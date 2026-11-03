/**
 * MIDI out from the sequencer (`f-midi-out` t-88): the pattern's notes sent to a MIDI output, in time with the pattern
 * player in the synth.
 *
 * The player runs in the AudioWorklet, which has no Web MIDI, so the notes are sent from the main thread. They are not
 * timed by a clock of their own: the player's `loop` events say which loop it is in, at what beat and tempo, from which
 * audio frame, and the page's clock (`MidiClock`) says when that frame is heard. So MIDI lines up with what the browser
 * synth is heard playing, and the playhead needs no second clock.
 *
 * Sending is a rolling look-ahead ({@link LOOKAHEAD_MS}), refilled by `pump` on a timer, never a whole loop at once: a
 * message handed to `MIDIOutput.send` with a timestamp can't be taken back, so an edit, a tempo move and Stop must be
 * within reach. The scheduler sees what the page sends the player (`message`) and what the player reports (`event`):
 *
 * - `pattern` starts a run at loop 0. Nothing is sent until its first `loop` event says when that was.
 * - `patternNext` is the loop after the one the player is in, as the player takes it; with none queued at the boundary
 *   the loop plays again, and `null` ends the pattern there.
 * - `patternEdit` replaces the loop the player is in. What has been sent stays sent: the edit is heard from the end of
 *   the look-ahead on, as the player hears it from its playhead on.
 * - `tempo` moves the clock at once; the player's own `loop` event for the move then places it exactly.
 * - `stopPattern`, `patternEnd` (the player ended it, or a panic did) and `release` let go of everything.
 *
 * Notes keep the player's held-note rules: two notes of one pitch that overlap (a slide, a tie) are let go once, when
 * the last ends, and a note held over the loop's end is let go in the next loop. Notes are placed on one count of beats
 * from the run's start, so a let-go owed by an earlier loop lands where the player lands it, whatever the tempo does.
 *
 * A loop the player would refuse (`playable`) is refused here too, so the two never disagree about what is playing.
 *
 * Pure: no timers, no Web MIDI. The page (`use-midi-out.ts`) gives it a port and a clock and calls `pump`.
 */
import type { PhraseNote } from '@/lib/app/synths/contract';
import { DEFAULT_VELOCITY } from '@/lib/app/synths/audio/note-events';
import {
  playable,
  type PatternEvent,
  type PatternLoop,
  type PatternMessage,
} from '@/lib/app/synths/audio/pattern-player';
import { logger } from '@/lib/logging';

/** How far ahead of what is heard notes are handed to the output. */
export const LOOKAHEAD_MS = 100;
/** A note due longer ago than this when its turn comes (the timer was held up) is not sent: it would land late. */
export const LATE_MS = 20;
/** All Notes Off. */
export const ALL_NOTES_OFF = 123;

/** What the scheduler sends to: a `MIDIOutput` has this. Times are `performance.now()` milliseconds. */
export interface MidiPort {
  send(data: number[], timestamp?: number): void;
}

/** When things happen, in `performance.now()` milliseconds. */
export interface MidiClock {
  now(): number;
  /** When audio frame `frame` (the clock `loop` events use) is heard. */
  at(frame: number): number;
}

/** A velocity 0..1 as MIDI's 1..127: a note-on of 0 would be a note-off. */
export const midiVelocity = (v: number | undefined): number =>
  Math.min(127, Math.max(1, Math.round((v ?? DEFAULT_VELOCITY) * 127)));

/** Messages the scheduler takes; anything else the page sends the engine is not its business. */
export type SchedulerMessage = PatternMessage | { type: 'tempo'; bpm: number } | { type: string };

/** Where beat `g` (from the run's start) is heard: at `ms`, moving at `bpm`. */
interface Anchor {
  g: number;
  ms: number;
  bpm: number;
}

/** A loop the scheduler is placing notes from: its index, the beat it starts on, and its notes. */
interface Cursor {
  index: number;
  start: number;
  loop: PatternLoop;
  /** Its notes sorted by start, and the next not yet reached. */
  notes: PhraseNote[];
  i: number;
}

/** A let-go owed: pitch `n` at beat `g` of the run. */
interface Off {
  g: number;
  n: number;
}

export interface MidiScheduler {
  /** Something the page sent the pattern player. */
  message(m: SchedulerMessage): void;
  /** Something the pattern player reported, already known to be this run's. */
  event(e: PatternEvent): void;
  /** Sends what falls within the look-ahead. */
  pump(): void;
  /** Lets go of every note sent and not yet let go, then All Notes Off, and stops placing notes until the next run. */
  release(): void;
  /** Lets go as `release` does, but keeps the run: notes start again from what is heard when next pumped. */
  silence(): void;
  /** Sends to `port` on `channel` (0..15) from now on, letting go of everything on the one before. `null` sends nothing. */
  setPort(port: MidiPort | null, channel: number): void;
}

