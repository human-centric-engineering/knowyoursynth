/**
 * Paraphony with an amp envelope per note (`oscAssign.env`, the MicroFreak's): four oscillators each play a key of
 * their own through the one filter, each on its own copy of the VCA's envelope, so a let-go note fades over the release
 * while the others hold. Each note is read back by its level at its own pitch (sine oscillators, an open filter).
 *
 * @see lib/app/synths/audio/dsp-core.ts
 */

import { describe, it, expect } from 'vitest';

import type { EngineParams } from '@/lib/app/synths/contract';
import { monoParams, render, rms, type Timed } from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** The amplitude of the sine at `hz` in `b[from, to)`: a single-bin DFT, Hann-windowed so the other notes do not leak in. */
function level(b: Float32Array, hz: number, from: number, to: number): number {
  let re = 0,
    im = 0,
    sum = 0;
  const w = (2 * Math.PI * hz) / SR;
  const len = to - from;
  for (let i = from; i < to; i++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - from)) / len);
    re += h * b[i] * Math.cos(w * i);
    im += h * b[i] * Math.sin(w * i);
    sum += h;
  }
  return (2 * Math.hypot(re, im)) / sum;
}

/** Each oscillator's level: low, so the filter's saturation makes no intermodulation to read as a note. */
const LV = 0.08;
/** A note counts as sounding above this, and as silent below `QUIET`. */
const LOUD = LV * 0.4,
  QUIET = LV * 0.03;

/** Four sine oscillators on the keyboard, an open filter, Envelope 2 (release 0.3 s) on the VCA. */
const four = (env: boolean, over: Partial<EngineParams> = {}): EngineParams =>
  monoParams({
    osc: [0, 1, 2, 3].map(() => ({ level: LV, mix: { sine: 1 }, semi: 0 })),
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 18000,
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    },
    env2: { a: 0.003, d: 0.05, s: 1, r: 0.3 },
    oscAssign: { mode: 'poly', env },
    ...over,
  });

const C3 = 48,
  G3 = 55,
  C4 = 60,
  E4 = 64,
  A4 = 69;
/** A window of 0.1 s starting at `t` seconds. */
const at = (t: number): [number, number] => [Math.round(t * SR), Math.round((t + 0.1) * SR)];
const on = (t: number, n: number, v?: number): Timed => [
  Math.round(t * SR),
  { type: 'noteOn', n, ...(v == null ? {} : { v }) },
];
const off = (t: number, n: number): Timed => [Math.round(t * SR), { type: 'noteOff', n }];

/** Four keys pressed 0.05 s apart from t = 0. */
const chord = [on(0, C3), on(0.05, G3), on(0.1, C4), on(0.15, E4)];

