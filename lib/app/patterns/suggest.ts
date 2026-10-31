/**
 * Patterns that suit the sound on the panel (`f-pattern-library` t-125): when to offer them, and which.
 *
 * The sound detector (`lib/app/synths/lib/soundkind.ts`) runs in the browser, in the probe worker, because it has to
 * play the patch through the voice and only the browser has the panel. It sends what it heard (the features). The
 * endpoint (`POST /api/v1/library-patterns/suggest`) scores those features with the model (`kindOf`, pure and cheap)
 * and ranks the library against them here, because only the server has the whole library. The design, the weights and
 * the threshold are in `.context/app/pattern-library.md` (Suggestions).
 *
 * Pure and client-safe: the hook decides whether to ask with `movedFar`, and the server ranks with `rankPatterns`.
 */
import { z } from 'zod';
import type { PatternFidelity, PatternRole } from '@prisma/client';
import type { PatternFacts } from '@/lib/app/patterns/library-facts';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-roles';
import { ROLE_LABELS } from '@/lib/app/patterns/library-labels';
import {
  KIND_INPUTS,
  kindInputs,
  type SoundFeatures,
  type SoundKind,
} from '@/lib/app/synths/lib/soundkind';
import { KIND_MODEL } from '@/lib/app/synths/lib/soundkind-model';

// ─── When to suggest ─────────────────────────────────────────────────────────

/**
 * How far a patch has to move from the sound it started as before patterns that suit it are offered, in
 * `kindDistance`'s units. Measured over every 12th library sound on 2026-10-31: a knob moved a tenth of its travel
 * crosses it 9% of the time, a knob moved a third of its travel 17%, and another sound of the same synth 96%.
 */
export const MOVED_FAR = 0.4;

/**
 * How different two readings are: the root mean square of their differences over the model's inputs, each in its
 * standard deviations across the library (`KIND_MODEL.scale`). 0 is the same sound; two sounds of one synth are about 1
 * apart (the median).
 */
export function kindDistance(a: SoundFeatures, b: SoundFeatures): number {
  const x = kindInputs(a);
  const y = kindInputs(b);
  let sum = 0;
  for (let j = 0; j < KIND_INPUTS.length; j++) {
    const d = (x[j] - y[j]) / KIND_MODEL.scale[j];
    sum += d * d;
  }
  return Math.sqrt(sum / KIND_INPUTS.length);
}

/**
 * Whether the patch now has moved far enough from where it started to be offered patterns of its own. `start` is the
 * library sound as it came, or null when there is none (one of the user's sounds, a shared one, the tutor's): then
 * it is always far enough, because nothing on the panel came with patterns.
 */
export function movedFar(start: SoundFeatures | null, now: SoundFeatures): boolean {
  if (!start) return true;
  if (start.silent || now.silent) return start.silent !== now.silent;
  return kindDistance(start, now) >= MOVED_FAR;
}

// ─── What the endpoint is sent ───────────────────────────────────────────────

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

/**
 * The detector's features as the endpoint takes them. The bounds are wide, past anything the detector returns, so
 * they only refuse what is not a reading at all.
 */
export const SoundFeaturesSchema = z.object({
  silent: z.boolean(),
  attack: num(0, 10),
  decay: num(0, 10),
  sustain: num(0, 10),
  release: num(0, 10),
  pulses: z.number().int().min(0).max(1000),
  wobble: num(0, 1000),
  brightness: num(-20, 20),
  brightMove: num(-20, 20),
  noise: num(0, 1),
  clarity: num(0, 1),
  pitch: num(-20, 20),
  tracking: num(-20, 20),
  drift: num(0, 1000),
  levels: z.object({ low: num(-400, 0), mid: num(-400, 0), high: num(-400, 0) }),
  voices: z.number().int().min(1).max(64),
}) satisfies z.ZodType<SoundFeatures>;

/** Most suggestions one call returns, and how many it returns when it is not told. */
export const SUGGEST_MAX = 20;
export const SUGGEST_DEFAULT = 8;

// ─── Which patterns ──────────────────────────────────────────────────────────

/** What ranking needs to know about a library pattern. */
export interface SuggestCandidate {
  id: string;
  name: string;
  role: PatternRole;
  fidelity: PatternFidelity;
  facts: PatternFacts;
  inspiredBy: { artistId: string | null; synthId: string | null };
}

/** Where the patch came from: what lifts a researched pattern, and the sound's own patterns, already listed. */
export interface SuggestContext {
  /** The synth on the panel. */
  synthId: string;
  /** The artist the sound on the panel is inspired by, if it is a library sound that is. */
  artistId: string | null;
  /** Patterns not to suggest: the sound's own. */
  exclude: ReadonlySet<string>;
}

export interface Suggestion {
  id: string;
  role: PatternRole;
  /** The role's share for this sound times how well the pattern fits it: comparable only within one call. */
  score: number;
  /** Why, in words: `slow attack, holds → held`. */
  reason: string;
}

/** The median note a pattern for each register is best centred on: D2, D4 and E5. */
const REGISTER_CENTRE = { low: 38, mid: 62, high: 76 } as const;
/** A sound starting this slowly (seconds to 90%) smears a line faster than a note a beat. */
const SLOW_ATTACK = 0.15;
/** A sound below this level at the end of the hold dies away under a held note. */
const DIES_AWAY = 0.1;
/** A role with a smaller share than this for the sound is not offered at all. */
const MIN_SHARE = 0.05;
/** How much a researched pattern of the same artist or synth is lifted, where it fits. */
const RESEARCHED_LIFT = 1.3;

