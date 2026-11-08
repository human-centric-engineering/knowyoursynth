'use client';

/**
 * The whole library ranked for the patch on the panel (`f-pattern-picker` t-213), for the Play deck's pattern picker.
 *
 * Nothing happens until the picker is open. Then, once the panel has settled (`SETTLE_MS` since it last changed, which
 * a panel left alone has long been), the sound detector reads the patch in the probe worker (`createKindReader`), and
 * one call to `POST /api/v1/library-patterns/rank` returns every public pattern in a section per role, as lean rows.
 * Unlike "Suits this sound" (`useSuggestedPatterns`) there is no `movedFar` gate: the sound's own patterns lead the
 * picker anyway, so the library is ranked under them whatever the patch.
 *
 * The answer holds while the picker is open, so nothing jumps under the pointer: a knob turned meanwhile is read the
 * next time it opens. A panel unchanged since it was last read is not read again, and the answer for each reading is
 * kept for the visit, so a patch that comes back to where it was is not asked about again. A reading that fails (the detector could not run, the panel could not be worked out) asks for
 * the library without features, which the endpoint lists by role and name, so the picker is never empty.
 */

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { logger } from '@/lib/logging';
import { createKindReader, type KindReader } from '@/lib/app/patterns/suggest-detect';
// Type only: this module reaches the browser, and the read module holds the database client.
import type { RankResult } from '@/lib/app/patterns/rank-read';
import { SETTLE_MS, type PanelState } from '@/components/app/sequencer/use-suggested-patterns';
import { engineOf } from '@/lib/app/synths/lib/predict';
import type { SoundFeatures } from '@/lib/app/synths/lib/soundkind';
import type { SynthDef } from '@/lib/app/synths/contract';

export interface RankInput {
  synthId: string;
  def: SynthDef;
  /** The panel now. */
  panel: PanelState;
  /** The library sound the patch started as, if it did: its own patterns are left out of the sections. */
  sound: string | null;
  /** Whether the picker is open: nothing is read while it is not. */
  open: boolean;
  /** False while what is on the panel is not settled yet (one of the user's sounds still loading). */
  enabled?: boolean;
}

/**
 * `off`: the picker is closed. `reading`: the detector or the endpoint is working. `ready`: `result` holds the answer.
 * `error`: the library could not be read; closing the picker and opening it again tries again.
 */
export type RankState = 'off' | 'reading' | 'ready' | 'error';

export interface RankedPatterns {
  state: RankState;
  result: RankResult | null;
}

/** How many answers are kept for the visit; the oldest goes first. */
const KEEP_ANSWERS = 50;

const OFF: RankedPatterns = { state: 'off', result: null };
const READING: RankedPatterns = { state: 'reading', result: null };

export function useRankedPatterns(input: RankInput): RankedPatterns {
  const { synthId, def, panel, sound, open, enabled = true } = input;
  const [status, setStatus] = useState<RankedPatterns>(OFF);
  const reader = useRef<KindReader | null>(null);
  const answers = useRef(new Map<string, Promise<RankResult>>());
  // The last panel the detector read, and what it heard.
  const lastRead = useRef<
    (PanelState & { def: SynthDef; features: Promise<SoundFeatures | null> }) | null
  >(null);
  useEffect(
    () => () => {
      reader.current?.dispose();
      reader.current = null;
    },
    []
  );

  // The panel as it is when the picker reads it, and when it last changed: read through refs, so a change while the
  // picker is open does not rank it again.
  const panelRef = useRef(panel);
  const changedAt = useRef(0);
  const { values, cables } = panel;
  useEffect(() => {
    panelRef.current = { values, cables };
    changedAt.current = Date.now();
  }, [values, cables]);

  const on = open && enabled;
  useEffect(() => {
    if (!on) {
      setStatus(OFF);
      return undefined;
    }
    let live = true;
    setStatus(READING);
    const rank = () => {
      const now = panelRef.current;
      // The panel read last time, unchanged since, is not read again; one that could not be read is tried again.
      let heard = lastRead.current;
      if (
        !heard ||
        heard.def !== def ||
        heard.values !== now.values ||
        heard.cables !== now.cables
      ) {
        const read = (reader.current ??= createKindReader());
        const entry = {
          def,
          values: now.values,
          cables: now.cables,
          features: Promise.resolve<SoundFeatures | null>(null),
        };
        // Working out the panel's sound (engineOf) can throw: that is a reading that failed, ranked without features.
        entry.features = Promise.resolve()
          .then(() => read.read(engineOf(def, now.values, now.cables, 0)))
          .catch((err: unknown): SoundFeatures | null => {
            if (lastRead.current === entry) lastRead.current = null;
            logger.warn('pattern picker: the patch could not be read', {
              synthId,
              err: String(err),
            });
            return null;
          });
        heard = entry;
        lastRead.current = entry;
      }
      heard.features
        .then((features) => {
          if (!live) return null;
          const key = `${synthId}|${sound ?? ''}|${features ? JSON.stringify(features) : ''}`;
          let asked = answers.current.get(key);
          if (!asked) {
            asked = apiClient.post<RankResult>('/api/v1/library-patterns/rank', {
              body: {
                synthId,
                ...(sound ? { sound } : {}),
                ...(features ? { features } : {}),
              },
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
            if (!live) return;
            logger.warn('pattern picker: the library could not be ranked', {
              synthId,
              err: String(err),
            });
            setStatus({ state: 'error', result: null });
          }
        );
    };
    // Still settling when the wait is up (a patch's glide, a knob turned as it opened): wait again from its last change.
    const left = () => SETTLE_MS - (Date.now() - changedAt.current);
    const settle = () => {
      if (left() > 0) t = setTimeout(settle, left());
      else rank();
    };
    let t = setTimeout(settle, Math.max(0, left()));
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [on, synthId, def, sound]);

  return status;
}
