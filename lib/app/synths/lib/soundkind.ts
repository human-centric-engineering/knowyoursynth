// What kind of sound a patch makes, read from the sound itself.
//
// A library sound's category is a tag someone wrote, and a user's edited patch has none that is still true. So this
// plays a few probe notes through the real voice (audio/probe, the renderer the sound map and the predicted scope use),
// reads plain features off the audio (how it starts, holds and dies away, how bright and noisy it is, whether it has
// a pitch and follows the keyboard), and turns them into a score for each pattern role it could carry and for each
// sound category. Nothing here is written per synth.
//
// Deterministic: the renderer seeds Math.random, so the same patch always reads the same.
//
// The features, the scores and how far they agree with the library's own categories: .context/app/pattern-library.md
// (The sound detector).
import type { PatternRole } from '@prisma/client';
import { PROBE_SR, renderHeld, spectrumAt } from '@/lib/app/synths/audio/probe';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-facts';
import { engineOf } from '@/lib/app/synths/lib/predict';
import { KIND_MODEL } from '@/lib/app/synths/lib/soundkind-model';
import type { CableLike } from '@/lib/app/synths/lib/patch';
import {
  PRESET_CATEGORIES,
  type ControlValues,
  type EngineParams,
  type PresetCategory,
  type SynthDef,
} from '@/lib/app/synths/contract';

/** The probe notes: low, mid and high (C2, G3, D5). The mid note is the one held and let go. */
export const KIND_NOTES = { low: 36, mid: 55, high: 74 } as const;
const HOLD = 0.55; // seconds the mid note is held: long enough to hear an attack, a decay and a sustain
const TAIL = 0.3; // ...and listened to after it is let go
const SHORT = 0.2; // the low and high notes: short, just long enough to read a level and a pitch

const FRAME = 240; // 10 ms at PROBE_SR: the envelope's resolution
const FFT_N = 2048; // the window spectrumAt reads
const SILENT = 1e-3; // a peak below about −60 dBFS is not a sound

const hz = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);
const db = (x: number): number => 20 * Math.log10(x + 1e-9);

/** What the detector reads off the audio. Times in seconds, levels as fractions of the note's peak. */
export interface SoundFeatures {
  /** Nothing audible on the mid note. Every other field is then zero. */
  silent: boolean;
  /** Time from the key going down to 90% of the peak. */
  attack: number;
  /** Time from the peak to half its level, while the key is held (the hold's length if it never gets there). */
  decay: number;
  /** Level at the end of the hold. */
  sustain: number;
  /** Time from letting go to 40 dB below the peak (0 if it was already there; the tail's length if it never gets there). */
  release: number;
  /** Rises of 6 dB or more after the first peak while the key is held: a sequencer, an arpeggio, a gated LFO. */
  pulses: number;
  /**
   * How much the level moves while it is held, beyond a steady rise or fall: the mean change in its slope from one
   * 10 ms frame to the next, in dB. A tremolo or a gated LFO moves it; a plain decay does not.
   */
  wobble: number;
  /** Where the energy sits, in octaves above the played note's fundamental (spectral centroid). */
  brightness: number;
  /** How far that moves from the start of the note to the end of the hold, in octaves (a filter sweep). */
  brightMove: number;
  /** How noise-like the spectrum is: 0 a pure tone, 1 white noise (spectral flatness). */
  noise: number;
  /** How clearly it has a pitch: 0 none, 1 a steady periodic wave. */
  clarity: number;
  /** Where the mid note sounds against its key, in octaves (−1 = an octave down; 0 with no pitch). */
  pitch: number;
  /** How the pitch it sounds follows the keys, from the low note to the high: 1 tracks, 0 a fixed pitch. */
  tracking: number;
  /** How far the pitch wanders while the note is held, in semitones. */
  drift: number;
  /** Level of the low, mid and high notes, in dB below the loudest of the three. */
  levels: { low: number; mid: number; high: number };
  /** How many notes the patch can play at once (1 for a mono synth, or a poly synth set to play as one). */
  voices: number;
}

/** The register a patch suits best. */
export type KindRegister = 'low' | 'mid' | 'high';

/** RMS envelope in FRAME-sample frames. */
function envelope(buf: Float32Array): Float32Array {
  const n = Math.floor(buf.length / FRAME);
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i++) s += buf[i] * buf[i];
    env[f] = Math.sqrt(s / FRAME);
  }
  return env;
}

const secs = (frames: number): number => (frames * FRAME) / PROBE_SR;

