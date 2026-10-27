/**
 * Engine additions for the Yamaha CS-80 (t-132): a second voice setting on every note (`layer`), the key timing pulse
 * (`pulse` → signal `velp`), the two ends of the keyboard (`keyEnds` → `kbdLo` / `kbdHi`), the ring modulator on the
 * voice sum with its speed envelope (`ringMod`), tremolo / chorus (`tremolo`) and glissando (`glide.steps`).
 *
 * Each test is written to fail with its feature taken out: a layer that is not played leaves silence, a signal that is
 * not computed leaves a VCA shut, and so on.
 *
 * @see lib/app/synths/audio/dsp-core.ts
 */

import { describe, it, expect } from 'vitest';

import type { MeterEvent, SynthEvent } from '@/lib/app/synths/audio/dsp-core';
import type { EngineParams, LayerParams } from '@/lib/app/synths/contract';
import {
  monoParams,
  render,
  rms,
  sameSamples,
  type Timed,
} from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;

const meters = (events: SynthEvent[]): MeterEvent[] =>
  events.filter((e): e is MeterEvent => e.type === 'meter');

/** A voice that only a route into `amp` opens: no envelope on the VCA and no bias. */
const shutVoice = (over: Partial<EngineParams> = {}): EngineParams =>
  monoParams({
    osc: [{ level: 0.8, mix: { saw: 1 }, semi: 0 }],
    vca: { envSrc: 'none', bias: 0 },
    ...over,
  });

/** One poly voice that is silent (no oscillator level), and a layer with a saw an octave up. */
function layered(over: Partial<EngineParams> = {}): EngineParams {
  const silent = monoParams({ osc: [{ level: 0, mix: { saw: 1 }, semi: 0 }] });
  const { volume: _v, ...b } = monoParams({ osc: [{ level: 0.8, mix: { saw: 1 }, semi: 12 }] });
  const layer: LayerParams = b;
  return { ...silent, poly: { voices: 4, stack: 1, mono: false }, layer, ...over };
}

describe('layered poly (layer)', () => {
  it('plays the layer on every note, beside the first setting', () => {
    const r = render(layered(), { len: 9600 });
    // the first setting is silent, so everything heard is the layer's
    expect(rms(r.out, 0, 4800)).toBeGreaterThan(0.02);
    const without = render(layered({ layer: undefined }), { len: 9600 });
    expect(rms(without.out, 0, 4800)).toBeLessThan(1e-4);
  });

  it('lights one voice bit per note, though each note takes two voices', () => {
    const one = render(layered(), { len: 9600 });
    expect(meters(one.events).some((m) => m.voices === 0b1)).toBe(true);
    expect(meters(one.events).every((m) => (m.voices ?? 0) <= 0b1)).toBe(true);
    const two = render(layered(), {
      len: 9600,
      events: [
        [0, { type: 'noteOn', n: 60 }],
        [0, { type: 'noteOn', n: 64 }],
      ],
    });
    expect(meters(two.events).some((m) => m.voices === 0b11)).toBe(true);
  });

  it('meters the first setting, not the layer', () => {
    // the layer's loudness envelope is instant, the first setting's takes half a second
    const slow = { ...layered().env2, a: 0.5 };
    const r = render({ ...layered(), env2: slow }, { len: 9600 });
    const m = meters(r.events);
    expect(m.length).toBeGreaterThan(0);
    expect(m[0].env2).toBeLessThan(0.3);
  });

  it('counts notes, not voices: a third note on a two-note pool takes over the oldest', () => {
    const r = render(layered({ poly: { voices: 2, stack: 1, mono: false } }), {
      len: 9600,
      events: [
        [0, { type: 'noteOn', n: 60 }],
        [0, { type: 'noteOn', n: 64 }],
        [2000, { type: 'noteOn', n: 67 }],
      ],
    });
    const m = meters(r.events);
    // never more than the two notes' bits
    expect(m.every((x) => (x.voices ?? 0) <= 0b11)).toBe(true);
    expect(m.some((x) => x.voices === 0b11)).toBe(true);
  });

  it('moves the voices onto the new setting when the layer is switched on while a voice exists', () => {
    const r = render(layered({ layer: undefined }), {
      len: 9600,
      events: [
        [0, { type: 'noteOn', n: 60 }],
        [100, { type: 'noteOff', n: 60 }],
        [2000, { type: 'params', p: layered() }],
        [2100, { type: 'noteOn', n: 60 }],
      ],
    });
    expect(rms(r.out, 0, 2000)).toBeLessThan(1e-4);
    expect(rms(r.out, 3000, 9600)).toBeGreaterThan(0.02);
  });
});

