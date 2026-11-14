/**
 * The Moog Sub 37's pieces of the sound engine (t-252): the ladder's `poles` (SLOPE), the `lfo2Rate`, `noiseLvl` and
 * `env1Rate` destinations (MOD 1 DEST LFO RATE, NOISE LEVEL, EG TIME), and the full-stage envelope loop
 * (`EnvParams.loopAll`, LOOP).
 *
 * A control signal is heard as the loudness of a steady tone: the signal routed to the VCA's `amp`, the VCA otherwise
 * shut, read as RMS over a short window (the output DC-blocks, so the signal itself cannot be read straight).
 *
 * @see lib/app/synths/audio/dsp-core.ts
 */

import { describe, it, expect } from 'vitest';

import type { EngineParams, EngineRoute, FilterParams } from '@/lib/app/synths/contract';
import type { Timed } from '@/tests/unit/lib/app/synths/audio/render';
import {
  allFinite,
  monoParams,
  render,
  rms,
  sameSamples,
} from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
const LEN = SR;
const ms = (t: number) => Math.round((t * SR) / 1000);

const held: Timed[] = [[0, { type: 'noteOn', n: 57, v: 0.9 }]];

/** RMS between two times in milliseconds. */
const win = (b: Float32Array, from: number, to: number) => rms(b, ms(from), ms(to));

