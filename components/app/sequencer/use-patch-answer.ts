'use client';

/**
 * The answer a pattern picker shows for the patch on the panel (`f-pattern-prefetch` t-263), worked out ahead of the
 * click: the core both pickers share (`useRankedPatterns` for the Play deck's, `useSuggestedPatterns` for the
 * sequencer's Patterns). Each says how to ask (`ask`); this says when, and which answer is shown.
 *
 * - **Prepared in the background.** With the picker closed, once the panel has settled (`SETTLE_MS` since it last
 *   changed) and the page has been quiet (`busy` false for `QUIET_MS`), the patch is read and asked about at idle. So
 *   opening usually finds the answer already there. Nothing is prepared while `busy`: a reading or a request not
 *   started when it turns true is not started. Nothing is prepared at all once the detector reads on the page's
 *   thread (workers blocked), where it would take time from the code that schedules notes.
 * - **Found again on a far move.** Each answer keeps the reading it was found for. A later reading that has moved far
 *   from it (`movedFar`) is asked about again; a nearer one keeps the answer, since the library's order barely
 *   changes for it.
 * - **Held while open.** An open picker's answer does not change under the pointer. A newer far-moved answer found
 *   while it is open is offered (`fresher`, taken with `take`), not swapped in. A closed picker takes it silently.
 * - **Opened while busy.** The user's request: the patch is read at once, in the worker. Where the detector reads on
 *   the page's thread it is not read while busy; the hook asks without a reading, and reads once quiet, showing the
 *   answer found with the reading in place of the one found without (not offered: that one was never for the patch).
 * - **One reading for a patch as it came.** A panel holding the start sound's values and cables is that sound's
 *   reading, not a second one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logging';
import { movedFar } from '@/lib/app/patterns/suggest';
import {
  createKindReader,
  createPatchReadings,
  ReadSkipped,
  samePanel,
  type PatchReadings,
  type PatchStart,
} from '@/lib/app/patterns/suggest-detect';
import type { PanelState } from '@/lib/app/synths/lib/patch';
import type { SoundFeatures } from '@/lib/app/synths/lib/soundkind';
import type { SynthDef } from '@/lib/app/synths/contract';

/** How long the panel has to be still before the patch is read again, in ms. */
export const SETTLE_MS = 800;

/** How long nothing has to have been playing before anything is worked out in the background, in ms. */
export const QUIET_MS = 1500;

/** The longest background work waits on the browser being idle before it starts anyway, in ms. */
const IDLE_TIMEOUT_MS = 2000;

/** How many answers are kept for the visit; the oldest goes first. */
const KEEP_ANSWERS = 50;

/** The panel readings the page's pickers share: one reader, one reading at a time, its worker started with the page. */
export function usePatchReadings(): PatchReadings {
  const [{ reader, readings }] = useState(() => {
    const r = createKindReader();
    return { reader: r, readings: createPatchReadings(r) };
  });
  useEffect(() => {
    reader.warm();
    return () => readings.dispose();
  }, [reader, readings]);
  return readings;
}

/**
 * How a picker asks, given the start sound's reading (null with no start; `features` null where it could not be read)
 * and the panel's (null where it could not be read, or was not, while busy on the page's thread). `near`: nothing to
 * ask. Null: nothing can be asked without a reading. Otherwise the request, its `key` (one answer per key is kept for
 * the visit) and its `group`: two readings are compared for a far move only within one group.
 */
export type Ask<T> = (
  start: { features: SoundFeatures | null } | null,
  now: SoundFeatures | null
) => 'near' | null | { group: string; key: string; request: () => Promise<T> };

export interface PatchAnswerInput<T> {
  readings: PatchReadings;
  synthId: string;
  def: SynthDef;
  /** The panel now. */
  panel: PanelState;
  start: PatchStart | null;
  /** What else the answers are for: a change starts over. */
  scope: string;
  /** Whether the picker is open. */
  open: boolean;
  /** False while what is on the panel is not settled yet: nothing is read, open or not. */
  enabled: boolean;
  /** Something is playing (see the module doc). */
  busy: boolean;
  ask: Ask<T>;
  /** Names the picker in the log. */
  label: string;
}

