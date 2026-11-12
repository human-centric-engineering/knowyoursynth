/**
 * The minilogue xd's MULTI ENGINE in the sound engine: filtered noise (`mix.mnoise`) and the VPM oscillator
 * (`mix.vpm`).
 *
 * Each is heard through an open voice (one oscillator, the SVF wide open, the VCA held open), so what comes out is the
 * oscillator. The noise tests compare the power in bands, which a filter of the named kind moves; the VPM tests read
 * harmonics, which phase modulation adds as sidebands at the modulator's ratio. A shape the engine ignored would be
 * silent and fail them all.
 *
 * @see lib/app/synths/audio/dsp-core.ts
 */

import { describe, it, expect } from 'vitest';

import type {
  EngineRoute,
  MultiNoiseParams,
  OscParams,
  VpmParams,
} from '@/lib/app/synths/contract';
import { allFinite, monoParams, render, rms } from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
const LEN = 24000;
/** A3: 220 Hz, so the low harmonics are well inside the band. */
const NOTE = 57;
const F0 = 220;
/** The open voice's own floor with no oscillator sounding is about 3e-6 RMS: "silent" is well under a sounding one. */
const FLOOR = 1e-4;
/**
 * How far below the fundamental a harmonic must be to count as absent. The open voice itself adds a little (a bare
 * sine comes out with its third harmonic about 1/3000 of the fundamental's power), so absent is below 1/1000.
 */
const ABSENT = 1e-3;

/** One oscillator straight out: the SVF open and flat, the VCA open with no envelope; `routes` as given. */
function play(
  osc: OscParams,
  note = NOTE,
  routes: EngineRoute[] = [],
  seed?: number
): Float32Array {
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
    events: [[0, { type: 'noteOn', n: note, v: 0.9 }]],
    seed,
  }).out;
}

/** Power at `hz` over samples `from`..`to` of `b` (Goertzel, Hann-windowed so a near harmonic does not leak in). */
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

/** Mean power across `lo`..`hi` Hz in 10 Hz steps: a band's level, smoothed over the noise's ragged spectrum. */
function band(b: Float32Array, lo: number, hi: number): number {
  let s = 0,
    k = 0;
  for (let hz = lo; hz <= hi; hz += 10, k++) s += power(b, hz, 0, LEN);
  return s / k;
}

const maxDiff = (a: Float32Array, b: Float32Array): number => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

const noise = (q: MultiNoiseParams): OscParams => ({
  level: 0.4,
  mix: { mnoise: 1 },
  semi: 0,
  mnoise: q,
});

const vpm = (q: Partial<VpmParams> = {}): OscParams => ({
  level: 0.4,
  mix: { vpm: 1 },
  semi: 0,
  vpm: { ratio: 1, depth: 0, ...q },
});

/** The SHAPE that puts the High / Low cutoff at `hz` (10 Hz → 21 kHz, exponential). */
const cutShape = (hz: number): number => Math.log(hz / 10) / Math.log(2100);
/** The SHAPE that puts the Decim rate at `hz` (240 Hz → 48 kHz, exponential). */
const rateShape = (hz: number): number => Math.log(hz / 240) / Math.log(200);

