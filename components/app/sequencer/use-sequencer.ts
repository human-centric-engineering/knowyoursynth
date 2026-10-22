'use client';

/**
 * The sequencer's state and its transport (`f-step-sequencer` t-80): the pattern being edited, its Undo, and the loop
 * by loop conversation with the engine's pattern player (t-79).
 *
 * The page owns one of these, so the pattern outlives the module being closed, and the bar's play button and the
 * module's are one transport. It is handed the riff of the sound on the panel and imports it (`importPhrase`, t-78)
 * whenever that riff changes, so the module always opens holding the sound's riff.
 *
 * Playing, it compiles one loop at a time (`compileLoop`):
 * - Play compiles loop 0 and sends `pattern`.
 * - Each `loop` event with `start` set is the cue to compile the loop after it and queue it (`patternNext`). A pattern
 *   that does not loop queues its end (`null`) instead.
 * - An edit recompiles the loop playing now and sends it as `patternEdit`, so it is heard from the playhead on without
 *   a restart, then queues a fresh next loop: the player drops the one queued before the edit.
 *
 * A pattern can also be loaded whole (`load`): one of the user's saved patterns (`f-step-sequencer` t-81), or a riff
 * from any synth's library. `loaded` names what it holds, and `edited` says whether it has changed since it was loaded
 * or saved. The sound's own riff names nothing.
 *
 * Mod lanes (t-82) move panel controls step by step. The page hands over `lanes`: the synth, and the voice's settings
 * for the panel with a lane's values in it. Each loop carries those settings where the lanes change them, and the
 * engine's pattern player makes the change on the step's sample. The panel moving (a knob turned, another synth) is an
 * edit of the loop playing, so what a lane leaves alone follows the knob. `modShown` is what the lanes set on the step
 * being heard, for the panel to draw.
 *
 * Each loop is compiled from a seed of its own, so the step order the page draws the playhead with is the order the
 * loop was compiled with, and an edit recompiles the loop with the same draws (a step with a probability does not
 * change its mind because a different step was edited).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import { importPhrase } from '@/lib/app/sequencer/import';
import {
  MAX_BPM,
  MIN_BPM,
  PatternSchema,
  newPattern,
  stepsPerBeat,
  type Pattern,
} from '@/lib/app/sequencer/pattern';
import { lanesPlay, resolveMods, stepOverrides } from '@/lib/app/sequencer/lanes';
import type { ControlValues, EngineParams, Phrase, SynthDef } from '@/lib/app/synths/contract';
import type { SynthEvent, SynthMessage } from '@/lib/app/synths/audio/dsp-core';
import {
  createPlayhead,
  type ParamChange,
  type PatternLoop,
} from '@/lib/app/synths/audio/pattern-player';
import { logger } from '@/lib/logging';

/** What the sequencer needs of the page's engine: `Engine` has all three. */
export interface SequencerEngine {
  send(m: SynthMessage): void;
  /** The frame being heard now, on the clock `loop` events use. */
  readonly frame: number;
  readonly ctx: { readonly sampleRate: number } | null;
}

/** The most edits Undo goes back through. */
export const UNDO_DEPTH = 100;
/** Edits in one group (one encoder being turned) this close together are one Undo. */
const GROUP_MS = 1200;
/** The least time between two sends of the loop playing for the panel moving under its lanes. */
const LANE_RESEND_MS = 50;

/** Where the playhead is: the step it is on, and the part (A or B) playing. */
export interface SeqPosition {
  step: number;
  part: number;
}

/** What one loop was compiled with, to draw its playhead and to compile it again after an edit. */
interface LoopInfo {
  seed: number;
  from: number | undefined;
  to: number;
  order: number[];
  part: number;
  /** Steps per beat when it was compiled: an edit to the step size leaves loops already sounding as they were. */
  perBeat: number;
}

/** What mod lanes play on: the synth on the panel, and its voice's settings with a lane's values in them. */
export interface LaneTarget {
  def: SynthDef;
  /** The panel's settings with `set` in place of the panel's values for those controls. Null if they can't be made. */
  paramsFor: (set: ControlValues) => EngineParams | null;
}