/**
 * Spectral centroid (Hz) and flatness (0–1) of the FFT window at `off`, over 40 Hz – 10 kHz. Flatness counts each bin
 * as at least 40 dB below the loudest: otherwise the empty bins between a tone's harmonics, and the ones above a
 * filter's cutoff, decide it, and every sound reads as a pure tone.
 */
function spectrum(buf: Float32Array, off: number): { centroid: number; flatness: number } {
  const dbs = spectrumAt(buf, Math.max(0, Math.min(off, buf.length - FFT_N)));
  const binHz = PROBE_SR / FFT_N;
  const lo = Math.ceil(40 / binHz);
  const hi = Math.floor(10000 / binHz);
  const power = new Float64Array(hi - lo + 1);
  let loudest = 0;
  for (let i = lo; i <= hi; i++) {
    // spectrumAt adds a floor of 1e-7 to every bin; take it off again, or a quiet note reads as noise.
    power[i - lo] = Math.max(Math.pow(10, dbs[i] / 10) - 1e-7, 0);
    if (power[i - lo] > loudest) loudest = power[i - lo];
  }
  if (!(loudest > 0)) return { centroid: 0, flatness: 0 };
  let sum = 0;
  let weighted = 0;
  let logSum = 0;
  for (let i = 0; i < power.length; i++) {
    sum += power[i];
    weighted += power[i] * (i + lo) * binHz;
    logSum += Math.log(Math.max(power[i], loudest * 1e-4));
  }
  const floored = power.reduce((s, x) => s + Math.max(x, loudest * 1e-4), 0) / power.length;
  return { centroid: weighted / sum, flatness: Math.exp(logSum / power.length) / floored };
}

const PITCH_W = 1024; // samples at half rate (85 ms) compared at each lag
const PITCH_MAX_LAG = 900; // half-rate samples: 13 Hz, so a bass patch two octaves below C2 still has a pitch
const PITCH_MIN_LAG = 5; // 2.4 kHz
/** Samples `pitchAt` needs from its offset. */
const PITCH_SPAN = 2 * (PITCH_W + PITCH_MAX_LAG);

/**
 * The pitch (Hz, 0 = none) of the stretch at `off`, and how clearly it repeats at that period (0–1). The YIN
 * difference function on a half-rate copy: the first dip below 0.2 (YIN's absolute threshold). The difference
 * function is normalised by its running mean, which is what keeps a smooth wave's short lags from reading as several
 * octaves too high; with no dip that deep, the deepest one, if it is below 0.5. The scope's `detectPeriod` stops at 38 Hz,
 * which a sub bass played on C2 is below.
 */
function pitchAt(buf: Float32Array, off: number): { f0: number; clarity: number } {
  const o = Math.max(0, Math.min(off, buf.length - PITCH_SPAN));
  if (buf.length - o < PITCH_SPAN) return { f0: 0, clarity: 0 };
  const n = PITCH_W + PITCH_MAX_LAG;
  const x = new Float32Array(n);
  let rms = 0;
  for (let i = 0; i < n; i++) {
    x[i] = (buf[o + 2 * i] + buf[o + 2 * i + 1]) * 0.5;
    rms += x[i] * x[i];
  }
  if (Math.sqrt(rms / n) < SILENT / 4) return { f0: 0, clarity: 0 };
  const d = new Float32Array(PITCH_MAX_LAG + 1);
  let running = 0;
  let lag = 0;
  for (let t = 1; t <= PITCH_MAX_LAG; t++) {
    let s = 0;
    for (let i = 0; i < PITCH_W; i++) {
      const v = x[i] - x[i + t];
      s += v * v;
    }
    running += s;
    d[t] = (s * t) / (running || 1);
    if (!lag && t > PITCH_MIN_LAG + 1 && d[t - 1] < 0.2 && d[t - 1] <= d[t] && d[t - 1] <= d[t - 2])
      lag = t - 1;
  }
  if (!lag) {
    // No clear dip: the deepest one, if it is a pitch at all.
    let best = PITCH_MIN_LAG;
    for (let t = PITCH_MIN_LAG; t <= PITCH_MAX_LAG; t++) if (d[t] < d[best]) best = t;
    if (d[best] > 0.5) return { f0: 0, clarity: Math.max(0, 1 - d[best]) };
    lag = best;
  }
  // Parabolic interpolation between the neighbouring lags.
  const a = d[lag - 1];
  const b = d[lag];
  const c = lag < PITCH_MAX_LAG ? d[lag + 1] : b;
  const den = a - 2 * b + c;
  const shift = den > 0 ? (a - c) / (2 * den) : 0;
  return { f0: PROBE_SR / 2 / (lag + shift), clarity: Math.max(0, Math.min(1, 1 - b)) };
}

