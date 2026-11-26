/**
 * Read the synth families for the public API (`GET /api/v1/synths/families`, and the family in
 * `GET /api/v1/synths/:id`). See `.context/app/synth-families.md`.
 *
 * The tables are the only source (D13). A modelled member is served only while its synth is, by the catalogue's rule
 * (listed, and its definition in the registry): a member whose synth is hidden is left out, as the synth is from the
 * catalogue. An unmodelled member is always served. A family is served only while it still has a modelled member and
 * a second member beside it, and opens on its default member while that one is served, else on its first modelled
 * member that is.
 */
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { getSynthDef } from '@/lib/app/synths/defs';

/** The databank instrument a member is. */
export interface FamilyInstrumentRef {
  id: string;
  name: string;
  maker: string;
  year: string;
}

/** One member of a family, as the toggle shows it. */
export interface FamilyMember {
  slug: string;
  label: string;
  /** The app synth that models it; null when it is not modelled, and shown as a blank panel with its differences. */
  synthId: string | null;
  instrument: FamilyInstrumentRef;
  /** What this member changed from the others. */
  differences: string;
}

/** An original, its revisions and the instruments that copy it. */
export interface SynthFamily {
  id: string;
  name: string;
  /** The slug of the member the family opens on: always a served, modelled member. */
  defaultMember: string;
  /** In toggle order. */
  members: FamilyMember[];
}

const familySelect = {
  id: true,
  name: true,
  defaultMember: true,
  members: {
    orderBy: [{ order: 'asc' as const }, { slug: 'asc' as const }],
    select: {
      slug: true,
      label: true,
      synthId: true,
      differences: true,
      instrument: { select: { id: true, name: true, maker: true, year: true } },
      synth: { select: { listed: true } },
    },
  },
};

type FamilyRow = {
  id: string;
  name: string;
  defaultMember: string;
  members: {
    slug: string;
    label: string;
    synthId: string | null;
    differences: string;
    instrument: FamilyInstrumentRef;
    synth: { listed: boolean } | null;
  }[];
};

/** A family as served, or null when too little of it is served to be one. */
function toFamily(row: FamilyRow): SynthFamily | null {
  const members: FamilyMember[] = [];
  for (const m of row.members) {
    if (m.synthId && !(m.synth?.listed && getSynthDef(m.synthId))) continue;
    members.push({
      slug: m.slug,
      label: m.label,
      synthId: m.synthId,
      instrument: m.instrument,
      differences: m.differences,
    });
  }
  const modelled = members.filter((m) => m.synthId);
  if (!modelled.length || members.length < 2) return null;
  const opens = modelled.find((m) => m.slug === row.defaultMember) ?? modelled[0];
  if (opens.slug !== row.defaultMember)
    logger.debug('families: default member not served, opening on the first modelled member', {
      familyId: row.id,
      defaultMember: row.defaultMember,
      opens: opens.slug,
    });
  return { id: row.id, name: row.name, defaultMember: opens.slug, members };
}

/** Every family that is served, by name. */
export async function listFamilies(): Promise<SynthFamily[]> {
  const rows = await prisma.synthFamily.findMany({
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: familySelect,
  });
  return rows.flatMap((row) => toFamily(row) ?? []);
}

/** The served family a synth is a modelled member of, or null when it is in none. */
export async function getFamilyOf(synthId: string): Promise<SynthFamily | null> {
  const row = await prisma.synthFamily.findFirst({
    where: { members: { some: { synthId } } },
    select: familySelect,
  });
  return row ? toFamily(row) : null;
}
