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
 * With the clock on (`setClock`, t-89), it also sends MIDI clock, so a hardware arpeggiator, LFO or delay follows the
 * pattern's tempo: Start, then {@link PPQN} pulses a beat on the straight grid (swing does not bend it), and Stop. They
 * are placed on the same count of beats as the notes, so they follow every tempo move the notes do. Start goes at beat
 * 0 of the run, before its first note; turned on mid-run, or after a change of port, at the start of the next loop, as
 * no Song Position Pointer is sent. Stop goes at the end, after the last let-go, or now when everything is let go,
 * never ahead of a Start handed over for later. A held-up timer stops the clock, which starts again at the next loop.
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
/** MIDI clock's pulses a quarter note: a beat. */
export const PPQN = 24;
/** MIDI's real-time messages: a clock pulse, Start, Stop. */
export const CLOCK = 0xf8;
export const START = 0xfa;
export const STOP = 0xfc;

/** What the scheduler sends to: a `MIDIOutput` has this. Times are `performance.now()` milliseconds. */
export interface MidiPort {
  send(data: number[], timestamp?: number): void;
}

/** When things happen, in `performance.now()` milliseconds. */
export interface MidiClock {
  now(): number;
  /** When audio frame `frame` (the clock `loop` events use) is heard. */
  at(frame: number): number;
  /** How long after it is rendered audio is heard, in ms: when a change the player makes now is heard. */
  heardIn?(): number;
}

/** A velocity 0..1 as MIDI's 1..127: a note-on of 0 would be a note-off. */
export const midiVelocity = (v: number | undefined): number =>
  Math.min(127, Math.max(1, Math.round((v ?? DEFAULT_VELOCITY) * 127)));

/** Messages the scheduler takes; anything else the page sends the engine is not its business. */
export type SchedulerMessage = PatternMessage | { type: 'tempo'; bpm: number } | { type: string };