/**
 * `off`: the picker is closed (or not enabled). `reading`: no answer to show yet. `near`: nothing to ask. `ready`:
 * `result` holds the answer. `error`: it could not be worked out; closing the picker and opening it again tries again.
 */
export type AnswerState = 'off' | 'reading' | 'near' | 'ready' | 'error';

export interface PatchAnswer<T> {
  state: AnswerState;
  result: T | null;
  /** A newer answer, for a patch moved far since the open picker's was found: offered, not swapped in. */
  fresher: T | null;
  /** Shows `fresher` in place of the answer. */
  take: () => void;
}

interface Answer<T> {
  scope: string;
  def: SynthDef;
  start: PatchStart | null;
  group: string;
  /** The reading it was found for. */
  features: SoundFeatures | null;
  /** The panel last read as it (near enough); null when it was asked without a reading. */
  read: PanelState | null;
  outcome: { near: true } | { result: T };
}

interface View<T> {
  state: AnswerState;
  result: T | null;
  fresher: T | null;
}

/** Whether two starts are the same sound: a start rebuilt for the same sound (a lesson's next step) is not a new one. */
const sameStart = (a: PatchStart | null, b: PatchStart | null): boolean =>
  a === b || (!!a && !!b && a.slug === b.slug);

const resultOf = <T>(a: Answer<T> | null): T | null =>
  a && 'result' in a.outcome ? a.outcome.result : null;

/** `requestIdleCallback` where the browser has it; a timer elsewhere. Returns how to call it off. */
function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(id);
  }
  const t = setTimeout(run, 0);
  return () => clearTimeout(t);
}

