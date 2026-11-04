/**
 * Default patch tests
 *
 * The Default patch is the panel every synth starts from, and its scale is the pattern the sequencer offers with it.
 * These pin what the scale plays, that every definition's own Default patch fits its synth and sounds through the real
 * DSP, and what the page lists.
 *
 * @see lib/app/synths/default-patch.ts
 */
import { describe, expect, it } from 'vitest';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import { PatternSchema } from '@/lib/app/sequencer/pattern';
import type { CablePair, SynthDef } from '@/lib/app/synths/contract';
import {
  DEFAULT_PATCH_ID,
  defaultPatchSound,
  defaultPatchState,
  SCALE_PATTERN,
  SCALE_PATTERN_VIEW,
  SCALE_PHRASE,
} from '@/lib/app/synths/default-patch';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import modelD from '@/lib/app/synths/defs/model-d';
import { cablesToEngine } from '@/lib/app/synths/lib/patch';
import { validateDefaultPatch, validatePreset } from '@/lib/app/synths/validate';
import { render, rms } from '@/tests/unit/lib/app/synths/audio/render';
import { makeMiniD } from '@/tests/fixtures/synths/mini-d';

describe('the scale pattern', () => {
  it('is a pattern the sequencer accepts', () => {
    expect(PatternSchema.safeParse(SCALE_PATTERN).success).toBe(true);
  });

  it('plays C major from C3 up to C4 and back down, one note a beat, slowly', () => {
    const loop = compileLoop(SCALE_PATTERN, { loop: 0, rng: seededRng(1) });

    expect(loop.notes.map(([, note]) => note)).toEqual([
      48, 50, 52, 53, 55, 57, 59, 60, 59, 57, 55, 53, 52, 50, 48,
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

  it.each(SYNTH_DEFS.map((d) => [d.id, d] as const))('%s lists as a valid sound', (_id, def) => {
    expect(validatePreset(def, defaultPatchSound(def)).problems).toEqual([]);
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

  it('says what to listen for on a patch that is not a sawtooth', () => {
    const listen = 'Listen for a short drum hit.';
    const def = { ...makeMiniD(), defaultPatch: { values: {}, listen } };
    const sound = defaultPatchSound(def);

    expect(sound.blurb).toMatch(/^The plainest tone on /);
    expect(sound.steps[0].why).toContain(listen);
    expect(sound.steps[0].why).not.toContain('sawtooth');
  });

  it('refuses a blank listen, which would describe the patch as a sawtooth', () => {
    const def = { ...makeMiniD(), defaultPatch: { values: {}, listen: '  ' } };

    expect(validateDefaultPatch(def).problems).toEqual([
      expect.objectContaining({ path: 'defaultPatch.listen', code: 'blank-listen' }),
    ]);
    expect(defaultPatchSound(def).blurb).toMatch(/^A plain sawtooth on /);
  });

  it('lists under its own category where it names one, and as a lead where it does not', () => {
    const def = { ...makeMiniD(), defaultPatch: { values: {}, category: 'perc' as const } };

    expect(defaultPatchSound(def).tags).toEqual(['perc']);
    expect(defaultPatchSound(modelD).tags).toEqual(['lead']);
  });

  it('describes a sawtooth where the patch says nothing of its own', () => {
    const sound = defaultPatchSound(modelD);

    expect(sound.blurb).toMatch(/^A plain sawtooth on the Model D/);
    expect(sound.steps[0].why).toContain('bright, steady buzz');
  });

  it('plugs the cables a Default patch has', () => {
    const cables: CablePair[] = [['env1.out', 'pitch.in']];
    const def = { ...makeMiniD(), defaultPatch: { values: {}, cables } };

    expect(defaultPatchState(def).cables).toEqual([
      expect.objectContaining({ from: 'env1.out', to: 'pitch.in' }),
    ]);
  });
});

/** The Default patch's panel through the real DSP, playing its scale: the RMS of the first `seconds`. */
function defaultPatchRms(def: SynthDef, seconds = 1.5): number {
  const st = defaultPatchState(def);
  const patched = Object.fromEntries(
    st.cables.flatMap((c) => [[c.to, true] as const, [c.from, true] as const])
  );
  const ep = def.toEngine(st.values, { wheel: 0, patched });
  ep.cables = cablesToEngine(def, st.cables, st.values);
  const { out } = render(ep, {
    len: Math.floor(48000 * seconds),
    events: [[0, { type: 'phrase', phrase: SCALE_PHRASE }]],
  });
  return rms(out);
}
/** What `check:synths` calls silent (its `rms < 0.004`). */
const SILENT = 0.004;

describe('every synth’s Default patch sounds', () => {
  it.each(SYNTH_DEFS.map((d) => [d.id, d] as const))('%s is not silent', (_id, def) => {
    expect(defaultPatchRms(def)).toBeGreaterThan(SILENT);
  });

  it('would catch a silent one: a modular left on the init fallback', () => {
    const vcs3 = SYNTH_DEFS.find((d) => d.id === 'ems-vcs3');
    expect(vcs3?.defaultPatch).toBeDefined();
    const { defaultPatch: _own, ...fallback } = vcs3!;

    expect(defaultPatchRms(fallback)).toBeLessThan(SILENT);
  });
});
