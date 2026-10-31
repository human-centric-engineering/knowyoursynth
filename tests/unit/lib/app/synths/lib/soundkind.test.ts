/**
 * The sound detector on hand-built patches: what it reads off the audio, the kind it says each patch is, that the same
 * patch always reads the same, and that a patch changed on the panel reads as what it has become.
 *
 * The patches are built here, not taken from the library, so the model was never fitted to them. The library-wide
 * agreement is `soundkind-library.test.ts`.
 *
 * @see lib/app/synths/lib/soundkind.ts
 */

import { describe, it, expect } from 'vitest';

import { PATTERN_ROLES } from '@/lib/app/patterns/library-facts';
import { PRESET_CATEGORIES, type EngineParams, type SynthDef } from '@/lib/app/synths/contract';
import { getSynthDef } from '@/lib/app/synths/defs';
import {
  KIND_INPUTS,
  kindCategories,
  kindInputs,
  kindOf,
  panelSoundKind,
  registerOf,
  soundFeatures,
  soundKind,
  type SoundFeatures,
} from '@/lib/app/synths/lib/soundkind';
import { KIND_MODEL } from '@/lib/app/synths/lib/soundkind-model';
import { monoParams } from '@/tests/unit/lib/app/synths/audio/render';

const silentOsc = [
  { level: 0, mix: { saw: 1 }, semi: 0 },
  { level: 0, mix: { pulse: 1 }, semi: 0 },
  { level: 0, mix: { tri: 1 }, semi: 0 },
];

/** A plucked bass: two oscillators an octave and two below the key, a low filter snapped open and shut. */
const pluckBass = (): EngineParams =>
  monoParams({
    osc: [
      { level: 0.8, mix: { saw: 1 }, semi: -12 },
      { level: 0.5, mix: { pulse: 1 }, pw: 0.4, semi: -24 },
      { level: 0, mix: { tri: 1 }, semi: 0 },
    ],
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 300,
      res: 0.4,
      envAmt: 3,
      envSrc: 'env1',
      kbd: 0.3,
    },
    env1: { a: 0.002, d: 0.12, s: 0, r: 0.05 },
    env2: { a: 0.002, d: 0.25, s: 0, r: 0.05 },
  });

/** A pad: six voices of two saws, a second and a quarter to swell in, a long release. */
const slowPad = (env2 = { a: 1.2, d: 0.5, s: 0.9, r: 1.5 }): EngineParams =>
  monoParams({
    poly: { voices: 6, stack: 1, mono: false },
    osc: [
      { level: 0.6, mix: { saw: 1 }, semi: 0 },
      { level: 0.6, mix: { saw: 1 }, semi: 0 },
      { level: 0, mix: { tri: 1 }, semi: 0 },
    ],
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 1200,
      res: 0.1,
      envAmt: 0.5,
      envSrc: 'env1',
      kbd: 0.5,
    },
    env1: { a: 1.2, d: 0.5, s: 0.8, r: 1.5 },
    env2,
  });

/** A noise sweep: no oscillators, noise through a resonant filter its envelope sweeps up. */
const noiseSweep = (): EngineParams =>
  monoParams({
    osc: silentOsc,
    noise: { level: 1 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 200,
      res: 0.7,
      envAmt: 5,
      envSrc: 'env1',
      kbd: 0,
    },
    env1: { a: 0.5, d: 0.5, s: 0.2, r: 0.5 },
    env2: { a: 0.05, d: 0.3, s: 0.9, r: 0.4 },
  });

const sum = (o: Record<string, number>): number => Object.values(o).reduce((s, x) => s + x, 0);