describe('split layers (layer.split, t-133)', () => {
  /** The first setting a saw, the layer silent, or the other way round with `layerLoud`. */
  function sides(layerLoud: boolean, split?: number): EngineParams {
    const loud = monoParams({ osc: [{ level: 0.8, mix: { saw: 1 }, semi: 0 }] });
    const quiet = monoParams({ osc: [{ level: 0, mix: { saw: 1 }, semi: 0 }] });
    const top = layerLoud ? quiet : loud;
    const { volume: _v, ...b } = layerLoud ? loud : quiet;
    const layer: LayerParams = split == null ? b : { ...b, split };
    return { ...top, poly: { voices: 4, stack: 1, mono: false }, layer };
  }
  const key = (n: number): Timed[] => [
    [0, { type: 'noteOn', n }],
    [4800, { type: 'noteOff', n }],
  ];

  it('plays a key below the split on the layer only', () => {
    // the layer is silent: a low key is silent with the split, and heard (the first setting) without it
    expect(rms(render(sides(false, 60), { events: key(48) }).out, 0, 4800)).toBeLessThan(1e-4);
    expect(rms(render(sides(false), { events: key(48) }).out, 0, 4800)).toBeGreaterThan(0.02);
    // the layer is the loud one: the low key is heard
    expect(rms(render(sides(true, 60), { events: key(48) }).out, 0, 4800)).toBeGreaterThan(0.02);
  });

  it('plays the split note and above on the top-level settings only', () => {
    expect(rms(render(sides(true, 60), { events: key(60) }).out, 0, 4800)).toBeLessThan(1e-4);
    expect(rms(render(sides(true), { events: key(72) }).out, 0, 4800)).toBeGreaterThan(0.02);
    expect(rms(render(sides(false, 60), { events: key(72) }).out, 0, 4800)).toBeGreaterThan(0.02);
  });

  it('meters the side that plays the key: a low key shows the layer', () => {
    // only the layer plays 48, so a meter on the idle top-level voice would read 0
    const r = render(sides(true, 60), { events: key(48) });
    const m = meters(r.events);
    expect(m.length).toBeGreaterThan(0);
    expect(Math.max(...m.map((x) => x.env2 ?? 0))).toBeGreaterThan(0.5);
  });

  it('lets go of both sides: no note hangs after a split chord is released', () => {
    const both: EngineParams = {
      ...sides(true, 60),
      osc: [{ level: 0.8, mix: { saw: 1 }, semi: 0 }],
    };
    const r = render(both, {
      len: 28800,
      events: [
        [0, { type: 'noteOn', n: 48 }],
        [0, { type: 'noteOn', n: 72 }],
        [4800, { type: 'noteOff', n: 48 }],
        [4800, { type: 'noteOff', n: 72 }],
      ],
    });
    expect(rms(r.out, 0, 4800)).toBeGreaterThan(0.02);
    expect(rms(r.out, 24000, 28800)).toBeLessThan(1e-4);
  });

  it('starts afresh when the split moves under a held key, so its note-off still reaches what sounds', () => {
    // held in DUAL on both settings, then switched to SPLIT: the key would otherwise be let go on one side only
    const loudBoth: EngineParams = {
      ...sides(true),
      osc: [{ level: 0.8, mix: { saw: 1 }, semi: 0 }],
    };
    const r = render(loudBoth, {
      len: 28800,
      events: [
        [0, { type: 'noteOn', n: 72 }],
        [2400, { type: 'params', p: { ...loudBoth, layer: { ...loudBoth.layer!, split: 60 } } }],
        [4800, { type: 'noteOff', n: 72 }],
      ],
    });
    expect(rms(r.out, 24000, 28800)).toBeLessThan(1e-4);
  });
});

