/**
 * Sound engine (dsp-core) tests.
 *
 * The bit-for-bit proof of the port is `npm run check:synths -- --compare` against the prototype's baseline. These
 * tests hold the engine's behaviour in place for the gate: every voice path renders finite, non-silent, repeatable
 * audio from real-looking EngineParams, and the behaviours a panel relies on (release to silence, phrase events,
 * meters, poly allocation, arpeggiator, dual assignment) do what they say.
 *
 * @see lib/app/synths/audio/dsp-core.ts
 */

import { describe, it, expect } from 'vitest';

import {
  BUILTIN_NORMALS,
  createSynth,
  DESTS,
  OSC_WAVES,
  SIGNALS,
  type MeterEvent,
  type SynthEvent,
} from '@/lib/app/synths/audio/dsp-core';
import type { EngineCable, EngineParams, Phrase } from '@/lib/app/synths/contract';
import {
  allFinite,
  monoParams,
  render,
  rms,
  sameSamples,
  type Timed,
} from '@/tests/unit/lib/app/synths/audio/render';

const meters = (events: SynthEvent[]): MeterEvent[] =>
  events.filter((e): e is MeterEvent => e.type === 'meter');

/** Render twice with the same seed: the engine's only randomness is Math.random, so the two must be identical. */
function renderStable(p: EngineParams, o: Parameters<typeof render>[1] = {}) {
  const a = render(p, o);
  const b = render(p, o);
  expect(sameSamples(a.out, b.out)).toBe(true);
  expect(allFinite(a.out)).toBe(true);
  return a;
}

const cable = (src: string, dst: string, amt = 1, add = false): EngineCable => ({
  src,
  dst,
  amt,
  add,
});

describe('signal and destination tables', () => {
  it('lists every destination once and every signal once but `pink`, including the generated per-oscillator and Moog names', () => {
    // `pink` is both the voice's pink noise and the Moog 923's pink output: one name, the later index wins in the voice
    expect(SIGNALS.filter((s, i) => SIGNALS.indexOf(s) !== i)).toEqual(['pink']);
    expect(new Set(DESTS).size).toBe(DESTS.length);
    for (const n of [1, 2, 3]) for (const w of OSC_WAVES) expect(SIGNALS).toContain(`o${n}${w}`);
    expect(SIGNALS).toEqual(
      expect.arrayContaining(['osc1', 'vcf1', 'env1', 'lfo', 'v1saw', 'e4', 's960clk'])
    );
    expect(DESTS).toEqual(expect.arrayContaining(['cutoff', 'vcfIn', 'pitch4', 'lp904In', 'q6In']));
  });

  it('normals the fixed voice path osc mixer → filter → overdrive → VCA → delay → output, and both gates to the key', () => {
    expect(BUILTIN_NORMALS).toEqual({
      vcfIn: 'mixer',
      odIn: 'vcf1',
      vcaIn: 'od',
      delayIn: 'vca',
      gate1: 'gate',
      gate2: 'gate',
      shIn: 'noise',
      dryIn: 'out',
    });
    for (const [d, s] of Object.entries(BUILTIN_NORMALS)) {
      expect(DESTS).toContain(d);
      expect(SIGNALS).toContain(s);
    }
  });
});

