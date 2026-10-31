'use client';

/**
 * Patterns that suit the patch on the panel (`f-pattern-library` t-125), for the pattern picker's "Suits this sound"
 * group.
 *
 * Nothing happens until the picker is open (`want(true)`). Then, once the panel has settled (`SETTLE_MS` since the last
 * change), the sound detector reads the patch in the probe worker (`createKindReader`). A library sound on the panel as
 * it came already has its own patterns, so the patch is only offered more once it has moved far from that sound
 * (`movedFar`); one of the user's sounds, a shared one or the tutor's is offered them at once. Then one call to
 * `POST /api/v1/library-patterns/suggest`, which returns the patterns themselves, so nothing is read per pattern.
 *
 * A knob turned and turned again asks once, when it stops. The same patch is never asked about twice in a visit: the
 * detector is deterministic, so a patch that comes back to where it was reads the same, and its answer is kept.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { logger } from '@/lib/logging';
import { createKindReader, type KindReader } from '@/lib/app/patterns/suggest-detect';
import { movedFar } from '@/lib/app/patterns/suggest';
// Type only: this module reaches the browser, and the read module holds the database client.
import type { SuggestResult } from '@/lib/app/patterns/suggest-read';
import { engineOf } from '@/lib/app/synths/lib/predict';
import type { PanelState } from '@/lib/app/synths/lib/patch';
import type { SoundFeatures } from '@/lib/app/synths/lib/soundkind';
import type { SynthDef } from '@/lib/app/synths/contract';

/** How long the panel has to be still before the patch is read again, in ms. */
export const SETTLE_MS = 800;

/** The panel's values and cables, as `presetState` gives a sound's. */
export type { PanelState };

export interface SuggestInput {
  synthId: string;
  def: SynthDef;
  /** The panel now. */
  panel: PanelState;
  /**
   * The library sound the panel started as, as it came (at the lesson step on the panel, if it is on one), or null
   * with none (then the patch is always offered more).
   * Its panel is worked out only when it is read. Keep it the same object while the sound is the same: a new one reads
   * the patch again.
   */
  start: { slug: string; panel: () => PanelState } | null;
  /**
   * How many patterns the start sound has of its own, null while they are being read. A sound with none brought
   * nothing to the picker, so it is offered more at once, as a patch with no start is.
   */
  ownPatterns?: number | null;
  /** False while what is on the panel is not settled yet (one of the user's sounds still loading). */
  enabled?: boolean;
}

/**
 * `off`: the picker is closed. `reading`: the detector or the endpoint is working. `near`: a library sound not moved
 * far from how it came, so nothing more is offered. `ready`: `result` holds the answer. `error`: it could not be worked
 * out; closing the picker and opening it again tries again.
 */
export type SuggestState = 'off' | 'reading' | 'near' | 'ready' | 'error';

export interface SuggestedPatterns {
  state: SuggestState;
  result: SuggestResult | null;
  /** Whether the picker is open: nothing is read while it is not. */
  want: (on: boolean) => void;
}

/** How many answers are kept for the visit; the oldest goes first. */
const KEEP_ANSWERS = 50;

const OFF = { state: 'off', result: null } as const;
const READING = { state: 'reading', result: null } as const;

export function useSuggestedPatterns(input: SuggestInput): SuggestedPatterns {
  const { synthId, def, panel, enabled = true } = input;
  const start = input.ownPatterns === 0 ? null : input.start;
  const [wanted, setWanted] = useState(false);
  const [status, setStatus] = useState<{ state: SuggestState; result: SuggestResult | null }>(OFF);
  const reader = useRef<KindReader | null>(null);
  // Each start's reading, by the start itself: a new sound, or a new lesson step of it, is a new start.
  const starts = useRef(new WeakMap<object, Promise<SoundFeatures>>());
  const answers = useRef(new Map<string, Promise<SuggestResult>>());
  useEffect(
    () => () => {
      reader.current?.dispose();
      reader.current = null;
    },
    []
  );

  const want = useCallback((on: boolean) => setWanted(on), []);

  const { values, cables } = panel;

  useEffect(() => {
    if (!wanted || !enabled) {
      // The same object while it stays off: a panel change with the picker closed re-renders nothing.
      setStatus((s) => (s.state === 'off' ? s : OFF));
      return undefined;
    }
    let live = true;
    // What was suggested for the patch before is not for this one: it goes while this is read. The same object while
    // it stays reading, so each tick of a knob re-renders nothing.
    setStatus((s) => (s.state === 'reading' ? s : READING));
    const t = setTimeout(() => {
      const read = (reader.current ??= createKindReader());
      // Working out a panel (presetState) or its sound (engineOf) can throw; that is a reading that failed, not a crash.
      const readPanel = (panelOf: () => PanelState) =>
        Promise.resolve().then(() => {
          const p = panelOf();
          return read.read(engineOf(def, p.values, p.cables, 0));
        });
      let startRead: Promise<SoundFeatures | null> = Promise.resolve(null);
      if (start) {
        let kept = starts.current.get(start);
        if (!kept) {
          kept = readPanel(start.panel);
          starts.current.set(start, kept);
          kept.catch(() => starts.current.delete(start));
        }
        startRead = kept;
      }
      Promise.all([startRead, readPanel(() => ({ values, cables }))])
        .then(([was, now]) => {
          if (!live) return null;
          if (!movedFar(was, now)) {
            setStatus({ state: 'near', result: null });
            return null;
          }
          const slug = start?.slug;
          const key = `${synthId}|${slug ?? ''}|${JSON.stringify(now)}`;
          let asked = answers.current.get(key);
          if (!asked) {
            asked = apiClient.post<SuggestResult>('/api/v1/library-patterns/suggest', {
              body: { synthId, ...(slug ? { sound: slug } : {}), features: now },
            });
            answers.current.set(key, asked);
            const oldest = answers.current.keys().next().value;
            if (answers.current.size > KEEP_ANSWERS && oldest !== undefined)
              answers.current.delete(oldest);
            asked.catch(() => answers.current.delete(key));
          }
          return asked;
        })
        .then(
          (result) => {
            if (live && result) setStatus({ state: 'ready', result });
          },
          (err: unknown) => {
            // A reading of a patch that has gone (the picker closed, the page left) failed nobody.
            if (!live) return;
            logger.warn('sequencer: patterns that suit the patch could not be worked out', {
              synthId,
              err: String(err),
            });
            setStatus({ state: 'error', result: null });
          }
        );
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [wanted, enabled, synthId, def, start, values, cables]);

  return { state: status.state, result: status.result, want };
}
