/**
 * The Elta Music SOLAR 42's sound path (t-135): EngineParams `solar`, eight voices with their own gates, a stereo
 * mixer, a dual filter and an effector, run in place of the fixed voice.
 *
 * Each test is written to fail with its feature taken out: voices that do not open on their own gates leave the
 * output silent with no key held, a mixer that ignores pan puts the voice on both sides, a link that does nothing
 * leaves the right filter where it was, and so on.
 *
 * @see lib/app/synths/audio/solar-core.ts
 */

import { describe, it, expect } from 'vitest';

import type {
  EngineParams,
  SolarDrone,
  SolarEnv,
  SolarParams,
  SolarSrapa,
  SolarVco,
} from '@/lib/app/synths/contract';
import { DROP, KNEE } from '@/lib/app/synths/audio/solar-core';
import {
  allFinite,
  monoParams,
  render,
  rms,
  type Timed,
} from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
const asr: SolarEnv = { mode: 'asr', a: 0.002, d: 0.1, s: 1, r: 0.01, hold: false };

const drone = (over: Partial<SolarDrone> = {}): SolarDrone => ({
  kind: 'drone',
  gate: false,
  env: asr,
  level: 0,
  pan: 0,
  gens: [
    { note: 36, on: true, mod: true },
    { note: 48, on: false, mod: true },
    { note: 55, on: false, mod: true },
    { note: 64, on: false, mod: true },
    { note: 79, on: false, mod: true },
  ],
  volt: 0,
  photo: 0,
  ...over,
});

const srapa = (over: Partial<SolarSrapa> = {}): SolarSrapa => ({
  kind: 'srapa',
  gate: false,
  env: asr,
  level: 0,
  pan: 0,
  note: 60,
  rate: 4,
  fm: false,
  am: false,
  dev: 0,
  noise: 0,
  ...over,
});

const vco = (over: Partial<SolarVco> = {}): SolarVco => ({
  kind: 'vco',
  gate: false,
  env: asr,
  level: 0,
  pan: 0,
  semi: 0,
  wave: 'saw',
  shape: 0.5,
  sub: false,
  fm: 0,
  ...over,
});

/** The 42N's panel order: drones 1–2, Papa Srapa 3, drones 4–5, Papa Srapa 6, VCO A, VCO B. Everything closed and silent. */
function solar(over: Partial<SolarParams> = {}): SolarParams {
  return {
    voices: [drone(), drone(), srapa(), drone(), drone(), srapa(), vco(), vco()],
    keys: { mode: 'single', split: 60, glide: 0 },
    ext: { level: 0, pan: 0 },
    pre: { level: 0, pan: 0 },
    vcf: {
      l: { mode: 'lp', cutoff: 18000, res: 0, drive: 0 },
      r: { mode: 'lp', cutoff: 18000, res: 0, drive: 0 },
      link: false,
    },
    fx: { l: { alg: null, p: {} }, r: { alg: null, p: {} }, xyz: [], blend: 0 },
    master: 1,
    lfo: { a: { hz: 0.2, wave: 1 }, b: { hz: 5, wave: 1 } },
    seq: {
      hz: 2,
      levels: [0, 0.2, 0.4, 0.6, 0.8],
      gates: [true, true, true, true, true],
      stages: 5,
    },
    ...over,
  };
}

/** The engine params a SOLAR definition returns: the stubs and `solar`. */
const params = (s: SolarParams): EngineParams => monoParams({ osc: [], solar: s });

/** Voice `i` (0-based) replaced. */
function withVoice(s: SolarParams, i: number, q: SolarParams['voices'][number]): SolarParams {
  const voices = [...s.voices];
  voices[i] = q;
  return { ...s, voices };
}

const noKeys: Timed[] = [];
const play = (s: SolarParams, events: Timed[] = noKeys, len = 9600) =>
  render(params(s), { sr: SR, len, events, stereo: true });

