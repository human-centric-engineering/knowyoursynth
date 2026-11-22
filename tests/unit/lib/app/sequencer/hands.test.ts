/**
 * Whether a person could play a pattern's mod lanes by hand (`f-lane-sounds` t-301): a knob's speed and its turns, a
 * switch's flips, read over the song as it loops, with a step a lane leaves alone back at the panel's value.
 *
 * @see lib/app/sequencer/hands.ts
 */
import { describe, it, expect } from 'vitest';
import modelD from '@/lib/app/synths/defs/model-d';
import { HAND_LIMITS, handProblems } from '@/lib/app/sequencer/hands';
import {
  buildPattern,
  ramp,
  wave,
  type Lane,
  type LanePatternSpec,
} from '@/scripts/app/sounds/lane-kit';
import type { ControlValues } from '@/lib/app/synths/contract';

/** Sixteenths at 120 bpm: a step is 0.125 s, so a full sweep takes four steps at the least (0.3 s / 0.125 s = 2.4). */
const pattern = (a: Record<string, Lane>, b: Record<string, Lane> = a, chain = [0, 1]) => {
  const spec: LanePatternSpec = {
    name: 'Test',
    role: 'bass_line',
    genre: 'Test',
    bpm: 120,
    root: 0,
    scale: 'chromatic',
    len: 16,
    chain,
    parts: [
      { notes: 'C3 . C3 . | C3 . C3 . | C3 . C3 . | C3 . C3:2 .', lanes: a },
      { notes: 'C3 . C3 . | C3 . C3 . | C3 . C3 . | C3 . C3:2 .', lanes: b },
    ],
    notes: 'A test.',
    key: 'test:hands',
  };
  return buildPattern(modelD, spec);
};
const panel: ControlValues = { 'filter.cutoff': 0, 'filter.emphasis': 2, 'osc1.wave': 'saw' };

describe('a knob', () => {
  it('passes a sweep a hand can make, there and back across the parts', () => {
    expect(
      handProblems(
        modelD,
        pattern({ 'filter.cutoff': ramp(-3, 3) }, { 'filter.cutoff': ramp(3, -3) }),
        panel
      )
    ).toEqual([]);
  });

  it('refuses a move faster than a full sweep in 0.3 s, naming where it lands', () => {
    // -3 to 3 is 60% of CUTOFF's travel in one 0.125 s step: a full sweep in 0.21 s.
    const p = pattern({ 'filter.cutoff': (c) => (c.i === 4 ? 3 : -3) });
    expect(handProblems(modelD, p, panel)).toEqual([
      "filter.cutoff: moves 60% of its travel into A5 in 0.13 s, a full sweep in 0.21 s (a hand's fastest is 0.3 s)",
    ]);
  });

  it('reads the loop’s seam: from the song’s last step back to its first', () => {
    // Each part climbs slowly from -4 to 4, so the jump is from B's last step to A's first.
    const p = pattern({ 'filter.cutoff': ramp(-4, 0) }, { 'filter.cutoff': ramp(0, 4) });
    expect(handProblems(modelD, p, panel)).toEqual([
      expect.stringMatching(/^filter\.cutoff: moves 80% of its travel into A1 /),
    ]);
  });

  it('reads a reversed pattern in the order it plays, so the seams fall where it turns round', () => {
    // Forward, B's 4 jumps back to A's -4 at the loop's end. Reversed, A plays down to -4 and B starts at its top, 4.
    const p = pattern({ 'filter.cutoff': ramp(-4, 0) }, { 'filter.cutoff': ramp(0, 4) });
    expect(handProblems(modelD, { ...p, direction: 'reverse' }, panel)).toEqual([
      expect.stringMatching(/^filter\.cutoff: moves 80% of its travel into B16 /),
    ]);
  });

  it('reads a pendulum turning round each loop, so a climb and its way back are one smooth move', () => {
    // Forward, the climb jumps from 4 back to -4 at every loop's start, first into B. In a pendulum it climbs, then plays back down.
    const p = pattern({ 'filter.cutoff': ramp(-4, 4) }, { 'filter.cutoff': ramp(-4, 4) });
    expect(handProblems(modelD, p, panel)).toEqual([
      expect.stringMatching(/moves 80% of its travel into B1 /),
    ]);
    expect(handProblems(modelD, { ...p, direction: 'pendulum' }, panel)).toEqual([]);
    // Over an odd chain the pendulum needs two goes round it to come back: the third loop plays B backwards.
    const three = { ...p, chain: [0, 1, 1], direction: 'pendulum' as const };
    expect(handProblems(modelD, three, panel)).toEqual([]);
  });

  it('says a lane in a random order has no playing to check', () => {
    const p = pattern({ 'filter.cutoff': ramp(-3, 3) });
    expect(handProblems(modelD, { ...p, direction: 'random' }, panel)).toEqual([
      'plays its steps in a random order, so its lanes have no one playing a hand could learn',
    ]);
  });

  it('counts a second of turns past the song’s end when the song is shorter than a second', () => {
    // Four steps at 240 bpm is a quarter second a pass, so three passes are not a second; a wobble two steps a cycle
    // turns on every step, sixteen times a second.
    const short = pattern({ 'filter.emphasis': wave(2, 3, 2) });
    const p = {
      ...short,
      bpm: 240,
      parts: short.parts.map((part) => ({ ...part, steps: part.steps.slice(0, 4) })),
      chain: [0],
    };
    expect(handProblems(modelD, p, panel)).toEqual([
      expect.stringMatching(/^filter\.emphasis: turns back 16 times in the second from /),
    ]);
  });

  it('refuses more than three turns back in a second, a wobble too quick for a hand', () => {
    // A 30% wobble four steps a cycle turns twice a half second: four times in a second, though no move is too fast.
    const p = pattern({ 'filter.emphasis': wave(2, 5, 4) });
    expect(handProblems(modelD, p, panel)).toEqual([
      'filter.emphasis: turns back 4 times in the second from A2 (a hand turns at most 3)',
    ]);
  });

  it('passes three turns a second, and does not count a wobble smaller than a steady hand’s', () => {
    // Eight steps a cycle is two turns a second; the 2% wobble on top never reaches the 3% that counts as a turn.
    const wobble: Lane = (c) => (wave(2, 5, 8)(c) as number) + (c.i % 2 ? 0.2 : 0);
    expect(handProblems(modelD, pattern({ 'filter.emphasis': wave(2, 5, 8) }), panel)).toEqual([]);
    expect(handProblems(modelD, pattern({ 'filter.emphasis': wobble }), panel)).toEqual([]);
  });

  it('puts a step the lane leaves alone back at the panel’s value', () => {
    // Set on the notes only: every rest drops back to the panel's 0, a 40% jump each way, twice a beat.
    const p = pattern({ 'filter.cutoff': (c) => (c.note === null ? null : 4) });
    expect(handProblems(modelD, p, panel).join('\n')).toMatch(/turns back 8 times/);
    expect(handProblems(modelD, p, { ...panel, 'filter.cutoff': 4 })).toEqual([]);
  });

  it('falls back to the control’s own value where the panel has none', () => {
    // CUTOFF's own value is 1: a lane at 1 on the notes leaves the knob still between them.
    const p = pattern({ 'filter.cutoff': (c) => (c.note === null ? null : 1) });
    expect(handProblems(modelD, p, {})).toEqual([]);
  });
});

