/**
 * The 0-COAST's SLOPE and CONTOUR in the sound engine: the `eoc` / `eon` gates, the `env2Rate` / `env1DecRate` time
 * CVs, a looping curved envelope and a free-running one (`EnvParams.free`).
 *
 * Two ways of hearing a control signal through the output, which DC-blocks: as the loudness of a steady tone (the
 * signal routed to the VCA's `amp`, read as RMS over a window), or as audio itself (normal `vcaIn` ← the signal, for a
 * looping envelope fast enough to pass the DC blocker).
 *
 * @see lib/app/synths/audio/dsp-core.ts
 */

import { describe, it, expect } from 'vitest';

import type { EngineParams, EngineRoute, EnvParams } from '@/lib/app/synths/contract';
import type { Timed } from '@/tests/unit/lib/app/synths/audio/render';
import { allFinite, monoParams, render, rms } from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
const LEN = SR;
const ms = (t: number) => Math.round((t * SR) / 1000);

const held: Timed[] = [[0, { type: 'noteOn', n: 57, v: 0.9 }]];

/** A steady 220 Hz triangle whose loudness is the routed signal alone: the VCA shut but for `routes`. */
function loudness(over: Partial<EngineParams>, routes: EngineRoute[], events = held): Float32Array {
  const p = monoParams({
    osc: [{ level: 0.4, mix: { tri: 1 }, semi: 0 }],
    filter: {
      type: 'svf',
      mode: 'lp',
      cutoff: 20000,
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    },
    vca: { envSrc: 'none', bias: 0 },
    routes,
    ...over,
  });
  return render(p, { sr: SR, len: LEN, events }).out;
}

/** Envelope 2 itself as the output: normal `vcaIn` ← env2 through an open VCA. */
function env2Out(env2: EnvParams, routes: EngineRoute[] = [], events = held, extra = {}) {
  const p = monoParams({
    env2,
    vca: { envSrc: 'none', bias: 1 },
    normals: { vcaIn: 'env2', ...extra },
    routes,
  });
  return render(p, { sr: SR, len: LEN, events }).out;
}

/** RMS between two times in milliseconds. */
const win = (b: Float32Array, from: number, to: number) => rms(b, ms(from), ms(to));

/** Power at `hz` over the second half of `b` (Goertzel, Hann-windowed). */
function power(b: Float32Array, hz: number): number {
  const from = LEN / 2;
  const n = LEN - from;
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0,
    s2 = 0;
  for (let i = from; i < LEN; i++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - from)) / (n - 1));
    const s0 = b[i] * h + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - c * s1 * s2) / n ** 2;
}

/** The decay rate of a fading tone, per second: the log of its loudness falling from one window to a later one. */
const decayRate = (b: Float32Array, t1: number, t2: number) =>
  Math.log(win(b, t1, t1 + 10) / win(b, t2, t2 + 10)) / ((t2 - t1) / 1000);