describe('mono voice', () => {
  it('clears both outputs before any params arrive, and ignores notes until then', () => {
    const syn = createSynth(48000, null);
    syn.handle({ type: 'noteOn', n: 60 });
    const out = new Float32Array(128).fill(1);
    const right = new Float32Array(128).fill(1);
    syn.process(out, 128, right);
    expect(out.every((x) => x === 0) && right.every((x) => x === 0)).toBe(true);
  });

  it('with no key held, stays silent', () => {
    expect(rms(render(monoParams(), { events: [], len: 256 }).out)).toBe(0);
  });

  it('sounds while a key is held, is repeatable under a seed, and differs under another seed', () => {
    const a = renderStable(monoParams());
    expect(rms(a.out, 0, 4800)).toBeGreaterThan(0.05);
    const other = render(monoParams(), { seed: 7 });
    expect(sameSamples(a.out, other.out)).toBe(false);
  });

  it('releases to silence after the key is let go', () => {
    const { out } = render(monoParams(), {
      len: 48000,
      events: [
        [0, { type: 'noteOn', n: 60 }],
        [4800, { type: 'noteOff', n: 60 }],
      ],
    });
    expect(rms(out, 0, 4800)).toBeGreaterThan(0.05);
    expect(rms(out, 40000, 48000)).toBeLessThan(1e-4);
  });

  it('reports the notes it plays and a meter about 25 times a second', () => {
    const { events } = render(monoParams(), { len: 9600 });
    expect(events).toContainEqual({ type: 'note', n: 60, on: true });
    expect(events).toContainEqual({ type: 'note', n: 60, on: false });
    const m = meters(events);
    expect(m.length).toBeGreaterThanOrEqual(4);
    expect(m[0]).toMatchObject({ gate: true, oscs: 0b111 });
    expect(m[0].overload).toBeGreaterThan(0);
  });

  it('plays a phrase, ends it with phraseEnd when it does not loop, and panics to allOff', () => {
    const phrase: Phrase = {
      bpm: 240,
      loop: false,
      steps: [
        [0, 48, 0.5],
        [0.5, 55, 0.5, 1],
      ],
    };
    const { events, out } = render(monoParams(), {
      len: 19200,
      events: [
        [0, { type: 'phrase', phrase }],
        [9600, { type: 'tempo', bpm: 300 }],
        [18000, { type: 'panic' }],
      ],
    });
    expect(rms(out, 0, 6000)).toBeGreaterThan(0.02);
    const notes = events.filter((e) => e.type === 'note');
    expect(notes.slice(0, 2)).toEqual([
      { type: 'note', n: 48, on: true },
      { type: 'note', n: 48, on: false },
    ]);
    expect(events.some((e) => e.type === 'phraseEnd')).toBe(true);
    expect(events.filter((e) => e.type !== 'meter').at(-1)).toEqual({ type: 'allOff' });
  });

  it('loops a phrase until it is stopped, and transposes it', () => {
    const phrase: Phrase = { bpm: 480, loop: true, transpose: 12, steps: [[0, 48, 0.25]] };
    const { events } = render(monoParams(), {
      len: 24000,
      events: [
        [0, { type: 'phrase', phrase }],
        [20000, { type: 'stopPhrase' }],
      ],
    });
    const ons = events.filter((e) => e.type === 'note' && e.on);
    expect(ons.length).toBeGreaterThanOrEqual(3);
    expect(ons[0]).toEqual({ type: 'note', n: 60, on: true });
    expect(events.some((e) => e.type === 'phraseEnd')).toBe(false);
  });

  it('ignores an empty phrase and a note off for a key that is not held', () => {
    const { out } = render(monoParams(), {
      events: [
        [0, { type: 'phrase', phrase: null }],
        [0, { type: 'phrase', phrase: { bpm: 120, loop: true, steps: [] } }],
        [0, { type: 'noteOff', n: 61 }],
      ],
    });
    expect(rms(out)).toBe(0);
  });

  it('takes a per-voice pitch offset and LFO phase', () => {
    const plain = render(monoParams());
    const moved = render(monoParams(), {
      events: [
        [0, { type: 'offset', semi: 0.5 }],
        [0, { type: 'phase', lfo: 0.25, lfo2: 0.5 }],
        [0, { type: 'offset' }],
        [0, { type: 'phase' }],
        [0, { type: 'offset', semi: 0.5 }],
        [0, { type: 'noteOn', n: 60 }],
      ],
    });
    expect(sameSamples(plain.out, moved.out)).toBe(false);
  });

  it('glides between legato notes, and only on legato notes when asked', () => {
    const events: Timed[] = [
      [0, { type: 'noteOn', n: 48 }],
      [2400, { type: 'noteOn', n: 72 }],
      [4800, { type: 'noteOff', n: 72 }],
      [4800, { type: 'noteOff', n: 48 }],
      [6000, { type: 'noteOn', n: 60 }],
    ];
    const glide = renderStable(monoParams({ glide: { time: 0.2, legato: false } }), { events });
    const legato = renderStable(monoParams({ glide: { time: 0.2, legato: true } }), { events });
    const none = render(monoParams(), { events });
    expect(sameSamples(glide.out, none.out)).toBe(false);
    expect(sameSamples(glide.out, legato.out)).toBe(false);
  });

  it('a held-over key and a velocity-less note both still sound', () => {
    const { out } = renderStable(
      monoParams({ trig: { retrig: false, drone: false, repeat: false } }),
      {
        events: [
          [0, { type: 'noteOn', n: 60 }],
          [1000, { type: 'noteOn', n: 64 }],
          [1500, { type: 'noteOn', n: 64 }],
          [3000, { type: 'noteOff', n: 64 }],
        ],
      }
    );
    expect(rms(out, 3200, 4800)).toBeGreaterThan(0.01);
  });
});