describe('soundFeatures', () => {
  it('reads how a plucked bass starts, dies away and where it sounds', () => {
    const f = soundFeatures(pluckBass());
    expect(f.silent).toBe(false);
    expect(f.attack).toBeLessThan(0.03);
    expect(f.decay).toBeLessThan(0.15);
    expect(f.sustain).toBeLessThan(0.05);
    expect(f.release).toBe(0); // gone before the key comes up
    // The loudest oscillator is two octaves below the key, and it still follows the keys from C2 up.
    expect(f.pitch).toBeCloseTo(-2, 1);
    expect(f.clarity).toBeGreaterThan(0.9);
    expect(f.voices).toBe(1);
  });

  it('reads a pad as slow to start, held and long to let go, with its voices', () => {
    const f = soundFeatures(slowPad());
    expect(f.attack).toBeGreaterThan(0.35);
    expect(f.sustain).toBeGreaterThan(0.85);
    expect(f.release).toBe(0.3); // still sounding when the probe stops listening
    expect(f.tracking).toBeCloseTo(1, 1);
    expect(f.pulses).toBe(0);
    expect(f.voices).toBe(6);
  });

  it('reads noise as noisy, bright and without a pitch', () => {
    const noise = soundFeatures(noiseSweep());
    const tone = soundFeatures(slowPad());
    expect(noise.noise).toBeGreaterThan(3 * tone.noise);
    expect(noise.clarity).toBeLessThan(0.5);
    expect(noise.tracking).toBe(0);
    expect(noise.brightness).toBeGreaterThan(tone.brightness + 2);
  });

  it('counts the re-attacks of a gated note and the movement of a tremolo', () => {
    // A square LFO at 8 Hz on the amplifier: the held note pulses.
    const gated = soundFeatures(
      monoParams({
        routes: [{ src: 'lfoSq', dst: 'amp', amt: 1 }],
        lfo: { rate: 8, mix: { tri: 1 }, keySync: true },
      })
    );
    const steady = soundFeatures(monoParams({ env2: { a: 0.003, d: 0.2, s: 1, r: 0.1 } }));
    expect(gated.pulses).toBeGreaterThanOrEqual(2);
    expect(gated.wobble).toBeGreaterThan(steady.wobble + 1);
    expect(steady.pulses).toBe(0);
  });

  it('counts a poly patch played as one voice, and stacked voices, as the notes it can play', () => {
    expect(soundFeatures(monoParams({ poly: { voices: 8, stack: 1, mono: true } })).voices).toBe(1);
    expect(soundFeatures(monoParams({ poly: { voices: 8, stack: 2, mono: false } })).voices).toBe(
      4
    );
  });

  it('reads a patch with nothing turned up as silent, and every other field as zero', () => {
    const f = soundFeatures(monoParams({ osc: silentOsc }));
    expect(f).toMatchObject({ silent: true, attack: 0, sustain: 0, clarity: 0, voices: 1 });
    expect(kindOf(f)).toBeNull();
    expect(soundKind(monoParams({ osc: silentOsc }))).toBeNull();
  });
});

describe('soundKind', () => {
  it('reads a plucked bass as a bass, for a bass line, in the low register', () => {
    const k = soundKind(pluckBass());
    expect(k).not.toBeNull();
    expect(['bass', 'perc']).toContain(k?.category);
    expect(['bass_line', 'percussive']).toContain(k?.role);
    expect(k?.register).toBe('low');
  });

  it('reads a long-attack pad as a pad, for held or slow parts', () => {
    const k = soundKind(slowPad());
    expect(k?.category).toBe('pad');
    expect(['held', 'slow_melody', 'chord_changes']).toContain(k?.role);
    expect(k?.register).toBe('mid');
  });

  it('reads a noise sweep as fx', () => {
    expect(soundKind(noiseSweep())?.category).toBe('fx');
  });

  it('reads a pad changed to start and stop at once as something else, with fewer held parts', () => {
    const pad = soundKind(slowPad());
    const plucked = soundKind(slowPad({ a: 0.002, d: 0.15, s: 0, r: 0.1 }));
    expect(plucked?.category).not.toBe('pad');
    expect(plucked?.roles.held).toBeLessThan(pad?.roles.held ?? 0);
  });

  it('gives every category and every role a share, and the shares sum to 1', () => {
    const k = soundKind(slowPad());
    expect(Object.keys(k?.categories ?? {}).sort()).toEqual([...PRESET_CATEGORIES].sort());
    expect(Object.keys(k?.roles ?? {}).sort()).toEqual([...PATTERN_ROLES].sort());
    expect(sum(k?.categories ?? {})).toBeCloseTo(1, 6);
    expect(sum(k?.roles ?? {})).toBeCloseTo(1, 2); // the model's role shares are rounded to 3 places
    expect(k?.categories[k.category]).toBe(Math.max(...Object.values(k?.categories ?? {})));
    expect(k?.roles[k.role]).toBe(Math.max(...Object.values(k?.roles ?? {})));
  });

  it('gives the same patch the same result twice', () => {
    const a = soundKind(noiseSweep());
    const b = soundKind(noiseSweep());
    expect(a).toEqual(b);
    expect(soundFeatures(pluckBass())).toEqual(soundFeatures(pluckBass()));
  });
});

