/**
 * One loop of a pattern as notes (`f-step-sequencer` t-78): each rule a modular sequencer adds, and the order they
 * apply in.
 */
import { describe, it, expect } from 'vitest';
import {
  SLIDE_OVERLAP,
  compileLoop,
  conditionPlays,
  seededRng,
  snapToScale,
  stepOrder,
  type Rng,
} from '@/lib/app/sequencer/compile';
import { PatternSchema, newPattern, type Pattern, type Step } from '@/lib/app/sequencer/pattern';

/** A pattern of `notes.length` sixteenths, one note per step (null for a rest), at 120 BPM. */
function line(notes: (number | null)[], edit: (p: Pattern) => void = () => {}): Pattern {
  const p = newPattern(notes.length);
  p.parts[0].steps = notes.map((n) => ({
    on: true,
    notes: n === null ? [] : [{ note: n, gate: 0.5 }],
  }));
  edit(p);
  return PatternSchema.parse(p);
}

const set = (p: Pattern, i: number, s: Partial<Step>) => Object.assign(p.parts[0].steps[i], s);
/** The pitches of a loop, in order. */
const pitches = (p: Pattern, loop = 0, rng: Rng = seededRng(7), fill = false) =>
  compileLoop(p, { loop, rng, fill }).notes.map((n) => n[1]);
