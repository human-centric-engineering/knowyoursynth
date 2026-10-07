/**
 * Model D definition tests: the panel → engine mapping, the readouts and the jack checks.
 *
 * `npm run check:synths model-d --compare` proves every sound renders as the prototype's did.
 * These tests pin the branches one at a time, with values worked by hand from the panel's
 * printed scales, so a slip shows up here with a name rather than as a changed fingerprint.
 *
 * @see lib/app/synths/defs/model-d.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  InputJack,
  JackHearContext,
} from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}, ctx: EngineContext = CTX) =>
  modelD.toEngine({ ...modelD.init, ...set }, ctx);

const control = (id: string): Control => {
  const c = modelD.controls.find((x) => x.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};
const readout = (id: string, v: number): string => {
  const c = control(id);
  if (c.kind !== 'cont' || !c.fmt) throw new Error(`${id} has no continuous readout`);
  return c.fmt(v);
};
const input = (id: string): InputJack => {
  const j = modelD.jacks.find((x) => x.id === id);
  if (!j || j.dir !== 'in') throw new Error(`no input jack ${id}`);
  return j;
};
const checkOf = (id: string, set: ControlValues): string | null => {
  const { check } = input(id);
  if (!check) throw new Error(`${id} has no check`);
  return check({ ...modelD.init, ...set });
};

/** `level10` worked out: (v / 10)^1.7 × max. */
const level = (v: number, max: number) => Math.pow(v / 10, 1.7) * max;

describe('Model D toEngine at the init patch', () => {
  const p = run();

  it('sounds oscillator 1 alone, as a sawtooth at 8′', () => {
    expect(p.osc[0]).toMatchObject({ mix: { saw: 1 }, pw: 0.5, semi: 0, kbd: true });
    expect(p.osc[0].level).toBeCloseTo(level(8, 0.9), 10);
    expect(p.osc[1].level).toBe(0);
    expect(p.osc[2]).toMatchObject({ level: 0, semi: -12 });
  });

  it('maps the filter and both contours from the panel scales', () => {
    // CUTOFF 1 is 0.6 of the way up a 20 Hz–20 kHz log sweep.
    expect(p.filter).toMatchObject({ type: 'ladder', mode: 'lp', res: 0, envAmt: 0, kbd: 0 });
    expect(p.filter.cutoff).toBeCloseTo(20 * Math.pow(1000, 0.6), 6);
    // Filter DECAY 4 is the printed 600 ms; FILTER DECAY on, so it is also the release.
    expect(p.env1).toMatchObject({ a: 0.003, d: 0.6, s: 0.4, r: 0.6 });
    // Loudness DECAY 3.5 sits between the printed 200 ms (2) and 600 ms (4), log-spaced.
    expect(p.env2.d).toBeCloseTo(0.2 * Math.pow(3, 0.75), 10);
    expect(p.env2).toMatchObject({ s: 1, r: p.env2.d });
  });

  it('sends nothing on the mod bus while MOD DEPTH is 0', () => {
    expect(run({ 'mod.toOsc': true, 'mod.toFilter': true }).routes).toEqual([]);
  });

  it('sets the output, the LFO and the fixed parts', () => {
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
    expect(p.lfo).toMatchObject({ mix: { tri: 1 }, keySync: false });
    expect(p.lfo.rate).toBeCloseTo(0.05 * Math.pow(4000, 0.45), 10);
    expect(p.noise).toEqual({ level: 0, color: 'white' });
    expect(p.ext).toEqual({ level: 0 });
    expect(p).toMatchObject({ a440: false, paraphonic: false, normals: { extIn: 'out' } });
  });
});

