/**
 * What plays along with a pattern (`f-step-sequencer` t-266, t-267): a count-in, a metronome and a drum beat, rendered
 * by the pattern player on the audio thread so every click and hit lands on its sample, in time with the notes.
 *
 * Everything runs on a grid of sixteenths counted in beats from the pattern's first step (beat 0). A count-in is the
 * bar before it: its clicks fall on the beats from `-countIn` to `-1`, the first accented. From beat 0 on, the
 * metronome clicks every beat (accented on each bar of four), and a drum beat plays its sixteen steps round and round,
 * every second sixteenth late by the pattern's swing. The bar is always four beats, whatever the loop's length, so a
 * three-beat loop does not drag the beat round with it.
 *
 * The voices are synthesised here (a sine for the click, a falling sine for the kick, filtered noise for the snare,
 * clap and hats, a short tone for the rim) from a fixed pool, so a hit allocates nothing on the audio thread. They are
 * added to the synth's output after its effects, dry. A closed hat chokes an open one, as on a drum machine.
 *
 * Pure apart from the pool and the noise it keeps: the player calls `process` with the beat at the first sample of each
 * span it renders, so a tempo change or an edit never puts a hit in the wrong place.
 */

/** The drum voices a beat can play, by index in a hit. */
export const DRUM_VOICES = ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'rim'] as const;
export type DrumVoice = (typeof DRUM_VOICES)[number];

/** Steps in one bar of a beat: sixteenths of four beats. */
export const BEAT_STEPS = 16;
/** The longest count-in, in beats. */
export const MAX_COUNT_IN = 8;
/** The most hits one bar of a beat carries. */
export const MAX_HITS = BEAT_STEPS * DRUM_VOICES.length;

/** One hit of a beat: its sixteenth in the bar (0–15), the voice (an index of `DRUM_VOICES`), and its velocity 0–1. */
export type DrumHit = [step: number, voice: number, velocity: number];

/** A beat as the player plays it: one bar of hits, and the pattern's swing (50 straight, 75 the heaviest). */
export interface DrumGrid {
  hits: DrumHit[];
  swing: number;
}

/** What plays along from beat 0: the metronome, and a drum beat or none. */
export interface BackingSettings {
  click: boolean;
  drums: DrumGrid | null;
}

export const NO_BACKING: BackingSettings = { click: false, drums: null };

/** A finite number: what every number the audio thread is sent is checked to be. */
export const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function playableHit(x: unknown): boolean {
  if (!Array.isArray(x)) return false;
  const [s, v, vel] = x as readonly unknown[];
  return (
    isNumber(s) &&
    Number.isInteger(s) &&
    s >= 0 &&
    s < BEAT_STEPS &&
    isNumber(v) &&
    Number.isInteger(v) &&
    v >= 0 &&
    v < DRUM_VOICES.length &&
    isNumber(vel) &&
    vel >= 0 &&
    vel <= 1
  );
}

/** Whether settings from the page can be played: what the audio thread is sent is checked, as a loop is. */
export function playableBacking(x: unknown): x is BackingSettings {
  if (typeof x !== 'object' || x === null) return false;
  const b = x as { click?: unknown; drums?: unknown };
  if (typeof b.click !== 'boolean') return false;
  if (b.drums === null) return true;
  if (typeof b.drums !== 'object') return false;
  const d = b.drums as { hits?: unknown; swing?: unknown };
  return (
    isNumber(d.swing) &&
    d.swing >= 50 &&
    d.swing <= 75 &&
    Array.isArray(d.hits) &&
    d.hits.length <= MAX_HITS &&
    d.hits.every(playableHit)
  );
}

/** A count-in from the page, in whole beats: 0 when it is not one. */
export const countInBeats = (x: unknown): number =>
  isNumber(x) && Number.isInteger(x) && x > 0 ? Math.min(x, MAX_COUNT_IN) : 0;

// Voice kinds beyond the drums: the click, and the accented click.
const CLICK = DRUM_VOICES.length;
const ACCENT = CLICK + 1;
const KICK = 0,
  SNARE = 1,
  CLAP = 2,
  CLOSED = 3,
  OPEN = 4,
  RIM = 5;