/** Upward zero crossings per second over `[from, to)`: the pitch of a plain saw or square. */
function hz(b: Float32Array, from: number, to: number): number {
  let n = 0;
  for (let i = from + 1; i < to; i++) if (b[i - 1] < 0 && b[i] >= 0) n++;
  return (n * SR) / (to - from);
}

/** Highest sample over `[from, to)`. */
const peak = (b: Float32Array, from: number, to: number): number => {
  let m = 0;
  for (let i = from; i < to; i++) m = Math.max(m, Math.abs(b[i]));
  return m;
};

describe('SOLAR 42 voices', () => {
  it('sounds two drones together on their own gates, with no key held', () => {
    let s = solar();
    s = withVoice(s, 0, drone({ gate: true, level: 1, gens: drone().gens }));
    s = withVoice(
      s,
      3,
      drone({ gate: true, level: 1, gens: drone().gens.map((g, k) => ({ ...g, on: k === 2 })) })
    );
    const both = play(s);
    expect(allFinite(both.out) && allFinite(both.right!)).toBe(true);
    expect(rms(both.out, 2400, 9600)).toBeGreaterThan(0.05);
    // each alone is quieter than the two together: both are sounding
    const one = play(withVoice(s, 3, drone()));
    const other = play(withVoice(s, 0, drone()));
    expect(rms(one.out, 2400, 9600)).toBeGreaterThan(0.02);
    expect(rms(other.out, 2400, 9600)).toBeGreaterThan(0.02);
    expect(rms(both.out, 2400, 9600)).toBeGreaterThan(rms(one.out, 2400, 9600) * 1.2);
    // with neither gate down the synth is silent
    const shut = play(withVoice(withVoice(s, 0, drone({ level: 1 })), 3, drone({ level: 1 })));
    expect(rms(shut.out, 2400, 9600)).toBeLessThan(1e-4);
  });

  it('opens a voice from its gate destination and from HOLD', () => {
    const open = drone({ level: 1 });
    const closed = play(withVoice(solar(), 0, open));
    expect(rms(closed.out, 2400, 9600)).toBeLessThan(1e-4);
    const held = play(withVoice(solar(), 0, drone({ level: 1, env: { ...asr, hold: true } })));
    expect(rms(held.out, 2400, 9600)).toBeGreaterThan(0.02);
    const routed = render(
      {
        ...params(withVoice(solar(), 0, open)),
        routes: [{ src: 'solPulser', dst: 'solG1', amt: 1 }],
      },
      { sr: SR, len: 48000, events: noKeys, stereo: true }
    );
    // the 2 Hz pulser opens it for the first half of each cycle
    expect(rms(routed.out, 2400, 11000)).toBeGreaterThan(0.02);
    expect(rms(routed.out, 14000, 23000)).toBeLessThan(1e-3);
  });

  it('puts a classic drone generator at its tuned pitch, and VOLT lowers it', () => {
    const one = (volt: number) =>
      withVoice(
        solar(),
        0,
        drone({
          gate: true,
          level: 1,
          volt,
          gens: drone().gens.map((_, k) => ({ note: 57, on: k === 0, mod: true })),
        })
      );
    // MIDI 57 is 220 Hz
    expect(hz(play(one(0), noKeys, 48000).out, 4800, 48000)).toBeCloseTo(220, -1);
    // at the knee the first generator has fallen DROP[0] semitones
    const low = hz(play(one(KNEE), noKeys, 48000).out, 4800, 48000);
    expect(low).toBeCloseTo(220 * Math.pow(2, -DROP[0] / 12), -1);
    // and the five fall by different amounts, so a chord re-tunes as it falls
    expect(new Set(DROP).size).toBe(5);
  });

  it('bends only the generators whose MOD is on with the photosensor', () => {
    const lit = (mod: boolean) =>
      render(
        {
          ...params(
            withVoice(
              solar(),
              0,
              drone({
                gate: true,
                level: 1,
                photo: 12,
                gens: drone().gens.map((_, k) => ({ note: 57, on: k === 0, mod })),
              })
            )
          ),
          // full light on the photosensor from a constant source: LFO A, a slow triangle
          routes: [{ src: 'solLfoA', dst: 'solPh1', amt: 1 }],
        },
        { sr: SR, len: 48000, events: noKeys, stereo: true }
      ).out;
    // MIDI 57 is 220 Hz; with MOD on, the light lifts it towards an octave (LFO A is a triangle, so on average half way)
    expect(hz(lit(false), 4800, 48000)).toBeCloseTo(220, -1);
    expect(hz(lit(true), 4800, 48000)).toBeGreaterThan(260);
  });

  it('cross-modulates the generators past the knee', () => {
    const chord = (volt: number) =>
      withVoice(
        solar(),
        0,
        drone({
          gate: true,
          level: 1,
          volt,
          gens: drone().gens.map((_, k) => ({ note: 45 + k * 7, on: k < 2, mod: true })),
        })
      );
    const atKnee = play(chord(KNEE), noKeys, 24000).out;
    const past = play(chord(1), noKeys, 24000).out;
    let diff = 0;
    for (let i = 4800; i < 24000; i++) diff += Math.abs(atKnee[i] - past[i]);
    expect(diff / 19200).toBeGreaterThan(0.05);
  });

  it('moves a Papa Srapa tone with its modulator (FM) and chops it (AM)', () => {
    const at = (q: Partial<SolarSrapa>) =>
      play(
        withVoice(solar(), 2, srapa({ gate: true, level: 1, note: 69, rate: 2, ...q })),
        noKeys,
        48000
      ).out;
    // the 2 Hz modulator runs free from a random phase, so look at it in 2000-sample windows: most of them fall
    // inside one half of its cycle
    const windows = (f: (from: number, to: number) => number): number[] =>
      Array.from({ length: 22 }, (_, k) => f(4000 + k * 2000, 6000 + k * 2000));
    const fm = at({ fm: true, dev: 1 });
    const pitches = windows((x, y) => hz(fm, x, y));
    // an octave up while it is high (dev 1), the tone's own pitch while it is low
    expect(pitches.filter((p) => p > 840 && p < 920).length).toBeGreaterThan(5);
    expect(pitches.filter((p) => p > 400 && p < 480).length).toBeGreaterThan(5);
    const am = at({ am: true });
    const quiet = windows((x, y) => rms(am, x, y)).filter((r) => r < 1e-3).length;
    expect(quiet).toBeGreaterThan(5);
    expect(quiet).toBeLessThan(17);
    // with neither, the tone runs on through the modulator's low half
    const plain = at({});
    expect(windows((x, y) => rms(plain, x, y)).filter((r) => r < 1e-3).length).toBe(0);
  });
});

