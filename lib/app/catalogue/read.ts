/**
 * Read the catalogue for the public API (`GET /api/v1/synths`, `GET /api/v1/synths/[id]`).
 *
 * The tables are the only source (D13). A synth is served only when it is listed **and** its definition is in the
 * registry, because a listed synth the app cannot play is a broken page, not a catalogue entry.
 *
 * Every sound is validated on read as well as on write (plan §5): a row edited into a shape its definition rejects,
 * or made on a definition version the registry no longer has, is left out and logged rather than sent to a panel that
 * cannot play it.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import type { Lineage, Preset } from '@/lib/app/synths/contract';
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import { validatePreset } from '@/lib/app/synths/validate';
import { LimitSchema, LineageEntrySchema, LineageRelativeSchema } from '@/lib/app/catalogue/data';

/** A synth as the catalogue lists it. */
export interface CatalogueSynth {
  id: string;
  name: string;
  maker: string;
  year: number;
  heritage: string;
  summary: string;
  /** The definition's current version; a sound saved now records it. */
  definitionVersion: number;
  /**
   * Sounds stored for the synth. The detail can serve fewer: it leaves out any that fail validation on read, and
   * each of those is logged as an error.
   */
  soundCount: number;
}

/** A library sound, as the panel plays it. */
export type CatalogueSound = Preset & { version: number };

export type Limit = z.infer<typeof LimitSchema>;

/** One synth with everything said about it. */
export interface SynthDetail {
  synth: CatalogueSynth;
  sounds: CatalogueSound[];
  lineage: Lineage | null;
  notes: {
    /** Control, jack or area id → "Unusual on…" note. */
    unusual: Record<string, string>;
    /** "What is not modelled": this synth's intro and entries, then the entries true of every panel. */
    limits: { intro: string | null; items: Limit[]; shared: Limit[] };
  };
}

const synthColumns = {
  id: true,
  name: true,
  maker: true,
  year: true,
  heritage: true,
  summary: true,
  _count: { select: { sounds: true } },
} satisfies Prisma.SynthSelect;

type SynthRow = Prisma.SynthGetPayload<{ select: typeof synthColumns }>;

function toCatalogueSynth(row: SynthRow, def: AppSynthDef): CatalogueSynth {
  const { id, name, maker, year, heritage, summary } = row;
  return {
    id,
    name,
    maker,
    year,
    heritage,
    summary,
    definitionVersion: def.version,
    soundCount: row._count.sounds,
  };
}

/** Every listed synth the app can play, in catalogue order. */
export async function listSynths(): Promise<CatalogueSynth[]> {
  const rows = await prisma.synth.findMany({
    where: { listed: true },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: synthColumns,
  });
  return rows.flatMap((row) => {
    const def = getSynthDef(row.id);
    if (def) return [toCatalogueSynth(row, def)];
    logger.warn('catalogue: listed synth has no definition, not served', { synthId: row.id });
    return [];
  });
}

const LineageColumnsSchema = z.object({
  timeline: z.array(LineageEntrySchema),
  relatives: z.array(LineageRelativeSchema),
});

/** One listed synth with its sounds, lineage and notes, or `null` when no listed, playable synth has that id. */
export async function getSynthDetail(id: string): Promise<SynthDetail | null> {
  const def = getSynthDef(id);
  if (!def) return null;
  const [row, noteRows] = await Promise.all([
    prisma.synth.findFirst({
      where: { id, listed: true },
      select: {
        ...synthColumns,
        sounds: { orderBy: [{ order: 'asc' }, { slug: 'asc' }] },
        lineage: true,
      },
    }),
    prisma.synthNote.findMany({
      where: { OR: [{ synthId: id }, { synthId: null, kind: 'LIMIT' }] },
      orderBy: [{ order: 'asc' }, { key: 'asc' }],
      select: { kind: true, synthId: true, target: true, title: true, text: true },
    }),
  ]);
  if (!row) return null;
  const { sounds: soundRows, lineage: lineageRow, ...synthRow } = row;
  const synth = toCatalogueSynth(synthRow, def);

  const sounds: CatalogueSound[] = [];
  for (const s of soundRows) {
    if (s.definitionVersion !== def.version) {
      logger.error('catalogue: sound made on a definition version the registry does not have', {
        synthId: id,
        sound: s.slug,
        version: s.definitionVersion,
        current: def.version,
      });
      continue;
    }
    const result = validatePreset(def, {
      id: s.slug,
      name: s.name,
      ref: s.ref,
      artist: s.artist,
      tags: s.tags,
      level: s.level,
      blurb: s.blurb,
      how: s.how,
      phrase: s.phrase,
      steps: s.steps,
      context: s.context,
      tweaks: s.tweaks,
    });
    if (!result.ok) {
      logger.error('catalogue: stored sound fails validation, not served', {
        synthId: id,
        sound: s.slug,
        problems: result.problems,
      });
      continue;
    }
    sounds.push({ ...result.value, version: s.definitionVersion });
  }

  let lineage: Lineage | null = null;
  if (lineageRow) {
    const parsed = LineageColumnsSchema.safeParse(lineageRow);
    if (parsed.success) {
      lineage = {
        title: lineageRow.title,
        intro: lineageRow.intro,
        ...parsed.data,
        ...(lineageRow.users.length ? { users: lineageRow.users } : {}),
        ...(lineageRow.note ? { note: lineageRow.note } : {}),
      };
    } else {
      logger.error('catalogue: stored lineage is malformed, not served', {
        synthId: id,
        problems: parsed.error.issues,
      });
    }
  }

  // An unusual note is checked against the definition as a sound is: one on something the synth no longer has is
  // left out rather than attached to nothing.
  const targets = new Set([
    ...def.controls.map((c) => c.id),
    ...def.jacks.map((j) => j.id),
    ...def.areas.map((a) => a.id),
  ]);
  const notes: SynthDetail['notes'] = {
    unusual: {},
    limits: { intro: null, items: [], shared: [] },
  };
  for (const n of noteRows) {
    if (n.kind === 'UNUSUAL' && n.target) {
      if (targets.has(n.target)) notes.unusual[n.target] = n.text;
      else
        logger.error('catalogue: unusual note on something the synth does not have, not served', {
          synthId: id,
          target: n.target,
        });
    } else if (n.kind === 'LIMIT_INTRO') notes.limits.intro = n.text;
    else if (n.kind === 'LIMIT' && n.title)
      (n.synthId ? notes.limits.items : notes.limits.shared).push({ title: n.title, text: n.text });
  }

  return { synth, sounds, lineage, notes };
}
