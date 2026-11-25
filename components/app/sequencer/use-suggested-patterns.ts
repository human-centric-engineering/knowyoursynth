'use client';

/**
 * Patterns that suit the patch on the panel (`f-pattern-library` t-125), for the pattern picker's "Suits this sound"
 * group.
 *
 * The sound detector reads the patch in the probe worker. A library sound on the panel as it came already has its own
 * patterns, so the patch is only offered more once it has moved far from that sound (`movedFar`); one of the user's
 * sounds, a shared one or the tutor's is offered them at once. Then one call to `POST /api/v1/library-patterns/suggest`,
 * which returns the patterns themselves, so nothing is read per pattern.
 *
 * When that happens is `usePatchAnswer`'s (`f-pattern-prefetch` t-263): in the background while the picker is closed
 * and nothing plays, so it usually opens on an answer already there; again when the patch has moved far from what it
 * was found for; and while the picker is open its list holds still, a newer one offered as `fresher`.
 */

import { useCallback, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { movedFar } from '@/lib/app/patterns/suggest';
import type { PatchReadings, PatchStart } from '@/lib/app/patterns/suggest-detect';
// Type only: this module reaches the browser, and the read module holds the database client.
import type { SuggestResult } from '@/lib/app/patterns/suggest-read';
import {
  usePatchAnswer,
  type AnswerState,
  type Ask,
  type PatchAnswer,
} from '@/components/app/sequencer/use-patch-answer';
import type { PanelState } from '@/lib/app/synths/lib/patch';
import type { SynthDef } from '@/lib/app/synths/contract';

export { SETTLE_MS } from '@/components/app/sequencer/use-patch-answer';

/** The panel's values and cables, as `presetState` gives a sound's. */
export type { PanelState };

export interface SuggestInput {
  /** The page's panel readings, shared with `useRankedPatterns` (`usePatchReadings`). */
  readings: PatchReadings;
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
  start: PatchStart | null;
  /**
   * How many patterns the start sound has of its own, null while they are being read. A sound with none brought
   * nothing to the picker, so it is offered more at once, limited to its tag while it is as it came (as the picker's
   * sections are) and to the category heard once it has moved far.
   */
  ownPatterns?: number | null;
  /** False while what is on the panel is not settled yet (one of the user's sounds still loading). */
  enabled?: boolean;
  /** Something is playing: nothing is worked out in the background. */
  busy?: boolean;
}

/**
 * `off`: the picker is closed. `reading`: the detector or the endpoint is working. `near`: a library sound not moved
 * far from how it came, so nothing more is offered. `ready`: `result` holds the answer. `error`: it could not be worked
 * out; closing the picker and opening it again tries again.
 */
export type SuggestState = AnswerState;

export interface SuggestedPatterns extends PatchAnswer<SuggestResult> {
  /** Whether the picker is open. */
  want: (on: boolean) => void;
}

export function useSuggestedPatterns(input: SuggestInput): SuggestedPatterns {
  const { synthId, start, enabled = true, busy = false } = input;
  // A start with no patterns of its own brought nothing to the picker: it is offered more at once, by its tag while it
  // is as it came (t-255).
  const noneOwn = input.ownPatterns === 0;
  const [wanted, setWanted] = useState(false);
  const want = useCallback((on: boolean) => setWanted(on), []);
  const slug = start?.slug;
  const ask: Ask<SuggestResult> = (was, now) => {
    if (!now) return null;
    // Offered more whatever the start reads as, a start that cannot be read is taken to be as it came.
    if (was && !was.features && !noneOwn) return null;
    const far = !!was?.features && movedFar(was.features, now);
    if (!noneOwn && was && !far) return 'near';
    const asCame = noneOwn && !!was && !far;
    const group = `${asCame}`;
    return {
      group,
      key: `${group}|${JSON.stringify(now)}`,
      request: () =>
        apiClient.post<SuggestResult>('/api/v1/library-patterns/suggest', {
          body: {
            synthId,
            ...(slug ? { sound: slug } : {}),
            features: now,
            ...(asCame ? { asCame } : {}),
          },
        }),
    };
  };
  const answer = usePatchAnswer<SuggestResult>({
    readings: input.readings,
    synthId,
    def: input.def,
    panel: input.panel,
    start,
    scope: `${synthId}|${slug ?? ''}|${noneOwn}`,
    open: wanted,
    enabled,
    busy,
    ask,
    label: 'sequencer: patterns that suit the patch',
  });
  return { ...answer, want };
}