describe('SOLAR 42 keyboard', () => {
  const vcos = (mode: 'single' | 'split') => {
    let s = solar({ keys: { mode, split: 60, glide: 0 } });
    s = withVoice(s, 6, vco({ level: 1, pan: -1 }));
    s = withVoice(s, 7, vco({ level: 1, pan: 1 }));
    return s;
  };

  it('plays both VCO voices from one key in single', () => {
    const r = play(vcos('single'), [[0, { type: 'noteOn', n: 57 }]], 24000);
    expect(hz(r.out, 2400, 24000)).toBeGreaterThan(200);
    expect(hz(r.right!, 2400, 24000)).toBeCloseTo(hz(r.out, 2400, 24000), 0);
    expect(rms(r.right!, 2400, 24000)).toBeGreaterThan(0.05);
  });

  it('gives keys below the split to the first VCO and the rest to the second in split', () => {
    const low = play(vcos('split'), [[0, { type: 'noteOn', n: 45 }]], 24000);
    expect(rms(low.out, 2400, 24000)).toBeGreaterThan(0.05);
    expect(rms(low.right!, 2400, 24000)).toBeLessThan(1e-4);
    const high = play(vcos('split'), [[0, { type: 'noteOn', n: 72 }]], 24000);
    expect(rms(high.out, 2400, 24000)).toBeLessThan(1e-4);
    expect(rms(high.right!, 2400, 24000)).toBeGreaterThan(0.05);
    // one key on each side: each VCO at its own pitch
    const both = play(
      vcos('split'),
      [
        [0, { type: 'noteOn', n: 45 }],
        [0, { type: 'noteOn', n: 69 }],
      ],
      48000
    );
    expect(hz(both.out, 4800, 48000)).toBeCloseTo(110, -1);
    expect(hz(both.right!, 4800, 48000)).toBeCloseTo(440, -1);
  });

  it('adds a square an octave below with SUB', () => {
    const s = (sub: boolean) =>
      withVoice(vcos('single'), 6, vco({ level: 1, pan: -1, wave: 'sine', sub }));
    const plain = play(s(false), [[0, { type: 'noteOn', n: 69 }]], 24000).out;
    const withSub = play(s(true), [[0, { type: 'noteOn', n: 69 }]], 24000).out;
    // how far the signal is from itself `lag` samples later: small when it repeats with that period
    const unlike = (b: Float32Array, lag: number): number => {
      let d = 0;
      for (let i = 4800; i < 24000 - lag; i++) d += Math.abs(b[i] - b[i + lag]);
      return d / (19200 - lag);
    };
    const one = Math.round(SR / 440),
      two = Math.round(SR / 220);
    // the sine alone repeats every 440 Hz cycle; with the sub it only repeats every second one
    expect(unlike(plain, one)).toBeLessThan(0.05);
    expect(unlike(withSub, one)).toBeGreaterThan(0.3);
    expect(unlike(withSub, two)).toBeLessThan(0.1);
  });

  it('moves the square width with the pwm destination', () => {
    const s = withVoice(vcos('single'), 6, vco({ level: 1, pan: -1, wave: 'square', shape: 0.5 }));
    // the share of each cycle the pulse spends high, from its edges (the output stage blocks DC, so not its average)
    const duty = (b: Float32Array): number => {
      let rise = -1,
        high = 0,
        cycles = 0,
        last = -1;
      for (let i = 2400; i < 24000; i++) {
        const j = b[i] - b[i - 1];
        if (j > 0.5) {
          if (last >= 0) cycles += i - last;
          last = i;
          rise = i;
        } else if (j < -0.5 && rise >= 0) {
          high += i - rise;
          rise = -1;
        }
      }
      return high / cycles;
    };
    const even = play(s, [[0, { type: 'noteOn', n: 57 }]], 24000).out;
    const wide = render(
      { ...params(s), routes: [{ src: 'solKg1', dst: 'solPw7', amt: 0.4 }] },
      { sr: SR, len: 24000, events: [[0, { type: 'noteOn', n: 57 }]], stereo: true }
    ).out;
    expect(duty(even)).toBeCloseTo(0.5, 1);
    expect(duty(wide)).toBeGreaterThan(0.8);
  });

  it("normals the first VCO into the second one's FM", () => {
    let s = vcos('single');
    s = withVoice(s, 6, vco({ level: 0, semi: -24 }));
    s = withVoice(s, 7, vco({ level: 1, pan: 1, wave: 'sine', fm: 0.5 }));
    const fmd = play(s, [[0, { type: 'noteOn', n: 69 }]], 24000).right!;
    const plain = play(
      withVoice(s, 7, vco({ level: 1, pan: 1, wave: 'sine' })),
      [[0, { type: 'noteOn', n: 69 }]],
      24000
    ).right!;
    let diff = 0;
    for (let i = 2400; i < 24000; i++) diff += Math.abs(fmd[i] - plain[i]);
    expect(diff / 21600).toBeGreaterThan(0.1);
  });
});