describe('kindOf', () => {
  const base = (over: Partial<SoundFeatures>): SoundFeatures => ({
    ...soundFeatures(monoParams()),
    ...over,
  });

  it('suits the low register to a bass, or to a patch sounding an octave or more below its key', () => {
    expect(registerOf(base({ pitch: 0 }), 'bass')).toBe('low');
    expect(registerOf(base({ pitch: -1 }), 'lead')).toBe('low');
    expect(registerOf(base({ pitch: -0.4 }), 'lead')).toBe('mid');
  });

  it('suits the high register to a patch an octave above its key, or one thin at the bottom', () => {
    expect(registerOf(base({ pitch: 1 }), 'lead')).toBe('high');
    expect(registerOf(base({ pitch: 0, levels: { low: -9, mid: 0, high: 0 } }), 'pad')).toBe(
      'high'
    );
    expect(registerOf(base({ pitch: 0, levels: { low: -8, mid: 0, high: 0 } }), 'pad')).toBe('mid');
  });

  it('weighs each role by how often sounds of each category carry it', () => {
    const f = soundFeatures(slowPad());
    const k = kindOf(f);
    const categories = kindCategories(f);
    for (const role of PATTERN_ROLES) {
      const want = PRESET_CATEGORIES.reduce(
        (s, c) => s + categories[c] * KIND_MODEL.roles[c][role],
        0
      );
      expect(k?.roles[role]).toBeCloseTo(want, 10);
    }
  });
});

describe('the model and its inputs', () => {
  it('was fitted to the inputs the detector reads today (refit with scripts/fit-soundkind.ts if not)', () => {
    expect(KIND_MODEL.inputs).toEqual([...KIND_INPUTS]);
    expect(KIND_MODEL.mean).toHaveLength(KIND_INPUTS.length);
    expect(KIND_MODEL.scale).toHaveLength(KIND_INPUTS.length);
    for (const c of PRESET_CATEGORIES)
      expect(KIND_MODEL.weights[c]).toHaveLength(KIND_INPUTS.length + 1);
    expect(kindInputs(soundFeatures(monoParams()))).toHaveLength(KIND_INPUTS.length);
  });

  it('gives every category the share of its sounds carrying each role, summing to 1', () => {
    for (const c of PRESET_CATEGORIES) expect(sum(KIND_MODEL.roles[c])).toBeCloseTo(1, 2);
  });
});

describe('panelSoundKind', () => {
  it('reads a synth panel the way the live voice would play it', () => {
    const def = getSynthDef('model-d');
    if (!def) throw new Error('model-d is registered');
    const k = panelSoundKind(def, { ...def.init }, []);
    expect(k).not.toBeNull();
    expect(k?.features.voices).toBe(1);
  });

  it('gives null for a panel that cannot be turned into sound', () => {
    const def = getSynthDef('model-d');
    if (!def) throw new Error('model-d is registered');
    const broken: SynthDef = {
      ...def,
      toEngine: () => {
        throw new Error('no engine');
      },
    };
    expect(panelSoundKind(broken, { ...def.init }, [])).toBeNull();
  });
});