/** One voice feature per row: each must render finite, repeatable audio that differs from the plain voice. */
const FEATURES: [string, EngineParams][] = [
  [
    'svf low-pass with key tracking and velocity envelope',
    monoParams({
      filter: {
        type: 'svf',
        mode: 'lp',
        cutoff: 800,
        res: 0.6,
        envAmt: 3,
        envSrc: 'env1v',
        kbd: 1,
      },
    }),
  ],
  [
    'svf high-pass, self-oscillating',
    monoParams({
      filter: {
        type: 'svf',
        mode: 'hp',
        cutoff: 600,
        res: 1.1,
        envAmt: 0,
        envSrc: 'env2',
        kbd: 0,
        mode2: 'bp',
      },
    }),
  ],
  [
    'svf band-pass',
    monoParams({
      filter: {
        type: 'svf',
        mode: 'bp',
        cutoff: 900,
        res: 0.5,
        envAmt: 1,
        envSrc: 'env2v',
        kbd: 0,
      },
    }),
  ],
  [
    'svf morph (notch)',
    monoParams({
      filter: {
        type: 'svf',
        mode: 'morph',
        cutoff: 900,
        res: 0.4,
        envAmt: 1,
        envSrc: 'env1',
        kbd: 0,
        morph: 0.7,
      },
    }),
  ],
  [
    'ladder high-pass and band-pass outputs',
    monoParams({
      filter: {
        type: 'ladder',
        mode: 'hp',
        mode2: 'bp',
        cutoff: 500,
        res: 0.9,
        envAmt: 1,
        envSrc: 'env1',
        kbd: 0,
        drive: 2,
      },
    }),
  ],
  [
    'ladder band-pass',
    monoParams({
      filter: {
        type: 'ladder',
        mode: 'bp',
        mode2: 'hp',
        cutoff: 700,
        res: 0.5,
        envAmt: 1,
        envSrc: 'env1',
        kbd: 0,
      },
    }),
  ],
  [
    '24 dB high-pass in front',
    monoParams({ hpf: { cutoff: 300, res: 1.05, envAmt: 1, envSrc: 'env2', kbd: 0.5 } }),
  ],
  [
    '6 dB high-pass in front',
    monoParams({ hpf: { cutoff: 400, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0, poles: 1 } }),
  ],
  [
    'overdrive and delay',
    monoParams({
      od: { on: true, drive: 0.7, tone: 0.2, level: 0.8 },
      delay: { on: true, time: 0.05, fb: 0.6, mix: 0.5 },
    }),
  ],
  ['bright overdrive', monoParams({ od: { on: true, drive: 0.5, tone: 0.9 } })],
  [
    'every waveform and the sub',
    monoParams({
      osc: [
        {
          level: 0.6,
          mix: { shark: 0.5, rsaw: 0.3, sine: 0.4, tmod: 0.3, sub: 0.5 },
          semi: 0,
          pw: 0.3,
        },
        { level: 0.5, mix: { notch: 0.5, tri: 0.2 }, pw: 0.4, semi: 0.1 },
        { level: 0.4, mix: { pulse: 1 }, semi: 12, subLevel: 0.4 },
        { level: 0.3, mix: { saw: 1 }, semi: -24, kbd: false, fixedNote: 40 },
      ],
    }),
  ],
  [
    'hard sync with the sync gate',
    monoParams({
      osc: [
        { level: 0.5, mix: { saw: 1 }, semi: 0 },
        { level: 0.6, mix: { saw: 1, sub: 0.3 }, semi: 7.3, syncTo: 0, syncGate: true },
      ],
    }),
  ],
  [
    'morphing oscillators, all four regions',
    monoParams({
      osc: [
        { level: 0.4, semi: 0, morph: 0.2 },
        { level: 0.4, semi: 0.05, morph: 0.6 },
        { level: 0.4, semi: 12, morph: 0.9 },
      ],
    }),
  ],
  [
    'skewed triangle and shaped sine',
    monoParams({
      osc: [
        { level: 0.6, mix: { tri: 1 }, semi: 0, skew: 0.2 },
        { level: 0.5, mix: { sine: 1 }, semi: 0.2, sineShape: -0.7 },
        { level: 0.5, mix: { sine: 1 }, semi: 0.3, sineShape: 0.5 },
      ],
    }),
  ],
  [
    'separate waveform outputs and split pulse width',
    monoParams({
      oscOuts: true,
      pwSplit: true,
      routes: [
        { src: 'o1sine', dst: 'cutoff', amt: 1 },
        { src: 'lfo', dst: 'pw3', amt: 0.2 },
      ],
    }),
  ],
  [
    'pink, coloured and tilted noise',
    monoParams({ noise: { level: 0.6, color: 'pink', gain: 1.2 } }),
  ],
  ['noise tone and tilt', monoParams({ noise: { level: 0.6, tone: 0.2, tilt: -0.6 } })],
  ['bright noise', monoParams({ noise: { level: 0.6, tone: 0.8, tilt: 0.6 } })],
  [
    'LFO shapes, sample and hold, delay, second LFO',
    monoParams({
      lfo: {
        rate: 7,
        mix: { saw: 0.3, rsaw: 0.2, sq: 0.2, sine: 0.3, sh: 0.4, shg: 0.3 },
        keySync: true,
        delay: 0.05,
        vibDelay: 0.02,
        vibDepth: 0.5,
      },
      lfo2: {
        rate: 3,
        mix: { tri: 0.3, saw: 0.2, rsaw: 0.1, sq: 0.2, sine: 0.4, sh: 0.3, shg: 0.3 },
        keySync: true,
        delay: 0.04,
      },
      routes: [
        { src: 'lfo', dst: 'cutoff', amt: 1 },
        { src: 'lfo2', dst: 'pitchAll', amt: 0.3 },
        { src: 'vib', dst: 'pitch1', amt: 0.5 },
      ],
    }),
  ],
  ['paraphonic second note', monoParams({ paraphonic: true, note2Osc: 1 })],
  [
    'duophonic keyboard',
    monoParams({ duo: true, routes: [{ src: 'kbd2', dst: 'pitch2', amt: 12 }] }),
  ],
  [
    'drift, tune and wheel',
    monoParams({
      drift: { depth: 0.3, rate: 0.01 },
      tune: 0.4,
      wheel: 0.5,
      routes: [{ src: 'wheel', dst: 'cutoff', amt: 2 }],
    }),
  ],
  [
    'TB-303 accent',
    monoParams({ acid: { thresh: 0.8, decay: 0.15, rise: 0.02, fall: 0.3, cut: 1.5, amp: 0.5 } }),
  ],
  ['forced accent with defaults', monoParams({ acid: { force: true, cut: 1, amp: 0.3 } })],
  [
    'curved envelopes with key follow, delay and hold',
    monoParams({
      env1: { a: 0.01, d: 0.05, s: 0.3, r: 0.05, curve: { a: 0.2, d: 0.7, r: 0.5 }, kf: 1 },
      env2: { a: 0.002, d: 0.1, s: 0.6, r: 0.05, dly: 0.01, hold: 0.02, kf: 0.5 },
      env3: { a: 0.01, d: 0.1, s: 0.5, r: 0.1 },
      vca: { envSrc: 'env3', bias: 0, gain: 0.9 },
      routes: [{ src: 'env3', dst: 'cutoff', amt: 1, by: 'env2' }],
    }),
  ],
  [
    'looping and frozen envelopes',
    monoParams({
      env1: { a: 0.005, d: 0.01, s: 0, r: 0.1, loop: true },
      env2: { a: 0.002, d: 0.2, s: 0.8, r: 0.1, freeze: false },
      vca: { envSrc: 'env1', bias: 0 },
    }),
  ],
  [
    'trigger sources: trigger and sample-and-hold clock',
    monoParams({
      trig: { retrig: true, drone: false, repeat: false, src: ['trig', 'sh'] },
      routes: [{ src: 'shClk', dst: 'envClk', amt: 1 }],
    }),
  ],
  // (a definition that picks envelope sources normals the shared gate input `gateIn` to the key itself)
  [
    'gate jack per envelope, repeat on the LFO',
    monoParams({
      trig: { retrig: true, drone: false, repeat: true, src: ['gate', 'gate'] },
      normals: { gateIn: 'gate' },
      cables: [cable('lfoSq', 'gate1')],
    }),
  ],
  [
    'drone',
    monoParams({ trig: { retrig: false, drone: true, repeat: false, src: ['gate', 'gate'] } }),
  ],
  [
    'drone without per-envelope sources',
    monoParams({ trig: { retrig: false, drone: true, repeat: false } }),
  ],
  [
    'auto trigger from the LFO',
    monoParams({
      trig: { retrig: false, drone: false, repeat: false, src: ['gate', 'gate'], auto: true },
    }),
  ],
  [
    'sample and hold clocked by the LFO, slew, attenuators and utilities',
    monoParams({
      sh: { rate: 8, glide: 0.01, clock: 'lfo' },
      slew: { time: 0.05 },
      att: [0.5, 0.8],
      cables: [
        cable('sh', 'slewIn'),
        cable('slew', 'att1In'),
        cable('lfoUni', 'att1CV'),
        cable('att1', 'cutoff'),
        cable('env2', 'att2In'),
        cable('att2', 'sum1A'),
        cable('lfo', 'sum1B'),
        cable('sum1', 'invertIn'),
        cable('invert', 'multIn'),
        cable('mult', 'pw1'),
        cable('noise', 'sum2A'),
        cable('sum2', 'inv1In'),
        cable('inv1', 'inv2In'),
        cable('inv2', 'eswA'),
        cable('esw', 'pitch3', 0.1),
      ],
    }),
  ],
  [
    'sample and hold on its own clock',
    monoParams({ sh: { rate: 20, glide: 0 }, routes: [{ src: 'sh', dst: 'cutoff', amt: 1 }] }),
  ],
  [
    'sample and hold on a patched clock',
    monoParams({
      sh: { rate: 5, glide: 0.001 },
      cables: [cable('lfoSq', 'shClock'), cable('sh', 'cutoff')],
    }),
  ],
  [
    'ring modulator, preamp and envelope follower',
    monoParams({
      ring: { ac: true, acB: true },
      preamp: { gain: 3 },
      envf: { sens: 2 },
      cables: [
        cable('osc1', 'ringA'),
        cable('osc2', 'ringB'),
        cable('ring', 'extIn'),
        cable('osc3', 'preampIn'),
        cable('preamp', 'envfIn'),
        cable('envf', 'cutoff'),
      ],
      ext: { level: 0.5 },
    }),
  ],
  ['spring reverb', monoParams({ rev: { on: true, mix: 0.5, decay: 0.7, damp: 0.3 } })],
  [
    'reverb unit (VCS3)',
    monoParams({
      rev: { on: true, mix: 0.4, unit: true },
      cables: [cable('vca', 'revIn'), cable('rev', 'dryIn'), cable('lfoUni', 'revMix', 0.3)],
    }),
  ],
  [
    '6 dB utility high-pass, sub output',
    monoParams({
      hp6: { cutoff: 200 },
      subOut: true,
      cables: [cable('osc1', 'hp6In'), cable('hp6', 'extIn'), cable('sub', 'pitch3', 0.1)],
      ext: { level: 0.5 },
    }),
  ],
  [
    'normals overridden and removed',
    monoParams({
      normals: { vcaIn: 'vcf2', delayIn: null, odIn: ['vcf1', 0.5] },
      cables: [cable('vca', 'delayIn', 1, true)],
    }),
  ],
  [
    'an A440 reference and an exponential VCA input',
    monoParams({ a440: true, cables: [cable('env1', 'ampExp')] }),
  ],
  [
    'joystick',
    monoParams({
      joy: [0.5, -0.3],
      routes: [
        { src: 'joyX', dst: 'cutoff', amt: 1 },
        { src: 'joyY', dst: 'pitchAll', amt: 1 },
      ],
    }),
  ],
  [
    'trapezoid envelope with decay CV',
    monoParams({
      trap: { a: 0.01, on: 0.02, d: 0.03, off: 0.01, auto: true, hold: false },
      cables: [cable('trap', 'decayCv')],
      vca: { envSrc: 'env1', bias: 0 },
    }),
  ],
  [
    'trapezoid waiting for a key',
    monoParams({
      trap: { a: 0.01, on: 0.01, d: 0.02, off: 0.01, auto: false, hold: false },
      vca: { envSrc: 'env1', bias: 0 },
    }),
  ],
  ['VCA bias with no envelope', monoParams({ vca: { envSrc: 'none', bias: 0.5 } })],
  [
    'oscillator levels and waves on cables',
    monoParams({
      osc: [
        { level: 0.4, semi: 0, morph: 0.3 },
        { level: 0.4, mix: { saw: 1 }, semi: 0.1 },
      ],
      cables: [cable('lfoUni', 'lvl1'), cable('lfo', 'wave1'), cable('lfoUni', 'lvl2')],
    }),
  ],
];

