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
 * never ahead of a Start handed over for later; and a Start never with a Stop or pulses still to land after it, so Play
 * straight after Stop waits for the next loop. A held-up timer stops the clock, which starts again at the next loop.
 *
 * With CCs given to mod lanes (`setCcs`, t-90), each change of a lane's value is sent as its CC on the channel, timed
 * like the notes and ahead of a note on the same beat. A CC is sent only when its value changes. Changes whose time
 * has gone (an edit, a CC given mid-run, a held-up timer, a change of port) aren't sent late one by one: only the
 * value in effect on each CC, now.
 * Nothing is sent back on Stop: the hardware keeps the last value, as it has no panel value to go back to.
 *
 * With a program set (`setProgram`, `f-midi-hardware-lead` t-92), a run from the top first calls up that patch: Bank
 * Select (CC 0, then CC 32, each only if given), then Program Change, now. A synth takes a moment to load a patch, so
 * nothing on the channel (a note, a CC) goes before {@link PROGRAM_LEAD_MS} after it: the first note waits for it if
 * it is due sooner, and the clock's Start with it. A run started part-way (a MIDI Continue) sends none: the patch was called up at its Start.
 *
 * Muted (`setMuted`, `f-default-patch` t-172: a new patch loading on the panel), the run goes on in time, the clock
 * and the lanes' CCs with it, but no note is sent: what is held is let go at once, and the notes come back in from the
 * first that starts after the mute is lifted.
 *
 * Pure: no timers, no Web MIDI. The page (`use-midi-out.ts`) gives it a port and a clock and calls `pump`.
 */
import type { ControlValues, PhraseNote } from '@/lib/app/synths/contract';
import type { CcLookup } from '@/lib/app/midi/cc';
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
/** Bank Select's two CCs: the bank's MSB, then its LSB. */
export const BANK_MSB = 0;
export const BANK_LSB = 32;
/** How long after a program change the hardware is given to load the patch before a note or CC goes. */
export const PROGRAM_LEAD_MS = 30;

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

/** A patch to call up on Play: program 0..127 (shown 1–128), and its bank's MSB and LSB, 0..127, where given. */
export interface MidiProgram {
  program: number;
  msb?: number;
  lsb?: number;
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
  /** Where its lanes' values change, in order, and the next not yet reached. */
  mods: Mod[];
  k: number;
}

/** From beat `b` of the loop, the lanes' values: `null` for none. */
type Mod = [b: number, set: ControlValues | null];

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
  /** The CCs the lanes' values are sent as, from their next change; `null` sends none. None to begin with. */
  setCcs(lookup: CcLookup | null): void;
  /** The patch a run from the top calls up first; `null` sends none. None to begin with. */
  setProgram(program: MidiProgram | null): void;
  /** Sends no notes, letting go of those held, or sends them again from the next to start. Not muted to begin with. */
  setMuted(muted: boolean): void;
}

