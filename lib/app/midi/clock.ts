/**
 * When an audio frame is heard, in `performance.now()` milliseconds: the clock MIDI out is timed by (`f-midi-out`
 * t-88), so a note sent to a MIDI output lands when the browser synth is heard playing the same note.
 *
 * `getOutputTimestamp()` pairs the context time being heard now with the `performance.now()` it is heard at, output
 * latency and all. Before the output has started (or in a browser without it) the context's own latency figures stand
 * in for it.
 */
import type { MidiClock } from '@/lib/app/midi/scheduler';

/** What the clock reads of an `AudioContext`. */
export interface AudioClockSource {
  readonly sampleRate: number;
  readonly currentTime: number;
  readonly baseLatency?: number;
  readonly outputLatency?: number;
  getOutputTimestamp?: () => AudioTimestamp;
}

/** A clock on whatever context `source` returns now; with none yet, frames are taken as heard now. */
export function audioClock(
  source: () => AudioClockSource | null,
  now: () => number = () => performance.now()
): MidiClock {
  return {
    now,
    heardIn() {
      const ctx = source();
      if (!ctx) return 0;
      const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
      if (ts && ts.performanceTime && ts.contextTime !== undefined)
        return Math.max(0, (ctx.currentTime - ts.contextTime) * 1000);
      return ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000;
    },
    at(frame) {
      const ctx = source();
      if (!ctx) return now();
      const t = frame / ctx.sampleRate;
      const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
      if (ts && ts.performanceTime && ts.contextTime !== undefined)
        return ts.performanceTime + (t - ts.contextTime) * 1000;
      const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
      return now() + (t - ctx.currentTime + latency) * 1000;
    },
  };
}