const byStart = (a: PhraseNote, b: PhraseNote) => a[0] - b[0] || a[1] - b[1];
const sorted = (loop: PatternLoop): PhraseNote[] => [...loop.notes].sort(byStart);
const validNote = (n: number) => Number.isInteger(n) && n >= 0 && n <= 127;

export function createMidiScheduler(clock: MidiClock): MidiScheduler {
  let port: MidiPort | null = null;
  let channel = 0;
  /** The loop notes are being placed from, or null: stopped, or ended. */
  let cur: Cursor | null = null;
  /** The loop after `cur`: a loop, `null` to end, `undefined` to play `cur` again. */
  let next: PatternLoop | null | undefined;
  /** Where each recent loop starts, in beats from the run's start: a `loop` event names a loop by its index. */
  const starts = new Map<number, number>();
  /** The loop the player is in, from its last `loop` event. */
  let playing = 0;
  let anchor: Anchor | null = null;
  /** Notes starting before this beat have been sent (or passed). */
  let sentTo = 0;
  /** Set when the port changes mid-run: the notes start again from what is heard now, not from where they stopped. */
  let resync = false;
  const offs: Off[] = [];
  /** How many sent notes hold each pitch, and when the last of them went down. */
  const held = new Map<number, number>();
  const downAt = new Map<number, number>();
  /** The latest time anything was sent for: a let-go sent earlier would arrive before a note-on already on its way. */
  let lastAt = 0;
  /** Something has been sent since the last release. */
  let dirty = false;
  /** The port a failed send was last reported for: once each, not once a note. */
  let failed: MidiPort | null = null;

  const msAt = (a: Anchor, g: number) => a.ms + ((g - a.g) * 60000) / a.bpm;
  const beatAt = (a: Anchor, ms: number) => a.g + ((ms - a.ms) * a.bpm) / 60000;

  function out(data: number[], at: number) {
    if (!port) return;
    try {
      port.send(data, at);
      lastAt = Math.max(lastAt, at);
      dirty = true;
    } catch (err) {
      // A port unplugged between the list and the send: the page drops it on the state change. Anything else would
      // fail on every note, so it is said once.
      if (failed !== port) {
        failed = port;
        logger.warn('MIDI out: a send failed', { err: String(err) });
      }
    }
  }

  function noteOn(n: number, v: number, at: number) {
    held.set(n, (held.get(n) ?? 0) + 1);
    downAt.set(n, at);
    out([0x90 | channel, n, midiVelocity(v)], at);
  }

  function noteOff(n: number, at: number) {
    const k = held.get(n) ?? 0;
    if (k <= 0) return;
    if (k > 1) {
      held.set(n, k - 1);
      return;
    }
    held.delete(n);
    // Never before its note-on, which a tempo move since it was sent could otherwise put it.
    out([0x80 | channel, n, 0], Math.max(at, downAt.get(n) ?? at));
  }

  function release() {
    const now = clock.now();
    // Now, in case what is on its way is dropped (the page closing); and again after the last note-on already sent.
    const times = lastAt > now ? [now, lastAt] : [now];
    if (port && dirty) {
      for (const at of times) {
        held.forEach((_, n) => out([0x80 | channel, n, 0], at));
        out([0xb0 | channel, ALL_NOTES_OFF, 0], at);
      }
    }
    held.clear();
    downAt.clear();
    offs.length = 0;
    dirty = false;
    lastAt = 0;
    cur = null;
    next = undefined;
    anchor = null;
  }

  function begin(loop: PatternLoop) {
    release();
    cur = { index: 0, start: 0, loop, notes: sorted(loop), i: 0 };
    next = undefined;
    starts.clear();
    starts.set(0, 0);
    playing = 0;
    sentTo = 0;
    resync = false;
  }

  /** On to the loop after `cur`, as the player turns at its end. False when the pattern ends there. */
  function turn(): boolean {
    const c = cur;
    if (!c) return false;
    if (next === null) {
      cur = null;
      return false;
    }
    const loop = next ?? c.loop;
    next = undefined;
    const start = c.start + c.loop.beats;
    cur = { index: c.index + 1, start, loop, notes: sorted(loop), i: 0 };
    starts.set(cur.index, start);
    starts.forEach((_, k) => {
      if (k < cur!.index - 8) starts.delete(k);
    });
    return true;
  }

  /** `loop` in place of what is left of `cur` from `sentTo` on. */
  function replace(loop: PatternLoop) {
    const c = cur!;
    const notes = sorted(loop);
    let i = 0;
    while (i < notes.length && c.start + notes[i][0] < sentTo) i++;
    cur = { ...c, loop, notes, i };
  }

  function pump() {
    if (!port || !anchor) return;
    const now = clock.now();
    const a = anchor;
    if (resync) {
      resync = false;
      // From what is heard now, less the lateness any note is allowed: one due this instant still goes.
      sentTo = Math.max(sentTo, beatAt(a, now - LATE_MS));
    }
    const to = beatAt(a, now + LOOKAHEAD_MS);
    for (;;) {
      // The next note to start, crossing into the loops after while they start inside the window.
      let on: { g: number; note: PhraseNote } | null = null;
      while (cur) {
        const c: Cursor = cur;
        if (c.i < c.notes.length && c.start + c.notes[c.i][0] < c.start + c.loop.beats) {
          on = { g: c.start + c.notes[c.i][0], note: c.notes[c.i] };
          break;
        }
        const end = c.start + c.loop.beats;
        if (end >= to) break;
        if (!turn()) {
          // The pattern ends at `end`: the player lets go of everything there, and reports it.
          for (const off of offs) off.g = Math.min(off.g, end);
          break;
        }
      }
      if (on && on.g >= to) on = null;
      offs.sort((x, y) => x.g - y.g);
      const off = offs.length > 0 && offs[0].g < to ? offs[0] : null;
      if (!on && !off) break;
      // At the same beat a let-go goes first, as in the player.
      if (off && (!on || off.g <= on.g)) {
        offs.shift();
        noteOff(off.n, Math.max(now, msAt(a, off.g)));
        continue;
      }
      const c = cur!;
      c.i++;
      const [b, n, len, v] = on!.note;
      if (on!.g < sentTo || !validNote(n) || !(len > 0)) continue;
      sentTo = on!.g;
      const at = msAt(a, on!.g);
      if (at < now - LATE_MS) continue;
      noteOn(n, v ?? DEFAULT_VELOCITY, Math.max(now, at));
      offs.push({ g: c.start + b + len, n });
    }
    sentTo = Math.max(sentTo, to);
  }

  function message(m: SchedulerMessage) {
    if (!isPattern(m)) {
      if (m.type === 'tempo' && 'bpm' in m) tempo(m.bpm);
      else if (m.type === 'panic') release();
      return;
    }
    switch (m.type) {
      case 'pattern':
        if (playable(m.loop)) begin(m.loop);
        return;
      case 'patternNext': {
        if (!cur || (m.loop !== null && !playable(m.loop))) return;
        if (cur.index <= playing) next = m.loop;
        // Already placing notes from the loop it is for (one shorter than the look-ahead): heard from here on, or no
        // more placed if it is the end.
        else if (m.loop) replace(m.loop);
        else {
          // The end comes where this loop began: what is owed past it is let go there, as the player lets go.
          for (const off of offs) off.g = Math.min(off.g, cur.start);
          cur = null;
        }
        return;
      }
      case 'patternEdit':
        if (!cur || !playable(m.loop)) return;
        // The player drops the loop queued before an edit; a fresh one follows.
        if (cur.index === playing) {
          replace(m.loop);
          next = undefined;
        }
        return;
      case 'stopPattern':
        release();
        return;
      default:
        return;
    }
  }

  function tempo(value: number) {
    if (!(Number.isFinite(value) && value > 0) || !anchor) return;
    const now = clock.now();
    anchor = { g: beatAt(anchor, now), ms: now, bpm: value };
  }

  function event(e: PatternEvent) {
    if (e.type === 'patternEnd') {
      release();
      return;
    }
    // A muted player's tick only says time has passed: the page pumps on it.
    if (e.type === 'patternTick' || (!cur && !anchor)) return;
    playing = e.index;
    // The player is in a loop the notes have not reached (the timer was held up): they catch up, sending nothing
    // before where the player is.
    while (cur && cur.index < e.index) if (!turn()) break;
    const start = starts.get(e.index);
    if (start === undefined) return;
    anchor = { g: start + e.beat, ms: clock.at(e.frame), bpm: e.bpm };
    sentTo = Math.max(sentTo, anchor.g);
  }

  function silence() {
    const run = cur;
    const n = next;
    const a = anchor;
    release();
    // The run goes on from what is heard when next pumped.
    cur = run;
    next = n;
    anchor = a;
    resync = true;
  }

  function setPort(p: MidiPort | null, ch: number) {
    if (p === port && ch === channel) return;
    silence();
    port = p;
    channel = Math.min(15, Math.max(0, Math.round(ch)));
  }

  return { message, event, pump, release, silence, setPort };
}

const PATTERN_TYPES = new Set([
  'pattern',
  'patternNext',
  'patternEdit',
  'patternMute',
  'stopPattern',
]);
const isPattern = (m: SchedulerMessage): m is PatternMessage => PATTERN_TYPES.has(m.type);
