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
  /**
   * The databank originals the family brings together (t-324), each an instrument that recreates nothing. Left out,
   * the members must all trace back to one original, whichever it is. Given, each member traces back to one of these,
   * and each is some member's original: so Moog's own System 15, 35 and 55, each an original of its own, can sit
   * beside Behringer's copies, which trace back to the Moog modular as a whole.
   */
  originals: z.array(BankIdSchema).max(12).optional(),
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
 * traces back to the same original, or, where the family lists its `originals`, to one of those: each listed one an
 * instrument the databank has that recreates nothing, and each the original of some member. A modelled member's
 * synth exists, sits in no other member of any family, and is linked in the databank to an instrument with that
 * same original as the member's, so the family and the databank agree on what the synth models.
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
    /** A member's original could not be found: its instrument is missing, or its chain is broken. */
    let unresolved = false;
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
      if (!root) unresolved = true;

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
    if (family.originals?.length) {
      const listed = new Set(family.originals);
      if (listed.size !== family.originals.length)
        problems.push(`${where}: an original is listed twice`);
      for (const id of listed) {
        const instrument = ctx.instruments.get(id);
        if (!instrument)
          problems.push(`${where}: the databank has no instrument ${id} for an original`);
        else if (instrument.recreationOf)
          problems.push(
            `${where}: original ${id} is a recreation of ${instrument.recreationOf}, not an original`
          );
        // A member whose original could not be found is already reported; it may be the one this original is for.
        else if (!roots.has(id) && !unresolved)
          problems.push(`${where}: original ${id} is no member's original`);
      }
      const others = [...roots].filter((r) => !listed.has(r)).sort();
      if (others.length)
        problems.push(
          `${where}: members trace back to ${others.join(', ')}, which the family's originals do not list`
        );
    } else if (roots.size > 1)
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