describe('key timing pulse (pulse → velp)', () => {
  const pulsed = (time: number): EngineParams =>
    shutVoice({ pulse: { time }, routes: [{ src: 'velp', dst: 'amp', amt: 1 }] });

  it('opens the VCA by the velocity at the key, then dies away', () => {
    const r = render(pulsed(0.02), { len: 9600 });
    const early = rms(r.out, 0, 480);
    expect(early).toBeGreaterThan(0.02);
    // after ten times the pulse's time the VCA is shut again, though the key is still down
    expect(rms(r.out, 4000, 4800)).toBeLessThan(early / 20);
  });

  it('is larger for a harder key', () => {
    const soft = render(pulsed(0.05), { events: [[0, { type: 'noteOn', n: 60, v: 0.2 }]] });
    const hard = render(pulsed(0.05), { events: [[0, { type: 'noteOn', n: 60, v: 1 }]] });
    expect(rms(hard.out, 0, 960)).toBeGreaterThan(rms(soft.out, 0, 960) * 2);
  });

  it('fires again for a legato key, which does not start the envelopes again', () => {
    const p = { ...pulsed(0.02), trig: { retrig: false, drone: false, repeat: false } };
    const r = render(p, {
      len: 9600,
      events: [
        [0, { type: 'noteOn', n: 60, v: 1 }],
        [4096, { type: 'noteOn', n: 62, v: 1 }],
      ],
    });
    // the first pulse has died away by the second key, which brings it back
    expect(rms(r.out, 4096, 4576)).toBeGreaterThan(rms(r.out, 3500, 4000) * 5);
  });

  it('is nothing without `pulse`', () => {
    const r = render(shutVoice({ routes: [{ src: 'velp', dst: 'amp', amt: 1 }] }));
    expect(rms(r.out)).toBeLessThan(1e-4);
  });
});

describe('keyboard ends (keyEnds → kbdLo / kbdHi)', () => {
  const ends = (sig: 'kbdLo' | 'kbdHi'): EngineParams =>
    shutVoice({ keyEnds: { mid: 66, span: 30 }, routes: [{ src: sig, dst: 'amp', amt: 1 }] });
  const at = (p: EngineParams, n: number) =>
    rms(render(p, { events: [[0, { type: 'noteOn', n, v: 0.9 }]] }).out, 960, 4800);

  it('is 0 at the middle and rises towards the bottom (kbdLo) or the top (kbdHi) only', () => {
    expect(at(ends('kbdLo'), 66)).toBeLessThan(1e-4);
    expect(at(ends('kbdHi'), 66)).toBeLessThan(1e-4);
    expect(at(ends('kbdLo'), 36)).toBeGreaterThan(0.02);
    expect(at(ends('kbdHi'), 36)).toBeLessThan(1e-4);
    expect(at(ends('kbdHi'), 96)).toBeGreaterThan(0.02);
    expect(at(ends('kbdLo'), 96)).toBeLessThan(1e-4);
  });

  it('rises gradually: halfway to the end is quieter than the end', () => {
    expect(at(ends('kbdLo'), 51)).toBeLessThan(at(ends('kbdLo'), 36));
    expect(at(ends('kbdLo'), 51)).toBeGreaterThan(0.005);
  });
});

