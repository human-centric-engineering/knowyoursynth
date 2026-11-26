/**
 * Synth families (`f-synth-families`): the shape of a family as its seed file and an admin's save hold it, and the
 * check every family must pass before it is written. See `.context/app/synth-families.md`.
 *
 * Shapes and the pure check only. This module never reads the seed files: the seed unit does (D13, guarded by
 * `tests/unit/lib/app/catalogue/seed-data-boundary.test.ts`), and the live app reads the tables.
 */
import { z } from 'zod';
import { BankIdSchema } from '@/lib/app/bank/data';

const text = z.string().trim().min(1);

/** A family's id, or a member's slug: lowercase words joined by hyphens, so it can sit in a URL as it is. */
export const FamilySlugSchema = z
  .string()
  .regex(/^[a-z0-9-]{1,64}$/, 'must be 1–64 lowercase letters, digits and hyphens');

/** One member, in toggle order. Modelled when it names an app synth (`synth`), unmodelled otherwise. */
export const FamilyMemberSchema = z.object({
  slug: FamilySlugSchema,
  label: text.max(60),
  /** The databank instrument this member is. */
  instrument: BankIdSchema,
  /** The app synth that models it, if any. */
  synth: FamilySlugSchema.optional(),
  /** What this member changed from the others: the differences and advancements it brought in. */
  differences: text.max(4000),
});

/** `families/<id>.json`: one family, its members in toggle order. */
export const FamilyFileSchema = z.object({
  id: FamilySlugSchema,
  name: text.max(80),
  /** The slug of the member the family opens on: the one most people are likely to own. */
  defaultMember: FamilySlugSchema,
  members: z.array(FamilyMemberSchema),
});

export type FamilyMemberFile = z.infer<typeof FamilyMemberSchema>;
export type FamilyFile = z.infer<typeof FamilyFileSchema>;

/** A databank instrument as the check needs it: what it recreates, and the app synths linked to it. */
export interface FamilyInstrument {
  recreationOf: string | null;
  synths: string[];
}

/** What the check reads besides the families: the databank's instruments by id, and every app synth's id. */
export interface FamilyCheckContext {
  instruments: ReadonlyMap<string, FamilyInstrument>;
  synths: ReadonlySet<string>;
}

/**
 * The original an instrument's recreation chain ends at: itself when it recreates nothing. Null when the chain names
 * an instrument the databank does not have, or goes round in a circle (the databank's own check refuses both, so
 * either means the tables were changed under it).
 */
export function rootOf(
  id: string,
  instruments: ReadonlyMap<string, FamilyInstrument>
): string | null {
  const seen = new Set<string>();
  for (let at: string | null = id; at;) {
    if (seen.has(at)) return null;
    seen.add(at);
    const instrument = instruments.get(at);
    if (!instrument) return null;
    if (!instrument.recreationOf) return at;
    at = instrument.recreationOf;
  }
  return null;
}

/**
 * Every problem with a set of families, as sentences naming the family and member; empty when all is well. Pure.
 *
 * A family has two members or more, with distinct slugs. Its default member is one of them, and modelled: a family
 * never opens on a blank panel. Every member names an instrument the databank has, and every member's instrument
 * traces back to the same original. A modelled member's synth exists, sits in no other member of any family, and is
 * linked in the databank to an instrument with that same original, so the family and the databank agree on what the
 * synth models.
 */
export function checkFamilies(families: readonly FamilyFile[], ctx: FamilyCheckContext): string[] {
  const problems: string[] = [];
  const familyIds = new Set<string>();
  const synthOwner = new Map<string, string>();

  for (const family of families) {
    const where = `family ${family.id}`;
    if (familyIds.has(family.id)) problems.push(`${where}: the id is used by another family`);
    familyIds.add(family.id);
    if (family.members.length < 2) problems.push(`${where}: needs two members or more`);

    const slugs = new Set<string>();
    const roots = new Set<string>();
    for (const member of family.members) {
      const at = `${where}, member ${member.slug}`;
      if (slugs.has(member.slug)) problems.push(`${at}: the slug is used twice in the family`);
      slugs.add(member.slug);

      const root = ctx.instruments.has(member.instrument)
        ? rootOf(member.instrument, ctx.instruments)
        : null;
      if (!ctx.instruments.has(member.instrument))
        problems.push(`${at}: the databank has no instrument ${member.instrument}`);
      else if (!root)
        problems.push(`${at}: instrument ${member.instrument}'s recreation chain is broken`);
      else roots.add(root);

      if (member.synth === undefined) continue;
      const synth = member.synth;
      if (!ctx.synths.has(synth)) {
        problems.push(`${at}: there is no app synth ${synth}`);
        continue;
      }
      const owner = synthOwner.get(synth);
      if (owner) problems.push(`${at}: synth ${synth} is already a member (${owner})`);
      else synthOwner.set(synth, `${family.id}/${member.slug}`);

      const linkedRoots = [...ctx.instruments]
        .filter(([, i]) => i.synths.includes(synth))
        .map(([id]) => rootOf(id, ctx.instruments));
      if (root && !linkedRoots.includes(root))
        problems.push(
          `${at}: synth ${synth} is not linked in the databank to anything that traces back to ${root}`
        );
    }
    if (roots.size > 1)
      problems.push(
        `${where}: its members trace back to different originals (${[...roots].sort().join(', ')})`
      );

    const chosen = family.members.find((m) => m.slug === family.defaultMember);
    if (!chosen)
      problems.push(
        `${where}: the default member ${family.defaultMember} is not one of its members`
      );
    else if (chosen.synth === undefined)
      problems.push(`${where}: the default member ${family.defaultMember} is not modelled`);
  }
  return problems;
}