/** The frame (as a sample offset) where the envelope is loudest, between `from` and `to` frames. */
function loudestFrame(env: Float32Array, from: number, to: number): number {
  let best = from;
  for (let f = from; f < Math.min(to, env.length); f++) if (env[f] > env[best]) best = f;
  return best;
}

/** How many semitones apart two frequencies are (0 when either is missing). */
const semis = (a: number, b: number): number => (a > 0 && b > 0 ? 12 * Math.log2(a / b) : 0);

/**
 * How many notes the patch can play at once: the poly wrapper's voices over its stack, unless it is set to play as one;
 * a note per oscillator when they are assigned to notes (the Poly D); two for a duophonic or paraphonic keyboard, or
 * two voices played one per note or split across the keys.
 */
export function voicesOf(p: EngineParams): number {
  if (p.poly) {
    if (p.poly.mono) return 1;
    return Math.max(1, Math.floor(p.poly.voices / Math.max(1, p.poly.stack || 1)));
  }
  if (p.oscAssign?.mode === 'poly') return Math.max(1, p.osc.length);
  if (p.duo || p.paraphonic || p.dual?.assign === 'duo' || p.dual?.assign === 'split') return 2;
  return 1;
}

const SILENT_FEATURES = (voices: number): SoundFeatures => ({
  silent: true,
  attack: 0,
  decay: 0,
  sustain: 0,
  release: 0,
  pulses: 0,
  wobble: 0,
  brightness: 0,
  brightMove: 0,
  noise: 0,
  clarity: 0,
  pitch: 0,
  tracking: 0,
  drift: 0,
  levels: { low: 0, mid: 0, high: 0 },
  voices,
});

/** Time from frame `from` until the envelope stays below `level`, in seconds (capped at the end of the buffer). */
function fallTime(env: Float32Array, from: number, level: number): number {
  let last = from - 1;
  for (let f = from; f < env.length; f++) if (env[f] >= level) last = f;
  return secs(last + 1 - from);
}