describe('ring modulator on the voice sum (ringMod)', () => {
  // A tiny base speed, so the sine stands almost still between envelopes: the ring output is then the dry sound times
  // a constant, sin(φ), and φ moves only while the speed envelope runs.
  const ringed = (depth: number): EngineParams =>
    monoParams({
      osc: [{ level: 0.5, mix: { saw: 1 }, semi: 0 }],
      env2: { a: 0.002, d: 0.1, s: 1, r: 0.05 },
      volume: 0.05,
      poly: { voices: 4, stack: 1, mono: false },
      ringMod: { hz: 1e-6, depth, env: { a: 0.002, d: 0.01, amt: 30 } },
    });
  /** The ring output over the dry output in a window: sin(φ) there, while the sound stays small enough to be linear. */
  function ratio(events: Timed[], from: number, to: number): number {
    const len = 48000;
    const wet = render(ringed(1), { len, events }).out;
    const dry = render(ringed(0), { len, events }).out;
    let num = 0,
      den = 0;
    for (let i = from; i < to; i++) {
      num += wet[i] * dry[i];
      den += dry[i] * dry[i];
    }
    return num / den;
  }

  it('does not start the speed envelope again for a key pressed while another is held', () => {
    const events: Timed[] = [
      [0, { type: 'noteOn', n: 60 }],
      [24000, { type: 'noteOn', n: 64 }],
    ];
    const before = ratio(events, 12000, 23000);
    expect(Math.abs(before)).toBeGreaterThan(0.05);
    expect(ratio(events, 30000, 47000)).toBeCloseTo(before, 2);
  });

  it('does not start it again for the only held key struck again', () => {
    const events: Timed[] = [
      [0, { type: 'noteOn', n: 60 }],
      [24000, { type: 'noteOn', n: 60 }],
    ];
    const before = ratio(events, 12000, 23000);
    expect(ratio(events, 30000, 47000)).toBeCloseTo(before, 2);
  });

  it('starts it again for a key pressed after every key was let go', () => {
    const events: Timed[] = [
      [0, { type: 'noteOn', n: 60 }],
      [20000, { type: 'noteOff', n: 60 }],
      [24000, { type: 'noteOn', n: 60 }],
    ];
    const before = ratio(events, 12000, 19000);
    expect(Math.abs(ratio(events, 30000, 47000) - before)).toBeGreaterThan(0.05);
  });

  it('does not fire when switched on under a key pressed while it was off', () => {
    // its sine starts at phase 0 and stands still, so with no fire the ring output is silent
    const { ringMod: _r, ...off } = ringed(1);
    const r = render(off, {
      len: 24000,
      events: [
        [0, { type: 'noteOn', n: 60 }],
        [12000, { type: 'params', p: ringed(1) }],
      ],
    });
    expect(rms(r.out, 2000, 11000)).toBeGreaterThan(0.001);
    expect(rms(r.out, 14000, 24000)).toBeLessThan(rms(r.out, 2000, 11000) / 50);
  });

  it('starts its speed envelope from rest when switched off and on again', () => {
    // a slow envelope that would sweep the sine up ten octaves if it carried on where it was switched off
    const at = (depth: number): EngineParams => ({
      ...ringed(depth),
      ringMod: { hz: 1e-3, depth, env: { a: 0.2, d: 1, amt: 20 } },
    });
    const play = (depth: number) => {
      const { ringMod: _r, ...off } = at(depth);
      return render(at(depth), {
        len: 48000,
        events: [
          [0, { type: 'noteOn', n: 60 }],
          [4800, { type: 'params', p: off }],
          [9600, { type: 'params', p: at(depth) }],
        ],
      }).out;
    };
    const wet = play(1),
      dry = play(0);
    const ratioIn = (from: number, to: number) => {
      let num = 0,
        den = 0;
      for (let i = from; i < to; i++) {
        num += wet[i] * dry[i];
        den += dry[i] * dry[i];
      }
      return num / den;
    };
    // at rest the sine stands almost still, so the ring output keeps the same share of the dry sound
    expect(ratioIn(36000, 42000)).toBeCloseTo(ratioIn(12000, 18000), 2);
  });

  it('leaves the sound alone at depth 0', () => {
    const p = ringed(0);
    const plain = { ...p, ringMod: undefined };
    expect(sameSamples(render(p).out, render(plain).out)).toBe(true);
  });
});