/** A steady 220 Hz triangle through an open SVF whose loudness is the routed signal alone: the VCA shut but for `routes`. */
function loudness(over: Partial<EngineParams>, routes: EngineRoute[], events = held): Float32Array {
  const p = monoParams({
    osc: [{ level: 0.4, mix: { tri: 1 }, semi: 0 }],
    filter: { type: 'svf', mode: 'lp', cutoff: 20000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
    vca: { envSrc: 'none', bias: 0 },
    routes,
    ...over,
  });
  return render(p, { sr: SR, len: LEN, events }).out;
}

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

/** How many times the loudness, read in 5 ms windows, rises through `level` over the buffer. */
function risesThrough(b: Float32Array, level: number): number {
  let n = 0;
  let prev = 0;
  for (let t = 0; t + 5 <= LEN / (SR / 1000); t += 5) {
    const v = win(b, t, t + 5);
    if (prev < level && v >= level) n++;
    prev = v;
  }
  return n;
}

describe('filter poles (Sub 37 SLOPE)', () => {
  /** A 110 Hz saw into the ladder at 600 Hz with no resonance, envelope and key tracking out. */
  const sawThrough = (filter: Partial<FilterParams>) =>
    render(
      monoParams({
        osc: [{ level: 0.6, mix: { saw: 1 }, semi: 0 }],
        filter: {
          type: 'ladder',
          mode: 'lp',
          cutoff: 600,
          res: 0,
          envAmt: 0,
          envSrc: 'env1',
          kbd: 0,
          ...filter,
        },
        env2: { a: 0.003, d: 0.2, s: 1, r: 0.1 },
      }),
      { sr: SR, len: LEN, events: held }
    ).out;

  it('takes each extra pole as a steeper roll-off above the cutoff', () => {
    // Arrange: the same note through one, two, three and four poles
    const outs = ([1, 2, 3, 4] as const).map((poles) => sawThrough({ poles }));

    // Act: the 30th harmonic (3.3 kHz), well above the cutoff, against the fundamental
    const ratio = outs.map((o) => power(o, 3300) / power(o, 110));

    // Assert: every pole added takes more of the high harmonic away
    expect(outs.every(allFinite)).toBe(true);
    expect(ratio[0]).toBeGreaterThan(ratio[1] * 4);
    expect(ratio[1]).toBeGreaterThan(ratio[2] * 4);
    expect(ratio[2]).toBeGreaterThan(ratio[3] * 4);
  });

  it('is the existing four-pole ladder at 4 and when absent', () => {
    // Arrange + Act
    const absent = sawThrough({});
    const four = sawThrough({ poles: 4 });

    // Assert: sample for sample the same
    expect(sameSamples(absent, four)).toBe(true);
  });
});

describe('dest lfo2Rate (Sub 37 MOD 1 DEST LFO RATE)', () => {
  /** LFO 2's square (rising to 1) heard as the loudness, at 4 Hz. */
  const lfo2Pulses = (routes: EngineRoute[]) =>
    loudness({ lfo2: { rate: 4, mix: { sq: 1 } } }, [
      { src: 'lfo2Uni', dst: 'amp', amt: 1 },
      ...routes,
    ]);

  it('moves LFO 2 in octaves', () => {
    // Arrange + Act: LFO 2 at its own rate, and pushed one octave up
    const plain = lfo2Pulses([]);
    const up = lfo2Pulses([{ src: 'one', dst: 'lfo2Rate', amt: 1 }]);

    // Assert: four pulses a second, then eight (one either side for where the window falls)
    expect(Math.abs(risesThrough(plain, 0.1) - 4)).toBeLessThanOrEqual(1);
    expect(Math.abs(risesThrough(up, 0.1) - 8)).toBeLessThanOrEqual(1);
  });

  it('leaves LFO 1 where it was', () => {
    // Arrange: LFO 1's square heard as the loudness, LFO 2 present
    const lfo1 = (routes: EngineRoute[]) =>
      loudness(
        {
          lfo: { rate: 4, mix: { sq: 1 }, keySync: false },
          lfo2: { rate: 3, mix: { sq: 1 } },
        },
        [{ src: 'lfoUni', dst: 'amp', amt: 1 }, ...routes]
      );

    // Act
    const plain = lfo1([]);
    const moved = lfo1([{ src: 'one', dst: 'lfo2Rate', amt: 1 }]);

    // Assert: LFO 1 does not hear LFO 2's rate
    expect(sameSamples(plain, moved)).toBe(true);
  });
});

describe('dest noiseLvl (Sub 37 NOISE LEVEL)', () => {
  /** White noise alone through an open filter and VCA. */
  const noise = (routes: EngineRoute[]) =>
    render(
      monoParams({
        osc: [],
        noise: { level: 0.2 },
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
      }),
      { sr: SR, len: LEN, events: held }
    ).out;

  it('adds to the noise level, and takes it to silence from below', () => {
    // Arrange + Act
    const plain = win(noise([]), 200, 900);
    const more = win(noise([{ src: 'one', dst: 'noiseLvl', amt: 0.2 }]), 200, 900);
    const none = win(noise([{ src: 'one', dst: 'noiseLvl', amt: -0.5 }]), 200, 900);

    // Assert: twice the level is about twice as loud; past zero there is no noise left, not an inverted one
    expect(plain).toBeGreaterThan(0.01);
    expect(more / plain).toBeGreaterThan(1.7);
    expect(more / plain).toBeLessThan(2.3);
    expect(none).toBeLessThan(plain * 0.01);
  });
});

describe('dest env1Rate (Sub 37 EG TIME)', () => {
  /** Envelope 1 heard as the loudness: a 200 ms attack and a 200 ms decay to 0.2. */
  const env1 = (routes: EngineRoute[]) =>
    loudness({ env1: { a: 0.2, d: 0.2, s: 0.2, r: 0.2 } }, [
      { src: 'env1', dst: 'amp', amt: 1 },
      ...routes,
    ]);

  it('stretches the attack as well as the decay', () => {
    // Arrange + Act: as set, and at half the rate (twice the time)
    const plain = env1([]);
    const slow = env1([{ src: 'one', dst: 'env1Rate', amt: -1 }]);

    // Assert: halfway up the plain attack, the slow one is well behind it
    expect(win(slow, 60, 70)).toBeLessThan(win(plain, 60, 70) * 0.75);
    // and later, when the plain one has decayed close to its sustain, the slow one is still high
    expect(win(plain, 700, 720)).toBeLessThan(win(slow, 700, 720) * 0.85);
  });

  it('multiplies with env1DecRate rather than replacing it', () => {
    // Arrange + Act: env1DecRate alone speeds the decay; with env1Rate at its opposite, the decay is as set and only
    // the attack is slower (twice as long, so everything after the peak comes 200 ms later)
    const plain = env1([]);
    const fast = env1([{ src: 'one', dst: 'env1DecRate', amt: 1 }]);
    const cancelled = env1([
      { src: 'one', dst: 'env1DecRate', amt: 1 },
      { src: 'one', dst: 'env1Rate', amt: -1 },
    ]);

    // Assert: 40 ms into the plain decay the fast one is well below it, and the cancelled one, 200 ms later, matches it
    const plainDecay = win(plain, 240, 260);
    expect(win(fast, 240, 260)).toBeLessThan(plainDecay * 0.8);
    expect(win(cancelled, 440, 460) / plainDecay).toBeGreaterThan(0.9);
    expect(win(cancelled, 440, 460) / plainDecay).toBeLessThan(1.1);
  });
});

describe('env loopAll (Sub 37 LOOP)', () => {
  /** Envelope 2 heard as the loudness, looping through every stage while the key is held. */
  const looping = (loopAll: boolean, events = held) =>
    loudness(
      {
        env2: { a: 0.02, d: 0.04, s: 0.5, r: 0.04, dly: 0.08, hold: 0.03, loop: true, loopAll },
      },
      [{ src: 'env2', dst: 'amp', amt: 1 }],
      events
    );

  it('waits out the delay, decays to the sustain level and releases before it starts again', () => {
    // Arrange + Act
    const out = looping(true);
    const peak = win(out, 100, 105);
    const ratios = Array.from({ length: 14 }, (_, i) => win(out, 130 + i * 5, 135 + i * 5) / peak);

    // Assert: silent through the first delay, then the attack and hold reach the top
    expect(win(out, 10, 70)).toBeLessThan(peak * 0.02);
    expect(peak).toBeGreaterThan(0.05);
    // the decay passes through half of it (the sustain) on its way down
    expect(ratios.some((r) => r > 0.4 && r < 0.6)).toBe(true);
    // the release takes it to silence, and the next delay keeps it there
    expect(win(out, 240, 300)).toBeLessThan(peak * 0.02);
    // then it goes round again: more than one peak in a second
    expect(risesThrough(out, peak * 0.8)).toBeGreaterThanOrEqual(3);
  });

  it('leaves the plain loop, which falls to silence from the top, as it was', () => {
    // Arrange + Act: the same envelope without loopAll never sits at its sustain level
    const plain = looping(false);
    const peak = Math.max(...Array.from({ length: 100 }, (_, i) => win(plain, i * 10, i * 10 + 5)));
    const sustaining = Array.from({ length: 30 }, (_, i) =>
      win(plain, 300 + i * 5, 305 + i * 5)
    ).filter((v) => v / peak > 0.4 && v / peak < 0.6);

    // Assert: it loops, and it spends no more than a few 5 ms windows passing through half
    expect(risesThrough(plain, peak * 0.8)).toBeGreaterThanOrEqual(2);
    expect(sustaining.length).toBeLessThan(6);
  });

  it('releases to silence when the key goes up', () => {
    // Arrange + Act: let go at 500 ms
    const out = looping(true, [...held, [ms(500), { type: 'noteOff', n: 57 }]]);

    // Assert: nothing left a few release times later, and nothing starts again
    expect(win(out, 800, 1000)).toBeLessThan(1e-3);
  });
});