/** A random source that returns these values in turn. */
const fixed = (...xs: number[]): Rng => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('compileLoop', () => {
  it('plays a forward line one sixteenth apart, the loop as long as every step', () => {
    const loop = compileLoop(line([60, null, 62, 64]), { loop: 0, rng: seededRng(1) });
    expect(loop.notes).toEqual([
      [0, 60, 0.125],
      [0.5, 62, 0.125],
      [0.75, 64, 0.125],
    ]);
    expect(loop.beats).toBe(1);
  });

  it('leaves out a muted step but keeps its place', () => {
    const p = line([60, 62, 64, 65], (q) => set(q, 1, { on: false }));
    expect(compileLoop(p, { loop: 0, rng: seededRng(1) }).notes.map((n) => [n[0], n[1]])).toEqual([
      [0, 60],
      [0.5, 64],
      [0.75, 65],
    ]);
  });

  describe('direction', () => {
    const notes = [60, 62, 64, 65];

    it('reverse plays the steps back to front, each in the slot it lands in', () => {
      const loop = compileLoop(
        line(notes, (p) => (p.direction = 'reverse')),
        { loop: 0, rng: seededRng(1) }
      );
      expect(loop.notes.map((n) => [n[0], n[1]])).toEqual([
        [0, 65],
        [0.25, 64],
        [0.5, 62],
        [0.75, 60],
      ]);
    });

    it('pendulum goes forward on even loops and back on odd ones', () => {
      const p = line(notes, (q) => (q.direction = 'pendulum'));
      expect(pitches(p, 0)).toEqual([60, 62, 64, 65]);
      expect(pitches(p, 1)).toEqual([65, 64, 62, 60]);
      expect(pitches(p, 2)).toEqual([60, 62, 64, 65]);
    });

    it('random picks a step for every slot from the random source', () => {
      const p = line(notes, (q) => (q.direction = 'random'));
      expect(pitches(p, 0, fixed(0.9, 0.1, 0.6, 0.3))).toEqual([65, 60, 64, 62]);
    });

    it('brownian starts on the first step, then steps on, stays or steps back, and carries on next loop', () => {
      const p = line(notes, (q) => (q.direction = 'brownian'));
      // Slot 0 starts the walk; then on (0.1), stay (0.6), back (0.9).
      const first = stepOrder(p, { loop: 0, rng: fixed(0.2, 0.1, 0.6, 0.9) });
      expect(first.order).toEqual([0, 1, 1, 0]);
      // Next loop starts from where it stood; back from the first step wraps to the last.
      const next = stepOrder(p, { loop: 1, rng: fixed(0.9, 0.1, 0.1, 0.1), from: first.to });
      expect(next.order).toEqual([3, 0, 1, 2]);
    });
  });

  describe('conditions and probability', () => {
    it('A:B plays on loop A of every B', () => {
      expect([0, 1, 2, 3, 4].map((l) => conditionPlays({ t: 'ab', a: 2, b: 3 }, l, false))).toEqual(
        [false, true, false, false, true]
      );
    });

    it('first, not first, fill and not fill', () => {
      expect([
        conditionPlays({ t: 'first' }, 0, false),
        conditionPlays({ t: 'first' }, 1, false),
      ]).toEqual([true, false]);
      expect([
        conditionPlays({ t: 'notFirst' }, 0, false),
        conditionPlays({ t: 'notFirst' }, 3, false),
      ]).toEqual([false, true]);
      expect([
        conditionPlays({ t: 'fill' }, 0, true),
        conditionPlays({ t: 'fill' }, 0, false),
      ]).toEqual([true, false]);
      expect([
        conditionPlays({ t: 'notFill' }, 0, true),
        conditionPlays({ t: 'notFill' }, 0, false),
      ]).toEqual([false, true]);
    });

    it('a step with a condition plays only on the loops it names', () => {
      const p = line([60, 62], (q) => set(q, 1, { condition: { t: 'ab', a: 1, b: 2 } }));
      expect(pitches(p, 0)).toEqual([60, 62]);
      expect(pitches(p, 1)).toEqual([60]);
      expect(pitches(p, 0, seededRng(1), true)).toEqual([60, 62]);
      const fill = line([60, 62], (q) => set(q, 1, { condition: { t: 'fill' } }));
      expect(pitches(fill, 0, seededRng(1), false)).toEqual([60]);
      expect(pitches(fill, 0, seededRng(1), true)).toEqual([60, 62]);
    });

    it('probability 0 never plays and 1 always does', () => {
      const p = line([60, 62, 64], (q) => {
        set(q, 0, { probability: 0 });
        set(q, 2, { probability: 1 });
      });
      for (let seed = 0; seed < 20; seed++)
        expect(pitches(p, 0, seededRng(seed))).toEqual([62, 64]);
    });

    it('probability plays a step when the draw is under it', () => {
      const p = line([60, 62], (q) => set(q, 1, { probability: 0.5 }));
      expect(pitches(p, 0, fixed(0.49))).toEqual([60, 62]);
      expect(pitches(p, 0, fixed(0.5))).toEqual([60]);
    });

    it('the same seed compiles the same loop', () => {
      const p = line([60, 62, 64, 65, 67, 69, 71, 72], (q) => {
        q.direction = 'random';
        q.parts[0].steps.forEach((s) => (s.probability = 0.5));
      });
      expect(pitches(p, 0, seededRng(42))).toEqual(pitches(p, 0, seededRng(42)));
      expect(pitches(p, 0, seededRng(42))).not.toEqual(pitches(p, 0, seededRng(43)));
    });
  });

  describe('timing', () => {
    it('ratchet plays the step evenly inside itself, each hit shortened to fit', () => {
      const p = line([60, null], (q) => set(q, 0, { ratchet: 4 }));
      expect(compileLoop(p, { loop: 0, rng: seededRng(1) }).notes).toEqual([
        [0, 60, 0.03125],
        [0.0625, 60, 0.03125],
        [0.125, 60, 0.03125],
        [0.1875, 60, 0.03125],
      ]);
    });

    it('swing moves every second step later, by up to half a step', () => {
      const starts = (swing: number) =>
        compileLoop(
          line([60, 62, 64, 65], (q) => (q.swing = swing)),
          { loop: 0, rng: seededRng(1) }
        ).notes.map((n) => n[0]);
      expect(starts(50)).toEqual([0, 0.25, 0.5, 0.75]);
      expect(starts(75)).toEqual([0, 0.375, 0.5, 0.875]);
    });

    it('a nudge starts a note late by part of a step', () => {
      const p = line([60, null], (q) => (q.parts[0].steps[0].notes[0].nudge = 0.5));
      expect(compileLoop(p, { loop: 0, rng: seededRng(1) }).notes[0][0]).toBe(0.125);
    });

    it('a slide holds the note past the start of the next step, and only the last hit of a ratchet', () => {
      const slid = line([60, 62], (q) => set(q, 0, { slide: true }));
      const [first] = compileLoop(slid, { loop: 0, rng: seededRng(1) }).notes;
      expect(first[2]).toBeCloseTo((1 + SLIDE_OVERLAP) / 4, 9);
      expect(first[0] + first[2]).toBeGreaterThan(0.25);
      const ratcheted = line([60, 62], (q) => set(q, 0, { slide: true, ratchet: 2 }));
      const hits = compileLoop(ratcheted, { loop: 0, rng: seededRng(1) }).notes.filter(
        (n) => n[1] === 60
      );
      expect(hits[0][2]).toBe(0.0625);
      expect(hits[1][0] + hits[1][2]).toBeGreaterThan(0.25);
    });

    it('the step size sets how many steps fit in a beat', () => {
      const p = line([60, 62, 64], (q) => (q.stepSize = '1/8t'));
      const loop = compileLoop(p, { loop: 0, rng: seededRng(1) });
      expect(loop.notes.map((n) => n[0])).toEqual([0, 1 / 3, 2 / 3]);
      expect(loop.beats).toBe(1);
    });
  });

  describe('pitch and velocity', () => {
    it('an accented step plays at full velocity; otherwise a note keeps its own or none', () => {
      const p = line([60, 62, 64], (q) => {
        set(q, 0, { accent: true });
        q.parts[0].steps[1].notes[0].velocity = 0.4;
      });
      expect(compileLoop(p, { loop: 0, rng: seededRng(1) }).notes.map((n) => n[3])).toEqual([
        1,
        0.4,
        undefined,
      ]);
    });

    it('transposes, then snaps to the scale', () => {
      const p = line([60, 61, 66], (q) => {
        q.transpose = 2;
        q.scale = 'major';
        q.root = 0;
      });
      // 62 is on C major; 63 snaps down to 62 (a tie goes down); 68 snaps down to 67.
      expect(pitches(p)).toEqual([62, 62, 67]);
    });

    it('keeps notes inside MIDI after a transpose', () => {
      expect(pitches(line([120], (q) => (q.transpose = 12)))).toEqual([127]);
    });
  });

  it('plays the part the chain names for each loop', () => {
    const p = line([60, 62], (q) => {
      q.parts.push({
        steps: [
          { on: true, notes: [{ note: 70, gate: 0.5 }] },
          { on: true, notes: [] },
        ],
      });
      q.chain = [0, 0, 1];
    });
    expect([0, 1, 2, 3].map((l) => pitches(p, l))).toEqual([[60, 62], [60, 62], [70], [60, 62]]);
  });
});

