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
import { drumStyleFor } from '@/lib/app/sequencer/drums';
import { phraseOf, riffProblem } from '@/lib/app/patterns/library';
import { defaultGrooveOf } from '@/lib/app/synths/default-grooves';
import type { CablePair, DefaultPatchStep, SynthDef } from '@/lib/app/synths/contract';
import {
  chosenSound,
  DEFAULT_PATCH_ID,
  defaultPatchName,
  defaultPatchPatterns,
  defaultPatchSound,
  defaultPatchState,
  startStep,
  SCALE_PATTERN,
  SCALE_PATTERN_VIEW,
  SCALE_PHRASE,
} from '@/lib/app/synths/default-patch';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';
import buchlaEasel from '@/lib/app/synths/defs/buchla-easel';
import modelD from '@/lib/app/synths/defs/model-d';
import { checklistRequired } from '@/lib/app/synths/lib/checklist';
import { cablesToEngine, presetState } from '@/lib/app/synths/lib/patch';
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

describe('the Model D’s Default Saw groove (t-303)', () => {
  const groove = defaultGrooveOf('model-d')!;
  const sound = defaultPatchSound(modelD);

  it('is a whole song the sequencer accepts and a sound can play by default: two parts, chained', () => {
    expect(PatternSchema.safeParse(groove.pattern).success).toBe(true);
    expect(riffProblem(groove.pattern)).toBeNull();
    expect(new Set(groove.pattern.chain).size).toBe(2);
    expect(groove.pattern.fx).toBeUndefined();
  });

  it('is the Default Saw’s default, played whole, its riff the first loop, with the scale after it', () => {
    expect(sound.defaultPattern).toMatchObject({ played: true, style: groove.style });
    expect(sound.phrase).toEqual(phraseOf(groove.pattern));
    const list = defaultPatchPatterns('model-d');
    expect(list.map((p) => p.id)).toEqual([sound.defaultPattern?.id, SCALE_PATTERN_VIEW.id]);
    expect(list[0].pattern).toBe(groove.pattern);
  });

  it('plays with the drums on Match, which finds a beat for its style, and no effects', () => {
    expect(chosenSound(modelD, sound)).toEqual({ drums: 'auto', fx: null });
    expect(drumStyleFor(groove.style, groove.pattern.bpm, 50).beat).not.toBeNull();
  });

  it('leaves every other synth’s Default Saw on its scale with the drums off (t-295)', () => {
    const others = SYNTH_DEFS.filter((d) => d.id !== 'model-d' && !d.defaultPatch?.listen?.trim());
    expect(others.length).toBeGreaterThan(0);
    for (const d of others) {
      const s = defaultPatchSound(d);
      expect(s.phrase, d.id).toBe(SCALE_PHRASE);
      expect(defaultPatchPatterns(d.id), d.id).toEqual([SCALE_PATTERN_VIEW]);
      expect(chosenSound(d, s).drums, d.id).toBe('off');
    }
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
    expect(sound.name).toBe('Default Saw');
    expect(sound.steps.at(-1)?.why).toContain('bright, steady buzz');
  });

  it('plugs the cables a Default patch has', () => {
    const cables: CablePair[] = [['env1.out', 'pitch.in']];
    const def = { ...makeMiniD(), defaultPatch: { values: {}, cables } };

    expect(defaultPatchState(def).cables).toEqual([
      expect.objectContaining({ from: 'env1.out', to: 'pitch.in' }),
    ]);
  });
});