/** What the sound does, in a few words a player reads: what the ranking leaned on. At most three. */
export function soundTraits(kind: SoundKind): string[] {
  const f = kind.features;
  const traits: string[] = [];
  if (f.attack >= SLOW_ATTACK) traits.push('slow attack');
  else if (f.attack <= 0.01) traits.push('sharp attack');
  if (f.sustain < DIES_AWAY) traits.push('dies away');
  else if (f.sustain >= 0.6) traits.push('holds');
  if (kind.register !== 'mid') traits.push(`${kind.register} register`);
  if (f.pulses >= 2) traits.push('pulses');
  if (f.voices === 1) traits.push('mono');
  else if (f.voices >= 4) traits.push('plays chords');
  if (f.noise >= 0.5) traits.push('noisy');
  return traits.slice(0, 3);
}

/** The roles worth offering for a sound, its largest share first. */
export function suitedRoles(kind: SoundKind): PatternRole[] {
  return PATTERN_ROLES.filter((r) => kind.roles[r] >= MIN_SHARE).sort(
    (a, b) => kind.roles[b] - kind.roles[a]
  );
}

/** `slow attack, low register → held, slow melody`: the sound's traits, and the roles that suit it most. */
export function kindSummary(kind: SoundKind): string {
  const roles = suitedRoles(kind)
    .slice(0, 3)
    .map((r) => ROLE_LABELS[r].toLowerCase());
  const traits = soundTraits(kind);
  return traits.length ? `${traits.join(', ')} → ${roles.join(', ')}` : roles.join(', ');
}

/** How well a pattern's notes suit the sound, 0–1 before a researched lift: its register, then its motion. */
function fit(kind: SoundKind, p: SuggestCandidate): number {
  const f = kind.features;
  const median = p.facts.register?.median ?? 0;
  const off = (median - REGISTER_CENTRE[kind.register]) / 12; // octaves from the centre
  let score = Math.exp(-0.5 * off * off); // 0.61 an octave away, 0.14 two
  // A slow attack smears a fast line; a sound that dies away leaves a long note silent before it ends.
  if (f.attack >= SLOW_ATTACK) score *= Math.exp(-Math.max(0, p.facts.density - 1) / 2);
  if (f.sustain < DIES_AWAY) score *= Math.exp(-Math.max(0, p.facts.noteLength - 1) / 2);
  return score;
}

const researched = (p: SuggestCandidate): boolean => p.fidelity !== 'in_the_style_of';

/** Whether a researched pattern belongs to where the patch came from: the same artist, or the synth on the panel. */
const related = (p: SuggestCandidate, ctx: SuggestContext): boolean =>
  researched(p) &&
  ((!!ctx.artistId && p.inspiredBy.artistId === ctx.artistId) ||
    p.inspiredBy.synthId === ctx.synthId);

/** What a lifted pattern's reason adds: where it is from. */
function liftNote(p: SuggestCandidate, ctx: SuggestContext): string {
  if (!related(p, ctx)) return '';
  return ctx.artistId && p.inspiredBy.artistId === ctx.artistId
    ? ' · same artist'
    : ' · this synth';
}

/**
 * The library's patterns that suit a sound, best first, at most `limit`.
 *
 * A pattern needing more voices than the patch can play is never offered (so a mono patch gets no chords). Each role
 * with a share of at least `MIN_SHARE` takes places in proportion to its share, and within a role the patterns that
 * fit the sound best come first: the register it sits in, and whether its motion suits how the sound starts and holds.
 * A researched pattern of the same artist or synth is lifted where it fits.
 */
export function rankPatterns(
  kind: SoundKind,
  candidates: readonly SuggestCandidate[],
  ctx: SuggestContext,
  limit: number
): Suggestion[] {
  const traits = soundTraits(kind);
  const lead = traits.length ? `${traits.join(', ')} → ` : '';
  const byRole = new Map<PatternRole, { p: SuggestCandidate; fit: number }[]>();
  for (const role of suitedRoles(kind)) byRole.set(role, []);
  for (const p of candidates) {
    const list = byRole.get(p.role);
    if (!list || ctx.exclude.has(p.id) || !p.facts.register) continue;
    if (p.facts.voices > kind.features.voices) continue;
    list.push({ p, fit: fit(kind, p) * (related(p, ctx) ? RESEARCHED_LIFT : 1) });
  }
  for (const list of byRole.values())
    list.sort(
      (a, b) =>
        b.fit - a.fit ||
        Number(researched(b.p)) - Number(researched(a.p)) ||
        a.p.name.localeCompare(b.p.name) ||
        a.p.id.localeCompare(b.p.id)
    );

  // Places go by the highest quotient: a role's share times its next pattern's fit, over the places it already has.
  // So the best-suited role leads, and the others come in as its quotient falls below theirs.
  const taken = new Map<PatternRole, number>();
  const out: Suggestion[] = [];
  while (out.length < limit) {
    let best: { role: PatternRole; next: { p: SuggestCandidate; fit: number }; q: number } | null =
      null;
    for (const [role, list] of byRole) {
      const n = taken.get(role) ?? 0;
      const next = list[n];
      if (!next) continue;
      const q = (kind.roles[role] * next.fit) / (n + 1);
      if (!best || q > best.q) best = { role, next, q };
    }
    if (!best) break;
    taken.set(best.role, (taken.get(best.role) ?? 0) + 1);
    const { p, fit: f } = best.next;
    out.push({
      id: p.id,
      role: p.role,
      score: Math.round(kind.roles[p.role] * f * 1000) / 1000,
      reason: `${lead}${ROLE_LABELS[p.role].toLowerCase()}${liftNote(p, ctx)}`,
    });
  }
  return out;
}
