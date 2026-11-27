/**
 * The DFAM's and the EDGE's sound libraries (t-269, t-270): the files on disk are what the specs write, so a spec
 * edited without running `write.ts` (or a library edited by hand) fails here. And the kit's numbers are the
 * definition's own mapping run backwards: each one, put through `defs/dfam-kit.ts`, gives back what it was asked for.
 * What the seed requires of every sound is tested in `seed-data.test.ts`.
 *
 * @see scripts/app/sounds/dfam/write.ts
 * @see scripts/app/sounds/dfam/kit.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  cutoffHz,
  decayS,
  egSemi,
  freqNote,
  tempoHz as tempoHzOf,
  vcfEgOct,
} from '@/lib/app/synths/defs/dfam-kit';
import {
  cutoff,
  decay,
  egAmt,
  freq,
  midi,
  pitches,
  run,
  step,
  tempo,
  tempoHz,
  vcfEg,
  vels,
} from '@/scripts/app/sounds/dfam/kit';

const written = vi.hoisted(() => new Map<string, string>());
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  writeFileSync: (file: string, text: string) => written.set(file, text),
}));
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.spyOn(console, 'log').mockImplementation(() => {});

const Library = z.object({ sounds: z.array(z.unknown()) });
const SOUNDS = join(process.cwd(), 'prisma/seeds/app-knowyoursynth/data/sounds');

describe('the libraries on disk', () => {
  it('are what the specs write, the DFAM’s 32 and the EDGE’s 12', async () => {
    await import('@/scripts/app/sounds/dfam/write');
    expect([...written.keys()].map((f) => f.slice(SOUNDS.length + 1))).toEqual([
      'dfam.json',
      'edge.json',
    ]);
    for (const [file, text] of written) {
      const disk: unknown = JSON.parse(readFileSync(file, 'utf8'));
      // prettier only re-wraps the file the writer prints, so the two parse to the same thing
      expect(JSON.parse(text), file).toEqual(disk);
    }
    const count = (f: string) =>
      Library.parse(JSON.parse(written.get(join(SOUNDS, f)) ?? '{}')).sounds.length;
    expect(count('dfam.json')).toBe(32);
    expect(count('edge.json')).toBe(12);
  });
});

describe('the sound kit', () => {
  it('names notes as MIDI numbers, and refuses what is not a note', () => {
    expect([midi('C4'), midi('A4'), midi('Bb1'), midi('F#3')]).toEqual([60, 69, 34, 54]);
    expect(() => midi('H2')).toThrow(/not a note/);
  });

  it('puts FREQUENCY on the note asked for, within its ten octaves', () => {
    for (const n of ['C1', 'G2', 'C3', 'E5']) expect(freqNote(freq(n))).toBeCloseTo(midi(n), 1);
    expect(() => freq('C9')).toThrow(/does not reach/);
  });

  it('sets the PITCH and VELOCITY rows, eight steps each', () => {
    expect(step(12)).toBe(1);
    // to four places, so a fifth is in tune
    expect(step(7) * 12).toBeCloseTo(7, 3);
    expect(() => step(72)).toThrow(/does not reach/);
    expect(pitches([0, 12, 0, 0, 0, 0, 0, -12])).toMatchObject({
      'seq.pitch2': 1,
      'seq.pitch8': -1,
    });
    expect(vels([10, 0, 5, 0, 10, 0, 5, 0])).toMatchObject({ 'seq.vel1': 10, 'seq.vel3': 5 });
    expect(() => pitches([0])).toThrow(/eight steps/);
    expect(() => vels([0])).toThrow(/eight steps/);
    expect(() => vels([11, 0, 0, 0, 0, 0, 0, 0])).toThrow(/velocity 11/);
  });

  it('puts TEMPO on a division of the beat, or on a clock rate', () => {
    // four steps a beat at 120 BPM is 8 Hz
    expect(tempoHzOf(tempo(120, 4))).toBeCloseTo(8, 1);
    expect(tempoHzOf(tempoHz(220))).toBeCloseTo(220, -1);
    expect(() => tempo(3000, 24)).toThrow(/does not reach/);
    expect(() => tempoHz(0.5)).toThrow(/does not reach/);
  });

  it('gives decays, cutoffs and EG amounts back through the definition', () => {
    expect(decayS(decay(0.25))).toBeCloseTo(0.25, 2);
    expect(() => decay(20)).toThrow(/no decay/);
    expect(cutoffHz(cutoff(1000))).toBeCloseTo(1000, -1);
    expect(() => cutoff(5)).toThrow(/no cutoff/);
    expect(egSemi(egAmt(24))).toBeCloseTo(24, 0);
    expect(egSemi(egAmt(-12))).toBeCloseTo(-12, 0);
    expect(() => egAmt(120)).toThrow(/does not reach/);
    expect(vcfEgOct(vcfEg(4))).toBeCloseTo(4, 1);
    expect(() => vcfEg(9)).toThrow(/does not reach/);
    expect(run()).toEqual({ 'seq.run': true });
  });
});
