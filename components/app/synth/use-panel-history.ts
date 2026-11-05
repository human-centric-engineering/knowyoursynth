'use client';

/**
 * Undo and redo for the panel (`lib/app/synths/lib/history.ts`): the page's session update wrapped, so a change made
 * through it is recorded and one that is not (the stored panel restored) is not. A different patch on the panel (a
 * sound or a lesson step loaded) starts the history afresh: Undo goes back through what was done to this one. ⌘Z (Ctrl+Z)
 * undoes and ⇧⌘Z (or Ctrl+Y) redoes, except in a field, a native dialog or the sequencer (its module and its View all
 * dialog), which has an Undo of its own; the docked sheets leave it to the panel. A save
 * (the sound's id changing, the panel not) keeps the history; a new patch set is a change of its own, never grouped.
 *
 * An undo or redo is shown being done: what it changes is lit (`HISTORY_LIGHT_MS`), then each control turns to its
 * value as a hand would (`HISTORY_TURN_MS`, `tweenValues`: a stepped knob through its steps, then snapped home), the
 * engine hearing the turn, and its cables go or come one by one through it, in the order they were plugged. Another press, or a change made meanwhile,
 * finishes it at once; with reduced motion it is done at once.
 *
 * A lesson step's moves are shown being made (`walk`, `f-step-moves` t-178): the session holds the step at once, while
 * the panel shows the step before and then each move in turn, lit (`MOVE_LIGHT_MS`, `moveStore`) and turned as Undo
 * turns a change. Unlike a load the synth stays playable, and the engine hears each move. Another press, a change, or
 * a session landing from elsewhere finishes it at once; with reduced motion it is set at once.
 *
 * A new patch is loaded (`glide`, `glidePlan`): a sound opened, Default patch, Restore patch, and the synth itself
 * arriving. Every load starts from the synth's Default patch (`f-default-patch` t-172), set at once, cables and all,
 * whatever was on the panel before, so the controls move the same way whichever sound was last. The session holds the
 * new patch at once (saved and recorded as one change); what the hook hands back as the session shows the glide from
 * the Default patch meanwhile, a part of the panel at a time down the voice, its cables out first and the new ones in
 * last, so the panel and the engine both follow it. Nothing is lit: the controls and cables moving are what shows it.
 * A session that lands from elsewhere meanwhile (the stored panel, the account's) carries the glide on to it; a change
 * made through `patch`, or Undo, finishes it at once. A new patch loaded meanwhile starts again from the Default patch.
 *
 * While a load runs the synth is not to be played (`loading`, `isLoading`, `onLoad`): the page drops notes and silences
 * the sequencer until it ends. With reduced motion there is no glide, so a load ends the moment it begins.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HISTORY_CABLE_MS,
  emptyHistory,
  glideAt,
  glideMs,
  glidePlan,
  panelChanges,
  recordChange,
  redo as redoStep,
  type StepMove,
  tweenCables,
  tweenValues,
  undo as undoStep,
  type PanelHistory,
  type PanelSnap,
} from '@/lib/app/synths/lib/history';
import { glideMotion } from '@/components/app/synth/motion';
import { defaultPatchState } from '@/lib/app/synths/default-patch';
import { highlightStore, moveStore } from '@/components/app/synth/stores';
import type { ControlValues, PatchCable, SynthDef } from '@/lib/app/synths/contract';

/** How long what an undo or redo changes is lit before it moves, in ms. */
export const HISTORY_LIGHT_MS = 900;
/** How long the controls take to turn to where they go, in ms. */
export const HISTORY_TURN_MS = 600;
/** How long each of a lesson step's moves is lit before it is made, in ms. */
export const MOVE_LIGHT_MS = 700;