describe('MULTI ENGINE noise (mix.mnoise)', () => {
  const lowBand = (b: Float32Array): number => band(b, 100, 300);
  const highBand = (b: Float32Array): number => band(b, 6000, 8000);

  it('Low passes the lows and cuts the highs above its cutoff', () => {
    const lp = play(noise({ type: 'lp', shape: cutShape(1000) }));
    expect(allFinite(lp)).toBe(true);
    expect(rms(lp)).toBeGreaterThan(0.01);
    expect(highBand(lp)).toBeLessThan(lowBand(lp) * 0.05);
  });

  it('High passes the highs and cuts the lows below its cutoff', () => {
    const hp = play(noise({ type: 'hp', shape: cutShape(1000) }));
    expect(rms(hp)).toBeGreaterThan(0.01);
    expect(lowBand(hp)).toBeLessThan(highBand(hp) * 0.1);
  });

  it('High and Low do not follow the key', () => {
    const lo = play(noise({ type: 'lp', shape: cutShape(1000) }), 45);
    const hi = play(noise({ type: 'lp', shape: cutShape(1000) }), 81);
    // the same seed and a cutoff that ignores the note: the same noise, sample for sample
    expect(maxDiff(lo, hi)).toBeLessThan(1e-6);
  });

  it('Peak centres its band on the oscillator’s pitch, so it plays in tune', () => {
    const a3 = play(noise({ type: 'peak', shape: 0 }));
    expect(rms(a3)).toBeGreaterThan(0.01);
    expect(band(a3, F0 - 20, F0 + 20)).toBeGreaterThan(band(a3, 900, 1100) * 20);
    const a4 = play(noise({ type: 'peak', shape: 0 }), NOTE + 12);
    expect(band(a4, 2 * F0 - 20, 2 * F0 + 20)).toBeGreaterThan(band(a4, F0 - 20, F0 + 20) * 5);
  });

  it('Peak widens its band as SHAPE rises', () => {
    const narrow = play(noise({ type: 'peak', shape: 0 }), NOTE + 12);
    const wide = play(noise({ type: 'peak', shape: 1 }), NOTE + 12);
    const off = (b: Float32Array): number => band(b, 900, 1000) / band(b, 420, 460);
    expect(off(wide)).toBeGreaterThan(off(narrow) * 4);
  });

  it('Peak’s SHAPE still widens the band on a low note, where the bandwidth is wider than the pitch', () => {
    // A1, 55 Hz: even SHAPE 0's 110 Hz band is twice the centre
    const narrow = play(noise({ type: 'peak', shape: 0 }), 33);
    const wide = play(noise({ type: 'peak', shape: 1 }), 33);
    const off = (b: Float32Array): number => band(b, 500, 600) / band(b, 40, 70);
    expect(off(wide)).toBeGreaterThan(off(narrow) * 4);
  });

  it('Decim holds the noise at its rate: a null in the spectrum at the rate, not halfway to it', () => {
    const d = play(noise({ type: 'decim', shape: rateShape(2000) }));
    expect(rms(d)).toBeGreaterThan(0.05);
    expect(band(d, 1960, 2040)).toBeLessThan(band(d, 960, 1040) * 0.1);
  });

  it('Decim’s rate follows the key by KEY TRACK, an octave per octave at 1', () => {
    const shape = rateShape(2000);
    // at C5 with full tracking the rate is 4 kHz: no null at 2 kHz any more, one at 4 kHz instead
    const up = play(noise({ type: 'decim', shape, keyTrack: 1 }), 72);
    expect(band(up, 1960, 2040)).toBeGreaterThan(band(up, 3960, 4040) * 10);
    // with no tracking C5 keeps the 2 kHz null
    const flat = play(noise({ type: 'decim', shape }), 72);
    expect(band(flat, 1960, 2040)).toBeLessThan(band(flat, 960, 1040) * 0.1);
  });

  it('SHAPE is moved by the oscillator’s pulse-width destination', () => {
    const viaCv = play(noise({ type: 'lp', shape: 0.2 }), NOTE, [
      { src: 'one', dst: 'pw1', amt: 0.4 },
    ]);
    expect(maxDiff(viaCv, play(noise({ type: 'lp', shape: 0.6 })))).toBeLessThan(1e-5);
  });

  it('KEY TRACK follows an off-keyboard oscillator’s fixed note, not the key played', () => {
    const fixed = (): OscParams => ({
      ...noise({ type: 'decim', shape: rateShape(2000), keyTrack: 1 }),
      kbd: false,
      fixedNote: 60,
    });
    expect(maxDiff(play(fixed(), 45), play(fixed(), 81))).toBeLessThan(1e-6);
  });

  it('is silent without its settings', () => {
    expect(rms(play({ level: 0.4, mix: { mnoise: 1 }, semi: 0 }))).toBeLessThan(FLOOR);
  });
});

