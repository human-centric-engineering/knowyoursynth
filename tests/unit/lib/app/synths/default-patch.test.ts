/**
 * Default patch tests
 *
 * The Default patch is the panel every synth starts from, and its scale is the pattern the sequencer offers with it.
 * These pin what the scale plays, that every definition's own Default patch fits its synth, and what the page lists.
 *
 * @see lib/app/synths/default-patch.ts
 */
import { describe, expect, it } from 'vitest';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import { PatternSchema } from '@/lib/app/sequencer/pattern';
import type { CablePair } from '@/lib/app/synths/contract';
import {
  DEFAULT_PATCH_ID,
  defaultPatchSound,
  defaultPatchState,
  SCALE_PATTERN,
  SCALE_PATTERN_VIEW,
} from '@/lib/app/synths/default-patch';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import modelD from '@/lib/app/synths/defs/model-d';
import { validateDefaultPatch, validatePreset } from '@/lib/app/synths/validate';
import { makeMiniD } from '@/tests/fixtures/synths/mini-d';

describe('the scale pattern', () => {
  it('is a pattern the sequencer accepts', () => {
    expect(PatternSchema.safeParse(SCALE_PATTERN).success).toBe(true);
  });

  it('plays C major from middle C up to C5 and back down, one note a beat, slowly', () => {
    const loop = compileLoop(SCALE_PATTERN, { loop: 0, rng: seededRng(1) });

    expect(loop.notes.map(([, note]) => note)).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60,
    ]);
    expect(loop.notes.map(([beat]) => beat)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(SCALE_PATTERN.bpm).toBe(70);
  });

  it('is the Default patch’s own pattern in the picker', () => {
    expect(SCALE_PATTERN_VIEW.pattern).toBe(SCALE_PATTERN);
    expect(SCALE_PATTERN_VIEW.inspiredBy.label).toBe('');
  });
});

describe('every synth’s Default patch', () => {
  it.each(SYNTH_DEFS.map((d) => [d.id, d] as const))('%s fits its synth', (_id, def) => {
    expect(validateDefaultPatch(def).problems).toEqual([]);
  });

  it('Model D has one of its own', () => {
    expect(modelD.defaultPatch).toBeDefined();
  });
});

describe('defaultPatchSound', () => {
  it('lists as a valid sound under the reserved id', () => {
    const sound = defaultPatchSound(modelD);

    expect(sound.id).toBe(DEFAULT_PATCH_ID);
    expect(validatePreset(modelD, sound).problems).toEqual([]);
  });

  it('sets the synth’s Default patch over init', () => {
    const state = defaultPatchState(modelD);

    expect(state.values).toEqual({ ...modelD.init, ...modelD.defaultPatch?.values });
    expect(state.values['filter.cutoff']).toBe(5);
    expect(state.cables).toEqual([]);
  });

  it('falls back to init with no cables on a synth with none of its own', () => {
    const def = makeMiniD();

    expect(defaultPatchState(def)).toEqual({ values: def.init, cables: [] });
  });

  it('plugs the cables a Default patch has', () => {
    const cables: CablePair[] = [['env1.out', 'pitch.in']];
    const def = { ...makeMiniD(), defaultPatch: { values: {}, cables } };

    expect(defaultPatchState(def).cables).toEqual([
      expect.objectContaining({ from: 'env1.out', to: 'pitch.in' }),
    ]);
  });
});
