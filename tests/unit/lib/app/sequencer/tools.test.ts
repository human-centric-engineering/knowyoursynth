/**
 * The sequencer's tools (`f-step-sequencer` t-78): each returns new steps and leaves the ones it was given alone.
 */
import { describe, it, expect } from 'vitest';
import { seededRng, snapToScale } from '@/lib/app/sequencer/compile';
import { PatternSchema, newPattern, type Step } from '@/lib/app/sequencer/pattern';
import {
  clearSteps,
  copySteps,
  euclid,
  euclidFill,
  moveByDegree,
  mutate,
  pasteSteps,
  randomise,
  resizePattern,
  reverseSteps,
  rotateSteps,
  shiftDegree,
  shiftOctave,
} from '@/lib/app/sequencer/tools';

const steps = (...notes: (number | null)[]): Step[] =>
  notes.map((n) => ({ on: true, notes: n === null ? [] : [{ note: n, gate: 0.5 }] }));
const pitchesOf = (xs: Step[]) => xs.map((s) => (s.notes[0] ? s.notes[0].note : null));
const rhythm = (xs: boolean[]) => xs.map((x) => (x ? 'x' : '.')).join('');

describe('euclid', () => {
  it('spreads hits as evenly as they go, from the first step', () => {
    expect(rhythm(euclid(3, 8))).toBe('x..x..x.');
    expect(rhythm(euclid(5, 8))).toBe('x.xx.xx.');
    expect(rhythm(euclid(4, 16))).toBe('x...x...x...x...');
    expect(rhythm(euclid(2, 5))).toBe('x.x..');
    expect(rhythm(euclid(3, 4))).toBe('x.xx');
    expect(rhythm(euclid(4, 7))).toBe('x.x.x.x');
    expect(rhythm(euclid(5, 12))).toBe('x..x.x..x.x.');
    expect(rhythm(euclid(7, 16))).toBe('x..x.x.x..x.x.x.');
    expect(rhythm(euclid(0, 4))).toBe('....');
    expect(rhythm(euclid(9, 4))).toBe('xxxx');
  });

  it('rotates the rhythm later, round the end', () => {
    expect(rhythm(euclid(3, 8, 1))).toBe('.x..x..x');
    expect(rhythm(euclid(3, 8, -1))).toBe('..x..x.x');
  });
});

describe('euclidFill', () => {
  it('turns the hits on and the rest off, keeps every note, and gives a hit on a rest the note', () => {
    const before = steps(60, 62, null, 64);
    const after = euclidFill(before, 2, 0, 48);
    expect(after.map((s) => s.on)).toEqual([true, false, true, false]);
    expect(pitchesOf(after)).toEqual([60, 62, 48, 64]);
    expect(before.map((s) => s.on)).toEqual([true, true, true, true]);
    expect(euclidFill(steps(null), 1, 0, 60.4)[0].notes[0].note).toBe(60);
  });
});

describe('moving steps', () => {
  it('rotate moves every step later, round the end', () => {
    expect(pitchesOf(rotateSteps(steps(60, 62, 64, null), 1))).toEqual([null, 60, 62, 64]);
    expect(pitchesOf(rotateSteps(steps(60, 62, 64, null), -1))).toEqual([62, 64, null, 60]);
  });

  it('reverse turns the steps back to front without changing the original', () => {
    const before = steps(60, 62, 64);
    expect(pitchesOf(reverseSteps(before))).toEqual([64, 62, 60]);
    expect(pitchesOf(before)).toEqual([60, 62, 64]);
  });
});

describe('shifting notes', () => {
  it('by octaves, keeping a note pushed past either end of MIDI an octave inside it', () => {
    expect(pitchesOf(shiftOctave(steps(60, null, 120), 1))).toEqual([72, null, 120]);
    expect(pitchesOf(shiftOctave(steps(5), -1))).toEqual([5]);
  });

  it('by scale degrees, across octaves', () => {
    // C major from C: E up two is G, B up one is the next C, C down one is the B below.
    expect(moveByDegree(64, 2, 0, 'major')).toBe(67);
    expect(moveByDegree(71, 1, 0, 'major')).toBe(72);
    expect(moveByDegree(60, -1, 0, 'major')).toBe(59);
    // A note off the scale is put on it first: C# snaps to C, then up one is D.
    expect(moveByDegree(61, 1, 0, 'major')).toBe(62);
    expect(pitchesOf(shiftDegree(steps(60, 64), 1, 0, 'major'))).toEqual([62, 65]);
    // Past the top of MIDI it drops an octave and stays on the scale: a degree above G 127 is A 129, so A 117.
    expect(moveByDegree(127, 1, 0, 'major')).toBe(117);
  });
});