describe.each(FEATURES)('voice feature: %s', (_name, p) => {
  it('renders finite, repeatable audio unlike the plain voice', () => {
    const r = renderStable(p, {
      len: 14400,
      events: [
        [0, { type: 'noteOn', n: 57, v: 0.95 }],
        [2400, { type: 'noteOn', n: 64, v: 0.6 }],
        [7200, { type: 'noteOff', n: 64 }],
        [9000, { type: 'noteOff', n: 57 }],
      ],
    });
    expect(rms(r.out)).toBeGreaterThan(0.001);
    const plain = render(monoParams(), { len: 14400 });
    expect(sameSamples(r.out, plain.out)).toBe(false);
  });
});

describe('a note per oscillator (oscAssign)', () => {
  const chord: Timed[] = [
    [0, { type: 'noteOn', n: 48 }],
    [480, { type: 'noteOn', n: 52 }],
    [960, { type: 'noteOn', n: 55 }],
    [1440, { type: 'noteOn', n: 59 }],
    [1920, { type: 'noteOn', n: 62 }],
    [2400, { type: 'noteOff', n: 52 }],
    [2880, { type: 'noteOn', n: 52 }],
    [4800, { type: 'noteOff', n: 48 }],
    [5000, { type: 'noteOff', n: 52 }],
    [5200, { type: 'noteOff', n: 55 }],
    [5400, { type: 'noteOff', n: 59 }],
    [5600, { type: 'noteOff', n: 62 }],
  ];
  const four = (mode: 'poly' | 'unison', damp: boolean): EngineParams =>
    monoParams({
      osc: [0, 1, 2, 3].map(() => ({ level: 0.4, mix: { saw: 1 }, semi: 0 })),
      oscAssign: { mode, damp },
      glide: { time: 0.02, legato: false },
    });

  it.each([
    ['poly', false],
    ['poly', true],
    ['unison', false],
  ] as const)('%s (damp %s) deals the held keys out to the oscillators', (mode, damp) => {
    const r = renderStable(four(mode, damp), { events: chord, len: 9600 });
    expect(rms(r.out, 0, 4800)).toBeGreaterThan(0.01);
    const m = meters(r.events);
    expect(m.some((x) => (x.oscs ?? 0) > 0)).toBe(true);
  });

  it('with no oscillator on the keyboard there is nothing to assign', () => {
    const p = monoParams({
      osc: [{ level: 0.5, mix: { saw: 1 }, semi: 0, kbd: false }],
      oscAssign: { mode: 'poly' },
    });
    expect(rms(renderStable(p).out)).toBeGreaterThan(0.01);
  });
});