const maxDiff = (a: Float32Array, b: Float32Array, from = 0): number => {
  let m = 0;
  for (let i = from; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

describe('eoc (SLOPE end of cycle)', () => {
  it('is low only while Envelope 2 falls', () => {
    // rises over about 50 ms, then falls to its sustain of zero, within reach of it after about 150 ms more
    const b = loudness({ env2: { a: 0.05, d: 0.1, s: 0, r: 0.1 } }, [
      { src: 'eoc', dst: 'amp', amt: 1 },
    ]);
    expect(allFinite(b)).toBe(true);
    const rising = win(b, 10, 40);
    expect(rising).toBeGreaterThan(0.05);
    expect(win(b, 80, 120)).toBeLessThan(rising * 0.01);
    expect(win(b, 400, 600)).toBeGreaterThan(rising * 0.9);
  });

  it('is high at rest, before anything fires Envelope 2', () => {
    const b = loudness(
      { env2: { a: 0.05, d: 0.1, s: 0, r: 0.1 } },
      [{ src: 'eoc', dst: 'amp', amt: 1 }],
      []
    );
    expect(win(b, 100, 300)).toBeGreaterThan(0.05);
  });
});

describe('eon (CONTOUR end of onset)', () => {
  it('is high from the end of Envelope 1’s attack until it is back at zero', () => {
    const b = loudness(
      { env1: { a: 0.05, d: 0.1, s: 0.5, r: 0.1 } },
      [{ src: 'eon', dst: 'amp', amt: 1 }],
      [
        [0, { type: 'noteOn', n: 57, v: 0.9 }],
        [ms(300), { type: 'noteOff', n: 57 }],
      ]
    );
    const on = win(b, 100, 280);
    expect(on).toBeGreaterThan(0.05);
    expect(win(b, 5, 40)).toBeLessThan(on * 0.01);
    // through the release, and low once it has finished (an RC release reaches zero about 340 ms after the key)
    expect(win(b, 320, 360)).toBeGreaterThan(on * 0.9);
    expect(win(b, 800, 1000)).toBeLessThan(on * 0.01);
  });
});

describe('time CV', () => {
  it('env2Rate +1 halves a looping Envelope 2’s cycle', () => {
    const loop: EnvParams = {
      a: 0.01,
      d: 0.01,
      s: 0,
      r: 0.01,
      curve: { a: 0.5, d: 0.5, r: 0.5 },
      loop: true,
    };
    const base = env2Out(loop);
    const fast = env2Out(loop, [{ src: 'one', dst: 'env2Rate', amt: 1 }]);
    // a straight rise and fall of 10 ms each: a 50 Hz triangle, then 100 Hz
    expect(power(base, 50)).toBeGreaterThan(power(base, 100) * 100);
    expect(power(fast, 100)).toBeGreaterThan(power(fast, 50) * 100);
    expect(power(fast, 100)).toBeGreaterThan(power(base, 50) * 0.5);
  });

  it('env2Rate speeds an RC Envelope 2’s fall too', () => {
    const env2: EnvParams = { a: 0.001, d: 0.2, s: 0, r: 0.2 };
    const to = (routes: EngineRoute[]) =>
      loudness({ env2 }, [{ src: 'env2', dst: 'amp', amt: 1 }, ...routes]);
    const ratio =
      decayRate(to([{ src: 'one', dst: 'env2Rate', amt: 1 }]), 30, 80) / decayRate(to([]), 30, 80);
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });

  it('env1DecRate +1 halves Envelope 1’s decay and leaves its attack alone', () => {
    const env1: EnvParams = { a: 0.03, d: 0.2, s: 0, r: 0.2 };
    const to = (routes: EngineRoute[]) =>
      loudness({ env1 }, [{ src: 'env1', dst: 'amp', amt: 1 }, ...routes]);
    const base = to([]);
    const fast = to([{ src: 'one', dst: 'env1DecRate', amt: 1 }]);
    const ratio = decayRate(fast, 60, 110) / decayRate(base, 60, 110);
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
    expect(maxDiff(base.subarray(0, ms(20)), fast.subarray(0, ms(20)))).toBeLessThan(1e-6);
  });

  it('changes nothing when nothing reaches it', () => {
    const env1: EnvParams = { a: 0.03, d: 0.2, s: 0, r: 0.2 };
    const base = loudness({ env1 }, [{ src: 'env1', dst: 'amp', amt: 1 }]);
    const zero = loudness({ env1 }, [
      { src: 'env1', dst: 'amp', amt: 1 },
      { src: 'one', dst: 'env1DecRate', amt: 0 },
      { src: 'one', dst: 'env2Rate', amt: 0 },
    ]);
    expect(maxDiff(base, zero)).toBe(0);
  });
});

describe('a looping curved envelope', () => {
  it('repeats, each rise and fall keeping its curve', () => {
    const straight = env2Out({
      a: 0.01,
      d: 0.01,
      s: 0,
      r: 0.01,
      curve: { a: 0.5, d: 0.5, r: 0.5 },
      loop: true,
    });
    const bent = env2Out({
      a: 0.01,
      d: 0.01,
      s: 0,
      r: 0.01,
      curve: { a: 0.15, d: 0.5, r: 0.5 },
      loop: true,
    });
    // still cycling in the second half (without the loop it would sit at zero after one fall)
    expect(rms(straight, LEN / 2)).toBeGreaterThan(0.1);
    expect(rms(bent, LEN / 2)).toBeGreaterThan(0.1);
    // a straight rise and fall is a symmetric triangle (no second harmonic); a bent rise is not
    expect(power(straight, 100)).toBeLessThan(power(straight, 50) * 1e-3);
    expect(power(bent, 100)).toBeGreaterThan(power(bent, 50) * 0.01);
  });
});

describe('free (EnvParams.free)', () => {
  const loop: EnvParams = {
    a: 0.013,
    d: 0.017,
    s: 0,
    r: 0.01,
    curve: { a: 0.5, d: 0.5, r: 0.5 },
    loop: true,
  };
  const AT = 128 * 100;
  const twoNotes: Timed[] = [
    [0, { type: 'noteOn', n: 57, v: 0.9 }],
    [AT, { type: 'noteOn', n: 64, v: 0.9 }],
  ];

  it('is not restarted by a new note when gated by a constant', () => {
    const one = env2Out({ ...loop, free: true }, [], held, { gate2: 'one' });
    const two = env2Out({ ...loop, free: true }, [], twoNotes, { gate2: 'one' });
    expect(maxDiff(one, two)).toBeLessThan(1e-6);
  });

  it('while one that is not free starts again on the new note', () => {
    const one = env2Out(loop, [], held, { gate2: 'one' });
    const two = env2Out(loop, [], twoNotes, { gate2: 'one' });
    expect(maxDiff(one, two, AT)).toBeGreaterThan(0.01);
  });
});
