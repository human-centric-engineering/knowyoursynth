/**
 * The pattern player: plays the sequencer's loops in the synth, sample-accurately (`f-step-sequencer` t-79).
 *
 * A riff (`phrase`) is one fixed list of notes, played round and round by the voice itself. A pattern differs each time
 * round (probability, random directions, conditions), and someone editing a step wants to hear it the next time the
 * playhead gets there. So the page compiles one loop at a time (`compileLoop`, t-78) and this player takes it:
 *
 * - `pattern` starts from beat 0 with the first loop.
 * - `patternNext` queues the loop after this one, swapped in on the boundary sample. With nothing queued, the loop
 *   plays again, so a page that is late never leaves a gap. `loop: null` ends the pattern at the boundary instead.
 * - `patternEdit` replaces what is still to play of this loop, from the playhead on, without a restart. A loop queued
 *   before the edit is dropped, since it would undo the edit: the page queues a fresh one.
 * - `tempo` moves it, as it moves a riff. `stopPattern` lets go of every note it holds.
 *
 * It wraps the synth rather than living in each voice, so mono, poly and dual synths play it the same way: it sends
 * them notes, and splits each `process` call at the samples where a note falls. With no pattern playing, `process`
 * and `handle` pass straight through, which keeps riffs, the sound map and the goldens exactly as they were.
 *
 * A loop can carry mod lanes as `params`: the whole voice's settings from a beat on, which the page works out from the
 * panel with the lanes' values in it (`f-step-sequencer` t-82). They are sent to the synth on their sample, as a knob
 * turned at that moment is. The page's own `params` are the panel's, kept as the rest the player goes back to when a
 * step sets nothing, when the pattern stops, and when an edit takes the lanes away. While a lane holds a control, the
 * panel's are kept and not sent, so a knob turned then does not undo the lane until the page's edit says how.
 *
 * It reports `loop` when a loop starts (so the page compiles the next) and when the tempo or an edit moves the playhead,
 * with the frame it applies from, so the page can draw the playhead from the audio clock ({@link createPlayhead}).
 */
import type { EngineParams, PhraseNote } from '@/lib/app/synths/contract';
import type { Synth, SynthEventHandler, SynthMessage } from '@/lib/app/synths/audio/dsp-core';
import { byBeat, noteEvents, type NoteEvent } from '@/lib/app/synths/audio/note-events';

/**
 * From `beat` of the loop on, the synth plays with these settings: the panel with the mod lanes' values in it. `null`
 * puts back the panel's own (the last `params` the page sent).
 */
export type ParamChange = [beat: number, p: EngineParams | null];

/**
 * One pass through a pattern, as `compileLoop` returns it: notes in beats from the loop's start, and its length. With
 * mod lanes, `params` says where the voice's settings change, in order.
 */
export interface PatternLoop {
  notes: PhraseNote[];
  beats: number;
  params?: ParamChange[];
}

/** A settings change, timed to its sample. */
interface ParamEvent {
  b: number;
  t: number;
  p: EngineParams | null;
}

/** What the page sends to play a pattern. */
export type PatternMessage =
  | { type: 'pattern'; loop: PatternLoop; bpm: number }
  | { type: 'patternNext'; loop: PatternLoop | null }
  | { type: 'patternEdit'; loop: PatternLoop }
  | { type: 'stopPattern' };

/**
 * Where the pattern is, from frame `frame` on: loop `index` (from 0), at `beat` of its `beats`, at `bpm`. `start` is
 * set when the loop has just begun, which is the page's cue to queue the next one.
 */
export interface LoopEvent {
  type: 'loop';
  index: number;
  start: boolean;
  beat: number;
  beats: number;
  bpm: number;
  /** The frame of the audio clock this applies from: the synth's own count, which the engine moves onto the context's. */
  frame: number;
}

/**
 * What the player reports. `patternEnd`: the pattern has stopped without the page stopping it, because it was told to
 * end (`patternNext` with no loop) and has played out, or because of a `panic` (which the engine sends on suspend).
 */
export type PatternEvent = LoopEvent | { type: 'patternEnd' };

/** The beat the playhead is on at frame `now`, from the `loop` event in effect then: within the loop, so it never runs past. */
export function beatAt(e: LoopEvent, now: number, sr: number): number {
  const beat = e.beat + ((now - e.frame) * e.bpm) / (60 * sr);
  return Math.min(Math.max(beat, 0), e.beats);
}

/** Where the playhead is: loop `index`, at `beat` of its `beats`. */
export interface PlayheadPosition {
  index: number;
  beat: number;
  beats: number;
}