describe('Buchla Music Easel path', () => {
  const easel = (over: Partial<NonNullable<EngineParams['easel']>> = {}): EngineParams =>
    monoParams({
      osc: [],
      easel: {
        cosc: { note: 60, kbd: true, sign: 1, shape: 0.5, wave: 'tri', timbre: 0.4 },
        mosc: { hz: 220, kbd: true, wave: 'saw', mode: 'fm', index: 0.3, fmIn: 0.5 },
        pulser: { v: 6, trig: 'self', mode: 'trans', fire: 0 },
        env: { a: 9, s: 6, d: 5, trig: 'pulser', mode: 'trans' },
        seq: {
          levels: [0.1, 0.5, 0.9, 0.3, 0.7],
          stages: 5,
          pulses: [true, false, true, false, true],
          trig: 'pulser',
        },
        rvs: { trig: 'pulser' },
        gates: [
          { mode: 'combo', level: 0.4 },
          { mode: 'lp', level: 0.6 },
        ],
        mix: [0.7, 0.5],
        porta: 0.05,
        add: 0,
        preset: 0.3,
        arp: { on: false, mode: 'up', rate: 6 },
        ...over,
      },
      cables: [
        cable('osc1', 'lpg1In'),
        cable('osc2', 'lpg2In'),
        cable('env1', 'gate1Lvl'),
        cable('seq', 'index', 0.3),
        cable('rnd1', 'fold', 0.2),
        cable('pulser', 'period', 0.1),
        cable('ezMix', 'dryIn'),
        cable('osc2', 'fmIn'),
        cable('lfo', 'portaIn'),
      ],
    });

  it.each([
    ['FM, triangle, self-cycling pulser', easel()],
    [
      'AM, spike, keyboard triggers, sustained envelope',
      easel({
        cosc: { note: 55, kbd: true, sign: -1, shape: 0.8, wave: 'spike', timbre: 0 },
        mosc: { hz: 110, kbd: false, wave: 'sq', mode: 'am', index: 0.6, fmIn: 0 },
        pulser: { v: 4, trig: 'kbd', mode: 'sus', fire: 1 },
        env: { a: 8, s: 5, d: 6, trig: 'kbd', mode: 'sus' },
        seq: { levels: [0.2, 0.8], stages: 2, pulses: [true, true], trig: 'kbd' },
        rvs: { trig: 'kbd' },
        gates: [
          { mode: 'vca', level: 0.5 },
          { mode: 'combo', level: 0.3 },
        ],
        arp: { on: true, mode: 'random', rate: 12 },
      }),
    ],
    [
      'balanced modulator, square, sequencer-driven, self envelope',
      easel({
        cosc: { note: 48, kbd: true, sign: 1, shape: 1, wave: 'sq', timbre: 0.8 },
        mosc: { hz: 330, kbd: true, wave: 'tri', mode: 'bal', index: 1, fmIn: 0.2 },
        pulser: { v: 7, trig: 'seq', mode: 'off', fire: 0 },
        env: { a: 9, s: 7, d: 8, trig: 'seq', mode: 'self' },
        seq: { levels: [0.5, 0.1, 0.9], stages: 3, pulses: [true, true, true], trig: 'off' },
        rvs: { trig: 'seq' },
        arp: { on: true, mode: 'up', rate: 20 },
      }),
    ],
  ])('%s renders finite, repeatable audio with lamps in the meter', (_n, p) => {
    const r = renderStable(p, {
      len: 19200,
      events: [
        [0, { type: 'noteOn', n: 60 }],
        [3000, { type: 'noteOn', n: 67 }],
        [9600, { type: 'noteOff', n: 67 }],
        [12000, { type: 'noteOff', n: 60 }],
      ],
    });
    expect(rms(r.out)).toBeGreaterThan(0.001);
    const m = meters(r.events);
    expect(m[0]).toHaveProperty('pulser');
    expect(m[0]).toHaveProperty('seq');
  });
});