const byStart = (a: PhraseNote, b: PhraseNote) => a[0] - b[0] || a[1] - b[1];
const sorted = (loop: PatternLoop): PhraseNote[] => [...loop.notes].sort(byStart);
const validByte = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 127;
const modsOf = (loop: PatternLoop): Mod[] =>
  Array.isArray(loop.mods)
    ? loop.mods.filter((m) => Array.isArray(m) && Number.isFinite(m[0])).sort((a, b) => a[0] - b[0])
    : [];

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
  /** The port those times are of. */
  let timesFor: MidiPort | null = null;
  /** What the lanes' values are sent as, and the value last sent on each CC since the last release. */
  let ccs: CcLookup | null = null;
  const ccSent = new Map<number, number>();
  /** Per CC, the value in effect from changes whose time has gone, still to be sent (`sendMod`). */
  const behind = new Map<number, number>();
  /** Per CC, the latest time a value was handed to the port for, on this port and channel. */
  const ccAt = new Map<number, number>();
  /** The patch a run from the top calls up, and the time nothing on the channel goes before while it loads. */
  let program: MidiProgram | null = null;
  let holdUntil = -Infinity;
  /** Per pitch held, how long its note-on was held back for the patch. */
  const lagOf = new Map<number, number>();
  /** No notes are sent, the run going on without them. */
  let muted = false;

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
    const due = free !== undefined && free > when ? free : when;
    const at = Math.max(holdUntil, due);
    held.set(n, (held.get(n) ?? 0) + 1);
    downAt.set(n, at);
    if (at > due) lagOf.set(n, at - due);
    else lagOf.delete(n);
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
    // Never before its note-on, which a tempo move since it was sent could otherwise put it. One held back for the
    // whole of its length while a patch loads keeps that length rather than ending as it starts; one that ends after
    // the hold ends where it did, so the note after it is not overlapped (a slide on a mono synth).
    const down = downAt.get(n) ?? at;
    const lag = lagOf.get(n) ?? 0;
    lagOf.delete(n);
    offAt(n, at > down ? at : Math.max(down, at + lag));
  }

  /** Lets go of every note held, now (one whose note-on is still on its way, at its own time), keeping the run. */
  function letGo() {
    const now = clock.now();
    held.forEach((_, n) => {
      out([0x80 | channel, n, 0], now);
      const down = downAt.get(n) ?? now;
      if (down > now) offAt(n, down);
    });
    held.clear();
    downAt.clear();
    lagOf.clear();
    offs.length = 0;
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
    lagOf.clear();
    ccSent.clear();
    offs.length = 0;
    dirty = false;
    cur = null;
    next = undefined;
    anchor = null;
  }

  /** A run from `beat` of loop `index` (both 0 but for a MIDI Continue, t-91): nothing before that beat is sent. */
  function begin(loop: PatternLoop, index: number, beat: number) {
    release();
    cur = { index, start: 0, loop, notes: sorted(loop), i: 0, mods: modsOf(loop), k: 0 };
    next = undefined;
    starts.clear();
    starts.set(index, 0);
    playing = index;
    sentTo = beat;
    resync = false;
    // Started part-way, the clock waits for the next loop's start, as it does when turned on mid-run.
    startG = clockOn && beat === 0 ? 0 : null;
    if (index === 0 && beat === 0) callUp();
  }

  /** The patch, now, after the release before it, and nothing on the channel until it has loaded. */
  function callUp() {
    if (!port || !program) return;
    const now = clock.now();
    const { program: pc, msb, lsb } = program;
    if (msb !== undefined) out([0xb0 | channel, BANK_MSB, msb], now);
    if (lsb !== undefined) out([0xb0 | channel, BANK_LSB, lsb], now);
    out([0xc0 | channel, pc], now);
    holdUntil = now + PROGRAM_LEAD_MS;
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
      mods: loop === c.loop ? c.mods : modsOf(loop),
      k: 0,
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

  /**
   * Start at loop `c`'s start, if it is still to come and (unless its notes are sent again) none of them has been sent:
   * Start goes before the first note. Else at the next loop's, which `turn` arms.
   */
  function arm(c: Cursor | null, resent: boolean) {
    startG =
      clockOn &&
      !started &&
      c &&
      (resent || sentTo <= c.start) &&
      (!anchor || msAt(anchor, c.start) >= clock.now())
        ? c.start
        : null;
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
      // A Start whose beat has passed (the timer was held up) would put the hardware's downbeat mid-loop. One with a
      // Stop or pulses of the clock before still to land after it (Play straight after Stop) would have the hardware
      // count those pulses as this run's, or start late. Either waits for the next loop's start.
      if (late || due < pulseMs || due < stopMs) return;
      // With the first note, if a patch loading holds it back: Start is the hardware's downbeat.
      const at = Math.max(now, due, holdUntil);
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
      arm(cur, false);
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
    // The lanes from the start: what is passed sends only the value in effect, which goes whatever was last sent.
    cur = { ...c, loop, notes, i, mods: modsOf(loop), k: 0 };
    ccSent.clear();
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
        c.k = 0;
      } else sentTo = Math.max(sentTo, from);
      rewind = false;
    }
    const to = beatAt(a, now + LOOKAHEAD_MS);
    for (;;) {
      // The next note to start, and the lanes' next change, crossing into the loops after while they start inside the
      // window.
      let on: { g: number; note: PhraseNote } | null = null;
      let mod: { g: number; set: ControlValues | null } | null = null;
      while (cur) {
        const c: Cursor = cur;
        if (c.i < c.notes.length && c.notes[c.i][0] < c.loop.beats)
          on = { g: c.start + c.notes[c.i][0], note: c.notes[c.i] };
        if (ccs && c.k < c.mods.length && c.mods[c.k][0] < c.loop.beats)
          mod = { g: c.start + c.mods[c.k][0], set: c.mods[c.k][1] };
        if (on || mod) break;
        if (c.start + c.loop.beats >= to || !turn()) break;
      }
      if (on && on.g >= to) on = null;
      if (mod && mod.g >= to) mod = null;
      const off = offs.length > 0 && offs[0].g < to ? offs[0] : null;
      let t = tick();
      if (t && t.g >= to) t = null;
      if (!on && !off && !t && !mod) break;
      // At the same beat a let-go goes first, as in the player, then the clock, then the lanes, then the note: Start
      // before the first note, Stop after the last let-go, a CC before the note it shapes.
      if (!(mod && (!on || mod.g <= on.g) && (!t || mod.g < t.g) && (!off || mod.g < off.g)))
        catchUp(now);
      if (off && (!on || off.g <= on.g) && (!t || off.g <= t.g) && (!mod || off.g <= mod.g)) {
        offs.shift();
        noteOff(off.n, Math.max(now, msAt(a, off.g)));
        continue;
      }
      if (t && (!on || t.g <= on.g) && (!mod || t.g <= mod.g)) {
        sendTick(t, a, now);
        continue;
      }
      if (mod && (!on || mod.g <= on.g)) {
        sendMod(cur!, mod.g, mod.set, a, now);
        continue;
      }
      const c = cur!;
      c.i++;
      const [b, n, len, v] = on!.note;
      if (on!.g < sentTo || !validByte(n) || !(len > 0)) continue;
      sentTo = on!.g;
      const at = msAt(a, on!.g);
      // Muted, too late, or a velocity the synth would play silent (MIDI would play it at 1).
      if (muted || at < now - LATE_MS || (v !== undefined && Math.round(v * 127) < 1)) continue;
      noteOn(n, v, Math.max(now, at));
      owe({ g: c.start + b + len, n });
    }
    catchUp(now);
    sentTo = Math.max(sentTo, to);
  }

  /** A CC's value, unless it is the value last sent on it. */
  function ccOut(cc: number, v: number, when: number) {
    if (ccSent.get(cc) === v) return;
    // Not while a patch loads, which would set it back.
    const at = Math.max(when, holdUntil);
    ccSent.set(cc, v);
    out([0xb0 | channel, cc, v], at);
    // A value handed over for later on this CC (before an edit, or a silence) can't be taken back: this one goes again
    // at that time too, after it, so the hardware ends on this one. Changes come in time order, so the latest wins.
    const queued = ccAt.get(cc);
    if (queued !== undefined && queued > at) out([0xb0 | channel, cc, v], queued);
    else ccAt.set(cc, at);
  }

  /**
   * The lanes' change at beat `g` of loop `c`, as CCs. One whose time has gone (an edit, a CC given mid-run, a change
   * of port, a held-up timer) is gathered per CC into `behind`, so only the value in effect on each goes, now, and
   * not a burst of the ones before it: a CC is a setting, better late than left wrong. One still to come goes at its
   * time.
   */
  function sendMod(c: Cursor, g: number, set: ControlValues | null, a: Anchor, now: number) {
    c.k++;
    if (!set || !ccs) return;
    const due = msAt(a, g);
    if (due <= now) {
      for (const [cc, v] of ccs(set)) behind.set(cc, v);
      return;
    }
    catchUp(now);
    for (const [cc, v] of ccs(set)) ccOut(cc, v, due);
  }

  /** The values in effect gathered in `behind`, sent now: before anything later is. */
  function catchUp(now: number) {
    behind.forEach((v, cc) => ccOut(cc, v, now));
    behind.clear();
  }

  function message(m: SchedulerMessage) {
    if (!isPattern(m)) {
      if (m.type === 'tempo' && 'bpm' in m) tempo(m.bpm);
      else if (m.type === 'panic') release();
      return;
    }
    switch (m.type) {
      case 'pattern': {
        if (!playable(m.loop)) return;
        const { index, beat } = m;
        begin(
          m.loop,
          typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : 0,
          typeof beat === 'number' && Number.isFinite(beat) && beat > 0 ? beat : 0
        );
        return;
      }
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
    // A clock that was running starts again at the loop notes are placed from, if it is still to come: its notes are
    // sent again after the silence, so after Start.
    if (startG === null) arm(cur, true);
    resync = true;
    rewind = true;
  }

  function setPort(p: MidiPort | null, ch: number) {
    if (p === port && ch === channel) return;
    const same = p === port;
    silence(same);
    port = p;
    // What was handed to another port or channel holds back nothing here, nor a patch called up there.
    ccAt.clear();
    holdUntil = -Infinity;
    // What was handed to another port holds nothing back on this one; what is still on its way on this one does.
    if (p && p !== timesFor) {
      startMs = stopMs = pulseMs = offMs = -Infinity;
      timesFor = p;
    }
    channel = Math.min(15, Math.max(0, Math.round(ch)));
  }

  function setCcs(lookup: CcLookup | null) {
    if (lookup === ccs) return;
    ccs = lookup;
    // Each lane's CC is sent again from the value in effect, whatever was last sent on it.
    ccSent.clear();
    if (cur) cur.k = 0;
  }

  function setProgram(p: MidiProgram | null) {
    // A program that doesn't read sends nothing rather than a byte the hardware would misread.
    program =
      p &&
      validByte(p.program) &&
      (p.msb === undefined || validByte(p.msb)) &&
      (p.lsb === undefined || validByte(p.lsb))
        ? p
        : null;
  }

  function setMuted(on: boolean) {
    if (on === muted) return;
    muted = on;
    if (on) letGo();
  }

  function setClock(on: boolean) {
    if (on === clockOn) return;
    clockOn = on;
    stop(clock.now());
    // Turned on mid-run, at the start of the next loop.
    arm(cur, false);
  }

  return {
    message,
    event,
    pump,
    release: () => release(),
    silence: () => silence(),
    setPort,
    setClock,
    setCcs,
    setProgram,
    setMuted,
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