describe('tremolo / chorus (tremolo)', () => {
  const poly = (tremolo?: EngineParams['tremolo']): EngineParams =>
    monoParams({ poly: { voices: 4, stack: 1, mono: false }, tremolo });

  it('moves the two sides apart', () => {
    const on = render(poly({ on: true, rate: 6, depth: 1 }), { stereo: true, len: 19200 });
    expect(sameSamples(on.out, on.right!)).toBe(false);
    const off = render(poly({ on: false, rate: 6, depth: 1 }), { stereo: true, len: 19200 });
    expect(sameSamples(off.out, off.right!)).toBe(true);
  });

  it('swings the level of each side at its rate', () => {
    // at 5 Hz the left side is loudest and quietest a tenth of a second apart
    const r = render(poly({ on: true, rate: 5, depth: 1 }), {
      stereo: true,
      len: 24000,
      events: [[0, { type: 'noteOn', n: 60 }]],
    });
    const win = (a: number) => rms(r.out, a, a + 480);
    const levels = Array.from({ length: 20 }, (_, k) => win(4800 + k * 480));
    expect(Math.max(...levels)).toBeGreaterThan(Math.min(...levels) * 2);
  });

  it('swings the mono sum too, as the GENERAL output does', () => {
    const r = render(poly({ on: true, rate: 5, depth: 1 }), {
      len: 24000,
      events: [[0, { type: 'noteOn', n: 60 }]],
    });
    const levels = Array.from({ length: 20 }, (_, k) => rms(r.out, 4800 + k * 480, 5280 + k * 480));
    expect(Math.max(...levels)).toBeGreaterThan(Math.min(...levels) * 1.3);
  });
});

describe('glissando (glide.steps)', () => {
  const sine = (steps: boolean): EngineParams =>
    monoParams({
      osc: [{ level: 0.8, mix: { sine: 1 }, semi: 0 }],
      filter: { type: 'svf', mode: 'lp', cutoff: 18000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
      glide: { time: 0.6, legato: false, steps },
      volume: 0.3,
    });
  /** The pitch in a window, as a MIDI note, from the time between its first and last upward zero crossings. */
  function pitchAt(b: Float32Array, from: number, to: number): number {
    const xs: number[] = [];
    for (let i = from + 1; i < to; i++)
      if (b[i - 1] < 0 && b[i] >= 0) xs.push(i - 1 + -b[i - 1] / (b[i] - b[i - 1]));
    const hz = ((xs.length - 1) * SR) / (xs[xs.length - 1] - xs[0]);
    return 69 + 12 * Math.log2(hz / 440);
  }
  const glide = (steps: boolean): number[] => {
    const r = render(sine(steps), {
      len: 48000,
      events: [
        [0, { type: 'noteOn', n: 72 }],
        [9600, { type: 'noteOff', n: 72 }],
        [9600, { type: 'noteOn', n: 84 }],
      ],
    });
    return Array.from({ length: 40 }, (_, k) =>
      pitchAt(r.out, 9984 + k * 480, 9984 + k * 480 + 480)
    );
  };
  const offGrid = (ns: number[]) => ns.filter((n) => Math.abs(n - Math.round(n)) > 0.15).length;

  it('moves in semitone steps', () => {
    const ns = glide(true);
    // a window that straddles a step reads between two notes; most sit on a semitone
    expect(offGrid(ns)).toBeLessThan(ns.length * 0.25);
    expect(new Set(ns.map(Math.round)).size).toBeGreaterThan(5);
  });

  it('slides without it', () => {
    const ns = glide(false);
    expect(offGrid(ns)).toBeGreaterThan(ns.length * 0.5);
  });
});
