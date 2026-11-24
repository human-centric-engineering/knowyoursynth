/**
 * Riding the wheel along with a pattern (`f-performance-wheels` t-311). With play-along on, a pattern's performance
 * wheel lanes (`@wheel`, `@bend`) stop playing the wheels: the loop goes to the voice and MIDI out without them, so the
 * hand's wheel plays, and the lane's values are shown on the wheel as a ghost for the learner to follow.
 *
 * How close they follow is a running score, 0..1: each sample is how near the hand's wheel is to the ghost, across the
 * wheel's travel, and the score leans towards the newest so it says how they are doing now, not since Play.
 *
 * Pure: the page samples the wheels on a timer (`use-play-along.ts`).
 */
import { isPerformanceId } from '@/lib/app/synths/lib/performance';
import type { Pattern } from '@/lib/app/sequencer/pattern';

/** The pattern as it plays with play-along on: its wheel lanes taken off, so the hand's wheels play. */
export function alongPattern(p: Pattern): Pattern {
  const lanes = p.lanes;
  if (!lanes?.some(isPerformanceId)) return p;
  return { ...p, lanes: lanes.filter((id) => !isPerformanceId(id)) };
}

/** How near the hand is to the ghost, 0 (a whole travel away, or more) to 1 (on it). `span` is the wheel's travel. */
export function closeness(hand: number, ghost: number, span: number): number {
  if (!(span > 0) || !Number.isFinite(hand) || !Number.isFinite(ghost)) return 0;
  return Math.max(0, 1 - Math.abs(hand - ghost) / span);
}

/** How closely the hand has followed: the running score, and how many samples it is from. */
export interface Follow {
  score: number;
  n: number;
}

export const NO_FOLLOW: Follow = { score: 0, n: 0 };

/** How much each new sample moves the score, once there are enough of them: about the last second at 10 a second. */
export const FOLLOW_WEIGHT = 0.15;

/** The score with sample `c` (a `closeness`) in. The first few count equally, so it is not swung by the first. */
export function follow(f: Follow, c: number): Follow {
  const v = Math.max(0, Math.min(1, Number.isFinite(c) ? c : 0));
  const w = Math.max(FOLLOW_WEIGHT, 1 / (f.n + 1));
  return { score: f.score + (v - f.score) * w, n: f.n + 1 };
}

/** How many samples the sign waits for before it says anything. */
export const FOLLOW_MIN_SAMPLES = 5;

export type FollowLevel = 'with' | 'near' | 'off';

/** What the sign under the wheels says. */
export interface FollowSign {
  level: FollowLevel;
  label: string;
}

/** At or above: right with it; at or above `NEAR`: close. Under it the hand is somewhere else. */
export const FOLLOW_WITH = 0.85;
export const FOLLOW_NEAR = 0.6;

/** The sign for a score: none until there are enough samples to say. */
export function followSign(f: Follow): FollowSign | null {
  if (f.n < FOLLOW_MIN_SAMPLES) return null;
  if (f.score >= FOLLOW_WITH) return { level: 'with', label: 'Right with it' };
  if (f.score >= FOLLOW_NEAR) return { level: 'near', label: 'Close' };
  return { level: 'off', label: 'Catch it up' };
}