describe('SOLAR 42 mixer, filter and effector', () => {
  const tone = (pan: number) =>
    withVoice(solar(), 2, srapa({ gate: true, level: 1, pan, note: 57 }));

  it('pans a voice between the two sides', () => {
    const left = play(tone(-1));
    expect(rms(left.out, 2400, 9600)).toBeGreaterThan(0.05);
    expect(rms(left.right!, 2400, 9600)).toBeLessThan(1e-4);
    const right = play(tone(1));
    expect(rms(right.out, 2400, 9600)).toBeLessThan(1e-4);
    expect(rms(right.right!, 2400, 9600)).toBeGreaterThan(0.05);
    const centre = play(tone(0));
    expect(rms(centre.out, 2400, 9600)).toBeCloseTo(rms(centre.right!, 2400, 9600), 3);
  });

  it('cuts the left and right filters independently, and links the right to the left', () => {
    const at = (l: number, r: number, link: boolean) =>
      play({
        ...tone(0),
        vcf: {
          l: { mode: 'lp', cutoff: l, res: 0, drive: 0 },
          r: { mode: 'lp', cutoff: r, res: 0, drive: 0 },
          link,
        },
      });
    const split = at(200, 18000, false);
    expect(rms(split.out, 2400, 9600)).toBeLessThan(rms(split.right!, 2400, 9600) * 0.5);
    const linked = at(200, 18000, true);
    expect(rms(linked.right!, 2400, 9600)).toBeCloseTo(rms(linked.out, 2400, 9600), 3);
  });

  it('blends the cartridges in with BLEND', () => {
    // the stereo delay with its own parameters, as a definition gives them
    const delay = {
      alg: 'delay',
      p: {
        MIX: 100,
        TIM: 300,
        OFS: 0,
        FBL: 40,
        FBR: 40,
        LC: 20,
        HC: 18000,
        FLC: 20,
        FHC: 12000,
        FCL: '1',
        FCR: '1',
        MOD: 'ST',
      },
    };
    const at = (blend: number) =>
      play({ ...tone(0), fx: { l: delay, r: delay, xyz: [], blend } }, noKeys, 48000);
    const dry = at(0);
    const wet = at(1);
    expect(allFinite(wet.out) && allFinite(wet.right!)).toBe(true);
    // nothing has come back from the 300 ms delay yet, so the effect alone is all but silent at first
    expect(rms(dry.out, 2400, 12000)).toBeGreaterThan(0.05);
    expect(rms(wet.out, 2400, 12000)).toBeLessThan(rms(dry.out, 2400, 12000) * 0.2);
    // then the echoes arrive
    expect(rms(wet.out, 20000, 48000)).toBeGreaterThan(0.02);
    expect(peak(wet.out, 0, 48000)).toBeLessThan(1);
  });
});