/** How long each kind sounds, in seconds, before its voice is free again. */
const LENGTH = [0.6, 0.35, 0.4, 0.12, 0.7, 0.08, 0.06, 0.06];
/** Loudness: the drums under a synth at its usual level, the click just above them. */
const DRUM_GAIN = 0.55;
const CLICK_GAIN = 0.4;
/** Hits sounding at once: a bar's busiest step, and the tails of the ones before. */
const POOL = 16;
/** A grid time this close to a sample's beat is on it: float beats from a tempo change never miss a hit. */
const EPS = 1e-9;
/** How long a hit sounding when the run stops takes to fade out. */
const FADE = 0.005;

interface Voice {
  kind: number;
  /** Samples since the hit, and how many it sounds for. */
  t: number;
  len: number;
  amp: number;
  phase: number;
  /** Two one-pole filter states, for the noise. */
  lp: number;
  lp2: number;
  /** Cut short by a stop: faded out over its last `FADE` seconds rather than dropped to silence (a click). */
  cut: boolean;
}

export interface Backing {
  /** What plays along from beat 0, from now on: heard from the next hit. */
  set(s: BackingSettings): void;
  /** A run starts at `beat` (negative for a count-in of that many beats): the grid is placed there. */
  start(beat: number, countIn: number): void;
  /** The run is over: nothing more is struck, and what sounds fades out over a few milliseconds. */
  stop(): void;
  /** Adds what still sounds (a stopped run's fading tails) to `k` samples from `off`, striking nothing. */
  tail(out: Float32Array, outR: Float32Array | undefined, off: number, k: number): void;
  /**
   * Adds `k` samples from `off` in `out` (and `outR`), the first at beat `beat`, at `spb` samples a beat. `muted`
   * keeps the grid moving and strikes nothing.
   */
  process(
    out: Float32Array,
    outR: Float32Array | undefined,
    off: number,
    k: number,
    beat: number,
    spb: number,
    muted: boolean
  ): void;
}