describe('MULTI ENGINE VPM (mix.vpm)', () => {
  it('at MOD DEPTH 0 is the bare sine carrier', () => {
    const bare = play(vpm());
    expect(rms(bare)).toBeGreaterThan(0.1);
    expect(power(bare, F0 * 2)).toBeLessThan(power(bare, F0) * ABSENT);
    expect(power(bare, F0 * 3)).toBeLessThan(power(bare, F0) * ABSENT);
  });

  it('adds sidebands at the modulator’s ratio as MOD DEPTH rises', () => {
    const one = play(vpm({ depth: 0.3 }));
    expect(allFinite(one)).toBe(true);
    expect(power(one, F0 * 2)).toBeGreaterThan(power(one, F0) * 0.01);
    expect(power(one, F0 * 3)).toBeGreaterThan(power(one, F0) * 1e-3);
    // a 2:1 modulator puts its sidebands at the carrier ± 2 × F0: odd harmonics only
    const two = play(vpm({ depth: 0.3, ratio: 2 }));
    expect(power(two, F0 * 3)).toBeGreaterThan(power(two, F0) * 0.01);
    expect(power(two, F0 * 2)).toBeLessThan(power(two, F0 * 3) * ABSENT);
  });

  it('FEEDBACK changes the spectrum, and NOISE fills in between the harmonics', () => {
    const plain = play(vpm({ depth: 0.3 }));
    const fb = play(vpm({ depth: 0.3, fb: 1 }));
    expect(Math.abs(power(fb, F0 * 4) - power(plain, F0 * 4))).toBeGreaterThan(
      power(plain, F0 * 4) * 0.5
    );
    const air = play(vpm({ depth: 0.3, noise: 1 }));
    expect(band(air, 300, 360)).toBeGreaterThan(band(plain, 300, 360) * 10);
  });

  it('a saw or square carrier is that wave when unmodulated', () => {
    const saw = play(vpm({ carrier: 'saw' }));
    // a saw's second harmonic is half its fundamental (a quarter of the power); a square has none
    expect(power(saw, F0 * 2) / power(saw, F0)).toBeGreaterThan(0.2);
    const sqr = play(vpm({ carrier: 'sqr' }));
    expect(power(sqr, F0 * 3) / power(sqr, F0)).toBeGreaterThan(0.08);
    expect(power(sqr, F0 * 2)).toBeLessThan(power(sqr, F0) * ABSENT);
  });

  it('drive adds odd harmonics to the sine carrier', () => {
    const driven = play(vpm({ drive: 1 }));
    expect(power(driven, F0 * 3)).toBeGreaterThan(power(play(vpm()), F0 * 3) * 100);
  });

  it('the internal envelope moves the index over the note, and restarts with the next', () => {
    const q = { depth: 0, eg: { a: 0, d: 0.1, amt: 1 } };
    const b = play(vpm(q));
    // bright at the start, a bare sine once the 0.1 s fall has run out
    expect(power(b, F0 * 2, 0, 2400)).toBeGreaterThan(power(b, F0, 0, 2400) * 0.01);
    expect(power(b, F0 * 2)).toBeLessThan(power(b, F0) * ABSENT);
    const p = monoParams({
      osc: [vpm(q)],
      filter: { type: 'svf', mode: 'lp', cutoff: 20000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
      vca: { envSrc: 'none', bias: 1 },
    });
    const again = render(p, {
      sr: SR,
      len: LEN,
      events: [
        [0, { type: 'noteOn', n: NOTE, v: 0.9 }],
        [12000, { type: 'noteOff', n: NOTE }],
        [14976, { type: 'noteOn', n: NOTE, v: 0.9 }],
      ],
    }).out;
    expect(power(again, F0 * 2, 15000, 17400)).toBeGreaterThan(
      power(again, F0, 15000, 17400) * 0.01
    );
  });

  it('a negative SHAPE MOD INT takes the envelope away from MOD DEPTH', () => {
    // a slow 2 s fall, so over the first 25 ms the depth stays near 0.3 − 0.3: close to a bare sine
    const b = play(vpm({ depth: 0.3, eg: { a: 0, d: 2, amt: -0.3 } }));
    const plain = play(vpm({ depth: 0.3 }));
    expect(power(b, F0 * 2, 0, 1200)).toBeLessThan(power(plain, F0 * 2, 0, 1200) * 0.01);
    expect(power(b, F0 * 2, 0, 1200)).toBeLessThan(power(b, F0, 0, 1200) * ABSENT);
  });

  it('MOD DEPTH is moved by the pulse-width destination, and MOD KEY TRACK halves it an octave up', () => {
    const viaCv = play(vpm({ depth: 0.1 }), NOTE, [{ src: 'one', dst: 'pw1', amt: 0.2 }]);
    expect(maxDiff(viaCv, play(vpm({ depth: 0.3 })))).toBeLessThan(1e-5);
    expect(
      maxDiff(play(vpm({ depth: 0.4, keyTrack: 1 }), 72), play(vpm({ depth: 0.2 }), 72))
    ).toBeLessThan(1e-5);
  });

  it('starts the modulator in step with the carrier, so every voice gets the same harmonics', () => {
    // the carrier starts at a random phase; the seed changes it, and the harmonic balance must not move with it
    const h2 = (seed: number): number => {
      const b = play(vpm({ depth: 0.5 }), NOTE, [], seed);
      return power(b, F0 * 2) / power(b, F0);
    };
    expect(h2(1)).toBeCloseTo(h2(2), 6);
    expect(h2(1)).toBeCloseTo(h2(3), 6);
  });

  it('MOD KEY TRACK below C4 stops at the same ceiling as the depth', () => {
    expect(
      maxDiff(play(vpm({ depth: 1, keyTrack: 1 }), 36), play(vpm({ depth: 2 }), 36))
    ).toBeLessThan(1e-5);
  });

  it('is silent without its settings', () => {
    expect(rms(play({ level: 0.4, mix: { vpm: 1 }, semi: 0 }))).toBeLessThan(FLOOR);
  });
});
