/**
 * Riding the wheel along with a pattern (`f-performance-wheels` t-311): the pattern played without its wheel lanes,
 * and the measure of how closely the hand follows the ghost.
 *
 * @see lib/app/sequencer/play-along.ts
 */

import { describe, it, expect } from 'vitest';
import {
  FOLLOW_MIN_SAMPLES,
  FOLLOW_NEAR,
  FOLLOW_WEIGHT,
  FOLLOW_WITH,
  NO_FOLLOW,
  alongPattern,
  closeness,
  follow,
  followSign,
  type Follow,
} from '@/lib/app/sequencer/play-along';
import { newPattern } from '@/lib/app/sequencer/pattern';
import { BEND } from '@/lib/app/synths/lib/performance';
import { WHEEL } from '@/lib/app/synths/lib/patch';

/** The score after samples `cs`, from none. */
const after = (cs: number[]): Follow => cs.reduce(follow, NO_FOLLOW);

describe('alongPattern', () => {
  it('takes the wheel lanes off and keeps the panel’s', () => {
    const p = { ...newPattern(16, '1/16', 120), lanes: ['cutoff', WHEEL, BEND] };
    const along = alongPattern(p);
    expect(along.lanes).toEqual(['cutoff']);
    // The steps' values are kept: only which lanes play changes.
    expect(along.parts).toBe(p.parts);
    expect(p.lanes).toEqual(['cutoff', WHEEL, BEND]);
  });

  it('gives back the same pattern when it has no wheel lane', () => {
    const p = { ...newPattern(16, '1/16', 120), lanes: ['cutoff'] };
    expect(alongPattern(p)).toBe(p);
    const bare = newPattern(16, '1/16', 120);
    expect(alongPattern(bare)).toBe(bare);
  });
});

describe('closeness', () => {
  it('is 1 on the ghost, falling across the wheel’s travel to 0 a whole travel away', () => {
    expect(closeness(0.5, 0.5, 1)).toBe(1);
    expect(closeness(0.25, 0.5, 1)).toBe(0.75);
    expect(closeness(0, 1, 1)).toBe(0);
    // The pitch wheel's travel is -1..1: a half-bend off is a quarter of it.
    expect(closeness(0.5, 0, 2)).toBe(0.75);
    expect(closeness(-1, 1, 2)).toBe(0);
  });

  it('never goes under 0, and is 0 for a value that is not a number or a wheel with no travel', () => {
    expect(closeness(0, 3, 1)).toBe(0);
    expect(closeness(Number.NaN, 0.5, 1)).toBe(0);
    expect(closeness(0.5, Number.POSITIVE_INFINITY, 1)).toBe(0);
    expect(closeness(0.5, 0.5, 0)).toBe(0);
  });
});

describe('follow', () => {
  it('averages the first samples equally, so the first does not swing it', () => {
    const f = after([1, 0, 1, 0]);
    expect(f.n).toBe(4);
    expect(f.score).toBeCloseTo(0.5, 10);
  });

  it('leans towards the newest samples once there are enough', () => {
    const steady = after(Array<number>(20).fill(1));
    expect(steady.score).toBeCloseTo(1, 10);
    // One sample right off moves it by the weight, not back to the overall average.
    const slip = follow(steady, 0);
    expect(slip.score).toBeCloseTo(1 - FOLLOW_WEIGHT, 10);
    // Back on it, it recovers: it says how they are doing now.
    const back = after([...Array<number>(20).fill(0), ...Array<number>(20).fill(1)]);
    expect(back.score).toBeGreaterThan(0.95);
  });

  it('clamps a sample to 0..1 and counts one that is not a number as 0', () => {
    expect(follow(NO_FOLLOW, 2).score).toBe(1);
    expect(follow(NO_FOLLOW, -1).score).toBe(0);
    expect(follow(NO_FOLLOW, Number.NaN).score).toBe(0);
  });
});

describe('followSign', () => {
  it('says nothing until there are enough samples', () => {
    expect(followSign(after(Array<number>(FOLLOW_MIN_SAMPLES - 1).fill(1)))).toBeNull();
    expect(followSign(after(Array<number>(FOLLOW_MIN_SAMPLES).fill(1)))?.level).toBe('with');
  });

  it('is right with it, close or off by the score', () => {
    const at = (score: number) => followSign({ score, n: FOLLOW_MIN_SAMPLES });
    expect(at(FOLLOW_WITH)).toEqual({ level: 'with', label: 'Right with it' });
    expect(at(FOLLOW_WITH - 0.01)?.level).toBe('near');
    expect(at(FOLLOW_NEAR)).toEqual({ level: 'near', label: 'Close' });
    expect(at(FOLLOW_NEAR - 0.01)).toEqual({ level: 'off', label: 'Catch it up' });
  });

  it('reads a hand riding the ghost a little behind as close, and one left still as off', () => {
    // The ghost sweeps 0 → 1; one hand trails it by a tenth, the other stays at the bottom.
    const ghost = Array.from({ length: 30 }, (_, k) => k / 29);
    const trailing = after(ghost.map((g, k) => closeness(ghost[Math.max(0, k - 3)], g, 1)));
    const still = after(ghost.map((g) => closeness(0, g, 1)));
    expect(followSign(trailing)?.level).toBe('with');
    expect(followSign(still)?.level).toBe('off');
  });
});
