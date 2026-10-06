/**
 * Shared helpers for the sound-engine tests: a plain mono EngineParams to vary, a seeded Math.random (the same
 * generator the probe and the check script use), and a renderer that plays notes through `createSynth`.
 */

import { vi } from 'vitest';

import { createSynth, type SynthEvent, type SynthMessage } from '@/lib/app/synths/audio/dsp-core';
import type { EngineParams } from '@/lib/app/synths/contract';

/** A plain three-oscillator mono voice: saw, pulse and triangle into a ladder low-pass, two ADSRs. */
export function monoParams(over: Partial<EngineParams> = {}): EngineParams {
  return {
    osc: [
      { level: 0.8, mix: { saw: 1 }, semi: 0 },
      { level: 0.5, mix: { pulse: 1 }, pw: 0.4, semi: -12 },
      { level: 0.3, mix: { tri: 1 }, semi: 7 },
    ],
    noise: { level: 0 },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 1500,
      res: 0.3,
      envAmt: 2,
      envSrc: 'env1',
      kbd: 0.5,
    },
    env1: { a: 0.005, d: 0.25, s: 0.4, r: 0.2 },
    env2: { a: 0.003, d: 0.2, s: 0.8, r: 0.1 },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: { rate: 5, mix: { tri: 1 }, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    volume: 0.7,
    ...over,
  };
}

/** Mulberry32, as `scripts/check-synths.ts` and the probe seed it. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A message sent at a sample position (rounded down to the 128-sample block it falls in). */
export type Timed = [at: number, msg: SynthMessage];

export interface RenderOptions {
  sr?: number;
  /** Length in samples. */
  len?: number;
  /** Messages after the params; default: middle C held for half the length. */
  events?: Timed[];
  stereo?: boolean;
  seed?: number;
}

export interface Rendered {
  out: Float32Array;
  right: Float32Array | null;
  events: SynthEvent[];
}

/** Render `p` through a fresh synth with a seeded Math.random. */
export function render(p: EngineParams, o: RenderOptions = {}): Rendered {
  const sr = o.sr ?? 48000;
  const len = o.len ?? 9600;
  const timed: Timed[] = o.events ?? [
    [0, { type: 'noteOn', n: 60, v: 0.9 }],
    [Math.floor(len / 2), { type: 'noteOff', n: 60 }],
  ];
  const spy = vi.spyOn(Math, 'random').mockImplementation(seeded(o.seed ?? 20240919));
  try {
    const events: SynthEvent[] = [];
    const syn = createSynth(sr, (e) => events.push(e));
    syn.handle({ type: 'params', p: structuredClone(p) });
    const out = new Float32Array(len);
    const right = o.stereo ? new Float32Array(len) : null;
    let e = 0;
    const queue = [...timed].sort((a, b) => a[0] - b[0]);
    for (let at = 0; at < len; at += 128) {
      while (e < queue.length && queue[e][0] < at + 128) syn.handle(queue[e++][1]);
      const n = Math.min(128, len - at);
      syn.process(out.subarray(at, at + n), n, right ? right.subarray(at, at + n) : undefined);
    }
    return { out, right, events };
  } finally {
    spy.mockRestore();
  }
}

export const rms = (b: Float32Array, from = 0, to = b.length): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += b[i] * b[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

export const allFinite = (b: Float32Array): boolean => b.every((x) => Number.isFinite(x));

export const sameSamples = (a: Float32Array, b: Float32Array): boolean =>
  a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
