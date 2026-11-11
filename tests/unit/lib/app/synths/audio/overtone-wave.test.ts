/**
 * The 0-COAST's OVERTONE into MULTIPLY in the sound engine (`mix.ovt`).
 *
 * Each is heard through an open voice (one oscillator, the SVF wide open, the VCA held open), so what comes out is the
 * oscillator. The tests read harmonics: a plain triangle has no even harmonics and a small third, so the added odd
 * harmonic shows as a louder third, the even one as a second where there was none, and folding as energy above both.
 * A shape the engine ignored would be silent and fail them all.
 *
 * @see lib/app/synths/audio/dsp-core.ts
 */

import { describe, it, expect } from 'vitest';

import type { EngineRoute, OscParams } from '@/lib/app/synths/contract';
import { allFinite, monoParams, render, rms } from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
const LEN = 24000;
/** A3: 220 Hz, so the seventh harmonic is well inside the band. */
const NOTE = 57;
const F0 = 220;

/** One oscillator straight out: the SVF open and flat, the VCA open with no envelope; `routes` as given. */
function play(osc: OscParams, routes: EngineRoute[] = []): Float32Array {
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
    routes,
  });
  return render(p, {
    sr: SR,
    len: LEN,
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

const ovt = (amount: number, fold = 0): OscParams => ({
  level: 0.4,
  mix: { ovt: 1 },
  semi: 0,
  ovt: amount,
  fold,
});

describe('overtone (mix.ovt)', () => {
  const tri = play({ level: 0.4, mix: { tri: 1 }, semi: 0 });

  it('at the odd end adds the third harmonic and no second', () => {
    const odd = play(ovt(0));
    expect(rms(odd)).toBeGreaterThan(0.05);
    expect(allFinite(odd)).toBe(true);
    expect(power(odd, F0 * 3)).toBeGreaterThan(power(tri, F0 * 3) * 10);
    expect(power(odd, F0 * 2)).toBeLessThan(power(odd, F0) * 1e-4);
  });

  it('at the even end adds the second harmonic, and the third falls back', () => {
    const odd = play(ovt(0));
    const even = play(ovt(1));
    expect(power(even, F0 * 2)).toBeGreaterThan(power(even, F0) * 0.05);
    expect(power(even, F0 * 2)).toBeGreaterThan(power(tri, F0 * 2) * 1000);
    expect(power(even, F0 * 3)).toBeLessThan(power(odd, F0 * 3) * 0.2);
  });

  it('between the two, blends them rather than jumping to one', () => {
    const odd = play(ovt(0));
    const even = play(ovt(1));
    const mid = play(ovt(0.5));
    const h2 = power(mid, F0 * 2);
    const h3 = power(mid, F0 * 3);
    expect(h2).toBeGreaterThan(power(odd, F0 * 2) * 100);
    expect(h2).toBeLessThan(power(even, F0 * 2));
    expect(h3).toBeGreaterThan(power(even, F0 * 3));
    expect(h3).toBeLessThan(power(odd, F0 * 3));
  });

  it('is moved by the oscillator’s wave destination, added to `ovt` and clamped to 0..1', () => {
    // a partial amount adds rather than replaces: 0.25 + 0.5 lands on 0.75, not on 0.5
    expect(
      maxDiff(play(ovt(0.25), [{ src: 'one', dst: 'wave1', amt: 0.5 }]), play(ovt(0.75)))
    ).toBeLessThan(1e-5);
    expect(
      maxDiff(play(ovt(0.5), [{ src: 'one', dst: 'wave1', amt: -1 }]), play(ovt(0)))
    ).toBeLessThan(1e-5);
    expect(
      maxDiff(play(ovt(0.5), [{ src: 'one', dst: 'wave1', amt: 1 }]), play(ovt(1)))
    ).toBeLessThan(1e-5);
  });

  it('folded by MULTIPLY, adds harmonics above the overtone', () => {
    const plain = play(ovt(0, 0));
    const folded = play(ovt(0, 1));
    expect(allFinite(folded)).toBe(true);
    expect(power(folded, F0 * 5) + power(folded, F0 * 7)).toBeGreaterThan(
      (power(plain, F0 * 5) + power(plain, F0 * 7)) * 10
    );
  });

  it('takes MULTIPLY from the pulse-width destination too, added to `fold`', () => {
    const moved = play(ovt(0, 0.25), [{ src: 'one', dst: 'pw1', amt: 0.5 }]);
    expect(maxDiff(moved, play(ovt(0, 0.75)))).toBeLessThan(1e-5);
  });

  it('folds what reaches ovtIn along with the overtone', () => {
    // An offset into the folder makes the fold lopsided, so even harmonics appear where the odd end has none. Added after
    // the folder it would only shift the wave, with no new harmonics.
    const without = play(ovt(0, 0.5));
    const withIn = play(ovt(0, 0.5), [{ src: 'one', dst: 'ovtIn', amt: 0.4 }]);
    expect(power(withIn, F0 * 2)).toBeGreaterThan(power(without, F0 * 2) * 1000);
  });

  it('leaves a tfold oscillator’s glide as it was: fold still smoothed, and once a sample', () => {
    // fold steps 0 → 1 while the note plays. Smoothed, it glides; not smoothed, it would never move; smoothed twice
    // with mix.ovt also on, it would arrive sooner than with tfold alone.
    const AT = 128 * 90; // on a block boundary, where render() applies a message
    const glide = (mix: OscParams['mix']): Float32Array => {
      const at = (fold: number) =>
        monoParams({
          osc: [{ level: 0.4, mix, semi: 0, fold }],
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
      const p = at(0);
      return render(p, {
        sr: SR,
        len: LEN,
        events: [
          [0, { type: 'noteOn', n: NOTE, v: 0.9 }],
          [AT, { type: 'params', p: at(1) }],
        ],
      }).out;
    };
    const tf = glide({ tfold: 1 });
    const folded = play({ level: 0.4, mix: { tfold: 1 }, semi: 0, fold: 1 });
    const before = tf.subarray(0, AT);
    expect(maxDiff(before, tri.subarray(0, AT))).toBeLessThan(1e-5);
    // 1 ms in it is between the two; 100 ms in it has arrived (the phase is the same, as only fold changed)
    const ms = SR / 1000;
    const between = (i: number) => Math.abs(tf[i] - folded[i]);
    let early = 0;
    for (let i = AT + ms; i < AT + 2 * ms; i++) early = Math.max(early, between(i));
    let late = 0;
    for (let i = AT + 100 * ms; i < LEN; i++) late = Math.max(late, between(i));
    expect(early).toBeGreaterThan(0.01);
    expect(late).toBeLessThan(1e-4);
    // with a negligible mix.ovt beside it, the tfold part glides the same way
    expect(maxDiff(glide({ tfold: 1, ovt: 1e-9 }), tf)).toBeLessThan(1e-6);
  });
});
