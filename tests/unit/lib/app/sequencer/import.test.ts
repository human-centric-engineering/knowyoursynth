/**
 * Every library riff opens in the sequencer without a note changing (`f-step-sequencer` t-78): imported, then
 * compiled for its first loop, it gives back the riff's own notes and the length the engine loops it at.
 */
import { describe, it, expect } from 'vitest';
import type { Phrase, PhraseNote } from '@/lib/app/synths/contract';
import { PresetSchema } from '@/lib/app/synths/validate';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import { bestStepSize, importPhrase, phraseBeats } from '@/lib/app/sequencer/import';
import { PatternSchema } from '@/lib/app/sequencer/pattern';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

/** Starts are compared to a millionth of a beat: well under one sample at any tempo the sequencer plays. */
const CLOSE = 6;

const riffs: { id: string; phrase: Phrase }[] = loadCatalogueData().sounds.flatMap((file) =>
  file.sounds.map((s) => {
    const preset = PresetSchema.parse(s);
    return { id: `${file.synth}/${preset.id}`, phrase: preset.phrase };
  })
);

/** A riff's notes as the engine plays them: velocity filled in where the riff leaves it out, sorted. */
const heard = (notes: PhraseNote[]) =>
  notes
    .map(([b, n, len, v]) => [b, n, len, v ?? 0.85] as const)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);

function expectSameNotes(actual: PhraseNote[], expected: PhraseNote[]) {
  const a = heard(actual);
  const e = heard(expected);
  expect(a).toHaveLength(e.length);
  a.forEach((note, i) => {
    expect(note[0]).toBeCloseTo(e[i][0], CLOSE);
    expect(note[1]).toBe(e[i][1]);
    expect(note[2]).toBeCloseTo(e[i][2], CLOSE);
    expect(note[3]).toBe(e[i][3]);
  });
}

describe('importing the library riffs', () => {
  it('reads the whole library', () => {
    // Without a floor, an empty catalogue would pass every test below.
    expect(riffs.length).toBeGreaterThan(1000);
    expect(
      riffs.some((r) => r.phrase.steps.some(([b]) => Math.abs(b * 4 - Math.round(b * 4)) > 1e-6))
    ).toBe(true);
    expect(
      riffs.some((r) => new Set(r.phrase.steps.map(([b]) => b)).size < r.phrase.steps.length)
    ).toBe(true);
  });

  it.each(riffs.map((r) => [r.id, r.phrase] as const))(
    '%s: compiles back to the same notes',
    (_id, phrase) => {
      const pattern = importPhrase(phrase);
      expect(PatternSchema.safeParse(pattern).success).toBe(true);
      const loop = compileLoop(pattern, { loop: 0, rng: seededRng(1) });
      expectSameNotes(loop.notes, phrase.steps);
      expect(loop.beats).toBe(phraseBeats(phrase));
      expect(pattern.bpm).toBe(phrase.bpm);
      expect(pattern.loop).toBe(phrase.loop);
    }
  );
});

describe('importPhrase', () => {
  it('puts a straight sixteenth riff on a 1/16 grid, one step per sixteenth, with no nudges', () => {
    const p = importPhrase({
      bpm: 120,
      loop: true,
      steps: [
        [0, 36, 0.2],
        [0.75, 48, 0.2, 1],
      ],
    });
    expect(p.stepSize).toBe('1/16');
    expect(p.parts[0].steps).toHaveLength(4);
    expect(p.parts[0].steps[0].notes).toEqual([{ note: 36, gate: 0.8 }]);
    expect(p.parts[0].steps[3].notes).toEqual([{ note: 48, gate: 0.8, velocity: 1 }]);
  });

  it('chooses a triplet grid when it puts fewer notes off the grid', () => {
    const triplets: Phrase = {
      bpm: 90,
      loop: true,
      steps: [
        [0, 60, 0.3],
        [1 / 3, 62, 0.3],
        [2 / 3, 64, 0.3],
      ],
    };
    expect(bestStepSize(triplets)).toBe('1/8t');
    const p = importPhrase(triplets);
    expect(p.parts[0].steps.map((s) => s.notes.map((n) => n.note))).toEqual([[60], [62], [64]]);
    expect(p.parts[0].steps.every((s) => s.notes.every((n) => n.nudge === undefined))).toBe(true);
  });

  it('carries an off-grid start as a nudge on the step it starts in', () => {
    const p = importPhrase({
      bpm: 100,
      loop: true,
      steps: [
        [0.1, 40, 0.2],
        [1, 40, 0.2],
      ],
    });
    expect(p.stepSize).toBe('1/16');
    expect(p.parts[0].steps[0].notes[0].nudge).toBeCloseTo(0.4, 9);
  });

  it('keeps a chord as one step with each note’s own length', () => {
    const p = importPhrase({
      bpm: 80,
      loop: true,
      steps: [
        [0, 60, 3.8],
        [0, 64, 1.9],
        [0, 67, 3.8],
      ],
    });
    expect(p.parts[0].steps[0].notes.map((n) => [n.note, n.gate])).toEqual([
      [60, 15.2],
      [64, 7.6],
      [67, 15.2],
    ]);
  });

  it('keeps a note held past the riff’s last beat', () => {
    const p = importPhrase({ bpm: 100, loop: true, steps: [[0, 40, 32.0005]] });
    expect(p.parts[0].steps).toHaveLength(128);
    expect(PatternSchema.safeParse(p).success).toBe(true);
  });

  it('keeps a whole-semitone transpose and refuses one it cannot hold', () => {
    expect(
      importPhrase({ bpm: 100, loop: true, steps: [[0, 40, 1]], transpose: -12 }).transpose
    ).toBe(-12);
    expect(() =>
      importPhrase({ bpm: 100, loop: true, steps: [[0, 40, 1]], transpose: 0.5 })
    ).toThrow(RangeError);
    expect(() =>
      importPhrase({ bpm: 100, loop: true, steps: [[0, 40, 1]], transpose: 60 })
    ).toThrow(RangeError);
  });

  it('keeps a riff that plays once as one that plays once', () => {
    expect(importPhrase({ bpm: 100, loop: false, steps: [[0, 60, 1]] }).loop).toBe(false);
  });

  it('refuses a riff too long for any step size rather than cutting it', () => {
    expect(() => importPhrase({ bpm: 100, loop: true, steps: [[64, 60, 1]] })).toThrow(RangeError);
  });
});