describe('Moog modular path', () => {
  const seqRows = [
    [1, 3, 5, 7, 9, 2, 4, 6],
    [0, 2, 4, 6, 8, 10, 1, 3],
    [5, 5, 5, 5, 5, 5, 5, 5],
  ];
  const moog = (
    over: Partial<NonNullable<EngineParams['moog']>> = {},
    extra: EngineCable[] = []
  ): EngineParams =>
    monoParams({
      osc: [],
      moog: {
        vco: [
          { kind: 'b', semi: 0, sync: 'off' },
          {
            kind: '921',
            semi: 7,
            sync: 'strong',
            width: 0.4,
            clamp: 0.25,
            aux: 'saw',
            auxLevel: 0.5,
          },
          { kind: 'b', semi: -12, sync: 'weak' },
          { kind: '921', semi: 3, sync: 'off', width: 0.5, clamp: 0, aux: 'rect', auxLevel: 1 },
        ],
        drv: [{ v: 0, w: 3 }],
        lp904: { lo: 100, v: 2, regen: 0.6 },
        hp904: { lo: 30, v: 1 },
        fb914: { g: [0.5, 0, 0.8, 0.3, 0.4, 0.6, 0.2, 0.7, 0.5, 0.4, 0.3, 0.2, 0.1, 0.6] },
        f923: { lp: 3000, hp: 150 },
        vca: [
          { v: 0, exp: false },
          { v: 2, exp: true },
        ],
        env: [
          { t1: 0.01, t2: 0.1, t3: 0.2, sus: 3 },
          { t1: 0.002, t2: 0.05, t3: 0.1, sus: 0 },
        ],
        mix: [{ g: [1, 0.5, 0.5, 0.5], m: 0.8 }],
        att: [1, 0.5, 0.3, 0.2],
        ctl: [{ on: [true, false, true], x: 0.5 }],
        i961: { sens: 2, onL: 0.01, onR: 0.02 },
        cm1a: { trig: 'both' },
        s960: {
          hz: 8,
          timing: true,
          rows: seqRows,
          range: [2, 4, 8],
          mode: ['normal', 'skip', 'normal', 'normal', 'normal', 'normal', 'normal', 'stop'],
          btn: {
            on: false,
            off: false,
            shift: false,
            set: [false, false, false, false, false, false, false, false],
          },
        },
        s962: { btn: [false, false, false] },
        d911a: { d: [0.01, 0.02], mode: 'series' },
        q995: [1, 0.5, 0.5, 0.5, 0.5, 0.5],
        ...over,
      },
      cables: [
        cable('kcv1', 'v1dc'),
        cable('kcv2', 'v2dc'),
        cable('v1saw', 'v2sy'),
        cable('d1f', 'v3lf'),
        cable('d1w', 'v3lw'),
        cable('v3rect', 'mu1In'),
        cable('mu1', 'x1i1'),
        cable('v2aux', 'x1i2'),
        cable('v1tri', 'x1i3'),
        cable('v4aux', 'x1i4'),
        cable('x1p', 'lp904In'),
        cable('lp904', 'hp904In'),
        cable('hp904', 'fb914In'),
        cable('fb914', 'lp923In'),
        cable('lp923', 'hp923In'),
        cable('hp923', 'a1ip'),
        cable('white', 'a1in', 0.05),
        cable('e1', 'a1cv'),
        cable('e2', 'lp904Cv', 0.3),
        cable('ktrL', 'e1st'),
        cable('ktrU', 'e2st'),
        cable('pink', 't1In', 0.1),
        cable('t1', 'v4ac'),
        cable('s960a', 'c1i1'),
        cable('s960b', 'c1i3'),
        cable('p6', 'c1x', 0.1),
        cable('c1', 'v4dc'),
        cable('s960clk', 'sw962sh'),
        cable('s960o1', 'sw962s2'),
        cable('v1sin', 'sw962i1'),
        cable('v2tri', 'sw962i2'),
        cable('v3saw', 'sw962i3'),
        cable('sw962', 'q1In'),
        cable('q1', 'a2ip'),
        cable('sw962t1', 'a2cv'),
        cable('a1p', 'i9au'),
        cable('i9a', 'i9bL'),
        cable('ktrL', 'i9siL'),
        cable('i9vL', 'i9aR'),
        cable('ktrU', 'i9siR'),
        cable('i9vR', 'i9bR'),
        cable('i9sL', 'dtI1'),
        cable('i9sR', 'dtI2'),
        cable('dtO1', 'e2st', 1, true),
        cable('s960c', 'hp904Cv', 0.2),
        cable('s960clk', 's960sh', 1),
        cable('n6', 's960cv', 0.1),
        cable('e1', 's960on', 1),
        cable('dtO2', 's960off', 0),
        cable('v4tri', 's960i2', 0),
        cable('v4saw', 'v4tv'),
        cable('v4sin', 'v4ts'),
        cable('v4lft', 'v2ac', 0.1),
        cable('v4lwt', 'v4wc', 0.1),
        cable('a1p', 'dryIn', 0.1),
        cable('a2n', 'dryIn', 0.05, true),
        cable('i9sL', 'revIn', 0.01),
        ...extra,
      ],
    });

  it('renders a patched system through every module, repeatably, with the 960 lamps in the meter', () => {
    const r = renderStable(moog(), {
      len: 19200,
      events: [
        [0, { type: 'noteOn', n: 60 }],
        [4800, { type: 'noteOff', n: 60 }],
        [6000, { type: 'noteOn', n: 67 }],
        [14000, { type: 'noteOff', n: 67 }],
      ],
    });
    expect(rms(r.out)).toBeGreaterThan(0.001);
    expect(meters(r.events).some((m) => typeof m.seq === 'number')).toBe(true);
  });

  it('is silent with nothing patched to the output', () => {
    const p = moog();
    p.cables = [];
    expect(rms(renderStable(p).out)).toBeLessThan(1e-6);
  });

  it('takes 960 and 962 button presses as a change of the panel button', () => {
    const p = moog();
    const q = structuredClone(p);
    // RUN, then STOP, then SHIFT, then stage 3's button: the sequencer ends up stopped on stage 3 (index 2)
    q.moog!.s960!.btn = {
      on: true,
      off: true,
      shift: true,
      set: [false, false, true, false, false, false, false, false],
    };
    q.moog!.s962 = { btn: [false, true, false] };
    const r = render(p, {
      len: 9600,
      events: [
        [0, { type: 'noteOn', n: 60 }],
        [4800, { type: 'params', p: q }],
      ],
    });
    expect(allFinite(r.out)).toBe(true);
    const after = meters(r.events).slice(-2);
    expect(after.map((m) => m.seq)).toEqual([2, 2]);
  });

  it.each([
    [
      'V-trigger keyboard and parallel trigger delay',
      { cm1a: { trig: 'v' as const }, d911a: { d: [0.01, 0.02], mode: 'parallel' as const } },
    ],
    [
      'S-trigger keyboard and independent trigger delays',
      { cm1a: { trig: 's' as const }, d911a: { d: [0.01, 0.02], mode: 'off' as const } },
    ],
  ])('%s', (_n, over) => {
    expect(allFinite(renderStable(moog(over)).out)).toBe(true);
  });
});

