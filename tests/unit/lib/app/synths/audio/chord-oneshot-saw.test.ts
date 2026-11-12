/**
 * Engine additions for the Korg minilogue xd (t-244): CHORD voice mode (`poly.chord`), the 1-SHOT LFO
 * (`lfo.oneShot`) and the saw's SHAPE (`mix.sfold`).
 *
 * Each is written to fail with its feature taken out: a chord that is not played is one pitch, a one-shot LFO that runs
 * keeps moving the cutoff, and an unfolded saw has the plain saw's spectrum.
 *
 * @see lib/app/synths/audio/dsp-core.ts
 */

import { describe, it, expect } from 'vitest';

import type { EngineParams, EngineRoute, OscParams } from '@/lib/app/synths/contract';
import { allFinite, monoParams, render, rms } from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
const LEN = 24000;
/** A3. */
const NOTE = 57;
const F0 = 220;
const semi = (n: number): number => F0 * 2 ** (n / 12);

/** Power at `hz` over samples `from`..`to` of `b` (Goertzel, Hann-windowed). */
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

/** A sine voice, the filter open, the VCA open: what comes out is the oscillators' pitches. */
const open = (over: Partial<EngineParams> = {}): EngineParams =>
  monoParams({
    osc: [{ level: 0.5, mix: { sine: 1 }, semi: 0 }],
    filter: { type: 'svf', mode: 'lp', cutoff: 20000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
    vca: { envSrc: 'none', bias: 1 },
    ...over,
  });

const play = (p: EngineParams, events = [[0, { type: 'noteOn', n: NOTE, v: 0.9 }]] as const) =>
  render(p, { sr: SR, len: LEN, events: events.map(([t, m]) => [t, { ...m }]) }).out;

describe('CHORD voice mode (poly.chord)', () => {
  const major = (): EngineParams =>
    open({ poly: { voices: 4, stack: 1, mono: true, chord: [0, 4, 7] } });

  it('plays the chord’s intervals on one key', () => {
    const b = play(major());
    expect(allFinite(b)).toBe(true);
    const root = power(b, F0);
    expect(root).toBeGreaterThan(1e-4);
    expect(power(b, semi(4))).toBeGreaterThan(root * 0.5);
    expect(power(b, semi(7))).toBeGreaterThan(root * 0.5);
    // nothing on the intervals it does not hold
    expect(power(b, semi(3))).toBeLessThan(root * 1e-3);
    // without the chord the stack is one voice: the root alone
    const plain = play(open({ poly: { voices: 4, stack: 1, mono: true } }));
    expect(power(plain, semi(4))).toBeLessThan(power(plain, F0) * 1e-3);
  });

  it('a new key moves the whole chord', () => {
    const b = render(major(), {
      sr: SR,
      len: LEN,
      events: [
        [0, { type: 'noteOn', n: NOTE, v: 0.9 }],
        [6016, { type: 'noteOn', n: NOTE + 2, v: 0.9 }],
      ],
    }).out;
    const up = (n: number): number => semi(2 + n);
    expect(power(b, up(0))).toBeGreaterThan(1e-4);
    expect(power(b, up(4))).toBeGreaterThan(power(b, up(0)) * 0.5);
    expect(power(b, up(7))).toBeGreaterThan(power(b, up(0)) * 0.5);
    // the first chord is gone
    expect(power(b, semi(4))).toBeLessThan(power(b, up(4)) * 1e-3);
  });

  it('is not louder for having more voices than one note would', () => {
    const one = rms(play(open({ poly: { voices: 4, stack: 1, mono: true, chord: [0] } })));
    const four = rms(
      play(open({ poly: { voices: 4, stack: 1, mono: true, chord: [0, 4, 7, 11] } }))
    );
    // four unrelated sines sum as power: about √4 = 2 × one, and the stack's gain brings it back down
    expect(four / one).toBeGreaterThan(0.7);
    expect(four / one).toBeLessThan(1.4);
  });
});

describe('1-SHOT LFO (lfo.oneShot)', () => {
  /** A triangle LFO at 4 Hz straight into the oscillator's pitch, an octave deep, read from the pitch itself. */
  const lfoPitch = (oneShot: boolean): EngineParams =>
    open({
      lfo: { rate: 4, mix: { tri: 1 }, keySync: false, oneShot },
      routes: [{ src: 'lfo', dst: 'pitch1', amt: 12 } satisfies EngineRoute],
    });

  it('runs half a cycle from the note, then holds at the top', () => {
    const b = play(lfoPitch(true));
    // half a 4 Hz cycle is 0.125 s; from then on the triangle sits at +1: an octave up, steady
    expect(power(b, 2 * F0)).toBeGreaterThan(power(b, F0) * 100);
    const free = play(lfoPitch(false));
    // the running LFO keeps sweeping, so no one pitch holds the power
    expect(power(free, 2 * F0)).toBeLessThan(power(b, 2 * F0) * 0.2);
  });

  it('starts from the beginning of its cycle on each note', () => {
    const p = lfoPitch(true);
    const b = render(p, {
      sr: SR,
      len: LEN,
      events: [
        [0, { type: 'noteOn', n: NOTE, v: 0.9 }],
        [11904, { type: 'noteOff', n: NOTE }],
        [12032, { type: 'noteOn', n: NOTE, v: 0.9 }],
      ],
    }).out;
    // just after the second note the triangle is back at its bottom: an octave down, not up
    const from = 12032 + 240,
      to = 12032 + 1200;
    expect(power(b, F0 / 2, from, to)).toBeGreaterThan(power(b, 2 * F0, from, to) * 10);
    // and it holds at the top again by the end
    expect(power(b, 2 * F0, LEN - 4800, LEN)).toBeGreaterThan(power(b, F0, LEN - 4800, LEN) * 100);
  });
});

describe('saw SHAPE (mix.sfold)', () => {
  const saw = (fold: number, mix: OscParams['mix'] = { sfold: 1 }): EngineParams =>
    open({ osc: [{ level: 0.4, mix, semi: 0, fold }] });

  it('at 0 is the plain saw', () => {
    const plain = play(saw(0, { saw: 1 }));
    const folded = play(saw(0));
    let m = 0;
    for (let i = 0; i < LEN; i++) m = Math.max(m, Math.abs(plain[i] - folded[i]));
    expect(m).toBeLessThan(1e-5);
  });

  it('folds into a triangle halfway, then past it until the second harmonic leads', () => {
    const rel = (b: Float32Array, h: number): number => power(b, F0 * h) / power(b, F0);
    const plain = play(saw(0));
    // a saw has every harmonic: its second at a quarter of the fundamental's power
    expect(rel(plain, 2)).toBeGreaterThan(0.2);
    // halfway the folded ramp is a triangle: odd harmonics only
    const half = play(saw(0.5));
    expect(rel(half, 2)).toBeLessThan(1e-4);
    expect(rel(half, 3)).toBeGreaterThan(1e-3);
    // fully folded, the second harmonic is louder than the fundamental
    expect(rel(play(saw(1)), 2)).toBeGreaterThan(1);
  });

  it('is moved by the pulse-width destination, added to `fold`', () => {
    const viaCv = play(
      open({
        osc: [{ level: 0.4, mix: { sfold: 1 }, semi: 0, fold: 0.2 }],
        routes: [{ src: 'one', dst: 'pw1', amt: 0.4 }],
      })
    );
    const direct = play(saw(0.6));
    let m = 0;
    for (let i = 0; i < LEN; i++) m = Math.max(m, Math.abs(viaCv[i] - direct[i]));
    expect(m).toBeLessThan(1e-5);
  });
});

describe('review round (t-244)', () => {
  it('a chord longer than the voices plays only as many as there are', () => {
    const b = play(open({ poly: { voices: 2, stack: 1, mono: true, chord: [0, 4, 7] } }));
    expect(power(b, semi(4))).toBeGreaterThan(power(b, F0) * 0.5);
    expect(power(b, semi(7))).toBeLessThan(power(b, F0) * 1e-3);
  });

  it('a one-shot LFO’s sample and hold takes a new value on each note', () => {
    const p = open({
      lfo: { rate: 4, mix: { sh: 1 }, keySync: false, oneShot: true },
      routes: [{ src: 'lfo', dst: 'pitch1', amt: 12 }],
    });
    const b = render(p, {
      sr: SR,
      len: LEN,
      events: [
        [0, { type: 'noteOn', n: NOTE, v: 0.9 }],
        [11904, { type: 'noteOff', n: NOTE }],
        [12032, { type: 'noteOn', n: NOTE, v: 0.9 }],
      ],
    }).out;
    // the pitch each note holds: where the zero crossings say it is
    const hz = (from: number, to: number): number => {
      let z = 0;
      for (let i = from + 1; i < to; i++) if (b[i - 1] < 0 && b[i] >= 0) z++;
      return (z * SR) / (to - from);
    };
    expect(Math.abs(hz(4800, 11000) - hz(16800, 24000))).toBeGreaterThan(5);
  });

  it('the folded saw has no click at its reset: no sample jumps far past its neighbours', () => {
    const b = play(open({ osc: [{ level: 0.4, mix: { sfold: 1 }, semi: 0, fold: 0.5 }] }));
    let worst = 0;
    for (let i = LEN / 2 + 1; i < LEN; i++) worst = Math.max(worst, Math.abs(b[i] - b[i - 1]));
    // at fold 0.5 the wave is a continuous triangle: steps of about 4 × level × 220 / 48000 per sample
    expect(worst).toBeLessThan(0.02);
  });
});