export interface EditOptions {
  /** Edits in the same group, close together, are undone as one: a turn of an encoder is one edit, not forty. */
  group?: string;
  /** Not an edit the user made (a tempo knob on the panel moving the pattern's tempo): Undo does not see it. */
  undoable?: boolean;
}

/**
 * What the sequencer holds, when it is not the sound's own riff: one of the user's patterns (`id` set), or a riff from a
 * library (`id` null, `name` saying whose).
 */
export interface LoadedPattern {
  id: string | null;
  name: string;
}

export interface Sequencer {
  pattern: Pattern;
  /** What the pattern was loaded from, or null for the sound's own riff. */
  loaded: LoadedPattern | null;
  /** Whether the pattern has changed since it was loaded or last saved. */
  edited: boolean;
  /**
   * Replaces the pattern with `p`, from `from`. An edited pattern it replaces is one Undo away, as it is when another
   * sound's riff arrives, and that Undo names it as it was named. A pattern that would not be valid is refused and
   * logged: false.
   */
  load: (p: Pattern, from: LoadedPattern) => boolean;
  /**
   * Which pattern is held: it changes whenever the whole pattern is replaced (one opened, another sound's riff, an Undo
   * past either). A save, rename or delete takes it as it sends, and names what is held only if it is unchanged.
   */
  held: () => number;
  /**
   * `saved` (the pattern as it was sent while `at` was held) has been saved as `as`: it names what is held, and an edit
   * made since the save was sent is still an edit. False, naming nothing, when another pattern is held since.
   */
  markSaved: (as: LoadedPattern, saved: Pattern, at: number) => boolean;
  /**
   * What the pattern held at `at` is called, or where it is saved, changed (a rename, a delete), its steps not: `edited`
   * stands. False, naming nothing, when another pattern is held since.
   */
  relabel: (as: LoadedPattern, at: number) => boolean;
  /** Changes the pattern. An edit that would not make a valid pattern is refused and logged. */
  edit: (next: Pattern | ((p: Pattern) => Pattern), o?: EditOptions) => void;
  undo: () => void;
  canUndo: boolean;
  playing: boolean;
  /** Starts the pattern from its first step. False if the sound could not be turned on. */
  play: () => Promise<boolean>;
  stop: () => void;
  /** While Fill is held, steps with a fill condition play (and those with "not fill" do not), from the next loop. */
  fill: boolean;
  setFill: (on: boolean) => void;
  /** The engine's events, which the page hears and passes on. */
  onEvent: (e: SynthEvent) => void;
  /** Where the playhead is now, or `null` while stopped (or before the first loop has been heard). */
  position: () => SeqPosition | null;
  /** A note played on the piano, the computer keyboard or MIDI: the module puts it on the chosen step. */
  noteIn: (n: number) => void;
  /** The module's handler for `noteIn`. Returns the undo. */
  onNoteIn: (f: (n: number) => void) => () => void;
  /** What the mod lanes set on the step being heard, for the panel to show; null when they set nothing (or stopped). */
  modShown: ControlValues | null;
}

/** An Undo step: the pattern, and for one a whole new pattern replaced, what it was named and saved as. */
interface Snapshot {
  p: Pattern;
  named?: { loaded: LoadedPattern | null; baseline: string };
}

const newSeed = () => Math.floor(Math.random() * 2 ** 32);

/** A riff as a pattern; a riff the pattern model cannot hold (none in the library) opens an empty pattern instead. */
function fromRiff(ph: Phrase, bpm: number | null): Pattern {
  try {
    const p = importPhrase(ph);
    return bpm ? { ...p, bpm: clampBpm(bpm) } : p;
  } catch (err) {
    logger.warn('sequencer: riff could not be imported', { err: String(err) });
    return newPattern(16, '1/16', clampBpm(bpm ?? ph.bpm));
  }
}

const clampBpm = (bpm: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, bpm));

/** The loop newest at or before `index`: a loop the player played again (the page was late) stands in for the next. */
function newestBefore(loops: Map<number, LoopInfo>, index: number): LoopInfo | undefined {
  for (let k = index; k >= index - 8; k--) {
    const info = loops.get(k);
    if (info) return info;
  }
  return undefined;
}