export function createBacking(sr: number): Backing {
  let settings: BackingSettings = NO_BACKING;
  /** The next sixteenth of the grid to strike, and the first beat of the count-in (0 for none). */
  let next = 0;
  let countFrom = 0;
  let running = false;
  let seed = 0x2545f491;
  const voices: Voice[] = Array.from({ length: POOL }, () => ({
    kind: -1,
    t: 0,
    len: 0,
    amp: 0,
    phase: 0,
    lp: 0,
    lp2: 0,
    cut: false,
  }));
  const coef = (hz: number) => 1 - Math.exp((-2 * Math.PI * Math.min(hz, sr * 0.45)) / sr);
  const LP_SNARE = coef(1800),
    LP_CLAP = coef(1100),
    LP2_CLAP = coef(3200),
    LP_HAT = coef(7500);

  /** Swing as beats: 75 delays the second sixteenth of each pair by half a sixteenth. */
  const swingBeats = () => (settings.drums ? ((settings.drums.swing - 50) / 25) * 0.125 : 0);
  /** The beat sixteenth `g` falls on. The count-in's clicks fall on beats, so swing never moves them. */
  const timeOf = (g: number) => g * 0.25 + (g > 0 && g % 2 === 1 ? swingBeats() : 0);
  /** The first sixteenth at or after `beat`. */
  function firstFrom(beat: number) {
    let g = Math.floor(beat * 4) - 1;
    while (timeOf(g) < beat - EPS) g++;
    return g;
  }

  function noise() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 2147483648 - 1;
  }

  function strike(kind: number, vel: number) {
    if (kind === CLOSED)
      for (const v of voices) if (v.kind === OPEN) v.len = Math.min(v.len, v.t + sr * 0.01);
    // A free voice, or the one nearest its end.
    let pick = voices[0];
    for (const v of voices) {
      if (v.kind < 0) {
        pick = v;
        break;
      }
      if (v.len - v.t < pick.len - pick.t) pick = v;
    }
    pick.kind = kind;
    pick.t = 0;
    pick.len = Math.max(1, Math.round(LENGTH[kind] * sr));
    pick.amp = vel * (kind >= CLICK ? CLICK_GAIN : DRUM_GAIN);
    pick.phase = 0;
    pick.lp = 0;
    pick.lp2 = 0;
    pick.cut = false;
  }

  /** What sixteenth `g` strikes. */
  function hit(g: number) {
    if (g < 0) {
      if (g >= countFrom * 4 && g % 4 === 0) strike(g === countFrom * 4 ? ACCENT : CLICK, 1);
      return;
    }
    if (settings.click && g % 4 === 0) strike(g % BEAT_STEPS === 0 ? ACCENT : CLICK, 1);
    const d = settings.drums;
    if (!d) return;
    const step = g % BEAT_STEPS;
    for (const [s, v, vel] of d.hits) if (s === step && vel > 0) strike(v, vel);
  }

  function sample(v: Voice): number {
    const s = v.t / sr;
    switch (v.kind) {
      case CLICK:
      case ACCENT: {
        const f = v.kind === ACCENT ? 1760 : 1100;
        return Math.sin(2 * Math.PI * f * s) * Math.exp(-s / 0.012);
      }
      case KICK: {
        const f = 45 + 115 * Math.exp(-s / 0.03);
        v.phase += (2 * Math.PI * f) / sr;
        return Math.sin(v.phase) * Math.exp(-s / 0.22) * 1.4;
      }
      case SNARE: {
        const x = noise();
        v.lp += LP_SNARE * (x - v.lp);
        const tone = Math.sin(2 * Math.PI * 185 * s) * Math.exp(-s / 0.05) * 0.5;
        return (x - v.lp) * Math.exp(-s / 0.1) * 0.8 + tone;
      }
      case CLAP: {
        const x = noise();
        v.lp += LP_CLAP * (x - v.lp);
        v.lp2 += LP2_CLAP * (x - v.lp - v.lp2);
        // Three quick slaps, then the room.
        const env = s < 0.03 ? Math.exp(-(s % 0.01) / 0.003) : Math.exp(-(s - 0.03) / 0.09);
        return v.lp2 * env * 1.6;
      }
      case CLOSED:
      case OPEN: {
        const x = noise();
        v.lp += LP_HAT * (x - v.lp);
        const env = Math.exp(-s / (v.kind === OPEN ? 0.2 : 0.025));
        // Cut short (choked): faded over its last samples rather than stopped on a step.
        const tail = Math.min(1, (v.len - v.t) / (sr * 0.005));
        return (x - v.lp) * env * tail * 1.1;
      }
      case RIM:
        return (
          (Math.sin(2 * Math.PI * 1700 * s) + 0.6 * Math.sin(2 * Math.PI * 480 * s)) *
          Math.exp(-s / 0.012) *
          0.6
        );
      default:
        return 0;
    }
  }

  /** One sample of every voice sounding, or null when none is. */
  function mix(): number | null {
    let sum = 0;
    let any = false;
    const fade = sr * FADE;
    for (const v of voices) {
      if (v.kind < 0) continue;
      any = true;
      const g = v.cut ? Math.min(1, (v.len - v.t) / fade) : 1;
      sum += sample(v) * v.amp * g;
      if (++v.t >= v.len) v.kind = -1;
    }
    return any ? sum : null;
  }

  function tail(out: Float32Array, outR: Float32Array | undefined, off: number, k: number) {
    for (let j = 0; j < k; j++) {
      const sum = mix();
      if (sum === null) return;
      out[off + j] += sum;
      if (outR) outR[off + j] += sum;
    }
  }

  return {
    set(s) {
      settings = s;
    },
    start(beat, countIn) {
      running = true;
      countFrom = -countIn;
      next = firstFrom(beat);
    },
    stop() {
      running = false;
      const fade = Math.max(1, Math.round(sr * FADE));
      for (const v of voices) {
        if (v.kind < 0 || v.len - v.t <= fade) continue;
        v.len = v.t + fade;
        v.cut = true;
      }
    },
    tail,
    process(out, outR, off, k, beat, spb, muted) {
      if (!running) {
        tail(out, outR, off, k);
        return;
      }
      const per = 1 / spb;
      // The beat jumped (a tempo change mid-span, a restart): the grid is placed again from here.
      if (timeOf(next - 1) > beat + EPS || timeOf(next) < beat - 2 * per) next = firstFrom(beat);
      const striking = !muted && (settings.click || !!settings.drums || next < 0);
      let sounding = false;
      for (const v of voices) if (v.kind >= 0) sounding = true;
      for (let j = 0; j < k; j++) {
        const b = beat + j * per;
        while (timeOf(next) <= b + EPS) {
          if (striking) {
            hit(next);
            sounding = true;
          }
          next++;
        }
        if (!sounding) continue;
        const sum = mix();
        sounding = sum !== null;
        if (sum === null) continue;
        out[off + j] += sum;
        if (outR) outR[off + j] += sum;
      }
    },
  };
}
