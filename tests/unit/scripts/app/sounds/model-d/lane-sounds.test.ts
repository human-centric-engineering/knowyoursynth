/**
 * The Model D's lane sounds (`f-lane-sounds` t-301) and its sounds played on the mod wheel (`f-performance-wheels`
 * t-312): the batches and library on disk are what the specs write, so a spec edited without running
 * `write-lane-sounds.ts` (or a batch edited by hand) fails here. What the seed requires of every batch is tested in
 * `library-researched.test.ts`.
 *
 * @see scripts/app/sounds/model-d/lane-sounds.ts
 * @see scripts/app/sounds/model-d/wheel-sounds.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import modelD from '@/lib/app/synths/defs/model-d';
import { WHEEL } from '@/lib/app/synths/lib/patch';
import type { ControlValues } from '@/lib/app/synths/contract';
import {
  buildPattern,
  cells,
  checkHands,
  riffOf,
  writeLaneSounds,
  type LaneSoundSpec,
} from '@/scripts/app/sounds/lane-kit';
import { LANE_SOUNDS, lfoAt, onWheel, READOUTS } from '@/scripts/app/sounds/model-d/lane-sounds';
import { WHEEL_SOUNDS } from '@/scripts/app/sounds/model-d/wheel-sounds';

const DATA = join(process.cwd(), 'prisma/seeds/app-knowyoursynth/data');
const BatchFile = z.object({
  patterns: z.array(
    z.object({ key: z.string(), pattern: z.unknown(), sounds: z.array(z.string()) })
  ),
});
const LibraryFile = z.object({ sounds: z.array(z.object({ id: z.string() }).passthrough()) });
const library = new Map(
  LibraryFile.parse(JSON.parse(readFileSync(join(DATA, 'sounds/model-d.json'), 'utf8'))).sounds.map(
    (s) => [s.id, s]
  )
);

describe.each([
  ['t301-model-d-lane-sounds.json', LANE_SOUNDS, 30],
  ['t312-model-d-wheel-sounds.json', WHEEL_SOUNDS, 10],
] as const)('%s', (file, specs: readonly LaneSoundSpec[], count) => {
  const batch = BatchFile.parse(JSON.parse(readFileSync(join(DATA, 'patterns', file), 'utf8')));
  const built = specs.map((s) => ({ spec: s, pattern: buildPattern(modelD, s.pattern) }));
  const sounds = writeLaneSounds(
    modelD,
    READOUTS,
    built.map(({ spec, pattern }) => ({ spec, riff: riffOf(pattern), bpm: pattern.bpm }))
  );

  it('holds the pattern each spec builds, on its sound', () => {
    expect(specs).toHaveLength(count);
    expect(batch.patterns.map((p) => p.key)).toEqual(specs.map((s) => s.pattern.key));
    batch.patterns.forEach((p, k) => {
      expect(p.pattern, p.key).toEqual(built[k].pattern);
      expect(p.sounds).toEqual([`model-d/${specs[k].id}`]);
    });
  });

  it('puts the lesson each spec writes in the library, playable by hand', () => {
    sounds.forEach((s, k) => {
      expect(library.get(s.id), s.id).toEqual(s);
      expect(() => checkHands(modelD, s, built[k].pattern)).not.toThrow();
    });
  });
});

describe('the wheel sounds (t-312)', () => {
  it('each play the mod wheel, with MOD DEPTH left at 0 by the lesson', () => {
    for (const s of WHEEL_SOUNDS) {
      expect(buildPattern(modelD, s.pattern).lanes, s.id).toContain(WHEEL);
      const set: ControlValues = Object.assign({}, ...s.steps.map((st) => st.set ?? {}));
      expect(set['mod.depth'], s.id).toBe(0);
    }
  });

  it('moved the lane sounds’ vibrato and wobble off MOD DEPTH', () => {
    const lanes = LANE_SOUNDS.flatMap((s) => s.pattern.parts.flatMap((p) => Object.keys(p.lanes)));
    expect(lanes).not.toContain('mod.depth');
    const onTheWheel = LANE_SOUNDS.filter((s) =>
      buildPattern(modelD, s.pattern).lanes?.includes(WHEEL)
    );
    expect(onTheWheel).toHaveLength(12);
  });
});

describe('onWheel', () => {
  it('plays a MOD DEPTH position as the wheel the Model D adds to it: (d / 10)²', () => {
    const [c] = cells('A2', 1);
    expect(onWheel(() => 5)(c)).toBe(0.25);
    expect(onWheel(() => 0)(c)).toBe(0);
    expect(onWheel(() => null)(c)).toBeNull();
  });

  it('agrees with the Model D: the wheel there gives the depth the knob would', () => {
    // The voice's pitch route at MOD DEPTH 6, wheel down, against MOD DEPTH 0 and the wheel where onWheel puts it.
    const panel: ControlValues = {
      ...modelD.init,
      'mod.toOsc': true,
      'mod.mix': 10,
      'lfo.rate': lfoAt(5),
    };
    const amt = (v: ControlValues, wheel: number) =>
      modelD.toEngine(v, { wheel, patched: {} }).routes?.find((r) => r.dst === 'pitchAll')?.amt;
    const [c] = cells('A2', 1);
    expect(amt({ ...panel, 'mod.depth': 0 }, onWheel(() => 6)(c) as number)).toBeCloseTo(
      amt({ ...panel, 'mod.depth': 6 }, 0)!,
      9
    );
  });
});