describe('paraphony with an amp envelope per note (oscAssign.env)', () => {
  it('sounds four held keys at once, one per oscillator', () => {
    const { out } = render(four(true), { events: chord, len: SR });
    const [a, b] = at(0.4);
    const lv = [C3, G3, C4, E4].map((n) => level(out, midiHz(n), a, b));
    // every note there at much the same level
    for (const x of lv) expect(x).toBeGreaterThan(LOUD);
    expect(Math.max(...lv) / Math.min(...lv)).toBeLessThan(1.3);
  });

  it('fades a let-go note alone over the release while the others hold', () => {
    const { out } = render(four(true), { events: [...chord, off(0.4, G3)], len: SR });
    const held = (t: number) => level(out, midiHz(C4), ...at(t));
    const gone = (t: number) => level(out, midiHz(G3), ...at(t));
    const before = gone(0.25);
    // part way through the release (0.3 s) it is quieter but still sounding; well after it, silent
    expect(gone(0.45)).toBeLessThan(before * 0.8);
    expect(gone(0.45)).toBeGreaterThan(before * 0.05);
    expect(gone(0.85)).toBeLessThan(before * 0.02);
    // the held notes do not move
    expect(held(0.85)).toBeCloseTo(held(0.25), 2);
  });

  it('keeps a released note fading when a new key comes, which takes a free oscillator', () => {
    const p = four(true);
    // two keys only, so two oscillators are free; G3 is let go and a new key comes during its release
    const ev = [on(0, C3), on(0.05, G3), off(0.3, G3), on(0.35, A4)];
    const { out } = render(p, { events: ev, len: SR });
    expect(level(out, midiHz(G3), ...at(0.36))).toBeGreaterThan(QUIET * 3);
    expect(level(out, midiHz(A4), ...at(0.4))).toBeGreaterThan(LOUD);
    // without its own envelope the new key silences the let-go note at once (the Poly D's rule)
    const shared = render(four(false), { events: ev, len: SR }).out;
    expect(level(shared, midiHz(G3), ...at(0.36))).toBeLessThan(QUIET);
  });

  it('gives a fifth key the oldest held note’s oscillator', () => {
    const { out } = render(four(true), { events: [...chord, on(0.4, A4)], len: SR });
    const [a, b] = at(0.6);
    expect(level(out, midiHz(C3), a, b)).toBeLessThan(QUIET);
    expect(level(out, midiHz(A4), a, b)).toBeGreaterThan(LOUD);
    for (const n of [G3, C4, E4]) expect(level(out, midiHz(n), a, b)).toBeGreaterThan(LOUD);
  });

  it('takes the oscillator of a let-go note before a held one', () => {
    // all four busy, G3 let go and still ringing: the fifth key takes G3's oscillator and C3 (oldest) holds on
    const { out } = render(four(true), {
      events: [...chord, off(0.3, G3), on(0.35, A4)],
      len: SR,
    });
    const [a, b] = at(0.5);
    expect(level(out, midiHz(G3), a, b)).toBeLessThan(QUIET);
    for (const n of [C3, C4, E4, A4]) expect(level(out, midiHz(n), a, b)).toBeGreaterThan(LOUD);
  });

  it('strikes each note at its own velocity with a velocity envelope on the VCA', () => {
    const p = four(true, { vca: { envSrc: 'env2v', bias: 0 } });
    const { out } = render(p, { events: [on(0, C3, 1), on(0.05, C4, 0.25)], len: SR });
    const [a, b] = at(0.3);
    expect(level(out, midiHz(C4), a, b) / level(out, midiHz(C3), a, b)).toBeCloseTo(0.25, 1);
  });

  it('fades every note out and goes quiet once all the keys are let go', () => {
    const { out } = render(four(true), {
      events: [...chord, off(0.3, C3), off(0.3, G3), off(0.3, C4), off(0.3, E4)],
      len: SR,
    });
    expect(rms(out, ...at(0.2))).toBeGreaterThan(0.05);
    expect(rms(out, ...at(0.8))).toBeLessThan(0.001);
  });

  it('holds a let-go note at the bias, as the VCA would with its envelope shut', () => {
    const p = four(true, { vca: { envSrc: 'env2', bias: 0.3 } });
    const { out } = render(p, { events: [...chord, off(0.3, G3)], len: SR });
    const [a, b] = at(0.85);
    // G3 at the bias alone (0.3), C4 at the bias and its sustain (1.3)
    expect(level(out, midiHz(G3), a, b) / level(out, midiHz(C4), a, b)).toBeCloseTo(0.3 / 1.3, 1);
  });

  it('plays as before with no oscillator on the keyboard', () => {
    const p = (env: boolean) =>
      four(env, { osc: [{ level: LV, mix: { sine: 1 }, semi: 0, kbd: false }] });
    const a = render(p(true), { events: chord, len: SR / 2 }).out;
    const b = render(p(false), { events: chord, len: SR / 2 }).out;
    expect(a).toEqual(b);
  });

  it('opens the VCA on its own envelope with no key down (a drone)', () => {
    const p = four(true, {
      noise: { level: 0.5 },
      trig: { retrig: true, drone: true, repeat: false },
    });
    expect(rms(render(p, { events: [], len: SR / 2 }).out, ...at(0.3))).toBeGreaterThan(0.01);
  });

  it('strikes a key under the top note at its own velocity with top-note priority', () => {
    const p = four(true, { vca: { envSrc: 'env2v', bias: 0 }, keyPriority: 'high' });
    const { out } = render(p, { events: [on(0, A4, 1), on(0.05, C3, 0.25)], len: SR });
    const [a, b] = at(0.4);
    expect(level(out, midiHz(C3), a, b) / level(out, midiHz(A4), a, b)).toBeCloseTo(0.25, 1);
  });

  it('tracks the filter on a new note, not on a let-go one that has died away', () => {
    // a low cutoff that follows the key: C6 is muffled if the filter still follows C3
    const p = four(true, {
      filter: {
        type: 'ladder',
        mode: 'lp',
        cutoff: 300,
        res: 0,
        envAmt: 0,
        envSrc: 'env1',
        kbd: 1,
      },
    });
    const C6 = 84;
    const after = render(p, { events: [on(0, C3), off(0.1, C3), on(0.6, C6)], len: SR }).out;
    const alone = render(p, { events: [on(0.6, C6)], len: SR }).out;
    const [a, b] = at(0.8);
    expect(level(after, midiHz(C6), a, b) / level(alone, midiHz(C6), a, b)).toBeCloseTo(1, 1);
  });

  it('does nothing with no envelope on the VCA', () => {
    const p = (env: boolean) => four(env, { vca: { envSrc: 'none', bias: 0.5 } });
    const ev = [...chord, off(0.4, G3)];
    const a = render(p(true), { events: ev, len: SR }).out;
    const b = render(p(false), { events: ev, len: SR }).out;
    expect(a).toEqual(b);
  });
});
