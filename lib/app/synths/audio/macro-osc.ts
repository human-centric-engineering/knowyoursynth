// The macro oscillator (`mix.macro`, `OscParams.macro`, see contract.ts): six oscillator models, each played by three
// settings, WAVE, TIMBRE and SHAPE (0..1). They are the Arturia MicroFreak's models the rest of the engine has no
// shape for (its spec, `.context/app/synth-data/microfreak/`, parameter `osc.type`); the engine knows no MicroFreak
// names, and a definition picks the model and sets the three values.
//
// - `wavetable`: 16 tables of 32 single-cycle frames. WAVE picks the table, TIMBRE the position in it (crossfading
//   between neighbouring frames), SHAPE a chorus of two detuned copies.
// - `harmo`: 16 sine partials. WAVE crossfades between eight sets of partial levels, TIMBRE sculpts them from a sine
//   (only the fundamental) to the whole set, SHAPE the same chorus.
// - `pluck`: a Karplus-Strong string. Each note strikes it with a burst of noise; TIMBRE is how hard (louder and
//   brighter), WAVE bows it (noise fed in all the time), SHAPE is how long it rings.
// - `formant`: two formants, each a sine restarted on every cycle of the note and faded out over the cycle. TIMBRE
//   sets the first formant's frequency against the note, WAVE the second's against the first, SHAPE how fast they
//   fade (narrow to wide).
// - `speech`: a buzz through three formant filters at a vowel's formants. WAVE picks the voice (four sets of formants,
//   the last whispered), SHAPE the vowel (a e i o u), TIMBRE shifts every formant down or up an octave.
// - `modal`: eight resonating modes struck by each note. WAVE moves them from harmonic to bar-like inharmonic ratios,
//   TIMBRE brightens the strike and, past half way, adds a dust of random strikes, SHAPE is how long they ring.
//
// The MicroFreak manual says what each setting does in a line and gives no tables, curves or ranges, and its tables
// are not published, so everything here is reasoned rather than measured: the tables, the eight partial sets, the
// vowel formants (textbook averages: Peterson and Barney, 1952), the ranges and the mode ratios. `formant`, `speech` and
// `modal` follow the ideas of the Mutable Instruments Plaits models the MicroFreak uses (MIT licence), not their code.
//
// One instance per oscillator; `step()` makes no allocations. The wavetables (about 4 MB, built by FFT) are built once
// per audio thread, by the first `set()` that chooses `wavetable`: about 120 ms, measured on a laptop, so the first
// wavetable patch loaded can drop a block of audio as it loads, and nothing after it does. WAVE and its modulation
// never build anything while sound is being made.

import type { MacroOscParams } from '@/lib/app/synths/contract';

const TWO_PI = Math.PI * 2;

/** A sine table for the additive models, read with linear interpolation. */
const SIN_N = 4096;
const SIN = new Float32Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin((TWO_PI * i) / SIN_N);
/** sin(2π·p) for any p ≥ 0. */
function sinT(p: number): number {
  const x = (p - Math.floor(p)) * SIN_N;
  const i = x | 0;
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i);
}

// ─── wavetables ──────────────────────────────────────────────────────────────

/** Samples in a frame, frames in a table, tables. */
const WT_LEN = 256;
const WT_FRAMES = 32;
export const WT_TABLES = 16;
/** Harmonics below WT_LEN / 2; each mip level halves them (127, 64, 32 … 1), so a frame stays band-limited up the keyboard. */
const WT_HARM = WT_LEN / 2 - 1;
const WT_LEVELS = 8;
/** The cycle of a frame given in time is sampled this finely before its harmonics are taken. */
const WT_SRC = WT_LEN * 4;