/** Play the probe notes through the voice and read the features. */
export function soundFeatures(p: EngineParams): SoundFeatures {
  const voices = voicesOf(p);
  const held = renderHeld(p, KIND_NOTES.mid, HOLD, TAIL);
  const env = envelope(held);
  const offFrame = Math.round((HOLD * PROBE_SR) / FRAME);
  const peak = env[loudestFrame(env, 0, offFrame)];
  if (!(peak > SILENT)) return SILENT_FEATURES(voices);

  // How it starts, holds and dies away. The attack ends at 90% of the peak, so a sustain that keeps creeping up
  // after a fast attack is not read as one long attack.
  let attackF = 0;
  while (env[attackF] < 0.9 * peak) attackF++;
  let decayF = attackF;
  while (decayF < offFrame && env[decayF] >= 0.5 * peak) decayF++;
  const lastN = Math.round(0.1 / secs(1));
  let sustain = 0;
  for (let f = offFrame - lastN; f < offFrame; f++) sustain += env[f];
  sustain = sustain / lastN / peak;
  const floor = peak / 100; // −40 dB
  const release = env[offFrame - 1] >= floor ? fallTime(env, offFrame, floor) : 0;

  // Re-attacks and level movement while it is held.
  let pulses = 0;
  let low = 0;
  let moved = 0;
  let movedN = 0;
  for (let f = attackF + 1; f < offFrame; f++) {
    const d = db(env[f] / peak);
    // Below −40 dB is a tail dying away, where the level's jitter is not a re-attack.
    if (env[f] <= floor) continue;
    if (d < low) low = d;
    else if (d - low >= 6) {
      pulses++;
      low = d;
    }
    if (f >= attackF + 2 && env[f] > floor && env[f - 1] > floor && env[f - 2] > floor) {
      const slope = d - db(env[f - 1] / peak);
      const before = db(env[f - 1] / peak) - db(env[f - 2] / peak);
      moved += Math.abs(slope - before);
      movedN++;
    }
  }
  const wobble = movedN ? moved / movedN : 0;

  // Timbre near the start of the note and at the end of the hold.
  const at = (frame: number, span: number): number => Math.max(0, frame * FRAME - span / 2);
  const early = spectrum(held, at(attackF, FFT_N));
  const lateFrame = offFrame - Math.ceil(FFT_N / FRAME);
  const late = spectrum(held, lateFrame * FRAME);
  const note = hz(KIND_NOTES.mid);
  const brightness = early.centroid > 0 ? Math.log2(early.centroid / note) : 0;
  const brightMove =
    early.centroid > 0 && late.centroid > 0 && env[lateFrame] > peak / 18 // −25 dB
      ? Math.log2(late.centroid / early.centroid)
      : 0;

  // Pitch: how clear, where it sounds, how steady, and whether it follows the keys.
  const mid = pitchAt(held, at(attackF, PITCH_SPAN));
  const heard: number[] = [];
  for (let k = 0; k < 3; k++) {
    const f = Math.round(attackF + ((offFrame - attackF - PITCH_SPAN / FRAME) * k) / 2);
    if (f >= 0 && env[f] > floor) {
      const got = pitchAt(held, f * FRAME).f0;
      if (got > 0) heard.push(got);
    }
  }
  const drift = heard.length > 1 ? Math.max(...heard.map((f) => Math.abs(semis(f, heard[0])))) : 0;

  const lowBuf = renderHeld(p, KIND_NOTES.low, SHORT, 0);
  const highBuf = renderHeld(p, KIND_NOTES.high, SHORT, 0);
  const lowEnv = envelope(lowBuf);
  const highEnv = envelope(highBuf);
  const lowPeak = lowEnv[loudestFrame(lowEnv, 0, lowEnv.length)];
  const highPeak = highEnv[loudestFrame(highEnv, 0, highEnv.length)];
  // Read the pitch where each short note is loudest (both are shorter than PITCH_SPAN plus a fast attack).
  const lowP = pitchAt(lowBuf, at(loudestFrame(lowEnv, 0, lowEnv.length), PITCH_SPAN));
  const highP = pitchAt(highBuf, at(loudestFrame(highEnv, 0, highEnv.length), PITCH_SPAN));
  const span = KIND_NOTES.high - KIND_NOTES.low;
  const tracking =
    lowP.f0 > 0 && highP.f0 > 0 ? Math.max(0, Math.min(1.5, semis(highP.f0, lowP.f0) / span)) : 0;
  const loudest = Math.max(lowPeak, highPeak, peak);

  const r3 = (x: number): number => Math.round(x * 1000) / 1000;
  return {
    silent: false,
    attack: r3(secs(attackF)),
    decay: r3(secs(decayF - attackF)),
    sustain: r3(sustain),
    release: r3(release),
    pulses,
    wobble: r3(wobble),
    brightness: r3(brightness),
    brightMove: r3(brightMove),
    noise: r3(early.flatness),
    clarity: r3(mid.clarity),
    pitch: r3(mid.f0 > 0 ? Math.log2(mid.f0 / note) : 0),
    tracking: r3(tracking),
    drift: r3(drift),
    levels: {
      low: r3(Math.max(-60, db(lowPeak / loudest))),
      mid: r3(Math.max(-60, db(peak / loudest))),
      high: r3(Math.max(-60, db(highPeak / loudest))),
    },
    voices,
  };
}

// ── from features to scores ──

/** The model's inputs, in order: each feature on a scale where a step means about the same everywhere. */
export const KIND_INPUTS = [
  'attack',
  'decay',
  'sustain',
  'release',
  'pulses',
  'wobble',
  'brightness',
  'brightMove',
  'noise',
  'clarity',
  'pitch',
  'tracking',
  'drift',
  'lowLevel',
  'highLevel',
  'voices',
] as const;

/** The features as the model reads them (KIND_INPUTS order): times on a log scale, counts and levels capped. */
export function kindInputs(f: SoundFeatures): number[] {
  return [
    Math.log10(f.attack + 0.005),
    Math.log10(f.decay + 0.01),
    f.sustain,
    f.release / TAIL,
    Math.min(f.pulses, 4) / 2,
    Math.log1p(f.wobble),
    f.brightness,
    f.brightMove,
    Math.sqrt(f.noise) * 3,
    f.clarity,
    Math.max(-3, Math.min(2, f.pitch)),
    f.tracking,
    Math.log1p(f.drift),
    f.levels.low / 10,
    f.levels.high / 10,
    Math.log2(f.voices) / 2,
  ];
}