describe('SOLAR 42 envelopes', () => {
  /** VCO A alone on the left, its key held from the start for `hold` samples. */
  const env = (e: Partial<SolarEnv>, hold = 48000, len = 48000) =>
    play(
      withVoice(solar(), 6, vco({ level: 1, pan: -1, env: { ...asr, ...e } })),
      [
        [0, { type: 'noteOn', n: 57 }],
        [hold, { type: 'noteOff', n: 57 }],
      ],
      len
    ).out;

  it('decays to the sustain level with adsr', () => {
    const o = env({ mode: 'adsr', a: 0.005, d: 0.05, s: 0.3 });
    const early = rms(o, 300, 1200),
      late = rms(o, 24000, 48000);
    expect(late).toBeGreaterThan(0.02);
    expect(late).toBeLessThan(early * 0.5);
  });

  it('rises and falls once on a held gate with ad', () => {
    const o = env({ mode: 'ad', a: 0.005, d: 0.05 });
    expect(rms(o, 300, 1200)).toBeGreaterThan(0.05);
    expect(rms(o, 24000, 48000)).toBeLessThan(1e-3);
  });

  it('repeats the AD while the gate is held with loop', () => {
    const o = env({ mode: 'loop', a: 0.05, d: 0.05 });
    // each cycle is about 0.05 s up and 0.05 s down: still sounding long after a single AD would have ended
    expect(rms(o, 24000, 48000)).toBeGreaterThan(0.05);
    const ad = env({ mode: 'ad', a: 0.05, d: 0.05 });
    expect(rms(ad, 24000, 48000)).toBeLessThan(1e-3);
  });

  it('releases to silence when the key is let go', () => {
    const o = env({ mode: 'asr', r: 0.02 }, 12000);
    expect(rms(o, 6000, 12000)).toBeGreaterThan(0.05);
    expect(rms(o, 24000, 48000)).toBeLessThan(1e-4);
  });
});

