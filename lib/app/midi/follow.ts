/**
 * Following an external MIDI clock (`f-midi-hardware-lead` t-91): the sequencer falls in with a drum machine or a DAW
 * that is already running, rather than always being the master.
 *
 * It reads the real-time messages of one input, each with the `timeStamp` it arrived at (`performance.now()` time):
 *
 * - **Clock** (0xF8, 24 a beat). The tempo is the pulses' spacing, by a least-squares line through the last beat of
 *   them, so the 1 ms or so a USB timestamp jitters by averages out. It is taken as the tempo only once it has moved
 *   more than {@link TEMPO_STEP}: a tempo sent is a message to the player and a move of MIDI out's clock, not a thing
 *   to send on every pulse.
 * - **Start** (0xFA) plays from beat 0 on the next pulse, **Continue** (0xFB) from where the clock's count is: where it
 *   stopped, or where a **Song Position Pointer** (0xF2) put it while stopped (a DAW sends one before Continue when it
 *   has been moved). **Stop** (0xFC) stops. Clock alone starts nothing.
 * - **A clock gone quiet** for {@link DROPOUT_BEATS} beats while playing counts as Stop (`check`, on a timer).
 *
 * **Phase.** A tempo alone drifts: the player's beat is compared with the clock's on every beat, and the difference is
 * made up over the beat after through the tempo sent ({@link GAIN}, at most {@link MAX_NUDGE} either way). The player's
 * beat comes from its own `loop` events, with when each event's frame is heard (`loop`), so what is matched to the
 * pulses is what is heard. Only a run this started is held to the clock's beat: one started from the page's own Play
 * while following plays at the clock's tempo, from wherever it was started.
 *
 * Pure: no timers, no Web MIDI. The page (`use-clock-in.ts`) feeds it the input and the run, and gives it the
 * sequencer's transport.
 */
import { CLOCK, PPQN, START, STOP } from '@/lib/app/midi/scheduler';
import type { LoopEvent } from '@/lib/app/synths/audio/pattern-player';

/** MIDI's Continue and Song Position Pointer, beside the clock, Start and Stop MIDI out sends. */
export const CONTINUE = 0xfb;
export const SONG_POSITION = 0xf2;
/** Whether a message is one the follower reads: the clock, Start, Continue, Stop or a Song Position Pointer. */
export const isClockMessage = (status: number): boolean =>
  status === CLOCK ||
  status === START ||
  status === CONTINUE ||
  status === STOP ||
  status === SONG_POSITION;

/** The pulses whose spacing is the tempo: a beat's worth. */
export const WINDOW = PPQN;
/** The fewest pulse spacings a tempo is read from: a quarter of a beat. */
export const MIN_SPACINGS = 6;
/** The tempo read moves this far (in BPM) before it is taken as the tempo. */
export const TEMPO_STEP = 0.25;
/** A clock quiet for this many beats while playing counts as Stop. */
export const DROPOUT_BEATS = 2;
/** The share of the beat error made up over the next beat. */
export const GAIN = 0.75;
/** The most the tempo is moved off the clock's to make up the beat error: a tenth. */
export const MAX_NUDGE = 0.1;
/** A beat's length before the clock's tempo is known, for the dropout: 120 BPM. */
const DEFAULT_BEAT_MS = 500;

/** What the follower drives: the sequencer's transport. */
export interface ClockTransport {
  /**
   * Play from `beat`, counted from the pattern's start across its loops, at `bpm` (`null`: the clock's tempo is not
   * known yet, so the pattern's own).
   */
  start(beat: number, bpm: number | null): void;
  stop(): void;
  /** The player's tempo, moved without editing the pattern. */
  tempo(bpm: number): void;
}

export interface ClockFollower {
  /** A real-time message from the input followed: its bytes, and when it arrived. Others are ignored. */
  input(data: ArrayLike<number>, ms: number): void;
  /** On a timer: a clock quiet for {@link DROPOUT_BEATS} beats while playing counts as Stop. */
  check(now: number): void;
  /** The sequencer sent a `pattern`: a run has started. It is held to the clock if this follower asked for it. */
  started(): void;
  /** The run stopped: `stopPattern` sent, or `patternEnd` reported. */
  stopped(): void;
  /** A `loop` event of the run playing, and when its frame is heard. */
  loop(e: LoopEvent, heardMs: number): void;
  /** The clock's tempo, or null before it is known. */
  bpm(): number | null;
  /**
   * Where the clock is at `now`, in beats from the song's start, while a run it started plays: null otherwise. A run
   * started again meanwhile (another pattern loaded) starts there, so it stays in time with the clock.
   */
  beat(now: number): number | null;
  /** The next run to start is started from clock beat `beat`, and is held to the clock from there. */
  rejoin(beat: number): void;
  /** Drives `t` from now on (none: nothing is driven). */
  drive(t: ClockTransport | null): void;
}

/** Where the player was: beat `g` of the clock's count, heard at `ms`, moving at `bpm`. */
interface Anchor {
  g: number;
  ms: number;
  bpm: number;
}

/** The slope of a least-squares line through `ys` at 0, 1, 2…: the average spacing, jitter averaged out. */
function spacing(ys: readonly number[]): number {
  const n = ys.length;
  const mx = (n - 1) / 2;
  let my = 0;
  for (const y of ys) my += y;
  my /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (ys[i] - my);
    den += (i - mx) * (i - mx);
  }
  return num / den;
}

