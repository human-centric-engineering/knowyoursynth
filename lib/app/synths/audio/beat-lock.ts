/**
 * Beat-locking: a synth's own free-running clock held to the app's beat while its sound follows the transport
 * (`f-own-sequencer`, `.context/app/sequencer-synths.md`).
 *
 * The Subharmonicon counts the app's 24-PPQ pulses down to its own 4 PPQ, because its hardware takes MIDI clock and
 * its TEMPO is a BPM. A clock with no tempo control (the 960's FREQUENCY RANGE and VERNIER, the Easel's and the Solar
 * 42N's pulsers) keeps its own rate as a request instead: the core asks how long a step at that rate is, in beats, and
 * this snaps it to a whole division of the beat, measured from the pulses. Start puts the core on its first step at the
 * run's first beat; Stop stops it. A core calls `clock()` from its message handler and `step()` once a sample.
 */
import { CLOCK_PPQ, type ClockAt } from '@/lib/app/synths/audio/subharm-core';

/** A clock faster than this (Hz) is an audio-rate oscillator, not a tempo: it is never locked. */
export const LOCK_MAX_HZ = 20;
/** The most steps a beat a locked clock takes: one a pulse. */
const MAX_DIV = CLOCK_PPQ;

/**
 * The length in beats of a step at `hz`, snapped to a whole division of the beat: `n` steps a beat at or above one a
 * beat (1/2, 1/3 … 1/24 of a beat), a whole number of beats below it. `bps` is the app's beats a second.
 */
export function snapStep(hz: number, bps: number): number {
  const r = hz / bps;
  if (!(r > 0)) return 1;
  if (r >= 1) return 1 / Math.min(MAX_DIV, Math.max(1, Math.round(r)));
  return Math.max(1, Math.round(1 / r));
}

/**
 * The length in beats of one stage of a clock whose rate changes stage by stage (the 960's row C timing): snapped to
 * the pulse grid, a whole number of 24ths of a beat, at least one. So a gallop's long and short stages keep their
 * ratio, tightened to the beat.
 */
export function snapStage(hz: number, bps: number): number {
  if (!(hz > 0)) return 1;
  return Math.max(1, Math.round((bps / hz) * CLOCK_PPQ)) / CLOCK_PPQ;
}

/** What a core's clock does on a sample: a run starts, the run stops, or neither. */
export type LockEvent = 'start' | 'stop' | null;

export interface BeatLock {
  /**
   * Take a `clock` message; it is acted on at the next `step()`. A start may say where the run is: `from` = the first
   * pulse to come, counted from the run's first beat (a run started part-way, on a sixteenth), so `beat()` is the run's.
   */
  clock: (at: ClockAt, from?: number) => void;
  /** One sample: the clock's start or stop, if one arrived since the last. Call before reading `beat()`. */
  step: () => LockEvent;
  /** A run is going: started and not stopped. */
  running: () => boolean;
  /**
   * Beats since the run's first beat, between pulses taken on at the last pulses' rate. Before the first pulse, where
   * the run started (0, or the start's `from`).
   */
  beat: () => number;
  /** The app's beats a second, from the pulses; 0 until two have arrived. */
  bps: () => number;
}

/**
 * The pulses' side of a beat lock, at sample rate `sr`. The players send each pulse on its own sample, the first on
 * the run's first beat, so the beat is the pulses counted plus the samples since the last, over the pulse period.
 */
export function createBeatLock(sr: number): BeatLock {
  let qStart = false,
    qStop = false,
    qPulses = 0,
    qFrom = 0;
  let run = false,
    base = 0,
    pulses = 0,
    since = 0,
    period = 0;

  function clock(at: ClockAt, from = 0) {
    if (at === 'start') {
      // a start takes back a stop not yet taken, and the pulses before it
      qStart = true;
      qFrom = from > 0 ? Math.round(from) : 0;
      qStop = false;
      qPulses = 0;
    } else if (at === 'stop') {
      qStop = true;
      qStart = false;
      qPulses = 0;
    } else qPulses++;
  }

  function step(): LockEvent {
    let e: LockEvent = null;
    if (qStop) {
      qStop = false;
      run = false;
      e = 'stop';
    }
    if (qStart) {
      qStart = false;
      run = true;
      base = qFrom;
      pulses = 0;
      since = 0;
      period = 0;
      e = 'start';
    }
    if (run && pulses > 0) since++;
    if (qPulses > 0) {
      if (run) {
        // several pulses on one sample (the tempo raised) share the samples since the last
        if (pulses > 0) period = since / qPulses;
        pulses += qPulses;
        since = 0;
      }
      qPulses = 0;
    }
    return e;
  }

  const beat = (): number =>
    !run
      ? 0
      : pulses === 0
        ? base / CLOCK_PPQ
        : (base + pulses - 1 + (period > 0 ? Math.min(since / period, 1) : 0)) / CLOCK_PPQ;
  const bps = (): number => (period > 0 ? sr / (period * CLOCK_PPQ) : 0);

  return { clock, step, running: () => run, beat, bps };
}
