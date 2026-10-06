// Sound-map probe: renders a short test gesture through the real voice and measures how far a changed panel
// setting moves the result. No imports except the DSP, so it bundles stand-alone for a Worker (see worker-entry)
// and also runs on the main thread when the host blocks Workers.
//
// Transliterated from the prototype's `prototype/src/audio/probe.js` (D3): same names, order and arithmetic.
import type { EngineParams } from '@/lib/app/synths/contract';
import { createSynth } from '@/lib/app/synths/audio/dsp-core';

/** One question for `measure`: see {@link createProbe}. */
export interface ProbeJob {
  key: string;
  nudges?: EngineParams[];
  far?: EngineParams[];
  base?: EngineParams;
  baseKey?: string;
}

/** The answer: `d` the largest audible change of a nudge, `far` that of the first audible far move, `live` anything changed. */
export interface ProbeResult {
  key: string;
  d?: number;
  far?: number;
  live: boolean;
}

/** A message from the page to the probe Worker (`probe-worker-entry.ts`). */
export type ProbeWorkerRequest =
  | { type: 'start'; run: number; baseline: EngineParams; notes: number[] }
  | { type: 'job'; run: number; job: ProbeJob };

/** The probe Worker's answers. */
export type ProbeWorkerReply =
  { type: 'ready'; run: number } | { type: 'result'; run: number; result: ProbeResult };

/** A probe session for one panel state. */
export interface Probe {
  /** Loudness of the baseline gesture. */
  rms: number;
  measure: (job: ProbeJob) => ProbeResult;
}

export const PROBE_SR = 24000;
/** Where the bundled probe Worker is served from (built by `scripts/build-audio-workers.ts`). */
export const PROBE_WORKER_URL = '/worklets/kys-probe.js';
const N = 2048; // analysis frame
const HOP = 512;
const FLOOR = 1e-7; // energy floor per band: differences below about −70 dB do not count

// The voice uses Math.random for oscillator start phase, noise and filter dither. A fixed seed per render makes two
// renders of the same settings identical sample for sample, so "this control changes nothing" is an exact test.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Play the gesture: a note, a second note played legato over it (so glide, retrigger and two-note keyboard modes
 * show up), then let go and listen to the release.
 */
export function renderGesture(p: EngineParams, notes: number[], short = false): Float32Array {
  // `short` is the same gesture in about half the time, for questions that only need a yes or no.
  const k = short ? 0.53 : 1;
  const seconds = 0.84 * k;
  const real = Math.random;
  Math.random = seeded(20240919);
  try {
    const len = Math.round(seconds * PROBE_SR);
    // A synth with an effects engine is stereo, and some of its controls (pan, width, ping-pong) change only the
    // difference between the sides. Its gesture is the left channel followed by the right, so those count too.
    // A two-module synth (`dual`) is stereo too: each module has its own pan, and so is one with a stereo chorus.
    const stereo = !!(p.fx || p.dual || p.chorus || p.outAmps);
    const buf = new Float32Array(stereo ? len * 2 : len);
    const syn = createSynth(PROBE_SR, () => {});
    syn.handle({ type: 'params', p });
    const at = (s: number): number => Math.round((s * PROBE_SR) / 128) * 128;
    const events: [number, 'noteOn' | 'noteOff', number][] = [
      [0, 'noteOn', notes[0]],
      [at(0.27 * k), 'noteOn', notes[1]],
      [at(0.33 * k), 'noteOff', notes[0]],
      [at(0.57 * k), 'noteOff', notes[1]],
    ];
    let e = 0;
    for (let o = 0; o < len; o += 128) {
      while (e < events.length && events[e][0] <= o) {
        syn.handle({ type: events[e][1], n: events[e][2], v: 0.85 });
        e++;
      }
      const n = Math.min(128, len - o);
      syn.process(
        buf.subarray(o, o + n),
        n,
        stereo ? buf.subarray(len + o, len + o + n) : undefined
      );
    }
    return buf;
  } finally {
    Math.random = real;
  }
}

/**
 * One held note, nothing else — for drawing what a patch looks like rather than measuring how different two
 * patches are. A third of the gesture's length and so about a third of its cost, which is what lets the predicted
 * scope keep up with a knob being dragged. Seeded the same way, so the same panel always gives the same samples.
 */
export function renderNote(p: EngineParams, note: number, seconds: number): Float32Array {
  const real = Math.random;
  Math.random = seeded(20240919);
  try {
    const len = Math.round(seconds * PROBE_SR);
    const buf = new Float32Array(len);
    const syn = createSynth(PROBE_SR, () => {});
    syn.handle({ type: 'params', p });
    syn.handle({ type: 'noteOn', n: note, v: 0.85 });
    for (let o = 0; o < len; o += 128)
      syn.process(buf.subarray(o, o + Math.min(128, len - o)), Math.min(128, len - o));
    return buf;
  } finally {
    Math.random = real;
  }
}

// ── features: log energy in third-of-an-octave bands, frame by frame ──
const hann = new Float32Array(N);
for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
const bandOfBin = new Int16Array(N / 2);
let NB = 0;
{
  const hz = PROBE_SR / N;
  let edge = 45;
  let b = 0;
  for (let i = 1; i < N / 2; i++) {
    while (i * hz > edge) {
      edge *= Math.pow(2, 1 / 3);
      b++;
    }
    bandOfBin[i] = b;
  }
  NB = b + 1;
}
const re = new Float32Array(N);
const im = new Float32Array(N);
const rev = new Uint16Array(N);
for (let i = 0, bits = Math.log2(N); i < N; i++) {
  let r = 0;
  for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
  rev[i] = r;
}
const cosT = new Float32Array(N / 2);
const sinT = new Float32Array(N / 2);
for (let i = 0; i < N / 2; i++) {
  cosT[i] = Math.cos((2 * Math.PI * i) / N);
  sinT[i] = Math.sin((2 * Math.PI * i) / N);
}

