'use client';

/**
 * Undo and redo for the panel (`lib/app/synths/lib/history.ts`): the page's session update wrapped, so a change made
 * through it is recorded and one that is not (the stored panel restored) is not. A different patch on the panel (a
 * sound or a lesson step loaded) starts the history afresh: Undo goes back through what was done to this one. ⌘Z (Ctrl+Z)
 * undoes and ⇧⌘Z (or Ctrl+Y) redoes, except in a field, a dialog or the sequencer, which has an Undo of its own. A save
 * (the sound's id changing, the panel not) keeps the history; a new patch set is a change of its own, never grouped.
 *
 * An undo or redo is shown being done: what it changes is lit (`HISTORY_LIGHT_MS`), then each control turns to its
 * value as a hand would (`HISTORY_TURN_MS`, `tweenValues`: a stepped knob through its steps, then snapped home), the
 * engine hearing the turn, and its cables go or come one by one through it, in the order they were plugged. Another press, or a change made meanwhile,
 * finishes it at once; with reduced motion it is done at once.
 *
 * A new patch is shown being set (`glide`, `glidePlan`): a sound opened, Blank patch, Restore patch, and the synth
 * itself arriving, which starts from its blank patch. The session holds the new patch at once (saved and recorded as
 * one change); what the hook hands back as the session shows the glide meanwhile, a part of the panel at a time down
 * the voice, the old cables out first and the new ones in last, so the panel and the engine both follow it. Nothing is
 * lit: the controls and cables moving are what shows it. A session that lands
 * from elsewhere meanwhile (the stored panel, the account's) carries the glide on to it; a change made through `patch`,
 * or Undo, finishes it at once.
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
  tweenCables,
  tweenValues,
  undo as undoStep,
  type PanelHistory,
  type PanelSnap,
} from '@/lib/app/synths/lib/history';
import { glideMotion } from '@/components/app/synth/motion';
import { highlightStore } from '@/components/app/synth/stores';
import type { ControlValues, PatchCable, SynthDef } from '@/lib/app/synths/contract';

/** How long what an undo or redo changes is lit before it moves, in ms. */
export const HISTORY_LIGHT_MS = 900;
/** How long the controls take to turn to where they go, in ms. */
export const HISTORY_TURN_MS = 600;

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
  /** Called as an undo or redo begins: whatever the page still has under way on the panel (Unplug all) stops. */
  onStep?: () => void
): {
  /** The session as the panel shows it: during a glide, its controls and cables part of the way there. */
  sess: S;
  patch: (fn: (s: S) => S) => void;
  /** As `patch`, the new patch shown being set (and a glide under way carried on to it, rather than finished). */
  glide: (fn: (s: S) => S) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The undo or redo being shown on the panel, if one is. */
  shown: 'undo' | 'redo' | null;
} {
  const [history, setHistory] = useState<PanelHistory>(emptyHistory);
  const historyRef = useRef(history);
  const current = useRef<PanelSnap>({ values: sess.values, cables: sess.cables });
  const prev = useRef<{ snap: PanelSnap; ident: string } | null>(null);
  // Set by a change made through `patch` (recorded) or by Undo and Redo (not), read by the effect after it renders.
  const made = useRef<'change' | 'glide' | 'history' | null>(null);
  const onStepRef = useRef(onStep);

  useEffect(() => {
    historyRef.current = history;
    onStepRef.current = onStep;
  });

  // The undo or redo being shown, or the glide, which `finish` completes at once.
  const showing = useRef<{ finish: () => void } | null>(null);
  const [shown, setShown] = useState<'undo' | 'redo' | null>(null);
  const finishShowing = useCallback(() => showing.current?.finish(), []);
  useEffect(() => finishShowing, [finishShowing]);

  // The glide: the panel as shown while it runs, from the first render on, as the synth arrives at its blank patch.
  const blank = (): PanelSnap => ({ values: { ...def.init }, cables: [] });
  const [frame, setFrame] = useState<PanelSnap | null>(blank);
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
      if (!glideMotion() || stages.length === 0) {
        gliding.current = null;
        show(null);
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
    [def]
  );

  useEffect(() => {
    const snap = { values: sess.values, cables: sess.cables };
    current.current = snap;
    const ident = `${def.id}|${sess.presetId ?? ''}|${sess.soundId ?? ''}|${sess.step ?? ''}`;
    const p = prev.current;
    prev.current = { snap, ident };
    const by = made.current;
    made.current = null;
    if (!p) return;
    const moved = p.snap.values !== snap.values || p.snap.cables !== snap.cables;
    if (moved && gliding.current) {
      const { at, delay } = gliding.current.halt();
      runGlide(at, snap, delay);
    } else if (moved && by === 'glide') runGlide(p.snap, snap, 0);
    // Saved, the panel is the same one: only a different patch on it starts the history afresh.
    if (p.ident !== ident && (moved || by !== 'change')) {
      setHistory(emptyHistory());
      return;
    }
    if (!moved) return;
    if (by === 'change' || by === 'glide')
      setHistory((h) => recordChange(h, p.snap, performance.now(), by === 'glide'));
  }, [sess, def.id]); // eslint-disable-line react-hooks/exhaustive-deps -- `runGlide` follows `def`, as `def.id` does

  // The synth arriving (the page is keyed by synth, so this is once per synth): its patch is set on the blank panel
  // the first render showed. Finished on the way out, and so begun again by React's development remount.
  useEffect(() => {
    runGlide(frameRef.current ?? blank(), current.current, ARRIVE_MS);
    return finishShowing;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

  const patch = useCallback(
    (fn: (s: S) => S) => {
      finishShowing();
      made.current = 'change';
      // Nothing changed, nothing renders, and so the mark would wait for the next session that lands from elsewhere.
      setSess((s) => {
        const next = fn(s);
        if (next === s && made.current === 'change') made.current = null;
        return next;
      });
    },
    [setSess, finishShowing]
  );

  const glide = useCallback(
    (fn: (s: S) => S) => {
      // An undo being shown is finished; a glide carries on to the new patch.
      if (!gliding.current) finishShowing();
      made.current = 'glide';
      setSess(fn);
    },
    [setSess, finishShowing]
  );

  const step = useCallback(
    (fn: typeof undoStep, which: 'undo' | 'redo') => {
      onStepRef.current?.();
      finishShowing();
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
      // Long enough for each cable to go or come in turn (Unplug all undone plugs them back one by one).
      const key = (c: PatchCable) => `${c.from}>${c.to}`;
      const had = new Set(from.cables.map(key));
      const has = new Set(to.cables.map(key));
      const cablesMoved =
        from.cables.filter((c) => !has.has(key(c))).length +
        to.cables.filter((c) => !had.has(key(c))).length;
      const turnMs = Math.min(2500, Math.max(HISTORY_TURN_MS, cablesMoved * HISTORY_CABLE_MS));
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
          'input, textarea, select, [contenteditable="true"], dialog, [role="dialog"], .kys-seq'
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
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    shown,
  };
}