export function useSequencer({
  engine,
  ensureAudio,
  riff,
  tempo = null,
  lanes = null,
}: {
  engine: SequencerEngine | null;
  /** Turns the sound on, as a press of Play on the bar does; false if it could not. */
  ensureAudio: () => Promise<boolean>;
  /** The riff of the sound on the panel: imported whenever it changes, replacing the pattern. */
  riff: Phrase | null;
  /** A tempo the panel sets (the TB-303's TEMPO knob), which the pattern follows. */
  tempo?: number | null;
  /** What mod lanes play on. Without it a pattern's lanes are silent. */
  lanes?: LaneTarget | null;
}): Sequencer {
  const [pattern, setPattern] = useState<Pattern>(() =>
    riff ? fromRiff(riff, tempo) : newPattern()
  );
  const [playing, setPlaying] = useState(false);
  const [fill, setFillState] = useState(false);
  // Undo's stack is a ref, so undoing never runs a side effect inside a state update; `undoable` mirrors whether it is
  // empty, for the button. A step that replaced the whole pattern (one opened, another sound's riff) keeps what the
  // pattern before it was named and saved as, so Undo puts those back too: Save never writes the steps Undo brought
  // back over the pattern that replaced them.
  const past = useRef<Snapshot[]>([]);
  const [undoable, setUndoable] = useState(false);
  const [loaded, setLoadedState] = useState<LoadedPattern | null>(null);
  /** The pattern as it was loaded or last saved, as JSON: what `edited` compares with. */
  const [baseline, setBaselineState] = useState(() => JSON.stringify(pattern));
  const loadedRef = useRef(loaded);
  const baselineRef = useRef(baseline);
  const setLoaded = useCallback((l: LoadedPattern | null) => {
    loadedRef.current = l;
    setLoadedState(l);
  }, []);
  const setBaseline = useCallback((b: string) => {
    baselineRef.current = b;
    setBaselineState(b);
  }, []);

  const patternRef = useRef(pattern);
  /** Counts replacements of the whole pattern: see `held`. */
  const heldRef = useRef(0);
  /** What is held now, as the Undo step a replacement of the whole pattern pushes. */
  const replaced = useCallback(
    (): Snapshot => ({
      p: patternRef.current,
      named: { loaded: loadedRef.current, baseline: baselineRef.current },
    }),
    []
  );
  const playingRef = useRef(false);
  const fillRef = useRef(false);
  const lastGroup = useRef<{ key: string; at: number } | null>(null);
  const loops = useRef(new Map<number, LoopInfo>());
  const current = useRef(0);
  /**
   * Set from a start until the new run's first loop reports. A `loop` or `patternEnd` from the run before (already on
   * its way from the audio thread when Stop and Play were pressed, or a new sound restarted it) is not this run's.
   */
  const awaiting = useRef(false);
  /** Counts Plays and Stops, so a Play still waiting for the sound knows a Stop came after it. */
  const runs = useRef(0);
  const playhead = useRef(createPlayhead());

  const send = useCallback((m: SynthMessage) => engine?.send(m), [engine]);
  const riffRef = useRef(riff);
  const tempoRef = useRef(tempo);
  const lanesRef = useRef(lanes);
  /** Whether the last loop compiled carried lane settings: the engine may still have them to take back. */
  const lanesSent = useRef(false);
  useEffect(() => {
    riffRef.current = riff;
    tempoRef.current = tempo;
  });

  /** The loop's lane changes as settings for the voice: none for a pattern without lanes the synth can play. */
  const lanePlay = useCallback((p: Pattern, mods: ReturnType<typeof compileLoop>['mods']) => {
    const target = lanesRef.current;
    if (!target || !p.lanes?.length) return undefined;
    const live = resolveMods(target.def, mods);
    if (live.length === 0) return undefined;
    // One set of lane values is one call to the synth's `toEngine`, however many steps share it.
    const made = new Map<string, EngineParams | null>();
    return live.map(([beat, set]): ParamChange => {
      if (!set) return [beat, null];
      const key = JSON.stringify(set);
      if (!made.has(key)) made.set(key, target.paramsFor(set));
      return [beat, made.get(key) ?? null];
    });
  }, []);

  /** Loop `index` of `p`, compiled from `seed`, with what it was compiled from kept. */
  const compile = useCallback(
    (p: Pattern, index: number, seed: number, from: number | undefined) => {
      const opts = { loop: index, from, fill: fillRef.current };
      const c = compileLoop(p, { ...opts, rng: seededRng(seed) });
      const info: LoopInfo = {
        seed,
        from,
        to: c.to,
        order: c.order,
        part: p.chain[index % p.chain.length],
        perBeat: stepsPerBeat(p),
      };
      loops.current.set(index, info);
      // Only the last few are read: the one heard now, the one rendered, the one queued.
      loops.current.forEach((_, k) => {
        if (k < index - 4) loops.current.delete(k);
      });
      const loop: PatternLoop = { notes: c.notes, beats: c.beats };
      const params = lanePlay(p, c.mods);
      if (params) loop.params = params;
      lanesSent.current = !!params;
      return loop;
    },
    [lanePlay]
  );

  const queue = useCallback(
    (index: number, seed = newSeed()) => {
      const p = patternRef.current;
      if (!p.loop) {
        send({ type: 'patternNext', loop: null });
        return;
      }
      const from = newestBefore(loops.current, index - 1)?.to;
      send({ type: 'patternNext', loop: compile(p, index, seed, from) });
    },
    [compile, send]
  );

  const start = useCallback(
    (p: Pattern) => {
      loops.current.clear();
      playhead.current.clear();
      current.current = 0;
      awaiting.current = true;
      send({ type: 'pattern', loop: compile(p, 0, newSeed(), undefined), bpm: p.bpm });
    },
    [compile, send]
  );

  /** The loop playing now, recompiled from the same draws, from the playhead on; then a fresh loop after it. */
  const resend = useCallback(
    (p: Pattern, prev: Pattern) => {
      if (p.bpm !== prev.bpm) send({ type: 'tempo', bpm: p.bpm });
      const i = current.current;
      const info = loops.current.get(i);
      send({
        type: 'patternEdit',
        loop: compile(p, i, info?.seed ?? newSeed(), info?.from),
      });
      queue(i + 1);
    },
    [compile, queue, send]
  );

  const commit = useCallback(
    (p: Pattern, o: EditOptions) => {
      const prev = patternRef.current;
      // An edit that changes nothing (a tool on a part of rests) is not one: nothing to undo, nothing to resend.
      if (p === prev || JSON.stringify(p) === JSON.stringify(prev)) return;
      const ok = PatternSchema.safeParse(p);
      if (!ok.success) {
        logger.warn('sequencer: edit refused', { issue: ok.error.issues[0]?.message });
        return;
      }
      patternRef.current = p;
      setPattern(p);
      if (o.undoable !== false) {
        const now = Date.now();
        const same =
          o.group !== undefined &&
          lastGroup.current?.key === o.group &&
          now - lastGroup.current.at < GROUP_MS;
        lastGroup.current = o.group !== undefined ? { key: o.group, at: now } : null;
        if (!same) {
          past.current = [...past.current.slice(-(UNDO_DEPTH - 1)), { p: prev }];
          setUndoable(true);
        }
      }
      if (playingRef.current) resend(p, prev);
    },
    [resend]
  );

  const edit = useCallback(
    (next: Pattern | ((p: Pattern) => Pattern), o: EditOptions = {}) =>
      commit(typeof next === 'function' ? next(patternRef.current) : next, o),
    [commit]
  );

  const undo = useCallback(() => {
    const snap = past.current[past.current.length - 1];
    if (!snap) return;
    past.current = past.current.slice(0, -1);
    setUndoable(past.current.length > 0);
    const was = patternRef.current;
    const prev = snap.p;
    patternRef.current = prev;
    setPattern(prev);
    if (snap.named) {
      heldRef.current++;
      setLoaded(snap.named.loaded);
      setBaseline(snap.named.baseline);
    }
    lastGroup.current = null;
    if (playingRef.current) resend(prev, was);
  }, [resend, setLoaded, setBaseline]);

  // The sound's riff, imported whenever it changes (another sound chosen): a fresh pattern with nothing to undo. Keyed
  // on the riff's content, so a sound read again with the same riff (a rename, a save) keeps the edits.
  // A riff that goes away for a moment (no sound shown) and comes back the same is not a new riff.
  const riffKey = useMemo(() => (riff ? JSON.stringify(riff) : null), [riff]);
  const loadedKey = useRef(riffKey);
  useEffect(() => {
    const ph = riffRef.current;
    if (!riffKey || !ph || riffKey === loadedKey.current) return;
    loadedKey.current = riffKey;
    const p = fromRiff(ph, tempoRef.current);
    // An edited pattern is not lost to another sound's riff: one Undo brings it back. An unedited one is just the
    // last sound's riff, and is not worth an Undo.
    const was = replaced();
    heldRef.current++;
    const edited = past.current.length > 0;
    patternRef.current = p;
    setPattern(p);
    setLoaded(null);
    setBaseline(JSON.stringify(p));
    past.current = edited ? [...past.current.slice(-(UNDO_DEPTH - 1)), was] : [];
    setUndoable(edited);
    lastGroup.current = null;
    if (playingRef.current) start(p);
  }, [riffKey, start, replaced, setLoaded, setBaseline]);

  const load = useCallback(
    (p: Pattern, from: LoadedPattern) => {
      const ok = PatternSchema.safeParse(p);
      if (!ok.success) {
        logger.warn('sequencer: pattern refused', { issue: ok.error.issues[0]?.message });
        return false;
      }
      // On a synth with a tempo knob the knob sets the tempo, as it does for the sound's riff.
      const next = tempoRef.current ? { ...ok.data, bpm: clampBpm(tempoRef.current) } : ok.data;
      const was = replaced();
      heldRef.current++;
      patternRef.current = next;
      setPattern(next);
      setLoaded(from);
      setBaseline(JSON.stringify(next));
      past.current = [...past.current.slice(-(UNDO_DEPTH - 1)), was];
      setUndoable(true);
      lastGroup.current = null;
      if (playingRef.current) start(next);
      return true;
    },
    [start, replaced, setLoaded, setBaseline]
  );

  const held = useCallback(() => heldRef.current, []);

  const markSaved = useCallback(
    (as: LoadedPattern, saved: Pattern, at: number) => {
      if (at !== heldRef.current) return false;
      setLoaded(as);
      setBaseline(JSON.stringify(saved));
      return true;
    },
    [setLoaded, setBaseline]
  );

  const relabel = useCallback(
    (as: LoadedPattern, at: number) => {
      if (at !== heldRef.current) return false;
      setLoaded(as);
      return true;
    },
    [setLoaded]
  );

  const edited = useMemo(() => JSON.stringify(pattern) !== baseline, [pattern, baseline]);

  // The panel's tempo knob moves the pattern's tempo, as it moves a riff's. The page sends the engine the tempo itself.
  useEffect(() => {
    if (!tempo) return;
    const p = patternRef.current;
    const bpm = clampBpm(tempo);
    if (p.bpm === bpm) return;
    patternRef.current = { ...p, bpm };
    setPattern(patternRef.current);
    // The knob's tempo stands through an Undo: what Undo goes back to is moved to it as well. A tempo set on the
    // sequencer's own encoder after this is a snapshot of its own, and Undo still takes it back.
    // Nor does it make a saved pattern an edited one, now or after an Undo.
    const atTempo = (b: string) => JSON.stringify({ ...(JSON.parse(b) as Pattern), bpm });
    past.current = past.current.map((q) => ({
      p: { ...q.p, bpm },
      named: q.named && { ...q.named, baseline: atTempo(q.named.baseline) },
    }));
    setBaseline(atTempo(baselineRef.current));
  }, [tempo, setBaseline]);

  const play = useCallback(async () => {
    // A Stop (or a riff) while the sound is still starting cancels this Play: it is a newer run than this one.
    const run = ++runs.current;
    if (!engine || !(await ensureAudio()) || run !== runs.current) return false;
    playingRef.current = true;
    setPlaying(true);
    start(patternRef.current);
    return true;
  }, [engine, ensureAudio, start]);

  // The panel moving, or another synth, changes what the lanes play: the loop playing is sent again, so a control no
  // lane sets follows the panel, and a lane for a control this synth lacks stays silent. Only while lanes play here (or
  // the engine still has their settings to take back), and at most once every LANE_RESEND_MS: a knob dragged or the mod
  // wheel ridden moves the panel every frame. The loop queued after it keeps its draws, so a step with a chance does
  // not change its mind because the wheel moved.
  const laneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laneResentAt = useRef(0);
  const resendLanes = useCallback(() => {
    laneTimer.current = null;
    const p = patternRef.current;
    const target = lanesRef.current;
    if (!playingRef.current) return;
    if (!lanesSent.current && !(target && lanesPlay(target.def, p))) return;
    laneResentAt.current = Date.now();
    const i = current.current;
    const info = loops.current.get(i);
    send({ type: 'patternEdit', loop: compile(p, i, info?.seed ?? newSeed(), info?.from) });
    queue(i + 1, loops.current.get(i + 1)?.seed);
  }, [compile, queue, send]);
  useEffect(() => {
    lanesRef.current = lanes;
    // One already due reads the newest panel when it goes.
    if (laneTimer.current) return;
    const wait = laneResentAt.current + LANE_RESEND_MS - Date.now();
    if (wait <= 0) resendLanes();
    else laneTimer.current = setTimeout(resendLanes, wait);
  }, [lanes, resendLanes]);
  useEffect(
    () => () => {
      if (laneTimer.current) clearTimeout(laneTimer.current);
    },
    []
  );

  const [modShown, setModShown] = useState<ControlValues | null>(null);

  const halt = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    playhead.current.clear();
    loops.current.clear();
  }, []);

  const stop = useCallback(() => {
    runs.current++;
    if (playingRef.current) send({ type: 'stopPattern' });
    halt();
  }, [halt, send]);

  // The loop after this one was queued before Fill changed: queued again, so Fill is heard from the next loop.
  const setFill = useCallback(
    (on: boolean) => {
      fillRef.current = on;
      setFillState(on);
      if (playingRef.current) queue(current.current + 1);
    },
    [queue]
  );

  const onEvent = useCallback(
    (e: SynthEvent) => {
      if (!playingRef.current) return;
      if (awaiting.current) {
        if (e.type !== 'loop' || e.index !== 0 || !e.start) return;
        awaiting.current = false;
      }
      if (e.type === 'loop') {
        current.current = e.index;
        playhead.current.push(e);
        if (e.start) queue(e.index + 1);
      } else if (e.type === 'patternEnd') halt();
    },
    [halt, queue]
  );

  const noteTarget = useRef<((n: number) => void) | null>(null);
  const noteIn = useCallback((n: number) => noteTarget.current?.(n), []);
  const onNoteIn = useCallback((f: (n: number) => void) => {
    noteTarget.current = f;
    return () => {
      if (noteTarget.current === f) noteTarget.current = null;
    };
  }, []);

  const position = useCallback((): SeqPosition | null => {
    if (!playingRef.current || !engine?.ctx) return null;
    const at = playhead.current.at(engine.frame, engine.ctx.sampleRate);
    if (!at) return null;
    const info = newestBefore(loops.current, at.index);
    if (!info) return null;
    const slot = Math.floor(at.beat * info.perBeat + 1e-9);
    const step = info.order[Math.min(slot, info.order.length - 1)];
    return step === undefined ? null : { step, part: info.part };
  }, [engine]);

  // While a pattern with lanes plays, what they set on the step being heard, for the panel: read once a frame, and
  // only a change is set, so the panel redraws once a step at most.
  const hasLanes = !!pattern.lanes?.length && !!lanes;
  useEffect(() => {
    if (!playing || !hasLanes) {
      setModShown(null);
      return;
    }
    let raf = 0;
    let last = '';
    const tick = () => {
      const at = position();
      const target = lanesRef.current;
      const p = patternRef.current;
      const set =
        at && target
          ? stepOverrides(target.def, p.parts[at.part]?.steps[at.step]?.mod, p.lanes ?? [])
          : null;
      const key = set ? JSON.stringify(set) : '';
      if (key !== last) {
        last = key;
        setModShown(set);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, hasLanes, position]);

  return {
    pattern,
    loaded,
    edited,
    load,
    held,
    markSaved,
    relabel,
    edit,
    undo,
    canUndo: undoable,
    playing,
    play,
    stop,
    fill,
    setFill,
    onEvent,
    position,
    noteIn,
    onNoteIn,
    modShown,
  };
}