// Long enough for each cable to go or come in turn (Unplug all undone plugs them back one by one).
const turnMsFor = (from: PanelSnap, to: PanelSnap): number => {
  const key = (c: PatchCable) => `${c.from}>${c.to}`;
  const had = new Set(from.cables.map(key));
  const has = new Set(to.cables.map(key));
  const cablesMoved =
    from.cables.filter((c) => !has.has(key(c))).length +
    to.cables.filter((c) => !had.has(key(c))).length;
  return Math.min(2500, Math.max(HISTORY_TURN_MS, cablesMoved * HISTORY_CABLE_MS));
};

const hasChanges = (from: PanelSnap, to: PanelSnap): boolean => {
  const { controls, jacks } = panelChanges(from, to);
  return controls.length > 0 || jacks.length > 0;
};

/** How long the blank panel shows before an arriving synth's patch is set on it, in ms. */
export const ARRIVE_MS = 350;

/** Slow at either end, as a hand turns a knob. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** What the hook needs of the page's session. */
interface Panelled {
  values: ControlValues;
  cables: PatchCable[];
  presetId: string | null;
  soundId?: string | null;
  step: number | null;
}

export function usePanelHistory<S extends Panelled>(
  sess: S,
  setSess: (fn: (s: S) => S) => void,
  def: SynthDef,
  /** Called as an undo, a redo or a new patch begins: whatever the page has under way on the panel (Unplug all) stops. */
  onTakeOver?: () => void,
  /** Called as a load begins (`true`), so the page lets go of what is sounding, and as it ends (`false`). */
  onLoad?: (loading: boolean) => void
): {
  /** The session as the panel shows it: during a glide, its controls and cables part of the way there. */
  sess: S;
  patch: (fn: (s: S) => S) => void;
  /** As `patch`, the new patch shown being set (and a glide under way carried on to it, rather than finished). */
  glide: (fn: (s: S) => S) => void;
  /**
   * As `patch`, a lesson step's moves shown being made from `from`, the step before (`stepMoves`): each lit, then turned
   * into place, the engine hearing it. False when there is nothing to show (no moves, or reduced motion): the step is
   * set at once. `onEnd` is called as the moves end, or are finished at once by another press or a change.
   */
  walk: (
    fn: (s: S) => S,
    from: PanelSnap,
    moves: readonly StepMove[],
    onEnd?: () => void
  ) => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The undo or redo being shown on the panel, if one is. */
  shown: 'undo' | 'redo' | null;
  /** A new patch is loading: nothing is to sound until it has. From the first render, as the synth arrives. */
  loading: boolean;
  /** `loading` as it is this moment, for a note that comes between renders. */
  isLoading: () => boolean;
} {
  const [history, setHistory] = useState<PanelHistory>(emptyHistory);
  const historyRef = useRef(history);
  const current = useRef<PanelSnap>({ values: sess.values, cables: sess.cables });
  const prev = useRef<{ snap: PanelSnap; ident: string; sound: string | null } | null>(null);
  // Set by a change made through `patch` (recorded) or by Undo and Redo (not), read by the effect after it renders.
  const made = useRef<'change' | 'glide' | 'walk' | 'history' | null>(null);
  const onTakeOverRef = useRef(onTakeOver);
  const onLoadRef = useRef(onLoad);
  // The session as last rendered: a new patch that changes nothing is no load.
  const sessRef = useRef(sess);

  useEffect(() => {
    historyRef.current = history;
    onTakeOverRef.current = onTakeOver;
    onLoadRef.current = onLoad;
    sessRef.current = sess;
  });

  // Loading from the first render: the synth arriving is a load like any other.
  const [loading, setLoadingState] = useState(true);
  const loadingRef = useRef(true);
  const setLoading = useCallback((on: boolean) => {
    if (loadingRef.current === on) return;
    loadingRef.current = on;
    setLoadingState(on);
    onLoadRef.current?.(on);
  }, []);
  const isLoading = useCallback(() => loadingRef.current, []);

  // The undo or redo being shown, or the glide, which `finish` completes at once.
  const showing = useRef<{ finish: () => void } | null>(null);
  const [shown, setShown] = useState<'undo' | 'redo' | null>(null);
  const finishShowing = useCallback(() => showing.current?.finish(), []);
  // A lesson step's moves being shown (`walk`): a session landing from elsewhere meanwhile finishes them.
  const walking = useRef(false);
  // On the way out, finished without telling the page a load has ended: it is going, and must not start its Play.
  const leave = useCallback(() => {
    onLoadRef.current = undefined;
    finishShowing();
  }, [finishShowing]);
  useEffect(() => leave, [leave]);

  // The glide: the panel as shown while it runs, from the first render on, as the synth arrives at its Default patch.
  const fromDefault = useCallback((): PanelSnap => defaultPatchState(def), [def]);
  const [frame, setFrame] = useState<PanelSnap | null>(fromDefault);
  const frameRef = useRef(frame);
  // The glide under way: `halt` stops it where it has got to, for the next to carry on from.
  const gliding = useRef<{ halt: () => { at: PanelSnap; delay: number } } | null>(null);

  const runGlide = useCallback(
    (from: PanelSnap, to: PanelSnap, delay: number) => {
      const show = (f: PanelSnap | null) => {
        frameRef.current = f;
        setFrame(f);
      };
      const stages = glidePlan(def, from, to);
      // With a wait first (the synth arriving), it waits even with nothing to move: what lands meanwhile, the stored
      // panel, carries it on from the Default patch.
      if (!glideMotion() || (stages.length === 0 && delay === 0)) {
        gliding.current = null;
        show(null);
        setLoading(false);
        return;
      }
      const total = glideMs(stages);
      const pending: { timer?: ReturnType<typeof setTimeout>; frame: number } = { frame: 0 };
      const stop = () => {
        clearTimeout(pending.timer);
        cancelAnimationFrame(pending.frame);
        if (showing.current?.finish === done) showing.current = null;
        gliding.current = null;
      };
      const done = () => {
        stop();
        show(null);
        setLoading(false);
      };
      showing.current = { finish: done };
      gliding.current = {
        // A part half turned turns on from there; one still waiting to begin waits its time again.
        halt: () => {
          const at = frameRef.current ?? from;
          const begun = pending.frame !== 0;
          stop();
          return { at, delay: begun ? 0 : delay };
        },
      };
      show(from);
      setLoading(true);
      pending.timer = setTimeout(() => {
        const start = performance.now();
        const turn = (now: number) => {
          const at = glideAt(def, from, to, stages, now - start, easeInOut);
          if (at.stage < 0 || now - start >= total) {
            done();
            return;
          }
          show(at.snap);
          pending.frame = requestAnimationFrame(turn);
        };
        pending.frame = requestAnimationFrame(turn);
      }, delay);
    },
    [def, setLoading]
  );

  useEffect(() => {
    const snap = { values: sess.values, cables: sess.cables };
    current.current = snap;
    const ident = `${def.id}|${sess.presetId ?? ''}|${sess.step ?? ''}`;
    const sound = sess.soundId ?? null;
    const p = prev.current;
    prev.current = { snap, ident, sound };
    const by = made.current;
    made.current = null;
    if (!p) return;
    const moved = p.snap.values !== snap.values || p.snap.cables !== snap.cables;
    if (moved && by === 'glide') {
      // A load, from the Default patch, whatever was on the panel or still gliding onto it; one landing while the synth
      // arrives waits out the arrival's wait.
      const delay = gliding.current?.halt().delay ?? 0;
      runGlide(fromDefault(), snap, delay);
    } else if (moved && gliding.current) {
      const { at, delay } = gliding.current.halt();
      runGlide(at, snap, delay);
    } else if (moved && walking.current && by !== 'walk') {
      finishShowing();
    } else if (by === 'glide' && !gliding.current) {
      // A new patch with the same panel: nothing to load after all.
      frameRef.current = null;
      setFrame(null);
      setLoading(false);
    }
    // Saved (the sound's id alone changing, through `patch`), the panel is the same one: only a different patch on it
    // starts the history afresh.
    const saved = p.ident === ident && !moved && (by === 'change' || by === 'walk');
    if (p.ident !== ident || (p.sound !== sound && !saved)) {
      setHistory(emptyHistory());
      return;
    }
    if (!moved) return;
    // Replay changes at the step already on the panel puts back the panel it had: nothing to undo.
    if (by === 'walk' && !hasChanges(p.snap, snap)) return;
    if (by === 'change' || by === 'walk' || by === 'glide')
      setHistory((h) => recordChange(h, p.snap, performance.now(), by === 'glide'));
  }, [sess, def.id]); // eslint-disable-line react-hooks/exhaustive-deps -- `runGlide` follows `def`, as `def.id` does

  // The synth arriving (the page is keyed by synth, so this is once per synth): its patch is set on the Default patch
  // the first render showed. Finished on the way out, and so begun again by React's development remount.
  useEffect(() => {
    runGlide(frameRef.current ?? fromDefault(), current.current, ARRIVE_MS);
    return leave;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

  // The change marked only when there is one: nothing changed, nothing renders, and a mark left would be read as this
  // change by the next session that lands from elsewhere. Only ever set here, so a no-op batched after a change keeps
  // the change's mark.
  const marked = useCallback(
    (fn: (s: S) => S, by: 'change' | 'glide' | 'walk') =>
      (s: S): S => {
        const next = fn(s);
        if (next !== s) made.current = by;
        return next;
      },
    []
  );

  const patch = useCallback(
    (fn: (s: S) => S) => {
      finishShowing();
      setSess(marked(fn, 'change'));
    },
    [setSess, finishShowing, marked]
  );

  const glide = useCallback(
    (fn: (s: S) => S) => {
      // An undo being shown is finished; a glide is taken over by the new patch's.
      if (!gliding.current) finishShowing();
      onTakeOverRef.current?.();
      // The load begins now, before anything else this moment can sound (the page's next note, or its Play), and the
      // panel shows the Default patch in the same render as the session takes the new one. With reduced motion it
      // snaps straight to the new one.
      if (fn(sessRef.current) !== sessRef.current) {
        setLoading(true);
        if (glideMotion()) {
          frameRef.current = fromDefault();
          setFrame(frameRef.current);
        }
      }
      setSess(marked(fn, 'glide'));
    },
    [setSess, finishShowing, marked, setLoading, fromDefault]
  );

  const step = useCallback(
    (fn: typeof undoStep, which: 'undo' | 'redo') => {
      // With nothing to step to, nothing under way is stopped.
      if (!fn(historyRef.current, current.current)) return;
      onTakeOverRef.current?.();
      finishShowing();
      // Finished, the panel is where the one shown lands, and this steps on from there.
      const from = current.current;
      const r = fn(historyRef.current, from);
      if (!r) return;
      const to = r.to;
      historyRef.current = r.history;
      setHistory(r.history);
      const put = (values: ControlValues, cables: PatchCable[]) =>
        setSess((s) => ({ ...s, values, cables }));
      const lit = highlightStore.get();
      const pending: { timer?: ReturnType<typeof setTimeout>; frame: number } = { frame: 0 };
      const done = () => {
        clearTimeout(pending.timer);
        cancelAnimationFrame(pending.frame);
        showing.current = null;
        setShown(null);
        highlightStore.set(lit);
        made.current = 'history';
        // The panel is there now, before it renders: a press or a change straight after starts from it.
        current.current = to;
        if (prev.current) prev.current = { ...prev.current, snap: to };
        put(to.values, to.cables);
      };
      if (reducedMotion()) {
        done();
        return;
      }
      const { controls, jacks } = panelChanges(from, to);
      highlightStore.set([...controls, ...jacks]);
      const turnMs = turnMsFor(from, to);
      showing.current = { finish: done };
      setShown(which);
      pending.timer = setTimeout(() => {
        const start = performance.now();
        const turn = (now: number) => {
          const t = Math.min(1, (now - start) / turnMs);
          if (t >= 1) {
            done();
            return;
          }
          // In between, the panel moves but nothing is recorded: the change is the undo's.
          made.current = null;
          put(
            tweenValues(def, from.values, to.values, easeInOut(t)),
            tweenCables(from.cables, to.cables, t)
          );
          pending.frame = requestAnimationFrame(turn);
        };
        pending.frame = requestAnimationFrame(turn);
      }, HISTORY_LIGHT_MS);
    },
    [setSess, finishShowing, def]
  );
  const walk = useCallback(
    (fn: (s: S) => S, from: PanelSnap, moves: readonly StepMove[], onEnd?: () => void) => {
      finishShowing();
      onTakeOverRef.current?.();
      if (reducedMotion() || moves.length === 0) {
        setSess(marked(fn, 'change'));
        return false;
      }
      const show = (f: PanelSnap | null) => {
        frameRef.current = f;
        setFrame(f);
      };
      const pending: { timer?: ReturnType<typeof setTimeout>; frame: number } = { frame: 0 };
      // What the page and the lesson light for the step, once they have lit it: put back when the moves end. Let go of
      // (the moves lit no more) once something else lights the panel meanwhile, such as the card closing.
      let lit: string[] | null = null;
      let mine: string[] | null = null;
      const light = (ids: string[]) => {
        if (highlightStore.get() !== mine) lit = null;
        if (!lit) return;
        highlightStore.set(ids);
        mine = ids;
      };
      const done = () => {
        clearTimeout(pending.timer);
        cancelAnimationFrame(pending.frame);
        if (showing.current?.finish === done) showing.current = null;
        walking.current = false;
        moveStore.set(null);
        if (lit && highlightStore.get() === mine) highlightStore.set(lit);
        show(null);
        onEnd?.();
      };
      const make = (k: number, at: PanelSnap) => {
        const m = moves[k];
        if (!m) {
          done();
          return;
        }
        moveStore.set({ id: m.id, ids: m.ids });
        light(m.ids);
        const turnMs = turnMsFor(at, m.to);
        pending.timer = setTimeout(() => {
          const start = performance.now();
          const turn = (now: number) => {
            const t = Math.min(1, (now - start) / turnMs);
            show({
              values: tweenValues(def, at.values, m.to.values, easeInOut(t)),
              cables: tweenCables(at.cables, m.to.cables, t),
            });
            if (t >= 1) make(k + 1, m.to);
            else pending.frame = requestAnimationFrame(turn);
          };
          pending.frame = requestAnimationFrame(turn);
        }, MOVE_LIGHT_MS);
      };
      showing.current = { finish: done };
      walking.current = true;
      // The panel shows the step before in the same render as the session takes the step.
      show(from);
      setSess(marked(fn, 'walk'));
      // Begun once the step's change has rendered, so the first move's light comes after what the page lights for it.
      pending.timer = setTimeout(() => {
        lit = mine = highlightStore.get();
        make(0, from);
      }, 0);
      return true;
    },
    [setSess, finishShowing, marked, def]
  );
  const undo = useCallback(() => step(undoStep, 'undo'), [step]);
  const redo = useCallback(() => step(redoStep, 'redo'), [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const isUndo = k === 'z' && !e.shiftKey;
      const isRedo = (k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey && !e.metaKey);
      if (!isUndo && !isRedo) return;
      if (
        e.target instanceof Element &&
        e.target.closest(
          'input, textarea, select, [contenteditable="true"], dialog, .kys-seq, .kys-seq-skin'
        )
      )
        return;
      e.preventDefault();
      if (isUndo) undo();
      else redo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const view = useMemo(
    () => (frame ? { ...sess, values: frame.values, cables: frame.cables } : sess),
    [sess, frame]
  );

  return {
    sess: view,
    patch,
    glide,
    walk,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    shown,
    loading,
    isLoading,
  };
}