describe('Model D toEngine, switch by switch', () => {
  it('detunes oscillators 2 and 3 and adds the master TUNE to the ones on the keyboard', () => {
    const p = run({ 'osc2.freq': 1, 'osc3.freq': 2, 'ctl.tune': 0.5 });
    expect(p.osc[1].semi).toBe(1.5);
    expect(p.osc[2].semi).toBe(-12 + 2 + 0.5);
  });

  it('frees oscillator 3 from the keyboard: FREQUENCY becomes a wider range, TUNE no longer applies', () => {
    const p = run({ 'osc3.kbd': false, 'osc3.freq': 7, 'ctl.tune': 2 });
    expect(p.osc[2].kbd).toBe(false);
    expect(p.osc[2].semi).toBeCloseTo(-12 + 36, 10);
  });

  it('splits MOD DEPTH between the two sources by MOD MIX, to pitch and cutoff', () => {
    const p = run({
      'mod.toOsc': true,
      'mod.toFilter': true,
      'mod.depth': 10,
      'mod.mix': 5,
      'mod.srcA': 'osc3',
      'mod.srcB': 'lfo',
    });
    expect(p.routes).toEqual([
      { src: 'osc3', dst: 'pitchAll', amt: 7 },
      { src: 'lfo', dst: 'pitchAll', amt: 7 },
      { src: 'osc3', dst: 'cutoff', amt: 2.25 },
      { src: 'lfo', dst: 'cutoff', amt: 2.25 },
    ]);
  });

  it('adds the mod wheel to MOD DEPTH, up to 1.2', () => {
    const half = run({ 'mod.toOsc': true, 'mod.mix': 10 }, { wheel: 0.5, patched: {} });
    expect(half.routes).toEqual([{ src: 'lfo', dst: 'pitchAll', amt: 0.5 * 14 }]);
    const full = run(
      { 'mod.toOsc': true, 'mod.mix': 10, 'mod.depth': 10 },
      { wheel: 1, patched: {} }
    );
    expect(full.routes).toEqual([{ src: 'lfo', dst: 'pitchAll', amt: 1.2 * 14 }]);
  });

  it('takes the filter EG on the left, and noise or the MOD SOURCE cable on the right', () => {
    const set = { 'mod.toFilter': true, 'mod.depth': 10, 'mod.mix': 5 };
    const left = run({ ...set, 'mod.srcA': 'eg', 'mod.srcB': 'noise' });
    expect((left.routes ?? []).map((r) => r.src)).toEqual(['env1', 'noise']);
    const patched = run(
      { ...set, 'mod.srcA': 'eg', 'mod.srcB': 'noise' },
      { wheel: 0, patched: { 'j.modSrc': true } }
    );
    expect((patched.routes ?? []).map((r) => r.src)).toEqual(['env1', 'mult']);
    // MOD MIX fully left: only the left-hand source.
    expect(run({ ...set, 'mod.mix': 0 }).routes).toEqual([
      { src: 'osc3', dst: 'cutoff', amt: 4.5 },
    ]);
  });

  it('follows the mixer, filter, contour and output switches', () => {
    const p = run({
      'mix.osc1On': false,
      'mix.noiseOn': true,
      'mix.noise': 10,
      'noise.colour': 'pink',
      'mix.extOn': true,
      'mix.ext': 10,
      'filter.mode': 'hp',
      'filter.kbd1': true,
      'filter.kbd2': true,
      'env.filterDecay': false,
      'env.loudDecay': false,
      'out.a440': true,
    });
    expect(p.osc[0].level).toBe(0);
    expect(p.noise).toEqual({ level: 0.8, color: 'pink' });
    // The feedback path grows with the main VOLUME (7): 1.6 × (0.4 + 0.7).
    expect(p.ext.level).toBeCloseTo(1.6 * 1.1, 10);
    expect(p.filter).toMatchObject({ mode: 'hp', kbd: 1 });
    expect(p.env1.r).toBe(0.012);
    expect(p.env2.r).toBe(0.012);
    expect(p.a440).toBe(true);
    expect(run({ 'out.mainOn': false }).volume).toBe(0);
  });

  it('switches the LFO to square and sets glide from the knob', () => {
    const p = run({ 'lfo.shape': 'sq', 'ctl.glide': 5 });
    expect(p.lfo.mix).toEqual({ sq: 1 });
    expect(p.glide).toEqual({ time: 0.5, legato: false });
  });
});

describe('Model D readouts', () => {
  it('prints cutoff, LFO rate, glide, tuning and contour times in the panel’s units', () => {
    expect(readout('filter.cutoff', -5)).toBe('20 Hz');
    expect(readout('filter.cutoff', 0)).toBe('632 Hz');
    expect(readout('filter.cutoff', 5)).toBe('20 kHz');
    expect(readout('lfo.rate', 0)).toBe('0.05 Hz');
    expect(readout('lfo.rate', 10)).toBe('200 Hz');
    expect(readout('ctl.glide', 0)).toBe('off');
    expect(readout('ctl.glide', 5)).toBe('500 ms');
    expect(readout('ctl.tune', 1)).toBe('+1 st');
    expect(readout('fenv.attack', 0)).toBe('3 ms');
    expect(readout('aenv.decay', 6)).toBe('1.0 s');
    expect(readout('fenv.decay', 10)).toBe('10 s');
  });

  it('gives the sustain knobs no time readout', () => {
    const c = control('fenv.sustain');
    expect(c.kind === 'cont' && c.fmt).toBeFalsy();
  });
});

describe('Model D jack checks', () => {
  const heard = { 'mod.srcB': 'noise', 'mod.mix': 5, 'mod.toOsc': true, 'mod.depth': 5 };

  it('says what stops a MOD SOURCE cable being heard, in the order to fix it', () => {
    expect(checkOf('j.modSrc', { ...heard, 'mod.srcB': 'lfo' })).toMatch(/NOISE \/ LFO switch/);
    expect(checkOf('j.modSrc', { ...heard, 'mod.mix': 0 })).toMatch(/MOD MIX is fully left/);
    expect(checkOf('j.modSrc', { ...heard, 'mod.toOsc': false })).toMatch(
      /OSCILLATOR MODULATION or FILTER MODULATION/
    );
    expect(checkOf('j.modSrc', { ...heard, 'mod.depth': 0 })).toMatch(/MOD DEPTH is at 0/);
    expect(checkOf('j.modSrc', heard)).toBeNull();
  });

  it('says what stops an EXT cable being heard', () => {
    expect(checkOf('j.ext', { 'mix.extOn': false })).toMatch(/switched off in the mixer/);
    expect(checkOf('j.ext', { 'mix.extOn': true, 'mix.ext': 0 })).toMatch(/EXT IN VOLUME is at 0/);
    expect(checkOf('j.ext', { 'mix.extOn': true, 'mix.ext': 3 })).toBeNull();
  });

  it('describes a MOD SOURCE cable by its source, capitalised', () => {
    const { hear } = input('j.modSrc');
    if (!hear) throw new Error('j.modSrc has no hear');
    // Only `src` is read; the rest of the context is the explainer's.
    const x = { src: 'the filter contour' } as JackHearContext;
    expect(hear(modelD.init, x)).toMatch(/^The filter contour takes the place of noise/);
  });
});