describe('SOLAR 42 VCO waves, glide and sync', () => {
  const one = (
    q: Partial<SolarVco>,
    keys: Timed[] = [[0, { type: 'noteOn', n: 57 }]],
    over: Partial<SolarParams> = {}
  ) => play({ ...withVoice(solar(over), 6, vco({ level: 1, pan: -1, ...q })) }, keys, 24000).out;
  const apart = (a: Float32Array, b: Float32Array): number => {
    let d = 0;
    for (let i = 2400; i < 24000; i++) d += Math.abs(a[i] - b[i]);
    return d / 21600;
  };

  it('plays each wave at the key pitch, each a different shape', () => {
    const waves = ['sine', 'tri', 'saw', 'square', 'sawInv', 'sineTri'] as const;
    const out = waves.map((wave) => one({ wave, shape: 0.2 }));
    for (const o of out) {
      expect(allFinite(o)).toBe(true);
      expect(hz(o, 2400, 24000)).toBeCloseTo(220, -1);
    }
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) expect(apart(out[i], out[j])).toBeGreaterThan(0.02);
  });

  it('turns the saw into its inverse through a triangle with sawInv', () => {
    const tri = one({ wave: 'tri' });
    // the middle of the morph is a triangle (up to the phase it started at, so compare loudness, not samples)
    expect(rms(one({ wave: 'sawInv', shape: 0.5 }), 2400, 24000)).toBeCloseTo(
      rms(tri, 2400, 24000),
      2
    );
  });

  it('glides from one key to the next', () => {
    const keys: Timed[] = [
      [0, { type: 'noteOn', n: 45 }],
      [9600, { type: 'noteOn', n: 69 }],
    ];
    const keys2: SolarParams['keys'] = { mode: 'single', split: 60, glide: 0.3 };
    const slow = play(
      withVoice(solar({ keys: keys2 }), 6, vco({ level: 1, pan: -1 })),
      keys,
      48000
    ).out;
    const fast = play(withVoice(solar(), 6, vco({ level: 1, pan: -1 })), keys, 48000).out;
    // just after the second key the glide is still on its way up from 110 Hz to 440 Hz
    const mid = hz(slow, 9600, 14400);
    expect(mid).toBeGreaterThan(130);
    expect(mid).toBeLessThan(400);
    expect(hz(fast, 9600, 14400)).toBeCloseTo(440, -1);
  });

  it('restarts the second VCO with sync', () => {
    let s = solar();
    s = withVoice(s, 6, vco({ level: 0, semi: -12 }));
    s = withVoice(s, 7, vco({ level: 1, pan: 1, wave: 'sine', semi: 5 }));
    const keys: Timed[] = [[0, { type: 'noteOn', n: 69 }]];
    const free = play(s, keys, 24000).right!;
    const synced = render(
      { ...params(s), routes: [{ src: 'solOsc7', dst: 'solSync8', amt: 1 }] },
      { sr: SR, len: 24000, events: keys, stereo: true }
    ).right!;
    // synced to VCO A (220 Hz), VCO B repeats every 220 Hz cycle; free, a fourth above 440 Hz, it does not
    const lag = Math.round(SR / 220);
    const unlike = (b: Float32Array): number => {
      let d = 0;
      for (let i = 4800; i < 24000 - lag; i++) d += Math.abs(b[i] - b[i + lag]);
      return d / (19200 - lag);
    };
    expect(unlike(synced)).toBeLessThan(0.15);
    expect(unlike(free)).toBeGreaterThan(0.3);
  });
});