describe('swing', () => {
  it('measures a move into a step against the swung time it has, as the compiler plays it', () => {
    // 40% of CUTOFF from step 4 into step 5. Straight that is 0.125 s, under a hand's limit; at swing 66 step 4 starts
    // 0.04 s late, so the move has 0.085 s.
    const lane: Lane = (c) => (c.i < 4 ? -2 : 2);
    const straight = pattern({ 'filter.cutoff': lane }, { 'filter.cutoff': ramp(2, -2) });
    expect(handProblems(modelD, straight, panel)).toEqual([]);
    expect(handProblems(modelD, { ...straight, swing: 66 }, panel)).toEqual([
      "filter.cutoff: moves 40% of its travel into A5 in 0.08 s, a full sweep in 0.21 s (a hand's fastest is 0.3 s)",
    ]);
  });

  it('counts swing from each loop’s first slot, so a part of odd length starts the next loop on time', () => {
    // Fifteen steps a part: B's first slot is on time and its second late, so the 40% move into B2 has 1.32 steps.
    // Counted across the song instead, B2 would be the 16th step, on time, with 0.68 of one.
    const odd = (p: ReturnType<typeof pattern>) => ({
      ...p,
      swing: 66,
      parts: p.parts.map((part) => ({ ...part, steps: part.steps.slice(0, 15) })),
    });
    const p = odd(
      pattern({ 'filter.cutoff': () => -2 }, { 'filter.cutoff': (c) => (c.i < 1 ? -2 : 2) })
    );
    expect(handProblems(modelD, p, panel)).toEqual([]);
  });

  it('times a switch’s flips by the swung steps too', () => {
    // Flipped on step 2 and back on step 5, three steps apart: 0.225 s at 200 bpm. At swing 74 step 2 starts 0.036 s
    // late, so the flip back comes 0.189 s after it, too soon for a hand.
    const p = {
      ...pattern({ 'osc1.wave': (c) => (c.i >= 1 && c.i < 4 ? 'sq' : 'saw') }),
      bpm: 200,
    };
    expect(handProblems(modelD, p, panel)).toEqual([]);
    expect(handProblems(modelD, { ...p, swing: 74 }, panel)).toEqual([
      'osc1.wave: changes again at A5, 0.19 s after its last change (a hand needs 0.2 s)',
    ]);
  });
});

describe('a switch or selector', () => {
  it('refuses a change within 0.2 s of the last', () => {
    const p = pattern({ 'osc1.wave': (c) => (c.i % 2 ? 'sq' : 'saw') });
    expect(handProblems(modelD, p, panel)).toEqual([
      'osc1.wave: changes again at A1, 0.13 s after its last change (a hand needs 0.2 s)',
    ]);
  });

  it('passes a flick every beat, and one change in the whole song', () => {
    const everyBeat = pattern({ 'osc1.wave': (c) => (Math.floor(c.i / 4) % 2 ? 'sq' : 'saw') });
    expect(handProblems(modelD, everyBeat, panel)).toEqual([]);
    const once = pattern({ 'osc1.wave': () => 'saw' }, { 'osc1.wave': () => 'sq' });
    expect(handProblems(modelD, once, panel)).toEqual([]);
  });
});

describe('the limits', () => {
  it('are the owner’s ruling, and a caller may pass its own', () => {
    expect(HAND_LIMITS).toEqual({ sweepS: 0.3, turnsPerS: 3, flipS: 0.2, jitter: 0.03 });
    const p = pattern({ 'filter.cutoff': (c) => (c.i === 4 ? 3 : -3) });
    expect(handProblems(modelD, p, panel, { ...HAND_LIMITS, sweepS: 0.1 })).toEqual([]);
  });

  it('reads no lane for a control the synth does not have', () => {
    const p = { ...pattern({ 'filter.cutoff': ramp(-3, 3) }), lanes: ['no.such'] };
    expect(handProblems(modelD, p, panel)).toEqual([]);
  });
});