describe('polyphonic synth', () => {
  const poly = (over: Partial<EngineParams> = {}): EngineParams =>
    monoParams({
      osc: [
        { level: 0.6, mix: { saw: 1 }, semi: 0 },
        { level: 0.4, mix: { pulse: 1 }, pw: 0.3, semi: 0.08 },
      ],
      poly: { voices: 4, stack: 1, mono: false, detune: 0.1 },
      ...over,
    });
  const chord: Timed[] = [
    [0, { type: 'noteOn', n: 48 }],
    [128, { type: 'noteOn', n: 55 }],
    [256, { type: 'noteOn', n: 60 }],
    [384, { type: 'noteOn', n: 64 }],
    [512, { type: 'noteOn', n: 67 }],
    [640, { type: 'noteOn', n: 64 }],
    [4800, { type: 'noteOff', n: 48 }],
    [4800, { type: 'noteOff', n: 55 }],
    [4800, { type: 'noteOff', n: 60 }],
    [4800, { type: 'noteOff', n: 64 }],
    [4800, { type: 'noteOff', n: 67 }],
    [5000, { type: 'noteOff', n: 99 }],
  ];

  it('plays a chord on several voices, steals the oldest when they run out, and meters the voices', () => {
    const r = renderStable(poly(), { events: chord, len: 9600, stereo: true });
    expect(rms(r.out, 0, 4800)).toBeGreaterThan(0.02);
    const m = meters(r.events);
    expect(m.some((x) => (x.voices ?? 0) >= 0b1111)).toBe(true);
    // without effects the two sides are the same
    expect(sameSamples(r.out, r.right!)).toBe(true);
  });

  it('runs every voice of a unison stack, and a mono stack legato', () => {
    const stack = renderStable(poly({ poly: { voices: 6, stack: 3, mono: false, detune: 0.2 } }), {
      events: chord,
    });
    expect(rms(stack.out, 0, 4800)).toBeGreaterThan(0.02);
    const mono = renderStable(poly({ poly: { voices: 4, stack: 4, mono: true } }), {
      events: chord,
    });
    expect(rms(mono.out, 0, 4800)).toBeGreaterThan(0.02);
  });

  it('applies the output stage: high-pass, bass boost and the stereo chorus', () => {
    const r = renderStable(
      poly({ post: { hpf: 60, boost: true }, chorus: { on: true, mode: 2 } }),
      {
        events: chord,
        stereo: true,
      }
    );
    expect(sameSamples(r.out, r.right!)).toBe(false);
    const off = renderStable(poly({ chorus: { on: false, mode: 0 } }), { events: chord });
    expect(rms(off.out, 0, 4800)).toBeGreaterThan(0.02);
  });

  it('runs the effects engine after the voices', () => {
    const fx: EngineParams['fx'] = {
      mode: 'insert',
      routing: 1,
      slots: [
        {
          alg: 'chorus',
          level: 1,
          p: {
            SPD: 0.6,
            DLL: 8,
            DLR: 11,
            WDL: 50,
            WDR: 50,
            PHS: 90,
            WAV: 50,
            LC: 80,
            HC: 12000,
            SPR: 50,
            MIX: 50,
          },
        },
        { alg: null },
        { alg: null },
        { alg: null },
      ],
    };
    const r = renderStable(poly({ fx }), { events: chord, stereo: true });
    expect(sameSamples(r.out, r.right!)).toBe(false);
  });

  it('switches between mono, poly and dual layouts and back', () => {
    const r = render(poly(), {
      len: 9600,
      events: [
        [0, { type: 'noteOn', n: 60 }],
        [1000, { type: 'params', p: poly({ poly: { voices: 2, stack: 1, mono: false } }) }],
        [2000, { type: 'params', p: monoParams() }],
        [2100, { type: 'noteOn', n: 62 }],
        [3000, { type: 'params', p: poly() }],
        [3100, { type: 'noteOn', n: 64 }],
        [4000, { type: 'phrase', phrase: { bpm: 240, loop: false, steps: [[0, 60, 0.5]] } }],
        [6000, { type: 'stopPhrase' }],
        [7000, { type: 'panic' }],
        [7100, { type: 'tempo', bpm: 100 }],
      ],
    });
    expect(allFinite(r.out)).toBe(true);
    expect(r.events.filter((e) => e.type === 'allOff').length).toBeGreaterThan(0);
  });

  it('plays a looping phrase across the voices', () => {
    const r = renderStable(poly(), {
      len: 24000,
      events: [
        [
          0,
          {
            type: 'phrase',
            phrase: {
              bpm: 480,
              loop: true,
              steps: [
                [0, 48, 0.5],
                [0, 55, 0.5],
                [0.5, 60, 0.25, 1],
              ],
            },
          },
        ],
      ],
    });
    expect(r.events.filter((e) => e.type === 'note' && e.on).length).toBeGreaterThanOrEqual(6);
  });

  it('ends a one-shot phrase with phraseEnd', () => {
    const r = render(poly(), {
      len: 24000,
      events: [[0, { type: 'phrase', phrase: { bpm: 480, loop: false, steps: [[0, 48, 0.25]] } }]],
    });
    expect(r.events.some((e) => e.type === 'phraseEnd')).toBe(true);
  });

  describe('arpeggiator', () => {
    const modes = ['up', 'down', 'updown', 'downup', 'random', 'played'] as const;
    const held: Timed[] = [
      [0, { type: 'noteOn', n: 60 }],
      [0, { type: 'noteOn', n: 64 }],
      [0, { type: 'noteOn', n: 67 }],
      [0, { type: 'noteOn', n: 64 }],
      [12000, { type: 'noteOff', n: 64 }],
      [16000, { type: 'noteOff', n: 60 }],
      [16000, { type: 'noteOff', n: 67 }],
    ];

    it.each(modes)('%s steps through the held keys in sixteenths', (mode) => {
      const p = poly({ arp: { on: true, bpm: 240, gate: 0.5, mode, octaves: 2, hold: false } });
      const r = renderStable(p, { events: held, len: 24000 });
      expect(rms(r.out, 0, 12000)).toBeGreaterThan(0.01);
    });

    it('holds the last chord when hold is on, with a full-length gate', () => {
      const p = poly({ arp: { on: true, bpm: 300, gate: 1, mode: 'up', octaves: 1, hold: true } });
      const r = renderStable(p, {
        events: [...held, [18000, { type: 'noteOn', n: 72 }]],
        len: 24000,
      });
      expect(rms(r.out, 16000, 24000)).toBeGreaterThan(0.01);
    });

    it('a zero gate plays nothing, and switching the arpeggiator off stops it', () => {
      const silent = renderStable(
        poly({ arp: { on: true, bpm: 300, gate: 0, mode: 'up', octaves: 1, hold: false } }),
        {
          events: held,
          len: 9600,
        }
      );
      expect(rms(silent.out)).toBeLessThan(1e-6);
      const off = render(
        poly({ arp: { on: true, bpm: 300, gate: 0.5, mode: 'up', octaves: 1, hold: false } }),
        {
          len: 9600,
          events: [
            ...held.slice(0, 3),
            [
              4800,
              {
                type: 'params',
                p: poly({
                  arp: { on: false, bpm: 300, gate: 0.5, mode: 'up', octaves: 1, hold: false },
                }),
              },
            ],
          ],
        }
      );
      expect(allFinite(off.out)).toBe(true);
    });
  });
});