describe('SOLAR 42 sequencer, effector knobs and filter mode', () => {
  it('steps the sequencer CV on the pulser, round the chosen number of stages', () => {
    // 4 Hz pulser: a new stage every 12000 samples; the CV moves VCO A up 12 semitones per unit
    const s = (stages: number) =>
      withVoice(
        solar({
          seq: {
            hz: 4,
            levels: [0, 0.25, 0.5, 0.75, 1],
            gates: [true, true, true, true, true],
            stages,
          },
        }),
        6,
        vco({ level: 1, pan: -1 })
      );
    const at = (stages: number) =>
      render(
        { ...params(s(stages)), routes: [{ src: 'solSeqCv', dst: 'solP7', amt: 12 }] },
        { sr: SR, len: 96000, events: [[0, { type: 'noteOn', n: 45 }]], stereo: true }
      ).out;
    const steps = (o: Float32Array) =>
      Array.from({ length: 7 }, (_, k) => hz(o, 12000 * k + 2000, 12000 * k + 11000));
    const three = steps(at(3));
    // three different pitches, then the same three again
    expect(Math.abs(three[0] - three[1])).toBeGreaterThan(10);
    expect(Math.abs(three[1] - three[2])).toBeGreaterThan(10);
    expect(three[3]).toBeCloseTo(three[0], -1);
    expect(three[4]).toBeCloseTo(three[1], -1);
    // with five stages the fourth step is a new pitch
    const five = steps(at(5));
    expect(Math.abs(five[3] - five[0])).toBeGreaterThan(30);
  });

  it('turns a cartridge parameter with an X knob, and with its CV', () => {
    const delay = {
      alg: 'delay',
      p: {
        MIX: 100,
        TIM: 300,
        OFS: 0,
        FBL: 0,
        FBR: 0,
        LC: 20,
        HC: 18000,
        FLC: 20,
        FHC: 12000,
        FCL: '1',
        FCR: '1',
        MOD: 'ST',
      },
    };
    const tone = withVoice(solar(), 2, srapa({ gate: true, level: 1, note: 57 }));
    const echo = (v: number, cv = 0) => {
      const p = params({
        ...tone,
        fx: { l: delay, r: delay, xyz: [{ ref: 'TIM', lo: 150, hi: 500, v }], blend: 1 },
      });
      const o = render(cv ? { ...p, routes: [{ src: 'solKg1', dst: 'solFxX', amt: cv }] } : p, {
        sr: SR,
        len: 48000,
        events: cv ? [[0, { type: 'noteOn', n: 60 }]] : noKeys,
        stereo: true,
      }).out;
      // the first sample the echo is heard: the delay time the knob set. A new cartridge fades in from dry over
      // its first ~70 ms (dm-fx's MIX smoothing), so look from 0.12 s on
      const from = Math.round(0.12 * SR);
      return from + o.subarray(from).findIndex((x) => Math.abs(x) > 0.05);
    };
    const short = echo(0),
      long = echo(1);
    expect(short).toBeGreaterThan(0.13 * SR);
    expect(short).toBeLessThan(0.22 * SR);
    expect(long).toBeGreaterThan(0.45 * SR);
    // the knob at 0 with full CV reaches the far end too
    expect(echo(0, 1)).toBeGreaterThan(0.45 * SR);
  });

  it('passes only the highs with the filter on band-pass at the top', () => {
    const at = (mode: 'lp' | 'bp') =>
      play({
        ...withVoice(solar(), 2, srapa({ gate: true, level: 1, pan: -1, note: 45 })),
        vcf: {
          l: { mode, cutoff: 12000, res: 0.2, drive: 0 },
          r: { mode: 'lp', cutoff: 18000, res: 0, drive: 0 },
          link: false,
        },
      }).out;
    expect(rms(at('bp'), 2400, 9600)).toBeLessThan(rms(at('lp'), 2400, 9600) * 0.5);
  });

  it('takes new settings while it plays', () => {
    const on = withVoice(solar(), 0, drone({ gate: true, level: 1 }));
    const off = withVoice(solar(), 0, drone({ gate: false, level: 1 }));
    const r = render(params(on), {
      sr: SR,
      len: 24000,
      events: [[9600, { type: 'params', p: params(off) }]],
      stereo: true,
    });
    expect(rms(r.out, 4800, 9600)).toBeGreaterThan(0.02);
    expect(rms(r.out, 14400, 24000)).toBeLessThan(1e-3);
  });
});