function fft() {
  for (let i = 0; i < N; i++) {
    const j = rev[i];
    if (j > i) {
      const t = re[i];
      re[i] = re[j];
      re[j] = t;
    }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1;
    const step = N / size;
    for (let i = 0; i < N; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j;
        const b = a + half;
        const tr = re[b] * cosT[k] + im[b] * sinT[k];
        const ti = im[b] * cosT[k] - re[b] * sinT[k];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

export function features(buf: Float32Array): Float32Array {
  const frames = Math.max(1, Math.floor((buf.length - N) / HOP) + 1);
  const f = new Float32Array(frames * NB);
  for (let fr = 0; fr < frames; fr++) {
    const o = fr * HOP;
    for (let i = 0; i < N; i++) {
      re[i] = (buf[o + i] || 0) * hann[i];
      im[i] = 0;
    }
    fft();
    const row = fr * NB;
    for (let i = 1; i < N / 2; i++)
      f[row + bandOfBin[i]] += (re[i] * re[i] + im[i] * im[i]) / (N * N);
    for (let b = 0; b < NB; b++) f[row + b] = 10 * Math.log10(f[row + b] + FLOOR);
  }
  return f;
}

/**
 * One windowed FFT of `buf` starting at `off`, as magnitude in dB per bin (bin i is i * PROBE_SR / N Hz).
 * The predicted harmonics graph draws this, so it can show the spectrum of a patch that is not sounding.
 */
export function spectrumAt(buf: Float32Array, off: number): Float32Array {
  for (let i = 0; i < N; i++) {
    re[i] = (buf[off + i] || 0) * hann[i];
    im[i] = 0;
  }
  fft();
  const out = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++)
    out[i] = 10 * Math.log10((re[i] * re[i] + im[i] * im[i]) / (N * N) + FLOOR);
  return out;
}

const RANGE = 50; // dB below the loudest band of the sound at which a difference stops counting

/**
 * How different two renderings sound: the mean change in dB over the audible part of the sound. Each band of each
 * frame is weighted by how loud it is (in either rendering) against the loudest band of the baseline, so a change
 * down in the release tail or in a nearly empty band counts for little. 0 = the same, about 1 = clearly different.
 */
export function distance(a: Float32Array, b: Float32Array, peak: number, norm: number): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const w = ((a[i] > b[i] ? a[i] : b[i]) - peak + RANGE) / RANGE;
    if (w > 0) s += (w > 1 ? 1 : w) * Math.abs(a[i] - b[i]);
  }
  return s / norm;
}

/** The loudest band of a sound, and the total weight of its audible part (what `distance` divides by). */
export function loudness(f: Float32Array): { peak: number; norm: number } {
  let peak = -Infinity;
  for (let i = 0; i < f.length; i++) if (f[i] > peak) peak = f[i];
  let norm = 0;
  for (let i = 0; i < f.length; i++) {
    const w = (f[i] - peak + RANGE) / RANGE;
    if (w > 0) norm += w;
  }
  return { peak, norm: Math.max(norm, f.length * 0.02) };
}

const sameSamples = (a: Float32Array, b: Float32Array): boolean => {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return false;
  return true;
};

/**
 * A probe session for one panel state. `measure(job)` answers one question about one control or cable:
 *   job.nudges – settings a small move away: `d` is the largest change any of them makes (the sensitivity).
 *   job.far    – settings a long way away, tried only if no nudge is audible: is there ANY move that can be heard?
 * `live` is false only when every rendering came out sample-identical to the baseline.
 * A job may bring its own baseline (`job.base`, cached under `job.baseKey`): "with this other control opened first,
 * can this one be heard?" – that only needs the yes or no.
 */
export function createProbe(baseline: EngineParams, notes: number[]): Probe {
  const base = renderGesture(baseline, notes);
  const baseF = features(base);
  const { peak, norm } = loudness(baseF);
  let rms = 0;
  for (let i = 0; i < base.length; i++) rms += base[i] * base[i];
  const bases = new Map<string | undefined, Float32Array>();
  return {
    rms: Math.sqrt(rms / base.length),
    measure(job: ProbeJob): ProbeResult {
      if (job.base) {
        let own = bases.get(job.baseKey);
        if (!own) {
          if (bases.size > 64) bases.clear();
          own = renderGesture(job.base, notes, true);
          bases.set(job.baseKey, own);
        }
        return {
          key: job.key,
          live: job.far!.some((p) => !sameSamples(own, renderGesture(p, notes, true))),
        };
      }
      let d = 0;
      let live = false;
      for (const p of job.nudges || []) {
        const buf = renderGesture(p, notes);
        if (sameSamples(base, buf)) continue;
        live = true;
        d = Math.max(d, distance(baseF, features(buf), peak, norm));
      }
      let far = 0;
      if (!live) {
        for (const p of job.far || []) {
          const buf = renderGesture(p, notes);
          if (sameSamples(base, buf)) continue;
          live = true;
          far = distance(baseF, features(buf), peak, norm);
          break;
        }
      }
      return { key: job.key, d, far, live };
    },
  };
}