describe('snapToScale', () => {
  it('leaves a chromatic note alone and finds the nearest note of another scale from its root', () => {
    expect(snapToScale(61, 0, 'chromatic')).toBe(61);
    expect(snapToScale(61, 0, 'minorPentatonic')).toBe(60);
    // On A minor pentatonic (A C D E G), G# is a semitone from both G and A: a tie goes down.
    expect(snapToScale(68, 9, 'minorPentatonic')).toBe(67);
    expect(snapToScale(70, 9, 'minorPentatonic')).toBe(69);
  });
});

describe('PatternSchema', () => {
  it('accepts a new pattern', () => {
    expect(PatternSchema.safeParse(newPattern()).success).toBe(true);
  });

  it.each([
    [
      'a part of another length',
      (p: Pattern) => p.parts.push({ steps: [{ on: true, notes: [] }] }),
    ],
    ['a chain naming a missing part', (p: Pattern) => (p.chain = [0, 1])],
    ['a ratchet of 5', (p: Pattern) => (p.parts[0].steps[0].ratchet = 5)],
    ['a probability over 1', (p: Pattern) => (p.parts[0].steps[0].probability = 1.5)],
    [
      'a nudge of a whole step',
      (p: Pattern) => (p.parts[0].steps[0].notes = [{ note: 60, gate: 1, nudge: 1 }]),
    ],
    ['a note above 127', (p: Pattern) => (p.parts[0].steps[0].notes = [{ note: 128, gate: 1 }])],
    [
      'a chord of seven',
      (p: Pattern) =>
        (p.parts[0].steps[0].notes = Array.from({ length: 7 }, (_, i) => ({
          note: 60 + i,
          gate: 1,
        }))),
    ],
    [
      'an A:B whose A is past B',
      (p: Pattern) => (p.parts[0].steps[0].condition = { t: 'ab', a: 3, b: 2 }),
    ],
    ['swing past 75', (p: Pattern) => (p.swing = 80)],
    [
      '129 steps',
      (p: Pattern) =>
        (p.parts[0].steps = Array.from({ length: 129 }, () => ({ on: true, notes: [] }))),
    ],
    ['an unknown field', (p: Pattern) => Object.assign(p, { extra: 1 })],
  ])('refuses %s', (_name, edit) => {
    const p = newPattern(16);
    edit(p);
    expect(PatternSchema.safeParse(p).success).toBe(false);
  });
});