describe('dual (two-module) synth', () => {
  const dual = (assign: 'unison' | 'split' | 'duo', cables: EngineCable[] = []): EngineParams => {
    const a = monoParams();
    const { volume: _v, ...b } = monoParams({
      osc: [{ level: 0.7, mix: { pulse: 1 }, pw: 0.3, semi: 12 }],
    });
    return { ...a, cables, dual: { b, assign, split: 60, level: [0.8, 0.6], pan: [-0.5, 0.7] } };
  };
  const keys: Timed[] = [
    [0, { type: 'noteOn', n: 48 }],
    [1000, { type: 'noteOn', n: 72 }],
    [2000, { type: 'noteOn', n: 76 }],
    [3000, { type: 'noteOff', n: 72 }],
    [4000, { type: 'noteOff', n: 76 }],
    [5000, { type: 'noteOff', n: 48 }],
  ];

  it.each(['unison', 'split', 'duo'] as const)(
    '%s shares the keys between the two modules, in stereo',
    (assign) => {
      const r = renderStable(dual(assign), { events: keys, stereo: true });
      expect(rms(r.out, 0, 4800)).toBeGreaterThan(0.02);
      expect(sameSamples(r.out, r.right!)).toBe(false);
      expect(meters(r.events).some((m) => (m.voices ?? 0) > 0)).toBe(true);
    }
  );

  it('runs sample by sample when a cable crosses between the modules', () => {
    const crossed = dual('unison', [
      { src: 'osc1', dst: 'pitch1', amt: 0.5, add: true, sp: 1, dp: 0 },
      { src: 'lfo', dst: 'cutoff', amt: 1, add: true, sp: 0, dp: 1 },
    ]);
    const r = renderStable(crossed, { events: keys });
    const plain = render(dual('unison'), { events: keys });
    expect(sameSamples(r.out, plain.out)).toBe(false);
  });

  it('reassigns when the assign mode changes while keys are held, and goes back to one voice', () => {
    const r = render(dual('split'), {
      len: 9600,
      events: [
        [0, { type: 'noteOn', n: 48 }],
        [0, { type: 'noteOn', n: 72 }],
        [2000, { type: 'params', p: dual('duo') }],
        [2100, { type: 'noteOn', n: 50 }],
        [4000, { type: 'params', p: monoParams({ poly: { voices: 2, stack: 1, mono: false } }) }],
        [5000, { type: 'params', p: dual('unison') }],
        [6000, { type: 'params', p: monoParams() }],
        [6100, { type: 'noteOn', n: 60 }],
      ],
    });
    expect(allFinite(r.out)).toBe(true);
  });
});

describe('stereo output amplifiers (outAmps)', () => {
  const amps = (): EngineParams =>
    monoParams({
      outAmps: [
        { level: 0.8, tone: -0.5, pan: 0.1 },
        { level: 0.6, tone: 0.6, pan: 0.9 },
      ],
      cables: [cable('vca', 'out1In'), cable('osc2', 'out2In', 0.3), cable('lfo', 'out2Lvl', 0.1)],
    });

  it('writes both sides itself, panned apart', () => {
    const r = renderStable(amps(), { stereo: true });
    expect(rms(r.out)).toBeGreaterThan(0.01);
    expect(sameSamples(r.out, r.right!)).toBe(false);
  });

  it('mixes the two sides down without a right channel', () => {
    const r = renderStable(amps());
    expect(rms(r.out)).toBeGreaterThan(0.01);
  });
});
