/**
 * A list of notes as the key presses that play them, shared by the riff player (`setPhrase` in dsp-core) and the
 * sequencer's pattern player, so the two keep one rule for the default velocity and for what happens at the same beat.
 */
import type { PhraseNote } from '@/lib/app/synths/contract';

/** The velocity a note without one plays at. */
export const DEFAULT_VELOCITY = 0.85;

/**
 * A key going down (`on`, velocity `v`) or up, at beat `b`, and sample `t` once the player playing it has timed it.
 * `st` is the beat its note starts on (`b` itself for a key going down), so a let-go can be told apart from one whose
 * note has not started yet.
 */
export interface NoteEvent {
  b: number;
  t: number;
  st: number;
  on: boolean;
  n: number;
  v: number;
}

/** Earlier first; at the same beat, a key is let go before one goes down. */
export function byBeat(x: NoteEvent, y: NoteEvent): number {
  return x.b - y.b || (x.on ? 1 : 0) - (y.on ? 1 : 0);
}

/** The notes' key presses and let-goes, in order ({@link byBeat}). */
export function noteEvents(notes: readonly PhraseNote[]): NoteEvent[] {
  const evs: NoteEvent[] = [];
  for (const [b, n, len, v] of notes) {
    evs.push({ b, t: 0, st: b, on: true, n, v: v == null ? DEFAULT_VELOCITY : v });
    evs.push({ b: b + len, t: 0, st: b, on: false, n, v: 0 });
  }
  return evs.sort(byBeat);
}