/** A real-time message due at beat `g` of the run. */
interface ClockTick {
  g: number;
  kind: 'start' | 'pulse' | 'stop';
}

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
  /** Sends MIDI clock, or stops sending it (with a Stop, if it had started). Off to begin with. */
  setClock(on: boolean): void;
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
  /** With `resync`: the notes in the look-ahead were let go before they began, so they are sent again. */
  let rewind = false;
  /** Let-gos owed, in order. */
  const offs: Off[] = [];
  /** How many sent notes hold each pitch, and when the last of them went down. */
  const held = new Map<number, number>();
  const downAt = new Map<number, number>();
  /**
   * Per pitch, the time of the latest let-go already handed to the port for later: a note of that pitch sent
   * afterwards must not go out before it, or that let-go would cut it.
   */
  const freeAt = new Map<number, number>();
  /** Something has been sent since the last release. */
  let dirty = false;
  /** The port a failed send was last reported for: once each, not once a note. */
  let failed: MidiPort | null = null;
  /** MIDI clock is sent. */
  let clockOn = false;
  /** Start has been sent, and Stop not since: pulses are being sent. */
  let started = false;
  /** The beat Start goes at, or null: none yet, and the next loop's start once one turns. */
  let startG: number | null = null;
  /** The beat Start went at, and the next pulse counted from there (beat `clockFrom + pulse / PPQN`). */
  let clockFrom = 0;
  let pulse = 0;
  /** The beat the pattern ends on, once it is known. */
  let endG: number | null = null;
  /**
   * When the last Start, pulse, Stop and let-go were handed to the port. A Stop never goes ahead of a Start handed over
   * for later, which would leave the hardware running, nor a Start ahead of a Stop; the pulses never go back; and the
   * end's Stop goes after the last let-go. Pulses already handed over may land after a Stop: clock while stopped is
   * ordinary MIDI, and only sets the hardware's tempo.
   */
  let startMs = -Infinity;
  let stopMs = -Infinity;
  let pulseMs = -Infinity;
  let offMs = -Infinity;

  const msAt = (a: Anchor, g: number) => a.ms + ((g - a.g) * 60000) / a.bpm;
  const beatAt = (a: Anchor, ms: number) => a.g + ((ms - a.ms) * a.bpm) / 60000;

  function out(data: number[], at: number) {
    if (!port) return;
    try {
      port.send(data, at);
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

  /** A let-go of `n` at `at`, which a later note of that pitch must not go out before. */
  function offAt(n: number, at: number) {
    out([0x80 | channel, n, 0], at);
    offMs = Math.max(offMs, at);
    if (at > clock.now()) freeAt.set(n, Math.max(at, freeAt.get(n) ?? at));
  }

  function noteOn(n: number, v: number | undefined, when: number) {
    const free = freeAt.get(n);
    const at = free !== undefined && free > when ? free : when;
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
    offAt(n, Math.max(at, downAt.get(n) ?? at));
  }

  /** Lets go of everything. With `keepClock` (a change of channel: clock has none) the clock runs on. */
  function release(keepClock = false) {
    const now = clock.now();
    freeAt.forEach((at, n) => {
      if (at <= now) freeAt.delete(n);
    });
    if (port && dirty) {
      // Now, and All Notes Off now: not later, where it would cut what the next run sends. A note-on already on its
      // way is let go at its own time as well, so it can't sound on after the release.
      held.forEach((_, n) => {
        out([0x80 | channel, n, 0], now);
        const down = downAt.get(n) ?? now;
        if (down > now) offAt(n, down);
      });
      out([0xb0 | channel, ALL_NOTES_OFF, 0], now);
    }
    if (!keepClock) {
      stop(now);
      startG = null;
    }
    endG = null;
    held.clear();
    downAt.clear();
    offs.length = 0;
    dirty = false;
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
    startG = clockOn ? 0 : null;
  }

  /** On to the loop after `cur`, as the player turns at its end. False when the pattern ends there. */
  function turn(): boolean {
    const c = cur;
    if (!c) return false;
    const start = c.start + c.loop.beats;
    if (next === null) {
      end(start);
      return false;
    }
    const loop = next ?? c.loop;
    next = undefined;
    // A loop played again keeps its sorted notes.
    cur = {
      index: c.index + 1,
      start,
      loop,
      notes: loop === c.loop ? c.notes : sorted(loop),
      i: 0,
    };
    starts.set(cur.index, start);
    if (clockOn && !started && startG === null) startG = start;
    starts.forEach((_, k) => {
      if (k < cur!.index - 8) starts.delete(k);
    });
    return true;
  }

  /** The pattern ends at beat `g`: the player lets go of everything there, so what is owed past it is let go there. */
  function end(g: number) {
    for (const off of offs) off.g = Math.min(off.g, g);
    cur = null;
    endG = g;
  }

  /** Stop, if Start was sent: never ahead of a Start handed over for later. */
  function stop(at: number) {
    if (port && started) {
      stopMs = Math.max(at, startMs);
      out([STOP], stopMs);
    }
    started = false;
  }

  /** The next real-time message due: Start, a pulse or Stop, at beat `g`. */
  function tick(): ClockTick | null {
    if (!clockOn) return null;
    if (!started)
      return startG !== null && (endG === null || startG < endG)
        ? { g: startG, kind: 'start' }
        : null;
    const g = clockFrom + pulse / PPQN;
    if (endG !== null && g >= endG) return { g: endG, kind: 'stop' };
    return { g, kind: 'pulse' };
  }

  function sendTick(t: ClockTick, a: Anchor, now: number) {
    const due = msAt(a, t.g);
    const late = due < now - LATE_MS;
    if (t.kind === 'start') {
      startG = null;
      // A Start whose beat has passed (the timer was held up) would put the hardware's downbeat mid-loop: it waits
      // for the next loop's start.
      if (late) return;
      const at = Math.max(now, stopMs, due);
      out([START], at);
      started = true;
      // The first pulse goes with Start: it is the beat Start counts from.
      clockFrom = t.g;
      pulse = 0;
      startMs = at;
      pulseMs = at;
      return;
    }
    if (t.kind === 'stop') {
      stop(Math.max(now, due, pulseMs, offMs));
      return;
    }
    // A pulse due long ago (the timer was held up) is not sent late: a burst of them would be a jump in tempo, and
    // skipping them would leave the hardware's count behind the pattern's for good. So the clock stops, and starts
    // again in step at the next loop's start.
    if (late) {
      stop(now);
      return;
    }
    pulse++;
    pulseMs = Math.max(now, pulseMs, due);
    out([CLOCK], pulseMs);
  }

  /** A let-go owed, in its place: let-gos at one beat keep the order they were owed in. */
  function owe(off: Off) {
    let i = offs.length;
    while (i > 0 && offs[i - 1].g > off.g) i--;
    offs.splice(i, 0, off);
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
      // From what is heard now, less the lateness any note is allowed: one due this instant still goes. After a
      // silence, notes from there on that were let go before they began are sent again.
      const from = beatAt(a, now - LATE_MS);
      if (rewind && cur) {
        sentTo = from;
        const c: Cursor = cur;
        while (c.i > 0 && c.start + c.notes[c.i - 1][0] >= from) c.i--;
      } else sentTo = Math.max(sentTo, from);
      rewind = false;
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
        if (c.start + c.loop.beats >= to || !turn()) break;
      }
      if (on && on.g >= to) on = null;
      const off = offs.length > 0 && offs[0].g < to ? offs[0] : null;
      let t = tick();
      if (t && t.g >= to) t = null;
      if (!on && !off && !t) break;
      // At the same beat a let-go goes first, as in the player, then the clock, then the note: Start before the first
      // note, Stop after the last let-go.
      if (off && (!on || off.g <= on.g) && (!t || off.g <= t.g)) {
        offs.shift();
        noteOff(off.n, Math.max(now, msAt(a, off.g)));
        continue;
      }
      if (t && (!on || t.g <= on.g)) {
        sendTick(t, a, now);
        continue;
      }
      const c = cur!;
      c.i++;
      const [b, n, len, v] = on!.note;
      if (on!.g < sentTo || !validNote(n) || !(len > 0)) continue;
      sentTo = on!.g;
      const at = msAt(a, on!.g);
      // Too late, or a velocity the synth would play silent (MIDI would play it at 1).
      if (at < now - LATE_MS || (v !== undefined && Math.round(v * 127) < 1)) continue;
      noteOn(n, v, Math.max(now, at));
      owe({ g: c.start + b + len, n });
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
        // The end comes where this loop began.
        else end(cur.start);
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
    // The player moves at what it renders now, which is heard a little later.
    const at = clock.now() + (clock.heardIn?.() ?? 0);
    anchor = { g: beatAt(anchor, at), ms: at, bpm: value };
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

  function silence(keepClock = false) {
    const run = cur;
    const n = next;
    const a = anchor;
    const e = endG;
    // A Start not sent yet keeps its place; one whose beat has passed by the next pump waits for the next loop.
    const sg = started ? null : startG;
    release(keepClock);
    // The run goes on from what is heard when next pumped. The clock starts again at the next loop.
    cur = run;
    next = n;
    anchor = a;
    endG = e;
    startG = sg;
    resync = true;
    rewind = true;
  }

  function setPort(p: MidiPort | null, ch: number) {
    if (p === port && ch === channel) return;
    const same = p === port;
    silence(same);
    port = p;
    // What was handed to the old port holds nothing back on the new one.
    if (!same) startMs = stopMs = pulseMs = offMs = -Infinity;
    channel = Math.min(15, Math.max(0, Math.round(ch)));
  }

  function setClock(on: boolean) {
    if (on === clockOn) return;
    clockOn = on;
    stop(clock.now());
    // Turned on mid-run, at the start of the next loop: the one notes are being placed from, if it is not heard yet.
    startG = on && cur && (!anchor || msAt(anchor, cur.start) >= clock.now()) ? cur.start : null;
  }

  return {
    message,
    event,
    pump,
    release: () => release(),
    silence: () => silence(),
    setPort,
    setClock,
  };
}

const PATTERN_TYPES = new Set([
  'pattern',
  'patternNext',
  'patternEdit',
  'patternMute',
  'stopPattern',
]);
const isPattern = (m: SchedulerMessage): m is PatternMessage => PATTERN_TYPES.has(m.type);