describe('the Default patch’s checklist', () => {
  const defs = SYNTH_DEFS.map((d) => [d.id, d] as const);

  it.each(defs)('%s has one', (_id, def) => {
    expect(def.defaultPatch?.checklist?.length).toBeGreaterThan(0);
  });

  it.each(defs)(
    '%s sets every control that shapes the sound exactly once, and ends on the Default patch',
    (_id, def) => {
      const sound = defaultPatchSound(def);
      const want = defaultPatchState(def);
      const seen = sound.steps.flatMap((s) => Object.keys(s.set ?? {}));

      expect(new Set(seen).size).toBe(seen.length);
      expect(new Set(seen)).toEqual(new Set(checklistRequired(def).map((c) => c.id)));
      sound.steps.forEach((s) =>
        Object.entries(s.set ?? {}).forEach(([id, v]) =>
          expect([id, v]).toEqual([id, want.values[id]])
        )
      );
      // every step builds on the Default patch, so the panel is on it at the last step and at every one before
      sound.steps.forEach((_s, k) => expect(presetState(def, sound, k)).toEqual(want));
      expect(sound.steps.flatMap((s) => s.cables ?? [])).toEqual(def.defaultPatch?.cables ?? []);
    }
  );

  it.each(defs)('%s says where each control goes, one line each', (_id, def) => {
    defaultPatchSound(def).steps.forEach((s) => {
      const lines = s.why
        .split('\n')
        .filter((l) => l.startsWith('- ') && !l.startsWith('- Listen for:'));
      expect(lines.length).toBe(Object.keys(s.set ?? {}).length + (s.cables?.length ?? 0));
    });
  });

  it('writes Model D’s steps from its panel: a position for each control, and what to listen for at the end', () => {
    const steps = defaultPatchSound(modelD).steps;
    const filter = steps.find((s) => s.module === 'filter');

    expect(filter?.why).toContain('- CUTOFF FREQUENCY: fully clockwise (5 · 20 kHz)');
    expect(filter?.why).toContain('- EMPHASIS: fully anticlockwise (0)');
    expect(steps.at(-1)?.why).toMatch(/\n- Listen for: .*bright, steady buzz/);
  });

  it('calls a sawtooth the Default Saw, and anything else the Default patch, with its reason first', () => {
    const easel = defaultPatchSound(buchlaEasel);
    const notSaw = buchlaEasel.defaultPatch?.notSaw ?? '';

    expect(defaultPatchName(modelD)).toBe('Default Saw');
    expect(defaultPatchName(buchlaEasel)).toBe('Default patch');
    expect(easel.name).toBe('Default patch');
    expect(notSaw).toMatch(/no sawtooth/);
    expect(easel.how.startsWith(notSaw)).toBe(true);
    expect(easel.steps[0].why.startsWith(`${notSaw}\n`)).toBe(true);
  });

  it.each(defs)('%s says why where its default is not a sawtooth', (_id, def) => {
    if (def.defaultPatch?.listen) expect(def.defaultPatch.notSaw?.trim()).toBeTruthy();
    else expect(defaultPatchName(def)).toBe('Default Saw');
  });

  it('keeps step 0 of other lessons to one step that sets the whole patch, and points to the checklist', () => {
    const s = startStep(modelD);

    expect(s.title).toBe('Default Saw');
    expect(s.set).toEqual(modelD.defaultPatch?.values);
    expect(s.why).toContain(
      'The Default Saw in the library sets it up one part of the panel at a time.'
    );
    expect(defaultPatchSound(makeMiniD()).steps).toHaveLength(1);
    expect(startStep(makeMiniD()).why).not.toContain('in the library');
  });
});

describe('validateDefaultPatch on a checklist', () => {
  const step = (controls: string[], extra: Partial<DefaultPatchStep> = {}): DefaultPatchStep => ({
    title: 'Set it',
    module: 'osc',
    why: 'Set these.',
    controls,
    ...extra,
  });
  const withChecklist = (checklist: DefaultPatchStep[], more: object = {}) => ({
    ...makeMiniD(),
    defaultPatch: { values: {}, checklist, ...more },
  });
  const codes = (def: SynthDef) => validateDefaultPatch(def).problems.map((p) => p.code);

  it('passes one that covers every control once, a broad pattern after a narrow one taking the rest', () => {
    expect(codes(withChecklist([step(['osc1.*']), step(['*'])]))).toEqual([]);
  });

  it('names each control it leaves unset', () => {
    const problems = validateDefaultPatch(withChecklist([step(['osc*', 'mix.*'])])).problems;

    expect(problems.every((p) => p.code === 'uncovered-control')).toBe(true);
    expect(problems.map((p) => p.message)).toContain(
      "mini-d's Default patch checklist does not set filter.cutoff"
    );
    // a ui control is no part of the sound, so it needs no step
    expect(problems.map((p) => p.message).join()).not.toContain('view.help');
  });

  it('refuses a pattern that matches nothing, and a step an earlier one left empty', () => {
    expect(codes(withChecklist([step(['*']), step(['osc1.*']), step(['nope.*'])]))).toEqual([
      'unmatched-pattern',
      'empty-step',
      'empty-step',
    ]);
  });

  it('refuses a blank step, and an empty checklist', () => {
    expect(codes(withChecklist([step(['*'], { why: ' ' })]))).toEqual(['blank-step']);
    expect(codes(withChecklist([]))).toContain('empty-checklist');
  });

  it('wants the patch’s cables in at exactly one step, and none where it has none', () => {
    const cables: CablePair[] = [['env1.out', 'pitch.in']];

    expect(codes(withChecklist([step(['*'])], { cables }))).toEqual(['cable-step']);
    expect(codes(withChecklist([step(['*']), step([], { cables: true })], { cables }))).toEqual([]);
    expect(codes(withChecklist([step(['*'], { cables: true })]))).toEqual(['cable-step']);
  });

  it('wants a reason where the patch is not a sawtooth', () => {
    expect(codes(withChecklist([step(['*'])], { listen: 'A drum.' }))).toEqual(['no-not-saw']);
    expect(
      codes(withChecklist([step(['*'])], { listen: 'A drum.', notSaw: 'It is a drum synth.' }))
    ).toEqual([]);
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