/**
 * The page's playhead. A `loop` event is posted when the audio is rendered, which is ahead of when it is heard by the
 * output latency, so the newest event is not yet the one in effect: a new loop's start would put the playhead on beat 0
 * while the end of the last loop is still sounding. This keeps the events it is given and reads each one only from
 * its frame on. `at(engine.frame, sampleRate)` is the playhead now; `clear` when the pattern stops.
 */
export function createPlayhead(): {
  push(e: LoopEvent): void;
  at(now: number, sr: number): PlayheadPosition | null;
  clear(): void;
} {
  const events: LoopEvent[] = [];
  return {
    push(e) {
      events.push(e);
    },
    at(now, sr) {
      while (events.length > 1 && events[1].frame <= now) events.shift();
      const e = events[0];
      return e ? { index: e.index, beat: beatAt(e, now, sr), beats: e.beats } : null;
    },
    clear() {
      events.length = 0;
    },
  };
}

/** Which voice settings play: mono, poly or dual. A change between them lets go of every held note. */
export const voiceMode = (p: EngineParams): 'mono' | 'poly' | 'dual' =>
  p.dual ? 'dual' : p.poly ? 'poly' : 'mono';

const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** A note from the page: a start at or after beat 0, a key, a length above 0, and a velocity if it has one. */
function playableNote(x: unknown): boolean {
  if (!Array.isArray(x)) return false;
  const a: readonly unknown[] = x;
  const [b, n, len, v] = a;
  return (
    isNumber(b) && b >= 0 && isNumber(n) && isNumber(len) && len > 0 && (v == null || isNumber(v))
  );
}

/** A settings change from the page: a beat at or after 0, and settings or `null`. */
function playableChange(x: unknown): boolean {
  if (!Array.isArray(x)) return false;
  const a: readonly unknown[] = x;
  return isNumber(a[0]) && a[0] >= 0 && (a[1] === null || (typeof a[1] === 'object' && !!a[1]));
}

/** Whether a loop from the page can be played: a length, and notes (and settings changes) that can be played. */
function playable(loop: PatternLoop | null | undefined): loop is PatternLoop {
  return (
    !!loop &&
    Number.isFinite(loop.beats) &&
    loop.beats > 0 &&
    Array.isArray(loop.notes) &&
    loop.notes.every(playableNote) &&
    (loop.params === undefined || (Array.isArray(loop.params) && loop.params.every(playableChange)))
  );
}

/** A loop's settings changes, in order, not yet timed. */
const paramEvents = (loop: PatternLoop): ParamEvent[] =>
  (loop.params ?? []).map(([b, p]) => ({ b, t: 0, p })).sort((x, y) => x.b - y.b);