/** A frame given by its harmonics: amplitude of harmonic `h` (1..WT_HARM) at position `x` (0..1). */
type Spectral = (h: number, x: number) => number;
/** A frame given by one cycle in time: the wave at phase `t` (0..1) at position `x`. */
type Temporal = (t: number, x: number) => number;
type TableDef = { s: Spectral } | { t: Temporal };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** A component at `f` cycles per sample: full level up to 0.35, fading to nothing at 0.45, so none cuts off on a sample. */
const nyq = (f: number): number => clamp01((0.45 - f) / 0.1);
/** A soft limit for the models that ring on (`pluck`, `modal`): near-linear when quiet, never reaching ±1. */
const soft = (y: number): number => y / Math.sqrt(1 + y * y);
/** Samples between coefficient updates of `harmo` and `modal` while their pitch or settings move. */
const COEF_EVERY = 16;
/** A fixed pseudo-random level per harmonic and seed, 0..1. */
const hash = (h: number, seed: number): number => {
  const v = Math.sin(h * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** The 16 tables, each sweeping one idea across its 32 frames (WAVE picks the table, TIMBRE the frame). */
const TABLES: TableDef[] = [
  // 0 saw → square: the even harmonics fade out
  { s: (h, x) => (h % 2 ? 1 : 1 - x) / h },
  // 1 pulse narrowing from square to a thin pulse
  { s: (h, x) => Math.sin(Math.PI * h * (0.5 - 0.47 * x)) / h },
  // 2 a single partial sweeping up from the fundamental to the 32nd harmonic
  { s: (h, x) => Math.exp(-(((h - 1 - 31 * x) / 1.2) ** 2)) },
  // 3 a hard-synced saw, the slave climbing from unison to eight times the master
  { t: (t, x) => 2 * ((t * (1 + 7 * x)) % 1) - 1 },
  // 4 a resonant peak sweeping up a saw, like a vowel opening
  { s: (h, x) => (1 / h) * (0.25 + 4 * Math.exp(-(((h - 2 - 22 * x) / 2.5) ** 2))) },
  // 5 organ drawbars, from flute (fundamental and octave) to full
  {
    s: (h, x) =>
      h === 1 ? 1 : h === 2 ? 0.7 : h === 3 || h === 4 ? x : h === 6 || h === 8 ? x * x * 0.7 : 0,
  },
  // 6 odd harmonics only, from a triangle to a square
  { s: (h, x) => (h % 2 ? (h % 4 === 3 ? -1 : 1) / h ** (2 - x) : 0) },
  // 7 a sine folded back harder and harder
  {
    t: (t, x) => {
      const v = Math.sin(TWO_PI * t) * (1 + 5 * x);
      return Math.abs(((((v + 1) % 4) + 4) % 4) - 2) - 1;
    },
  },
  // 8 two saws drifting apart in phase, from one saw to a saw an octave up
  { t: (t, x) => (2 * (t % 1) - 1 + 2 * ((t + 0.5 * x) % 1) - 1) / 2 },
  // 9 a saw through a comb whose notches move
  { s: (h, x) => Math.abs(Math.cos(Math.PI * h * (0.02 + 0.23 * x))) / h },
  // 10 the even harmonics rising against the odd ones
  { s: (h, x) => (h % 2 ? 1 - 0.6 * x : 0.15 + 0.85 * x) / h },
  // 11 a crossfade between two fixed sets of random partial levels
  { s: (h, x) => ((1 - x) * hash(h, 1) + x * hash(h, 2)) / Math.sqrt(h) },
  // 12 a sine stepped down from 32 levels to 2
  {
    t: (t, x) => {
      const n = Math.round(32 * Math.pow(1 / 16, x));
      return Math.round(Math.sin(TWO_PI * t) * n) / n;
    },
  },
  // 13 phase-distortion resonance: a sine at a rising multiple, faded out over each cycle
  { t: (t, x) => (1 - t) * Math.sin(TWO_PI * t * (1 + 15 * x)) },
  // 14 frequency modulation of a sine by itself, the index rising to 6
  { t: (t, x) => Math.sin(TWO_PI * t + 6 * x * Math.sin(TWO_PI * t)) },
  // 15 the octaves only (1, 2, 4, 8 …) building up from a sine
  { s: (h, x) => ((h & (h - 1)) === 0 ? Math.pow(0.5 + 0.45 * x, Math.log2(h)) : 0) },
];

/**
 * An in-place complex FFT of length `n` (a power of two): `sign` −1 forward, +1 inverse (unscaled). Used only to build
 * the wavetables, so it is written for clarity over speed.
 */
function fft(re: Float64Array, im: Float64Array, n: number, sign: number): void {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * TWO_PI) / len;
    const wr = Math.cos(ang),
      wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k,
          b = a + (len >> 1);
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Built tables: per table, WT_LEVELS × WT_FRAMES frames of WT_LEN + 1 samples (the last repeats the first). */
const built: Float32Array[] = [];

/**
 * One table built: each frame's harmonics (given, or by an FFT of its cycle), then each mip level by an inverse FFT
 * of the harmonics it keeps, every level of a frame at the gain that puts its full-band level at a peak of 1.
 */
function buildTable(ti: number): Float32Array {
  const def = TABLES[ti];
  const stride = WT_LEN + 1;
  const out = new Float32Array(WT_LEVELS * WT_FRAMES * stride);
  // each harmonic as cos and sin parts: the frame is Σ A·cos(2πht) + B·sin(2πht)
  const A = new Float64Array(WT_HARM + 1);
  const B = new Float64Array(WT_HARM + 1);
  const sre = new Float64Array(WT_SRC),
    sim = new Float64Array(WT_SRC);
  const re = new Float64Array(WT_LEN),
    im = new Float64Array(WT_LEN);
  for (let f = 0; f < WT_FRAMES; f++) {
    const x = f / (WT_FRAMES - 1);
    if ('s' in def) {
      for (let h = 1; h <= WT_HARM; h++) {
        A[h] = 0;
        B[h] = def.s(h, x);
      }
    } else {
      for (let i = 0; i < WT_SRC; i++) {
        sre[i] = def.t(i / WT_SRC, x);
        sim[i] = 0;
      }
      fft(sre, sim, WT_SRC, -1);
      for (let h = 1; h <= WT_HARM; h++) {
        A[h] = (2 * sre[h]) / WT_SRC;
        B[h] = (-2 * sim[h]) / WT_SRC;
      }
    }
    let gain = 0;
    for (let l = 0; l < WT_LEVELS; l++) {
      const hMax = l === 0 ? WT_HARM : WT_LEN >> (l + 1);
      re.fill(0);
      im.fill(0);
      for (let h = 1; h <= hMax; h++) {
        re[h] = A[h] / 2;
        im[h] = -B[h] / 2;
        re[WT_LEN - h] = A[h] / 2;
        im[WT_LEN - h] = B[h] / 2;
      }
      fft(re, im, WT_LEN, 1);
      if (l === 0) {
        let pk = 0;
        for (let i = 0; i < WT_LEN; i++) pk = Math.max(pk, Math.abs(re[i]));
        gain = pk > 1e-9 ? 1 / pk : 0;
      }
      const o = (l * WT_FRAMES + f) * stride;
      for (let i = 0; i < WT_LEN; i++) out[o + i] = re[i] * gain;
      out[o + WT_LEN] = out[o];
    }
  }
  return out;
}

/**
 * Builds every table, once per audio thread. A definition's `set()` calls it the first time a `wavetable` model is
 * chosen, outside the render loop, so WAVE and its modulation never build a table while sound is being made.
 */
export function buildWavetables(): void {
  for (let i = built.length; i < WT_TABLES; i++) built.push(buildTable(i));
}

/**
 * The mip position for a phase increment, 0..WT_LEVELS − 1, read between its two neighbouring levels. Level `l` keeps
 * WT_LEN / 2^(l+1) harmonics, so at `inc` it is free of aliasing while log2(WT_LEN·inc) ≤ l. The position is one level
 * above that, so both levels read are always under Nyquist, and the crossfade between them changes brightness
 * smoothly up a glide; the lowest notes read level 0 alone.
 */
function mipPos(inc: number): number {
  const lv = Math.log2(Math.max(1e-9, WT_LEN * inc)) + 1;
  return lv < 0 ? 0 : lv > WT_LEVELS - 1 ? WT_LEVELS - 1 : lv;
}

/** One sample of table `t` at level `l`, frame position `fpos` (0..WT_FRAMES − 1) and phase `ph` (0..1). */
function readLevel(t: Float32Array, l: number, fpos: number, ph: number): number {
  const stride = WT_LEN + 1;
  const f0 = fpos | 0;
  const f1 = f0 < WT_FRAMES - 1 ? f0 + 1 : f0;
  const ff = fpos - f0;
  const x = (ph - Math.floor(ph)) * WT_LEN;
  const i = x | 0;
  const fr = x - i;
  const o0 = (l * WT_FRAMES + f0) * stride + i;
  const o1 = (l * WT_FRAMES + f1) * stride + i;
  const s0 = t[o0] + (t[o0 + 1] - t[o0]) * fr;
  const s1 = t[o1] + (t[o1 + 1] - t[o1]) * fr;
  return s0 + (s1 - s0) * ff;
}

/** One sample of table `t` at mip position `mp` (see `mipPos`), crossfading the level below it into the one above. */
function readTable(t: Float32Array, mp: number, fpos: number, ph: number): number {
  const l0 = Math.floor(mp);
  const fr = mp - l0;
  const a = readLevel(t, l0, fpos, ph);
  if (fr === 0 || l0 >= WT_LEVELS - 1) return a;
  return a + (readLevel(t, l0 + 1, fpos, ph) - a) * fr;
}

// ─── harmo ───────────────────────────────────────────────────────────────────

const H_PARTIALS = 16;
/** Eight sets of partial levels; WAVE crossfades through them in order. */
const H_SETS: number[][] = [
  // every harmonic at 1/n (saw-like)
  Array.from({ length: H_PARTIALS }, (_, i) => 1 / (i + 1)),
  // odd harmonics at 1/n (square-like)
  Array.from({ length: H_PARTIALS }, (_, i) => (i % 2 ? 0 : 1 / (i + 1))),
  // odd harmonics at 1/n² (triangle-like)
  Array.from({ length: H_PARTIALS }, (_, i) => (i % 2 ? 0 : 1 / (i + 1) ** 2)),
  // drawbar organ: 1, 2, 3, 4, 6, 8, 10, 12, 16
  Array.from({ length: H_PARTIALS }, (_, i) =>
    [1, 2, 3, 4, 6, 8, 10, 12, 16].includes(i + 1) ? 0.6 : 0
  ),
  // even harmonics leading
  Array.from({ length: H_PARTIALS }, (_, i) =>
    i === 0 ? 0.6 : i % 2 ? 1 / Math.sqrt(i + 1) : 0.1
  ),
  // octaves only
  Array.from({ length: H_PARTIALS }, (_, i) => ([1, 2, 4, 8, 16].includes(i + 1) ? 0.8 : 0)),
  // a hollow cluster around the fifth to seventh harmonics
  Array.from({ length: H_PARTIALS }, (_, i) => (i === 0 ? 0.7 : i >= 4 && i <= 6 ? 0.6 : 0)),
  // every harmonic at an equal level (buzz)
  Array.from({ length: H_PARTIALS }, () => 0.3),
];

// ─── speech ──────────────────────────────────────────────────────────────────

/** Formants F1–F3 in Hz for a e i o u, per voice: man, woman, child (Peterson and Barney's averages), and a whisper. */
const VOWELS: number[][][] = [
  [
    [730, 1090, 2440],
    [530, 1840, 2480],
    [270, 2290, 3010],
    [570, 840, 2410],
    [300, 870, 2240],
  ],
  [
    [850, 1220, 2810],
    [610, 2330, 2990],
    [310, 2790, 3310],
    [590, 920, 2710],
    [370, 950, 2670],
  ],
  [
    [1030, 1370, 3170],
    [690, 2610, 3570],
    [370, 3200, 3730],
    [680, 1060, 3180],
    [430, 1170, 3260],
  ],
  [
    [800, 1200, 2600],
    [560, 2000, 2700],
    [300, 2500, 3200],
    [580, 900, 2600],
    [330, 900, 2400],
  ],
];
const F_GAIN = [1, 0.6, 0.35];
const F_BW = [90, 110, 150];
/** Samples between the formant filters' coefficient updates; each moves to the next update in steps meanwhile. */
const SV_EVERY = 16;

// ─── modal ───────────────────────────────────────────────────────────────────

/** `pluck`'s output level: the hardest strike, bowed, at its longest ring, peaks under 1. */
const KS_OUT = 0.6;

const MODES = 8;
/** The dust's strikes per second at TIMBRE 1. */
const DUST_RATE = 400;

// ─── the oscillator ──────────────────────────────────────────────────────────

export interface MacroOsc {
  /**
   * The model and settings; a change of model clears what was ringing. The first `wavetable` builds the tables and
   * the first `pluck` makes its delay line, here rather than in `step()`.
   */
  set(q: MacroOscParams): void;
  /** Clears what was ringing: the voice calls it when the oscillator's `mix.macro` goes to 0, so it starts from rest when it comes back. */
  reset(): void;
  /**
   * One sample. `inc` and `phase` are the oscillator's own (cycles per sample, 0..1), so its tuning, sync and pitch
   * modulation carry over; `w`, `t` and `s` are WAVE, TIMBRE and SHAPE with their modulation, clamped here; `hit` is a
   * note starting on this sample.
   */
  step(inc: number, phase: number, w: number, t: number, s: number, hit: boolean): number;
}

export function createMacroOsc(sr: number): MacroOsc {
  let model: MacroOscParams['model'] = 'wavetable';
  // the chorus copies' phases
  let chA = 0.31,
    chB = 0.67;
  // pluck: the string's delay line and where it is written; excitation samples left and the strike's filter
  const KS_N = 1 << 13;
  let ks: Float32Array | null = null;
  let ksW = 0,
    ksLeft = 0,
    ksPrev = 0,
    ksExcLp = 0,
    ksBowLp = 0;
  // formant: each formant's phase
  let fp1 = 0,
    fp2 = 0;
  // speech: three state-variable filters, their coefficients (updated every few samples) and the whisper's noise
  const svIc1 = new Float64Array(3),
    svIc2 = new Float64Array(3),
    svA1 = new Float64Array(3),
    svA2 = new Float64Array(3),
    svA3 = new Float64Array(3),
    svK = new Float64Array(3),
    // the targets the coefficients move to, a step at a time, over each update's 16 samples
    svT = new Float64Array(12),
    svD = new Float64Array(12);
  let svCount = 0,
    svFirst = true;
  const svCur = [svK, svA1, svA2, svA3];
  // modal: each mode's two past outputs and coefficients, the strike's filter and the inc they were worked out for
  const mY1 = new Float64Array(MODES),
    mY2 = new Float64Array(MODES),
    mC = new Float64Array(MODES),
    mR2 = new Float64Array(MODES),
    mG = new Float64Array(MODES);
  let mInc = -1,
    mW = -1,
    mS = -1,
    mT = -1,
    mT60 = 1,
    mWait = 0,
    mExcLp = 0;

  function clear() {
    ksLeft = 0;
    ksPrev = ksExcLp = ksBowLp = 0;
    if (ks) ks.fill(0);
    svIc1.fill(0);
    svIc2.fill(0);
    svCount = 0;
    svFirst = true;
    mY1.fill(0);
    mY2.fill(0);
    mInc = -1;
    mExcLp = 0;
  }

  /** The chorus for `wavetable` and `harmo`: two copies about ±0.6 % (10 cents) out, mixed in by SHAPE. */
  const CH_DET = 0.006;

  /**
   * The chorus copies are added at SHAPE and the sum divided by 1 + 2·SHAPE, so all three in step still peak at 1.
   *
   * WAVE picks a table: each of the 16 holds the middle of its sixteenth of the knob, and the middle fifth of the way
   * from one table's centre to the next is a crossfade between them, so sweeping WAVE never jumps between waveforms.
   */
  function wtAt(ta: Float32Array, tb: Float32Array, x: number, mp: number, fpos: number, ph: number) {
    const a = readTable(ta, mp, fpos, ph);
    return x > 0 ? a + (readTable(tb, mp, fpos, ph) - a) * x : a;
  }
  function wavetable(inc: number, phase: number, w: number, t: number, s: number): number {
    if (built.length < WT_TABLES) buildWavetables();
    let tp = w * WT_TABLES - 0.5;
    tp = tp < 0 ? 0 : tp > WT_TABLES - 1 ? WT_TABLES - 1 : tp;
    const ti = Math.min(WT_TABLES - 2, Math.floor(tp));
    const x = clamp01((tp - ti - 0.4) / 0.2);
    const ta = built[ti],
      tb = built[ti + 1];
    const fpos = t * (WT_FRAMES - 1);
    const mp = mipPos(inc * (1 + CH_DET));
    let y = wtAt(ta, tb, x, mp, fpos, phase);
    if (s > 0) {
      chA += inc * (1 + CH_DET);
      chB += inc * (1 - CH_DET);
      chA -= Math.floor(chA);
      chB -= Math.floor(chB);
      y = (y + s * (wtAt(ta, tb, x, mp, fpos, chA) + wtAt(ta, tb, x, mp, fpos, chB))) / (1 + 2 * s);
    }
    return y;
  }

  /** The partials' levels for WAVE and TIMBRE, filled into `hl` (no allocation: a fixed scratch array). */
  const hl = new Float64Array(H_PARTIALS);
  let hW = -1,
    hT = -1,
    hInc = -1,
    hGain = 0,
    hWait = 0;
  function harmoLevels(w: number, t: number, inc: number): number {
    if (w === hW && t === hT && inc === hInc) return hGain;
    // moving, the levels are worked out again only every COEF_EVERY samples
    if (hWait-- > 0 && hW >= 0) return hGain;
    hWait = COEF_EVERY - 1;
    hW = w;
    hT = t;
    hInc = inc;
    const pos = w * (H_SETS.length - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(H_SETS.length - 1, i0 + 1);
    const fr = pos - i0;
    const a = H_SETS[i0],
      b = H_SETS[i1];
    // TIMBRE: at 0 only the fundamental; rising, the upper partials come in, each by its own share
    const tilt = (1 - t) * 6;
    let sum = 0;
    for (let k = 0; k < H_PARTIALS; k++) {
      // a partial fades out as it nears Nyquist
      const nf = nyq((k + 1) * inc);
      if (!nf) {
        hl[k] = 0;
        continue;
      }
      let v = (a[k] + (b[k] - a[k]) * fr) * nf;
      if (k > 0) v *= Math.pow(k + 1, -tilt);
      else if (v < 0.25) v = 0.25;
      hl[k] = v;
      sum += Math.abs(v);
    }
    // the partials can all peak together, so their summed level is held to 1
    hGain = sum > 0 ? 1 / Math.max(1, sum) : 0;
    return hGain;
  }
  function harmoAt(ph: number, g: number): number {
    let y = 0;
    for (let k = 0; k < H_PARTIALS; k++) if (hl[k]) y += hl[k] * sinT(ph * (k + 1));
    return y * g;
  }
  function harmo(inc: number, phase: number, w: number, t: number, s: number): number {
    const g = harmoLevels(w, t, inc);
    let y = harmoAt(phase, g);
    if (s > 0) {
      chA += inc * (1 + CH_DET);
      chB += inc * (1 - CH_DET);
      chA -= Math.floor(chA);
      chB -= Math.floor(chB);
      y = (y + s * (harmoAt(chA, g) + harmoAt(chB, g))) / (1 + 2 * s);
    }
    return y;
  }

  function pluck(inc: number, w: number, t: number, s: number, hit: boolean): number {
      const buf = ks!;
    // the period in samples, held to the line's length (about 6 Hz at 48 kHz)
    let per = inc > 0 ? 1 / inc : KS_N - 2;
    if (per > KS_N - 2) per = KS_N - 2;
    if (per < 2) per = 2;
    if (hit) ksLeft = Math.ceil(per);
    // the strike: a burst of noise one period long, louder and brighter with TIMBRE
    let x = 0;
    if (ksLeft > 0) {
      ksLeft--;
      const n = Math.random() * 2 - 1;
      const c = 0.08 + 0.9 * t;
      ksExcLp += (n - ksExcLp) * c;
      x += ksExcLp * (0.35 + 0.65 * t);
    }
    // WAVE bows it: dark noise fed in all the time
    if (w > 0) {
      const n = Math.random() * 2 - 1;
      ksBowLp += (n - ksBowLp) * 0.05;
      x += ksBowLp * w * 0.6;
    }
    // the loop filter: the delayed sample averaged with the one before it, weighted `b` (0.5 is the classic string's
    // average; less is brighter, so a string that rings longer also stays brighter). It delays by `b` samples, so the
    // line is read that much less than a period back, linearly interpolated.
    const b = 0.5 - 0.3 * s;
    let rp = ksW - (per - b);
    while (rp < 0) rp += KS_N;
    const i = rp | 0;
    const fr = rp - i;
    const d0 = buf[i & (KS_N - 1)],
      d1 = buf[(i + 1) & (KS_N - 1)];
    const d = d0 + (d1 - d0) * fr;
    // SHAPE: the time to fall 60 dB, 0.05 s to 12 s, as a gain per trip round the loop
    const t60 = 0.05 * Math.pow(240, s);
    const g = Math.pow(10, (-3 * per) / (sr * t60));
    const lp = d * (1 - b) + ksPrev * b;
    ksPrev = d;
    const y = lp * g + x;
    buf[ksW] = y > 1.5 ? 1.5 : y < -1.5 ? -1.5 : y;
    ksW = (ksW + 1) & (KS_N - 1);
    // the strike and the string it starts can peak together, so the string comes out at a level that keeps it under 1
    // repeated strikes and the bow pile up in a string still ringing, so it ends in a soft limit
    return soft(y * KS_OUT);
  }

  function formant(
    inc: number,
    phase: number,
    w: number,
    t: number,
    s: number,
    wrapped: boolean
  ): number {
    // TIMBRE: the first formant from the note itself up six octaves; WAVE: the second 0.5 to 4 times the first
    // each formant is held at 0.3 of the sample rate rather than let go silent above it on high notes
    const cap = inc > 0 ? 0.3 / inc : 64;
    const r1 = Math.min(Math.pow(2, 6 * t), cap);
    const r2 = Math.min(r1 * (0.5 + 3.5 * w), cap);
    if (wrapped) {
      fp1 = phase * r1;
      fp2 = phase * r2;
    } else {
      fp1 += inc * r1;
      fp2 += inc * r2;
    }
    // each formant fades out as it nears Nyquist
    const a1 = nyq(inc * r1);
    const a2 = 0.6 * nyq(inc * r2);
    // SHAPE: the fade over each cycle, from steep (wide formants) to a slow one (narrow)
    const pw = 8 - 7.5 * s;
    const win = Math.pow(1 - phase, pw);
    // the two can peak together, so their sum is held to 1
    return (win * (a1 * sinT(fp1) + a2 * sinT(fp2)) * 0.9) / Math.max(1, a1 + a2);
  }

  function speech(inc: number, phase: number, w: number, t: number, s: number): number {
    if (svCount <= 0) {
      svCount = SV_EVERY;
      // WAVE: the voice, crossfaded; SHAPE: the vowel, crossfaded; TIMBRE: an octave down to an octave up
      const vp = w * (VOWELS.length - 1);
      const v0 = Math.floor(vp),
        v1 = Math.min(VOWELS.length - 1, v0 + 1),
        vf = vp - v0;
      const op = s * 4;
      const o0 = Math.floor(op),
        o1 = Math.min(4, o0 + 1),
        of = op - o0;
      const shift = Math.pow(2, 2 * t - 1);
      for (let f = 0; f < 3; f++) {
        const at = (vi: number) => VOWELS[vi][o0][f] + (VOWELS[vi][o1][f] - VOWELS[vi][o0][f]) * of;
        let hz = (at(v0) + (at(v1) - at(v0)) * vf) * shift;
        if (hz > sr * 0.45) hz = sr * 0.45;
        const g = Math.tan((Math.PI * hz) / sr);
        const k = Math.min(2, (F_BW[f] * shift) / hz);
        const a1 = 1 / (1 + g * (g + k));
        svT[f] = k;
        svT[3 + f] = a1;
        svT[6 + f] = g * a1;
        svT[9 + f] = g * g * a1;
      }
      const cur = svCur;
      for (let j = 0; j < 12; j++) {
        const c = cur[(j / 3) | 0];
        if (svFirst) c[j % 3] = svT[j];
        svD[j] = (svT[j] - c[j % 3]) / SV_EVERY;
      }
      svFirst = false;
    }
    svCount--;
    for (let f = 0; f < 3; f++) {
      svK[f] += svD[f];
      svA1[f] += svD[3 + f];
      svA2[f] += svD[6 + f];
      svA3[f] += svD[9 + f];
    }
    // the source: a buzz (a falling ramp, band-limited by a one-sample blep at its reset) and, for the whisper, noise
    let src = 1 - 2 * phase;
    if (phase < inc) {
      const x = phase / inc;
      src += x + x - x * x - 1;
    } else if (phase > 1 - inc) {
      const x = (phase - 1) / inc;
      src += x * x + x + x + 1;
    }
    const whisper = clamp01((w - 2 / 3) * 3);
    src = src * (1 - whisper) + (Math.random() * 2 - 1) * whisper * 1.5;
    let y = 0;
    for (let f = 0; f < 3; f++) {
      const v3 = src - svIc2[f];
      const v1 = svA1[f] * svIc1[f] + svA2[f] * v3;
      const v2 = svIc2[f] + svA2[f] * svIc1[f] + svA3[f] * v3;
      svIc1[f] = 2 * v1 - svIc1[f];
      svIc2[f] = 2 * v2 - svIc2[f];
      // the band, at unity peak gain
      y += v1 * svK[f] * F_GAIN[f];
    }
    return y * 1.2;
  }

  function modal(inc: number, w: number, t: number, s: number, hit: boolean): number {
    // the modes' coefficients, worked out again when the pitch or a setting moves
    const moved = Math.abs(inc - mInc) > inc * 1e-4 || w !== mW || s !== mS || t !== mT;
    // moving, the modes are worked out again only every COEF_EVERY samples (a fresh start always works them out)
    if (moved && (mInc < 0 || mWait-- <= 0)) {
      mWait = COEF_EVERY - 1;
      mInc = inc;
      mW = w;
      mS = s;
      mT = t;
      // SHAPE: the fundamental's time to fall 60 dB, 0.05 s to 10 s; the upper modes fall faster
      const t60 = 0.05 * Math.pow(200, s);
      mT60 = t60;
      // TIMBRE lifts the upper modes; the levels are shared out so their sum, all ringing in step, is 0.9
      let norm = 0;
      for (let k = 0; k < MODES; k++) norm += Math.pow(k + 1, -1.2 + 1.1 * t);
      for (let k = 0; k < MODES; k++) {
        const n = k + 1;
        // WAVE: harmonic at 0 (n), bending to a free bar's ratios at 1 (about n^1.6)
        const ratio = Math.pow(n, 1 + 0.6 * w);
        const f = inc * ratio;
        const nf = nyq(f);
        if (!nf) {
          // a mode over Nyquist is silent, and starts from rest if it comes back down
          mG[k] = mC[k] = mR2[k] = mY1[k] = mY2[k] = 0;
          continue;
        }
        const r = Math.exp(-6.9078 / (sr * (t60 / (1 + 0.6 * k))));
        const wk = TWO_PI * f;
        mC[k] = 2 * r * Math.cos(wk);
        mR2[k] = r * r;
        // input scaled by sin(ω) so each mode's ring starts at its level
        mG[k] = (Math.sin(wk) * Math.pow(n, -1.2 + 1.1 * t) * 0.9 * nf) / norm;
      }
    }
    // the strike: an impulse through a filter that opens with TIMBRE; past half way, random dust strikes as well
    // The dust's strikes pile up in modes that ring long, as a random walk does, so each is scaled down by the square
    // root of how many land within a ring time; it then rings at about the level of one note's strike.
    let imp = hit ? 1 : 0;
    if (t > 0.5) {
      const rate = (t - 0.5) * 2 * DUST_RATE;
      if (Math.random() < rate / sr)
        imp += ((Math.random() * 2 - 1) * 0.6) / Math.sqrt(1 + (rate * mT60) / 6.9);
    }
    mExcLp += (imp - mExcLp) * (0.05 + 0.9 * t);
    // the filter keeps the strike's area, not its height: a dark strike rings the low modes as loud as a bright one
    const mExc = mExcLp;
    let y = 0;
    for (let k = 0; k < MODES; k++) {
      if (!mG[k]) continue;
      const v = mC[k] * mY1[k] - mR2[k] * mY2[k] + mG[k] * mExc;
      mY2[k] = mY1[k];
      mY1[k] = v;
      y += v;
    }
    // notes struck into modes still ringing add up, so it ends in a soft limit
    return soft(y);
  }

  let lastPhase = 0;
  return {
    set(q) {
      if (q.model !== model) clear();
      model = q.model;
      if (model === 'wavetable') buildWavetables();
      if (model === 'pluck' && !ks) ks = new Float32Array(KS_N);
    },
    reset: clear,
    step(inc, phase, w, t, s, hit) {
      w = clamp01(w);
      t = clamp01(t);
      s = clamp01(s);
      const wrapped = phase < lastPhase;
      lastPhase = phase;
      switch (model) {
        case 'wavetable':
          return wavetable(inc, phase, w, t, s);
        case 'harmo':
          return harmo(inc, phase, w, t, s);
        case 'pluck':
          return pluck(inc, w, t, s, hit);
        case 'formant':
          return formant(inc, phase, w, t, s, wrapped);
        case 'speech':
          return speech(inc, phase, w, t, s);
        case 'modal':
          return modal(inc, w, t, s, hit);
      }
      return 0;
    },
  };
}