export function createClockFollower(to: ClockTransport | null = null): ClockFollower {
  let transport = to;
  /** The last pulses' times. */
  const times: number[] = [];
  let lastPulse: number | null = null;
  /** The tempo taken, and the nudge the last beat's error asked for. */
  let tempo: number | null = null;
  let nudge = 0;
  /** The tempo last sent to the player. */
  let sent: number | null = null;
  /** `armed`: a Start or Continue is waiting for its first pulse. */
  let state: 'stopped' | 'armed' | 'running' = 'stopped';
  /** The clock's count of pulses from the song's start: the next pulse is beat `count / PPQN`. */
  let count = 0;
  /** The beat a start was asked for, until the run it starts begins. */
  let asked: number | null = null;
  /** A run plays, and whether it is held to the clock's beat: from which beat it was started, if so. */
  let playing = false;
  let lockedFrom: number | null = null;
  const anchors: Anchor[] = [];
  /** Where each loop of the run starts on the clock's count, and how long it is. */
  const starts = new Map<number, number>();
  const lengths = new Map<number, number>();

  const beatMs = () => (tempo ? 60000 / tempo : DEFAULT_BEAT_MS);

  function send(bpm: number) {
    if (!(Number.isFinite(bpm) && bpm > 0)) return;
    // Exactly the same tempo is not sent again; any other is, as a nudge is small by design.
    if (sent !== null && Math.abs(bpm - sent) < 1e-6) return;
    sent = bpm;
    transport?.tempo(bpm);
  }

  /** The player's beat heard at `ms`, on the clock's count: from the event in effect then (the first, before it). */
  function playerBeat(ms: number): number | null {
    let a: Anchor | undefined;
    for (const x of anchors) {
      if (x.ms > ms && a) break;
      a = x;
    }
    return a ? a.g + ((ms - a.ms) * a.bpm) / 60000 : null;
  }

  function measure(ms: number) {
    // A clock starting again after a gap: the spacing across the gap is no tempo.
    if (lastPulse !== null && ms - lastPulse > DROPOUT_BEATS * beatMs()) times.length = 0;
    lastPulse = ms;
    times.push(ms);
    if (times.length > WINDOW + 1) times.shift();
    if (times.length <= MIN_SPACINGS) return;
    const bpm = 60000 / (spacing(times) * PPQN);
    if (!(Number.isFinite(bpm) && bpm > 0)) return;
    if (tempo === null || Math.abs(bpm - tempo) > TEMPO_STEP) tempo = bpm;
  }

  function pulse(ms: number) {
    measure(ms);
    if (state === 'armed') {
      state = 'running';
      asked = count / PPQN;
      nudge = 0;
      transport?.start(asked, tempo);
      count++;
      return;
    }
    if (state === 'running') {
      // On the beat: how far the player is from it, made up over the beat to come.
      if (count % PPQN === 0 && lockedFrom !== null) {
        const heard = playerBeat(ms);
        if (heard !== null) {
          const err = count / PPQN - heard;
          nudge = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, GAIN * err));
        }
      }
      count++;
    }
    if (playing && tempo !== null) send(tempo * (1 + (lockedFrom !== null ? nudge : 0)));
  }

  function halt() {
    if (state === 'stopped') return;
    state = 'stopped';
    transport?.stop();
  }

  return {
    input(data, ms) {
      const status = data[0];
      if (status === CLOCK) pulse(ms);
      else if (status === START) {
        count = 0;
        state = 'armed';
      } else if (status === CONTINUE) state = 'armed';
      else if (status === STOP) halt();
      else if (status === SONG_POSITION && state === 'stopped') {
        // In sixteenths: six pulses each.
        const lsb = data[1] ?? 0;
        const msb = data[2] ?? 0;
        count = ((lsb & 0x7f) | ((msb & 0x7f) << 7)) * (PPQN / 4);
      }
    },
    check(now) {
      if (state === 'running' && lastPulse !== null && now - lastPulse > DROPOUT_BEATS * beatMs())
        halt();
    },
    started() {
      playing = true;
      lockedFrom = asked;
      asked = null;
      anchors.length = 0;
      starts.clear();
      lengths.clear();
      sent = null;
      nudge = 0;
    },
    stopped() {
      playing = false;
      lockedFrom = null;
      anchors.length = 0;
      starts.clear();
      lengths.clear();
    },
    loop(e, heardMs) {
      if (lockedFrom === null) return;
      if (!starts.has(e.index)) {
        const prev = starts.get(e.index - 1);
        // The run's first loop starts where the clock was when it was asked for, less the beat it started from.
        const at =
          prev === undefined ? lockedFrom - e.beat : prev + (lengths.get(e.index - 1) ?? e.beats);
        starts.set(e.index, at);
        starts.forEach((_, k) => {
          if (k < e.index - 4) starts.delete(k);
        });
      }
      lengths.set(e.index, e.beats);
      lengths.forEach((_, k) => {
        if (k < e.index - 4) lengths.delete(k);
      });
      anchors.push({ g: starts.get(e.index)! + e.beat, ms: heardMs, bpm: e.bpm });
      if (anchors.length > 16) anchors.shift();
    },
    bpm: () => tempo,
    beat(now) {
      if (state !== 'running' || lockedFrom === null || lastPulse === null) return null;
      // The pulse last counted, and the time since it.
      return (count - 1) / PPQN + Math.max(0, now - lastPulse) / beatMs();
    },
    rejoin(beat) {
      asked = beat;
    },
    drive(t) {
      transport = t;
    },
  };
}