/** The synth, able to play patterns as well. */
export function withPatterns(synth: Synth, sr: number, onEvent: SynthEventHandler | null): Synth {
  /** The loop playing: its own events (`base`, played again when nothing is queued) and those still to come. */
  let cur: {
    base: NoteEvent[];
    evs: NoteEvent[];
    beats: number;
    len: number;
    /** Its settings changes (mod lanes), and the next of them to make. */
    pev: ParamEvent[];
  } | null = null;
  /** The loop after this one: events, `null` to end, `undefined` to play this one again. */
  let next: { base: NoteEvent[]; beats: number; pev: ParamEvent[] } | null | undefined;
  let pi = 0;
  /** The panel's settings, as the page last sent them: what the synth goes back to when no lane sets anything. */
  let rest: EngineParams | null = null;
  /** The lane settings the synth has now, or `null` while it has the panel's. */
  let applied: EngineParams | null = null;
  /**
   * What a loop before this one still owes (a slide or a tie into this one): its events from `ci` on, which fall `cb`
   * beats before their beat in this loop. Kept as they were rather than copied in, so turning over allocates nothing.
   */
  let carry: NoteEvent[] | null = null;
  let ci = 0,
    cb = 0;
  let idx = 0, // the next event of `cur.evs` to fire
    pos = 0, // the next sample to play, from the loop's start
    index = 0, // which loop this is
    bpm = 120,
    frames = 0, // samples played since the synth was made
    announce: boolean | null = null; // a `loop` event is owed: true at a loop's start, false for a moved playhead
  /** How many of the pattern's notes hold each key: two notes of one pitch overlap on a slide or a tie. */
  const held = new Map<number, number>();
  // Reused for every note, so a note sent to the synth makes no message object on the audio thread.
  const down = { type: 'noteOn' as const, n: 0, v: 0 };
  const up = { type: 'noteOff' as const, n: 0 };
  let mode = '';

  const spb = () => (60 / bpm) * sr;
  const time = (evs: { b: number; t: number }[]) => {
    const s = spb();
    for (const e of evs) e.t = Math.round(e.b * s);
  };
  const length = (beats: number) => Math.max(1, Math.round(beats * spb()));
  const carrying = () => !!carry && ci < carry.length;
  const carryTime = (s: number) => Math.round((carry![ci].b - cb) * s);

  /** A key goes down, or is let go once the last note holding it ends. */
  function press(e: NoteEvent) {
    const k = held.get(e.n) ?? 0;
    if (e.on) {
      held.set(e.n, k + 1);
      down.n = e.n;
      down.v = e.v;
      synth.handle(down);
    } else if (k > 0) {
      held.set(e.n, k - 1);
      if (k === 1) {
        up.n = e.n;
        synth.handle(up);
      }
    }
  }

  /** Settings to the synth. One that changes it between mono, poly and dual lets go of the pattern's notes first. */
  function setParams(p: EngineParams) {
    const now = voiceMode(p);
    if (now !== mode && mode) release();
    mode = now;
    synth.handle({ type: 'params', p });
  }

  /**
   * A lane's settings, or (`null`) the panel's back. Not before the page has sent the panel's: with nothing to go back
   * to, a lane's settings would stay on the synth after it lets go.
   */
  function apply(p: EngineParams | null) {
    if (p && rest) {
      applied = p;
      setParams(p);
    } else if (applied) {
      applied = null;
      if (rest) setParams(rest);
    }
  }

  function release() {
    held.forEach((k, n) => {
      if (k > 0) {
        up.n = n;
        synth.handle(up);
      }
    });
    held.clear();
  }

  function stop(silent: boolean) {
    if (!cur) return;
    cur = null;
    next = undefined;
    carry = null;
    announce = null;
    apply(null);
    release();
    if (!silent && onEvent) onEvent({ type: 'patternEnd' });
  }

  function start(loop: PatternLoop, tempo: number) {
    stop(true);
    synth.handle({ type: 'stopPhrase' });
    if (Number.isFinite(tempo) && tempo > 0) bpm = tempo;
    const base = noteEvents(loop.notes);
    time(base);
    const pev = paramEvents(loop);
    time(pev);
    cur = { base, evs: base, beats: loop.beats, len: length(loop.beats), pev };
    next = undefined;
    pi = 0;
    idx = 0;
    pos = 0;
    index = 0;
    announce = true;
  }

  /** What is left of this loop becomes the edited loop's notes that start from the playhead on. */
  function edit(loop: PatternLoop) {
    if (!cur) return;
    const s = spb();
    const base = noteEvents(loop.notes);
    time(base);
    // A note sounding now keeps the let-go it had: dropping it would leave the note held until Stop. The edit's own
    // notes come in only from the playhead on, let-goes and all, so none lets go of a note it did not start.
    const owed = cur.evs.slice(idx).filter((e) => !e.on && Math.round(e.st * s) < pos);
    cur.base = base;
    cur.evs = owed.concat(base.filter((e) => Math.round(e.st * s) >= pos)).sort(byBeat);
    cur.beats = loop.beats;
    cur.len = length(loop.beats);
    idx = 0;
    if (pos >= cur.len) pos = cur.len;
    // The settings the edited loop has at the playhead come in now: what a lane holds may have changed, or gone.
    cur.pev = paramEvents(loop);
    time(cur.pev);
    pi = 0;
    while (pi < cur.pev.length && cur.pev[pi].t <= pos) pi++;
    apply(pi > 0 ? cur.pev[pi - 1].p : null);
    // The loop queued for after this one was compiled before the edit and would undo it: dropped, so the edited loop
    // plays again unless the page queues a fresh one. A pattern told to end still ends.
    if (next) next = undefined;
    announce = announce ?? false;
  }

  function tempo(value: number) {
    if (!(value > 0)) return;
    bpm = value;
    if (!cur) return;
    const old = cur.len;
    time(cur.base);
    time(cur.evs);
    time(cur.pev);
    cur.len = length(cur.beats);
    pos = Math.min(Math.round((pos * cur.len) / old), cur.len - 1);
    announce = announce ?? false;
  }

  /** The loop boundary: the next loop comes in, and what this one still owes (a note held over the end) is carried. */
  function turn() {
    const c = cur!;
    if (next === null) {
      stop(false);
      return;
    }
    const owes = idx < c.evs.length;
    if (owes && carrying()) {
      // Still owed from the loop before as well (a note longer than a loop): both, on this loop's beats. Rare, so it may
      // allocate.
      const older = carry!.slice(ci).map((e) => ({ ...e, b: e.b - cb, st: e.st - cb }));
      carry = older.concat(c.evs.slice(idx)).sort(byBeat);
      ci = 0;
      cb = c.beats;
    } else if (owes) {
      carry = c.evs;
      ci = idx;
      cb = c.beats;
    } else if (carrying()) {
      cb += c.beats;
    } else {
      carry = null;
    }
    if (next) {
      c.base = next.base;
      c.beats = next.beats;
      c.pev = next.pev;
    }
    next = undefined;
    time(c.base);
    time(c.pev);
    pi = 0;
    // A loop whose lanes set nothing from its start (none it can play, or a pattern of the chain without lanes) starts
    // on the panel's settings, not on what the loop before left set.
    if (c.pev.length === 0 || c.pev[0].t > 0) apply(null);
    c.evs = c.base;
    c.len = length(c.beats);
    idx = 0;
    pos = 0;
    index++;
    announce = true;
  }

  /** Everything due at `pos`, and the boundary when it is reached. */
  function fire() {
    if (cur && pos >= cur.len) turn();
    if (!cur) return;
    if (announce !== null && onEvent) {
      onEvent({
        type: 'loop',
        index,
        start: announce,
        beat: pos / spb(),
        beats: cur.beats,
        bpm,
        frame: frames,
      });
    }
    announce = null;
    // Settings first, so a note on the same sample plays with them.
    const pev = cur.pev;
    while (pi < pev.length && pev[pi].t <= pos) apply(pev[pi++].p);
    const evs = cur.evs;
    const s = spb();
    for (;;) {
      const le = idx < evs.length && evs[idx].t < cur.len ? evs[idx] : null;
      const lt = le ? le.t : Infinity;
      const ce = carrying() ? carry![ci] : null;
      const ct = ce ? carryTime(s) : Infinity;
      // At the same sample a let-go goes first, and then what the loop before owes.
      if (ce && ct <= pos && (ct < lt || (ct === lt && (!ce.on || le!.on)))) {
        ci++;
        press(ce);
      } else if (le && lt <= pos) {
        idx++;
        press(le);
      } else break;
    }
  }

  function handle(m: SynthMessage) {
    switch (m.type) {
      case 'pattern':
        if (playable(m.loop)) start(m.loop, m.bpm);
        return;
      case 'patternNext':
        if (cur && (m.loop === null || playable(m.loop)))
          next = m.loop && {
            base: noteEvents(m.loop.notes),
            beats: m.loop.beats,
            pev: paramEvents(m.loop),
          };
        return;
      case 'patternEdit':
        if (playable(m.loop)) edit(m.loop);
        return;
      case 'stopPattern':
        stop(true);
        return;
      case 'tempo':
        tempo(m.bpm);
        break;
      case 'phrase':
        stop(true);
        break;
      case 'panic':
        // Sent by the engine too (on suspend), so the page may not know: it is told the pattern has stopped.
        stop(false);
        break;
      case 'params':
        // The panel's settings. While a lane holds the synth they wait as the rest it goes back to.
        rest = m.p;
        if (applied) return;
        setParams(m.p);
        return;
      default:
        break;
    }
    synth.handle(m);
  }

  function process(out: Float32Array, n: number, outR?: Float32Array) {
    if (!cur) {
      synth.process(out, n, outR);
      frames += n;
      return;
    }
    let i = 0;
    while (i < n) {
      fire();
      if (!cur) {
        synth.process(out.subarray(i, n), n - i, outR && outR.subarray(i, n));
        frames += n - i;
        return;
      }
      // Up to the next note, the next owed from the loop before, or the boundary, whichever comes first.
      let due = cur.len;
      if (idx < cur.evs.length && cur.evs[idx].t < due) due = cur.evs[idx].t;
      if (pi < cur.pev.length && cur.pev[pi].t < due) due = cur.pev[pi].t;
      if (carrying()) due = Math.min(due, carryTime(spb()));
      const k = Math.min(Math.max(1, due - pos), n - i);
      if (i === 0 && k === n) synth.process(out, n, outR);
      else synth.process(out.subarray(i, i + k), k, outR && outR.subarray(i, i + k));
      pos += k;
      frames += k;
      i += k;
    }
  }

  return { handle, process };
}