export function usePatchAnswer<T>(input: PatchAnswerInput<T>): PatchAnswer<T> {
  const { readings, def, start, scope, open, enabled, busy } = input;
  const on = open && enabled;
  const [view, setViewNow] = useState<View<T>>({ state: 'off', result: null, fresher: null });
  // Set only when it changes, checked here rather than in an updater: an updater returning the state it was given is
  // still an update queued, and queued from an effect on every move of the panel it chains an update onto each frame
  // of a glide, which React reports as "Maximum update depth exceeded" (t-157).
  const viewRef = useRef(view);
  const setView = useCallback((next: View<T>) => {
    const was = viewRef.current;
    if (was.state === next.state && was.result === next.result && was.fresher === next.fresher)
      return;
    viewRef.current = next;
    setViewNow(next);
  }, []);

  // The props the work reads when it runs, rather than when it was scheduled.
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });
  // The panel, and when it last changed: the first run, on mount, is not a change (0: long settled when the page opened).
  const panelRef = useRef(input.panel);
  const changedAt = useRef(0);
  const { values, cables } = input.panel;
  const mounted = useRef(false);
  useEffect(() => {
    panelRef.current = { values, cables };
    if (mounted.current) changedAt.current = Date.now();
    mounted.current = true;
  }, [values, cables]);
  // Since when nothing has been playing (null: something is; 0: nothing has since the page opened).
  const busyRef = useRef(busy);
  const quietSince = useRef<number | null>(0);
  useEffect(() => {
    busyRef.current = busy;
    if (busy) quietSince.current = null;
    else quietSince.current ??= Date.now();
  }, [busy]);

  // The latest answer for the patch, open or closed; and the one the open picker shows.
  const found = useRef<Answer<T> | null>(null);
  const shown = useRef<Answer<T> | null>(null);
  const fresher = useRef<Answer<T> | null>(null);
  const answers = useRef(new Map<string, Promise<T>>());
  // What the open picker could not work out: it stays in error for that until closed.
  const failedFor = useRef<{ scope: string; def: SynthDef; start: PatchStart | null } | null>(null);

  /** Whether `a` was found for what is on the panel now. */
  const current = useCallback((a: Answer<T> | null): a is Answer<T> => {
    const { def: d, start: s, scope: sc } = latest.current;
    return (
      !!a &&
      a.scope === sc &&
      a.def === d &&
      sameStart(a.start, s) &&
      !!a.read &&
      samePanel(a.read, panelRef.current)
    );
  }, []);

  /**
   * Reads the patch and finds its answer, keeping the one found before for a reading not moved far from it. Null:
   * called off (background work, skipped) or nothing to show yet (busy on the page's thread). Throws where it could not
   * be worked out.
   */
  const work = useCallback(
    async (mode: 'open' | 'background', signal?: AbortSignal): Promise<Answer<T> | null> => {
      const { synthId, def: d, start: s, scope: sc, ask, label } = latest.current;
      const now = panelRef.current;
      const background = mode === 'background';
      // Not on the page's thread while something plays: asked without a reading, and read once quiet.
      const deferred = !background && busyRef.current && readings.onPageThread;
      const opts = { background, signal };
      const failed = (what: string) => (err: unknown) => {
        if (err instanceof ReadSkipped) throw err;
        logger.warn(`${label}: ${what} could not be read`, { synthId, err: String(err) });
        return null;
      };
      let was: { features: SoundFeatures | null } | null = null;
      let features: SoundFeatures | null = null;
      try {
        if (!deferred) {
          const startRead = s ? readings.start(d, s, opts).catch(failed('the start sound')) : null;
          let asCame = false;
          try {
            asCame = !!s && samePanel(now, readings.startPanel(s));
          } catch {
            // A start whose panel cannot be worked out is not the panel; its reading fails on its own.
          }
          const panelRead = asCame
            ? startRead
            : readings.panel(d, now, opts).catch(failed('the patch'));
          // Both awaited together: one skipped leaves the other's rejection handled.
          const [w, f] = await Promise.all([startRead, panelRead]);
          was = s ? { features: w } : null;
          features = f;
        }
      } catch (err) {
        if (err instanceof ReadSkipped) return null;
        throw err;
      }
      // Not read is not known: a start not read is taken to be, as one that could not be.
      const asked = ask(deferred && s ? { features: null } : was, features);
      if (asked === null) {
        if (deferred) return null;
        throw new Error('the patch could not be read');
      }
      const group = asked === 'near' ? 'near' : asked.group;
      const read = features ? now : null;
      const f = found.current;
      const kept =
        f &&
        f.scope === sc &&
        f.def === d &&
        sameStart(f.start, s) &&
        f.group === group &&
        (features ? !!f.features && !movedFar(f.features, features) : true);
      let answer: Answer<T>;
      if (kept) {
        answer = { ...f, read: read ?? f.read };
      } else {
        let outcome: Answer<T>['outcome'];
        if (asked === 'near') outcome = { near: true };
        else {
          // Kept per scope: a key is only one picker's reading, and the same reading for another sound is not its answer.
          const key = `${sc}|${asked.key}`;
          let pending = answers.current.get(key);
          if (!pending) {
            if (signal?.aborted) return null;
            pending = asked.request();
            answers.current.set(key, pending);
            const oldest = answers.current.keys().next().value;
            if (answers.current.size > KEEP_ANSWERS && oldest !== undefined)
              answers.current.delete(oldest);
            pending.catch(() => answers.current.delete(key));
          }
          outcome = { result: await pending };
        }
        answer = { scope: sc, def: d, start: s, group, features, read, outcome };
      }
      // Kept only while it is still for what the picker is about.
      const l = latest.current;
      if (l.scope === sc && l.def === d && sameStart(l.start, s)) found.current = answer;
      return answer;
    },
    [readings]
  );

  // The open picker: shows the answer found for the patch, or works it out; then, while it stays open, finds newer
  // answers to offer.
  useEffect(() => {
    if (!on) {
      shown.current = null;
      fresher.current = null;
      failedFor.current = null;
      setView({ state: 'off', result: null, fresher: null });
      return undefined;
    }
    const fail = failedFor.current;
    if (fail && fail.scope === scope && fail.def === def && sameStart(fail.start, start))
      return undefined;
    failedFor.current = null;
    const was = shown.current;
    if (!was || was.scope !== scope || was.def !== def || !sameStart(was.start, start)) {
      // Just opened, or about something else now.
      shown.current = null;
      fresher.current = null;
      if (current(found.current)) {
        shown.current = found.current;
        setView(viewOf(found.current, null));
        return undefined;
      }
      setView({ state: 'reading', result: null, fresher: null });
    } else if (current(fresher.current ?? was)) {
      return undefined;
    }
    let live = true;
    // Not read on the page's thread while something plays, but once it has been quiet a while. The first answer is
    // still asked for meanwhile, without a reading, where the picker can ask without one.
    const waitQuiet = readings.onPageThread && !busy;
    if (readings.onPageThread && busy && shown.current) return undefined;
    const left = () =>
      Math.max(
        SETTLE_MS - (Date.now() - changedAt.current),
        waitQuiet ? QUIET_MS - (Date.now() - (quietSince.current ?? Date.now())) : 0
      );
    const run = () => {
      work('open').then(
        (answer) => {
          if (!live || !answer) return;
          const showing = shown.current;
          if (!showing) {
            shown.current = answer;
            setView(viewOf(answer, null));
            return;
          }
          // One asked without a reading (busy on the page's thread) gives way to the first found with one.
          if (!showing.features && answer.features) {
            shown.current = answer;
            fresher.current = null;
            setView(viewOf(answer, null));
            return;
          }
          // The same answer, for a patch moved only a little: still the one shown.
          // Moved back to it: what was offered is for a patch no longer on the panel.
          if (answer.outcome === showing.outcome || resultOf(answer) === resultOf(showing)) {
            shown.current = { ...showing, read: answer.read ?? showing.read };
            fresher.current = null;
            setView(viewOf(shown.current, null));
            return;
          }
          // Offered, not swapped in; a far move back to nothing more to offer is not worth offering.
          if (!('result' in answer.outcome)) return;
          fresher.current = answer;
          setView(viewOf(showing, answer));
        },
        (err: unknown) => {
          if (!live) return;
          logger.warn(`${latest.current.label}: could not be worked out`, {
            synthId: latest.current.synthId,
            err: String(err),
          });
          if (shown.current) return;
          failedFor.current = { scope, def, start };
          setView({ state: 'error', result: null, fresher: null });
        }
      );
    };
    // Still settling when the wait is up (a patch's glide, a knob turned as it opened): wait again from its last change.
    const settle = () => {
      if (left() > 0) t = setTimeout(settle, left());
      else run();
    };
    let t = setTimeout(settle, Math.max(0, left()));
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [on, scope, def, start, values, cables, busy, readings, current, work, setView]);

  // The closed picker: prepared in the background, once settled and quiet, at idle.
  useEffect(() => {
    if (on || !enabled || busy || readings.onPageThread || current(found.current)) return undefined;
    const ctl = new AbortController();
    let cancelIdle: (() => void) | undefined;
    const left = () =>
      Math.max(
        SETTLE_MS - (Date.now() - changedAt.current),
        QUIET_MS - (Date.now() - (quietSince.current ?? Date.now()))
      );
    const settle = () => {
      if (left() > 0) {
        t = setTimeout(settle, left());
        return;
      }
      cancelIdle = whenIdle(() => {
        work('background', ctl.signal).catch((err: unknown) => {
          // Not said: opening the picker asks again, and says so if it fails then.
          logger.debug(`${latest.current.label}: not prepared`, { err: String(err) });
        });
      });
    };
    let t = setTimeout(settle, Math.max(0, left()));
    return () => {
      clearTimeout(t);
      cancelIdle?.();
      ctl.abort();
    };
  }, [on, enabled, busy, scope, def, start, values, cables, readings, current, work]);

  const take = useCallback(() => {
    const next = fresher.current;
    if (!next) return;
    shown.current = next;
    fresher.current = null;
    setView(viewOf(next, null));
  }, [setView]);

  return { state: view.state, result: view.result, fresher: view.fresher, take };
}

function viewOf<T>(answer: Answer<T>, fresher: Answer<T> | null): View<T> {
  return 'result' in answer.outcome
    ? { state: 'ready', result: answer.outcome.result, fresher: resultOf(fresher) }
    : { state: 'near', result: null, fresher: resultOf(fresher) };
}
