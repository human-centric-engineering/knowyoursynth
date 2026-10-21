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
 * - `patternEdit` replaces what is still to play of this loop, from the playhead on, without a restart.
 * - `tempo` moves it, as it moves a riff. `stopPattern` lets go of every note it holds.
 *
 * It wraps the synth rather than living in each voice, so mono, poly and dual synths play it the same way: it sends
 * them notes, and splits each `process` call at the samples where a note falls. With no pattern playing, `process`
 * and `handle` pass straight through, which keeps riffs, the sound map and the goldens exactly as they were.
 *
 * It reports `loop` when a loop starts (so the page compiles the next) and when the tempo or an edit moves the playhead,
 * with the frame it applies from, so the page can draw the playhead from the audio clock ({@link beatAt}).
 */
import type { PhraseNote } from '@/lib/app/synths/contract';
import type { Synth, SynthEventHandler, SynthMessage } from '@/lib/app/synths/audio/dsp-core';

/** One pass through a pattern, as `compileLoop` returns it: notes in beats from the loop's start, and its length. */
export interface PatternLoop {
  notes: PhraseNote[];
  beats: number;
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

/** What the player reports. `patternEnd`: a pattern told to end (`patternNext` with no loop) has played out. */
export type PatternEvent = LoopEvent | { type: 'patternEnd' };

/** The velocity a note without one plays at, as in a riff. */
const DEFAULT_VELOCITY = 0.85;

/** A note going down (`on`, velocity `v`) or up, at beat `b` of its loop and sample `t` at the current tempo. */
interface PatEvent {
  b: number;
  t: number;
  on: boolean;
  n: number;
  v: number;
}

/** The beat the playhead is on at frame `now`, from the last `loop` event: within the loop, so it never runs past. */
export function beatAt(e: LoopEvent, now: number, sr: number): number {
  const beat = e.beat + ((now - e.frame) * e.bpm) / (60 * sr);
  return Math.min(Math.max(beat, 0), e.beats);
}

/** A loop's notes as events, in order: by time, and a key let go before one goes down at the same moment (as a riff). */
function toEvents(loop: PatternLoop): PatEvent[] {
  const evs: PatEvent[] = [];
  for (const [b, n, len, v] of loop.notes) {
    evs.push({ b, t: 0, on: true, n, v: v == null ? DEFAULT_VELOCITY : v });
    evs.push({ b: b + len, t: 0, on: false, n, v: 0 });
  }
  return evs.sort(byTime);
}

function byTime(x: PatEvent, y: PatEvent): number {
  return x.b - y.b || (x.on ? 1 : 0) - (y.on ? 1 : 0);
}

/** Whether a loop from the page can be played: a length, and notes that are numbers. */
function playable(loop: PatternLoop | null | undefined): loop is PatternLoop {
  return (
    !!loop &&
    Number.isFinite(loop.beats) &&
    loop.beats > 0 &&
    Array.isArray(loop.notes) &&
    loop.notes.every((x) => Array.isArray(x) && x.every((y) => y == null || Number.isFinite(y)))
  );
}

/** The synth, able to play patterns as well. */
export function withPatterns(synth: Synth, sr: number, onEvent: SynthEventHandler | null): Synth {
  /** The loop playing: its own events (`base`, played again when nothing is queued) and those still to come. */
  let cur: { base: PatEvent[]; evs: PatEvent[]; beats: number; len: number } | null = null;
  /** The loop after this one: events, `null` to end, `undefined` to play this one again. */
  let next: { base: PatEvent[]; beats: number } | null | undefined;
  let idx = 0, // the next event of `cur.evs` to fire
    pos = 0, // the next sample to play, from the loop's start
    index = 0, // which loop this is
    bpm = 120,
    frames = 0, // samples played since the synth was made
    announce: boolean | null = null; // a `loop` event is owed: true at a loop's start, false for a moved playhead
  const held = new Set<number>();
  // Reused for every note, so playing a pattern allocates nothing per note on the audio thread.
  const down = { type: 'noteOn' as const, n: 0, v: 0 };
  const up = { type: 'noteOff' as const, n: 0 };
  let mode = '';

  const spb = () => (60 / bpm) * sr;
  const time = (evs: PatEvent[]) => {
    const s = spb();
    for (const e of evs) e.t = Math.round(e.b * s);
  };
  const length = (beats: number) => Math.max(1, Math.round(beats * spb()));

  function release() {
    for (const n of Array.from(held)) {
      up.n = n;
      synth.handle(up);
    }
    held.clear();
  }

  function stop(silent: boolean) {
    if (!cur) return;
    cur = null;
    next = undefined;
    announce = null;
    release();
    if (!silent && onEvent) onEvent({ type: 'patternEnd' });
  }

  function start(loop: PatternLoop, tempo: number) {
    stop(true);
    synth.handle({ type: 'stopPhrase' });
    if (Number.isFinite(tempo) && tempo > 0) bpm = tempo;
    const base = toEvents(loop);
    time(base);
    cur = { base, evs: base, beats: loop.beats, len: length(loop.beats) };
    next = undefined;
    idx = 0;
    pos = 0;
    index = 0;
    announce = true;
  }

  /** What is left of this loop becomes the edited loop's events from the playhead on. */
  function edit(loop: PatternLoop) {
    if (!cur) return;
    const base = toEvents(loop);
    time(base);
    // A note sounding now keeps the let-go it had: dropping it would leave the note held until Stop.
    const offs = cur.evs.slice(idx).filter((e) => !e.on && held.has(e.n));
    cur = {
      base,
      evs: offs.concat(base.filter((e) => e.t >= pos)).sort(byTime),
      beats: loop.beats,
      len: length(loop.beats),
    };
    idx = 0;
    if (pos >= cur.len) pos = cur.len;
    announce = announce ?? false;
  }

  function tempo(value: number) {
    if (!(value > 0)) return;
    bpm = value;
    if (!cur) return;
    const old = cur.len;
    time(cur.base);
    time(cur.evs);
    cur.len = length(cur.beats);
    pos = Math.min(Math.round((pos * cur.len) / old), cur.len - 1);
    announce = announce ?? false;
  }

  /** The loop boundary: the next loop comes in, with what is still owed from this one (a note held over the end). */
  function turn() {
    const c = cur!;
    if (next === null) {
      stop(false);
      return;
    }
    const nx = next ?? { base: c.base, beats: c.beats };
    next = undefined;
    // An event this loop placed past its end (a slide or a tie into the next bar) still happens, that far into the next.
    const carried = c.evs.slice(idx).map((e) => ({ ...e, b: e.b - c.beats, t: e.t - c.len }));
    time(nx.base);
    cur = {
      base: nx.base,
      evs: carried.length ? carried.concat(nx.base).sort(byTime) : nx.base,
      beats: nx.beats,
      len: length(nx.beats),
    };
    time(cur.evs);
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
    const evs = cur.evs;
    while (idx < evs.length && evs[idx].t <= pos && evs[idx].t < cur.len) {
      const e = evs[idx++];
      if (e.on) {
        held.add(e.n);
        down.n = e.n;
        down.v = e.v;
        synth.handle(down);
      } else if (held.has(e.n)) {
        held.delete(e.n);
        up.n = e.n;
        synth.handle(up);
      }
    }
  }

  function handle(m: SynthMessage) {
    switch (m.type) {
      case 'pattern':
        if (playable(m.loop)) start(m.loop, m.bpm);
        return;
      case 'patternNext':
        if (cur && (m.loop === null || playable(m.loop)))
          next = m.loop && { base: toEvents(m.loop), beats: m.loop.beats };
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
      case 'panic':
        stop(true);
        break;
      case 'params': {
        // A synth changing between mono, poly and dual drops what its voices held: let go of the pattern's notes first.
        const now = m.p.dual ? 'dual' : m.p.poly ? 'poly' : 'mono';
        if (now !== mode && mode) release();
        mode = now;
        break;
      }
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
      // Up to the next note or the boundary, whichever comes first.
      const due = idx < cur.evs.length ? Math.min(cur.evs[idx].t, cur.len) : cur.len;
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
