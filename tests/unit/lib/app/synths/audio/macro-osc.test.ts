/**
 * The macro oscillator in the sound engine (`mix.macro`): the MicroFreak's wavetable, harmonic, plucked string,
 * formant, speech and modal models.
 *
 * Each model is heard through an open voice (one oscillator, the SVF wide open, the VCA held open), so what comes out
 * is the oscillator. For each one: it sounds, it stays under full scale, each of its three settings changes it, and
 * dests `mWave`, `mTimbre` and `mShape` move those settings as the knobs do. Then one test per model on what its
 * settings are said to do, read from harmonics, band levels or how the sound dies away. A model the engine ignored would
 * be silent and fail them all.
 *
 * @see lib/app/synths/audio/macro-osc.ts
 */

import { describe, it, expect } from 'vitest';

import type { EngineRoute, MacroOscParams, OscParams } from '@/lib/app/synths/contract';
import { allFinite, monoParams, render, rms } from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
const LEN = 24000;
/** A3: 220 Hz, so the low harmonics are well inside the band. */
const NOTE = 57;
const F0 = 220;
const SEED = 7;

type Model = MacroOscParams['model'];
const MODELS: Model[] = ['wavetable', 'harmo', 'pluck', 'formant', 'speech', 'modal'];

const osc = (q: MacroOscParams): OscParams => ({
  level: 0.4,
  mix: { macro: 1 },
  semi: 0,
  macro: q,
});

/** One macro oscillator straight out, the note held from the start. */
function play(q: MacroOscParams, routes: EngineRoute[] = [], note = NOTE, len = LEN): Float32Array {
  const p = monoParams({
    osc: [osc(q)],
    filter: { type: 'svf', mode: 'lp', cutoff: 20000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
    vca: { envSrc: 'none', bias: 1 },
    routes,
  });
  return render(p, {
    sr: SR,
    len,
    events: [[0, { type: 'noteOn', n: note, v: 0.9 }]],
    seed: SEED,
  }).out;
}

const peak = (b: Float32Array): number => b.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

/** Power at `hz` over samples `from`..`to` of `b` (Goertzel, Hann-windowed so a near harmonic does not leak in). */
function power(b: Float32Array, hz: number, from = LEN / 2, to = LEN): number {
  const n = to - from;
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0,
    s2 = 0;
  for (let i = from; i < to; i++) {
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - from)) / (n - 1));
    const s0 = b[i] * win + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - c * s1 * s2) / n ** 2;
}

/** Mean power across `lo`..`hi` Hz in 20 Hz steps. */
function band(b: Float32Array, lo: number, hi: number, from = LEN / 2, to = LEN): number {
  let s = 0,
    k = 0;
  for (let hz = lo; hz <= hi; hz += 20, k++) s += power(b, hz, from, to);
  return s / k;
}

const maxDiff = (a: Float32Array, b: Float32Array): number => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

const at = (model: Model, wave = 0.5, timbre = 0.5, shape = 0.5): MacroOscParams => ({
  model,
  wave,
  timbre,
  shape,
});

describe.each(MODELS)('macro oscillator %s', (model) => {
  it('sounds, under full scale', () => {
    const b = play(at(model));
    expect(allFinite(b)).toBe(true);
    expect(rms(b)).toBeGreaterThan(0.01);
    expect(peak(b)).toBeLessThan(1);
  });

  it.each(['wave', 'timbre', 'shape'] as const)('responds to %s', (key) => {
    const lo = play({ ...at(model), [key]: 0.15 });
    const hi = play({ ...at(model), [key]: 0.85 });
    // the two settings differ by much more than the seeded noise any model adds is allowed to
    expect(maxDiff(lo, hi)).toBeGreaterThan(0.05);
  });

  it.each([
    ['mWave', 'wave'],
    ['mTimbre', 'timbre'],
    ['mShape', 'shape'],
  ] as const)('dest %s moves %s as its knob does', (dst, key) => {
    const knob = play({ ...at(model), [key]: 0.8 });
    const routed = play({ ...at(model), [key]: 0.2 }, [{ src: 'one', dst, amt: 0.6 }]);
    expect(maxDiff(knob, routed)).toBeLessThan(1e-4);
    // and the sum is held to 0..1: pushing past the top is the top
    const over = play({ ...at(model), [key]: 0.8 }, [{ src: 'one', dst, amt: 5 }]);
    const top = play({ ...at(model), [key]: 1 });
    expect(maxDiff(over, top)).toBeLessThan(1e-4);
  });
});

