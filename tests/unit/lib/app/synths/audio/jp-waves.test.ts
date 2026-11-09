/**
 * The JP-8080's OSC 1 waveforms in the sound engine: super saw, feedback osc, triangle mod and filtered noise.
 *
 * Each is heard through an open voice (one oscillator, the SVF wide open, the VCA held open), so what comes out is the
 * oscillator. Every test compares against a plain wave or a spectrum, so a waveform the engine ignores, being silent,
 * fails them all.
 *
 * @see lib/app/synths/audio/dsp-core.ts
 */

import { describe, it, expect } from 'vitest';

import type { OscParams } from '@/lib/app/synths/contract';
import { allFinite, monoParams, render, rms } from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
const LEN = 24000;
/** A3: 220 Hz, so the eighth harmonic is well inside the band. */
const NOTE = 57;
const F0 = 220;

/** One oscillator straight out: the SVF open and flat, the VCA open with no envelope. */
function play(osc: OscParams, seed?: number): Float32Array {
  const p = monoParams({
    osc: [osc],
    filter: {
      type: 'svf',
      mode: 'lp',
      cutoff: 20000,
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    },
    vca: { envSrc: 'none', bias: 1 },
  });
  return render(p, {
    sr: SR,
    len: LEN,
    seed,
    events: [[0, { type: 'noteOn', n: NOTE, v: 0.9 }]],
  }).out;
}

/** Power at `hz` over the settled second half of `b` (Goertzel, Hann-windowed so a near harmonic does not leak in). */
function power(b: Float32Array, hz: number): number {
  const from = LEN / 2;
  const n = LEN - from;
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0,
    s2 = 0;
  for (let i = from; i < LEN; i++) {
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - from)) / (n - 1));
    const s0 = b[i] * win + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - c * s1 * s2) / n ** 2;
}

const maxDiff = (a: Float32Array, b: Float32Array): number => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

describe('super saw (mix.ssaw)', () => {
  const saw = play({ level: 0.4, mix: { saw: 1 }, semi: 0 });

  it('at zero detune and side mix is the single saw', () => {
    const ss = play({ level: 0.4, mix: { ssaw: 1 }, semi: 0, ssDetune: 0, ssMix: 0 });
    expect(rms(ss)).toBeGreaterThan(0.05);
    expect(maxDiff(ss, saw)).toBeLessThan(1e-6);
  });

  it('with the side saws up but no detune, is still one pitch: no energy off the harmonics', () => {
    const ss = play({ level: 0.4, mix: { ssaw: 1 }, semi: 0, ssDetune: 0, ssMix: 1 });
    expect(maxDiff(ss, saw)).toBeGreaterThan(0.05);
    expect(power(ss, F0 * 1.06)).toBeLessThan(power(ss, F0) * 1e-3);
  });

  it('spreads the spectrum around each harmonic as DETUNE rises', () => {
    const at = (d: number) =>
      play({ level: 0.4, mix: { ssaw: 1 }, semi: 0, ssDetune: d, ssMix: 1 });
    const none = at(0),
      half = at(0.5),
      full = at(1);
    // the outermost saw sits about 10.7 % up at full DETUNE, about 5.4 % at half
    const outer = (b: Float32Array) => power(b, F0 * 1.10745);
    expect(outer(full)).toBeGreaterThan(outer(half) * 10);
    expect(outer(full)).toBeGreaterThan(outer(none) * 100);
    expect(power(half, F0 * 1.0537)).toBeGreaterThan(power(none, F0 * 1.0537) * 100);
    expect(allFinite(full)).toBe(true);
  });

  it('lowers the centre saw as MIX raises the sides', () => {
    const lo = play({ level: 0.4, mix: { ssaw: 1 }, semi: 0, ssDetune: 1, ssMix: 0 });
    const hi = play({ level: 0.4, mix: { ssaw: 1 }, semi: 0, ssDetune: 1, ssMix: 1 });
    expect(power(hi, F0)).toBeLessThan(power(lo, F0));
    expect(power(hi, F0 * 0.88998)).toBeGreaterThan(power(lo, F0 * 0.88998) * 100);
  });
});

