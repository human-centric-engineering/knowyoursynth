/**
 * The whole public library ranked for the patch on the panel (`f-pattern-picker` t-212): what the Play deck's picker
 * lists under the patch's own patterns.
 *
 * `rankPatterns` (`suggest.ts`) answers a different question, a top few interleaved across the roles that suit the
 * sound. This answers every pattern, once, in a section per role: the sections in order of the patch's share of each
 * role, and within a section the same fit and lift `rankPatterns` orders by. The rules are in
 * `.context/app/pattern-library.md` (Suggestions, The whole library).
 *
 * Pure and client-safe: the endpoint (`rank-read.ts`) reads the library and the sound, and ranks here.
 */
import type { PatternFidelity, PatternRole } from '@prisma/client';
import type { LibraryPatternView } from '@/lib/app/patterns/library';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-roles';
import { ROLE_LABELS } from '@/lib/app/patterns/library-labels';
import {
  byFit,
  liftedFit,
  reasonFor,
  reasonLead,
  type SuggestCandidate,
  type SuggestContext,
} from '@/lib/app/patterns/suggest';
import type { SoundKind } from '@/lib/app/synths/lib/soundkind';

/** What ranking the library needs to know about a pattern: a view has it all. */
export type RankCandidate = SuggestCandidate & {
  inspiredBy: LibraryPatternView['inspiredBy'];
};

/** A pattern as the picker lists it: no notes, which a pick reads from `GET /api/v1/library-patterns/:id`. */
export interface RankedPattern {
  id: string;
  name: string;
  role: PatternRole;
  /** How long it is, in bars of four beats. */
  bars: number;
  inspiredBy: LibraryPatternView['inspiredBy'];
  fidelity: PatternFidelity;
  /** Why it is where it is, as `/suggest` gives it: `slow attack, holds → drone · same artist`. Null with no reading. */
  why: string | null;
  /** It starts more notes together than the patch can play, so it is last in its section. */
  tooManyVoices: boolean;
}

export interface RankSection {
  role: PatternRole;
  label: string;
  /** The patch's share of the role, 0–1; null with no reading. */
  share: number | null;
  patterns: RankedPattern[];
}

const row = (p: RankCandidate, why: string | null, tooManyVoices: boolean): RankedPattern => ({
  id: p.id,
  name: p.name,
  role: p.role,
  bars: p.facts.bars,
  inspiredBy: p.inspiredBy,
  fidelity: p.fidelity,
  why,
  tooManyVoices,
});

/**
 * Every candidate but the sound's own (`ctx.exclude`), once, in a section per role; every role has a section, empty
 * or not.
 *
 * With a reading (`kind`), the sections go by the patch's share of each role, largest first, and the patterns in each
 * by fit with the researched lift (`byFit`), except that a pattern needing more voices than the patch has goes last in
 * its section, marked. With none (a silent patch, or no reading yet), the sections are in `PATTERN_ROLES` order and the
 * patterns by name.
 */
export function rankLibrary(
  kind: SoundKind | null,
  candidates: readonly RankCandidate[],
  ctx: SuggestContext
): RankSection[] {
  const roles = kind
    ? [...PATTERN_ROLES].sort((a, b) => kind.roles[b] - kind.roles[a])
    : [...PATTERN_ROLES];
  const byRole = new Map<PatternRole, { p: RankCandidate; fit: number; over: boolean }[]>(
    roles.map((r) => [r, []])
  );
  for (const p of candidates) {
    if (ctx.exclude.has(p.id)) continue;
    byRole.get(p.role)?.push({
      p,
      fit: kind ? liftedFit(kind, p, ctx) : 0,
      over: !!kind && p.facts.voices > kind.features.voices,
    });
  }
  const lead = kind ? reasonLead(kind) : '';
  return roles.map((role) => {
    const list = byRole.get(role) ?? [];
    list.sort((a, b) =>
      kind
        ? Number(a.over) - Number(b.over) || byFit(a, b)
        : a.p.name.localeCompare(b.p.name) || a.p.id.localeCompare(b.p.id)
    );
    return {
      role,
      label: ROLE_LABELS[role],
      share: kind ? Math.round(kind.roles[role] * 1000) / 1000 : null,
      patterns: list.map(({ p, over }) => row(p, kind ? reasonFor(lead, p, ctx) : null, over)),
    };
  });
}