describe('wavetable', () => {
  it('table 0 runs from a saw (even harmonics) to a square (none)', () => {
    const saw = play(at('wavetable', 0, 0, 0));
    const sq = play(at('wavetable', 0, 1, 0));
    expect(power(saw, 2 * F0)).toBeGreaterThan(power(saw, F0) * 0.1);
    expect(power(sq, 2 * F0)).toBeLessThan(power(sq, F0) * 1e-3);
    expect(power(sq, 3 * F0)).toBeGreaterThan(power(sq, F0) * 0.05);
  });

  it('stays band-limited high up the keyboard', () => {
    // C8 (4186 Hz): a saw's harmonics past Nyquist would fold back below the fundamental
    const b = play(at('wavetable', 0, 0, 0), [], 108);
    expect(band(b, 200, 3000)).toBeLessThan(power(b, 4186.01) * 1e-3);
  });
});

describe('harmo', () => {
  it('is a sine at TIMBRE 0 and has its partials at 1', () => {
    const sine = play(at('harmo', 0, 0, 0));
    const full = play(at('harmo', 0, 1, 0));
    expect(power(sine, 3 * F0)).toBeLessThan(power(sine, F0) * 1e-3);
    expect(power(full, 3 * F0)).toBeGreaterThan(power(full, F0) * 0.05);
  });
});

describe('pluck', () => {
  it('plays at the note and dies away, ringing longer with SHAPE', () => {
    const short = play(at('pluck', 0, 0.6, 0.2), [], NOTE, 48000);
    const long = play(at('pluck', 0, 0.6, 0.9), [], NOTE, 48000);
    const late = (b: Float32Array) => rms(b, 36000, 48000);
    expect(late(short)).toBeLessThan(rms(short, 0, 4800) * 0.05);
    expect(late(long)).toBeGreaterThan(late(short) * 10);
    // the string's pitch is the note's
    expect(power(long, F0, 4800, 28800)).toBeGreaterThan(power(long, F0 * 1.06, 4800, 28800) * 10);
  });

  it('keeps sounding while WAVE bows it', () => {
    const plucked = play(at('pluck', 0, 0.6, 0.2), [], NOTE, 48000);
    const bowed = play(at('pluck', 1, 0.6, 0.2), [], NOTE, 48000);
    expect(rms(bowed, 36000, 48000)).toBeGreaterThan(rms(plucked, 36000, 48000) * 10);
  });
});

describe('formant', () => {
  it('moves its formant up with TIMBRE', () => {
    const lo = play(at('formant', 0, 0.2, 0.5));
    const hi = play(at('formant', 0, 0.7, 0.5));
    const ratio = (b: Float32Array) => band(b, 2500, 6000) / band(b, 100, 1000);
    expect(ratio(hi)).toBeGreaterThan(ratio(lo) * 10);
  });
});

describe('speech', () => {
  it('puts the second formant high for i and low for u', () => {
    const i = play(at('speech', 0, 0.5, 0.5));
    const u = play(at('speech', 0, 0.5, 1));
    // a man's i has F2 near 2290 Hz, his u near 870 Hz
    const f2 = (b: Float32Array) => band(b, 2100, 2500) / band(b, 700, 1000);
    expect(f2(i)).toBeGreaterThan(f2(u) * 10);
  });
});

describe('modal', () => {
  it('rings after the strike and longer with SHAPE', () => {
    const short = play(at('modal', 0, 0.3, 0.2), [], NOTE, 48000);
    const long = play(at('modal', 0, 0.3, 0.9), [], NOTE, 48000);
    const late = (b: Float32Array) => rms(b, 36000, 48000);
    expect(late(short)).toBeLessThan(rms(short, 0, 4800) * 0.05);
    expect(late(long)).toBeGreaterThan(late(short) * 10);
  });

  it('is harmonic at WAVE 0 and not at 1', () => {
    const harm = play(at('modal', 0, 0.3, 0.9), [], NOTE, 48000);
    const bar = play(at('modal', 1, 0.3, 0.9), [], NOTE, 48000);
    const second = (b: Float32Array) => power(b, 2 * F0, 0, 24000) / power(b, F0, 0, 24000);
    expect(second(harm)).toBeGreaterThan(second(bar) * 10);
  });
});