describe('feedback osc (mix.fbk)', () => {
  const saw = play({ level: 0.4, mix: { saw: 1 }, semi: 0 });

  it('with no feedback is the plain saw', () => {
    const fb = play({ level: 0.4, mix: { fbk: 1 }, semi: 0, fbHarm: 0.5, fbAmt: 0 });
    expect(rms(fb)).toBeGreaterThan(0.05);
    expect(maxDiff(fb, saw)).toBeLessThan(1e-6);
  });

  it('adds the harmonic HARMONICS picks, louder as the amount rises', () => {
    // fbHarm 0 → the 2nd harmonic, 0.5 → the 5th, 1 → the 8th
    for (const [h, n] of [
      [0, 2],
      [0.5, 5],
      [1, 8],
    ]) {
      const lo = play({ level: 0.4, mix: { fbk: 1 }, semi: 0, fbHarm: h, fbAmt: 0.3 });
      const hi = play({ level: 0.4, mix: { fbk: 1 }, semi: 0, fbHarm: h, fbAmt: 1 });
      expect(power(lo, F0 * n)).toBeGreaterThan(power(saw, F0 * n) * 2);
      expect(power(hi, F0 * n)).toBeGreaterThan(power(lo, F0 * n));
      expect(allFinite(hi)).toBe(true);
    }
  });
});

describe('triangle mod (mix.tfold)', () => {
  const tri = play({ level: 0.4, mix: { tri: 1 }, semi: 0 });

  it('unfolded is the plain triangle', () => {
    const tf = play({ level: 0.4, mix: { tfold: 1 }, semi: 0, fold: 0 });
    expect(rms(tf)).toBeGreaterThan(0.05);
    expect(maxDiff(tf, tri)).toBeLessThan(1e-5);
  });

  it('folded, trades the fundamental for overtones', () => {
    const tf = play({ level: 0.4, mix: { tfold: 1 }, semi: 0, fold: 1 });
    expect(power(tf, F0)).toBeLessThan(power(tri, F0) * 0.1);
    expect(power(tf, F0 * 3)).toBeGreaterThan(power(tri, F0 * 3) * 10);
  });

  it('is moved by the oscillator’s pulse-width destination, as CONTROL 1 is', () => {
    const p = (fold: number) => ({
      level: 0.4,
      mix: { tfold: 1 },
      semi: 0,
      fold,
    });
    const base = monoParams({
      osc: [p(0)],
      filter: {
        type: 'svf',
        mode: 'lp',
        cutoff: 20000,
        res: 0,
        envAmt: 0,
        envSrc: 'env1',
        kbd: 0,
      },
      vca: { envSrc: 'none', bias: 1 },
    });
    const ev = { sr: SR, len: LEN, events: [[0, { type: 'noteOn' as const, n: NOTE, v: 0.9 }]] };
    const moved = render(
      { ...base, routes: [{ src: 'one', dst: 'pw1', amt: 1 }] },
      ev as Parameters<typeof render>[1]
    ).out;
    const folded = play(p(1));
    expect(maxDiff(moved, folded)).toBeLessThan(1e-5);
  });
});

describe('filtered noise (mix.fnoise)', () => {
  it('gets louder as the cutoff opens', () => {
    const dark = play({ level: 0.4, mix: { fnoise: 1 }, semi: 0, nCut: -12 });
    const bright = play({ level: 0.4, mix: { fnoise: 1 }, semi: 0, nCut: 36 });
    expect(rms(dark)).toBeGreaterThan(0.001);
    expect(rms(bright)).toBeGreaterThan(rms(dark) * 2);
  });

  it('at full resonance rings at the played pitch, a near-sine, and stays bounded', () => {
    const ring = play({ level: 0.4, mix: { fnoise: 1 }, semi: 0, nCut: 0, nRes: 1 });
    const flat = play({ level: 0.4, mix: { fnoise: 1 }, semi: 0, nCut: 0, nRes: 0 });
    expect(power(ring, F0)).toBeGreaterThan(power(ring, F0 * 1.5) * 50);
    expect(power(ring, F0)).toBeGreaterThan(power(flat, F0) * 10);
    expect(Math.max(...ring.map(Math.abs))).toBeLessThan(1.5);
  });

  it('follows the oscillator’s pitch', () => {
    const up = play({ level: 0.4, mix: { fnoise: 1 }, semi: 12, nCut: 0, nRes: 1 });
    expect(power(up, F0 * 2)).toBeGreaterThan(power(up, F0) * 50);
  });
});