/**
 * The scoring model, fitted to the library by `scripts/fit-soundkind.ts` and written to `soundkind-model.ts`.
 * A multinomial logistic regression: each input is standardised (`mean`, `scale`), and each category's score is its
 * weights times the inputs plus its last weight (the bias), turned into shares that sum to 1.
 */
export interface KindModel {
  inputs: readonly string[];
  mean: readonly number[];
  scale: readonly number[];
  weights: Readonly<Record<PresetCategory, readonly number[]>>;
  /** How often a library sound of each category carries each role: the share of its riffs the role rule gives that role. */
  roles: Readonly<Record<PresetCategory, Readonly<Record<PatternRole, number>>>>;
}

/** What kind of sound a patch makes. */
export interface SoundKind {
  features: SoundFeatures;
  /** How much it sounds like each category; the shares sum to 1. */
  categories: Record<PresetCategory, number>;
  /** The category it sounds most like. */
  category: PresetCategory;
  /** How well it suits each pattern role; the shares sum to 1. */
  roles: Record<PatternRole, number>;
  /** The role it suits best. */
  role: PatternRole;
  /** The register it suits. */
  register: KindRegister;
}

const top = <K extends string>(scores: Record<K, number>, keys: readonly K[]): K =>
  keys.reduce((best, k) => (scores[k] > scores[best] ? k : best), keys[0]);

/** The category shares the model gives these features. */
export function kindCategories(
  f: SoundFeatures,
  model: KindModel = KIND_MODEL
): Record<PresetCategory, number> {
  const inputs = kindInputs(f);
  // A model fitted to other inputs would score NaN everywhere and quietly call every patch a bass.
  if (model.mean.length !== inputs.length || model.weights.bass.length !== inputs.length + 1)
    throw new Error(
      'soundkind: the model was fitted to other inputs; refit with scripts/fit-soundkind.ts'
    );
  const z = inputs.map((x, j) => (x - model.mean[j]) / model.scale[j]);
  const raw = PRESET_CATEGORIES.map((c) => {
    const w = model.weights[c];
    return z.reduce((s, x, j) => s + x * w[j], w[z.length]);
  });
  const max = Math.max(...raw);
  const exp = raw.map((x) => Math.exp(x - max));
  const sum = exp.reduce((s, x) => s + x, 0);
  return Object.fromEntries(PRESET_CATEGORIES.map((c, k) => [c, exp[k] / sum])) as Record<
    PresetCategory,
    number
  >;
}

/**
 * The register a patch suits: low if it sounds most like a bass or sounds more than half an octave below its key
 * (the octave-down a bass patch is usually set to, with room for a detuned oscillator); high if it sounds more than
 * half an octave above, or is thin at the bottom (the low note 9 dB or more below the loudest); mid
 * otherwise.
 */
export function registerOf(f: SoundFeatures, category: PresetCategory): KindRegister {
  if (category === 'bass' || f.pitch <= -0.5) return 'low';
  if (f.pitch >= 0.5 || f.levels.low <= -9) return 'high';
  return 'mid';
}

/** Scores for features already read (`soundFeatures`), or null for a silent patch: there is nothing to judge. */
export function kindOf(f: SoundFeatures, model: KindModel = KIND_MODEL): SoundKind | null {
  if (f.silent) return null;
  const categories = kindCategories(f, model);
  const category = top(categories, PRESET_CATEGORIES);
  // A role's score is how often sounds of each category carry it, weighed by how much this one sounds like each.
  const roles = Object.fromEntries(
    PATTERN_ROLES.map((r) => [
      r,
      PRESET_CATEGORIES.reduce((s, c) => s + categories[c] * model.roles[c][r], 0),
    ])
  ) as Record<PatternRole, number>;
  return {
    features: f,
    categories,
    category,
    roles,
    role: top(roles, PATTERN_ROLES),
    register: registerOf(f, category),
  };
}

/** What kind of sound these engine parameters make, or null if they are silent. */
export function soundKind(p: EngineParams, model: KindModel = KIND_MODEL): SoundKind | null {
  return kindOf(soundFeatures(p), model);
}

/** What kind of sound a panel makes, or null if it is silent or cannot be turned into sound. */
export function panelSoundKind(
  def: SynthDef,
  values: ControlValues,
  cables: CableLike[]
): SoundKind | null {
  let p: EngineParams;
  try {
    p = engineOf(def, values, cables, 0);
  } catch {
    return null; // the panel reports the error itself
  }
  return soundKind(p);
}