describe('randomise', () => {
  const opts = { root: 9, scale: 'minorPentatonic' as const, low: 45, high: 69, density: 0.75 };

  it('puts every note on the scale and in the range', () => {
    const out = randomise(64, seededRng(3), opts);
    const notes = out.flatMap((s) => s.notes.map((n) => n.note));
    expect(notes.length).toBeGreaterThan(20);
    for (const n of notes) {
      expect(n).toBeGreaterThanOrEqual(45);
      expect(n).toBeLessThanOrEqual(69);
      expect(snapToScale(n, 9, 'minorPentatonic')).toBe(n);
    }
  });

  it('fills about the share of steps it is asked for, and none at density 0', () => {
    expect(
      randomise(16, seededRng(3), { ...opts, density: 0 }).every((s) => s.notes.length === 0)
    ).toBe(true);
    const filled = randomise(400, seededRng(3), opts).filter((s) => s.notes.length > 0).length;
    expect(filled).toBeGreaterThan(260);
    expect(filled).toBeLessThan(340);
  });

  it('adds accents and slides only when asked', () => {
    const plain = randomise(64, seededRng(5), opts);
    expect(plain.some((s) => s.accent || s.slide)).toBe(false);
    const spiced = randomise(64, seededRng(5), { ...opts, accents: 0.5, slides: 0.5 });
    expect(spiced.some((s) => s.accent)).toBe(true);
    expect(spiced.some((s) => s.slide)).toBe(true);
  });
});

describe('mutate', () => {
  it('at 0 changes nothing; at 1 moves every note one degree and leaves rests as rests', () => {
    const before = steps(60, null, 64, 67);
    expect(mutate(before, seededRng(1), 0, 0, 'major')).toEqual(before);
    const after = mutate(before, seededRng(1), 1, 0, 'major');
    expect(after[1]).toEqual(before[1]);
    [0, 2, 3].forEach((i) => {
      const moved = after[i].notes[0].note;
      expect([
        moveByDegree(before[i].notes[0].note, 1, 0, 'major'),
        moveByDegree(before[i].notes[0].note, -1, 0, 'major'),
      ]).toContain(moved);
    });
  });
});

describe('copy, paste and clear', () => {
  it('pastes a copied range over the steps from a place, cut off at the end', () => {
    const source = steps(60, 62, 64, 65);
    const clip = copySteps(source, 1, 3);
    expect(pitchesOf(pasteSteps(source, 3, clip))).toEqual([60, 62, 64, 62]);
    expect(pitchesOf(pasteSteps(source, 0, clip))).toEqual([62, 64, 64, 65]);
    // A paste starting before the first step keeps only the part of the clip that lands inside.
    const pasted = pasteSteps(source, -1, clip);
    expect(pitchesOf(pasted)).toEqual([64, 62, 64, 65]);
    expect(Object.keys(pasted)).toEqual(['0', '1', '2', '3']);
    clip[0].notes[0].note = 0;
    expect(pitchesOf(source)).toEqual([60, 62, 64, 65]);
  });

  it('clears a range, or all of it', () => {
    expect(pitchesOf(clearSteps(steps(60, 62, 64), 1, 2))).toEqual([60, null, 64]);
    expect(pitchesOf(clearSteps(steps(60, 62, 64)))).toEqual([null, null, null]);
  });
});

describe('resizePattern', () => {
  it('adds rests at the end or cuts steps from it, in every part, and stays valid', () => {
    const p = newPattern(4);
    p.parts[0].steps = steps(60, 62, 64, 65);
    p.parts.push({ steps: steps(70, null, null, null) });
    const longer = resizePattern(p, 6);
    expect(pitchesOf(longer.parts[0].steps)).toEqual([60, 62, 64, 65, null, null]);
    expect(longer.parts[1].steps).toHaveLength(6);
    expect(pitchesOf(resizePattern(p, 2).parts[0].steps)).toEqual([60, 62]);
    expect(PatternSchema.safeParse(longer).success).toBe(true);
    expect(resizePattern(p, 500).parts[0].steps).toHaveLength(128);
    expect(resizePattern(p, 0).parts[0].steps).toHaveLength(1);
    expect(resizePattern(p, Number.NaN).parts[0].steps).toHaveLength(4);
  });
});
