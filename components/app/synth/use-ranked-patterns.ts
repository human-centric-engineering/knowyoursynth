'use client';

/**
 * The whole library ranked for the patch on the panel (`f-pattern-picker` t-213), for the Play deck's pattern picker.
 *
 * One call to `POST /api/v1/library-patterns/rank` returns every public pattern in a section per role, as lean rows,
 * for what the sound detector hears of the patch. When it is asked (in the background with the picker closed, so it
 * usually opens on an answer already there), when it is asked again (the patch moved far from what it was found for),
 * and what the open picker shows meanwhile (it holds still, and offers a newer answer as `fresher`) are
 * `usePatchAnswer`'s (`f-pattern-prefetch` t-263). Unlike "Suits this sound" (`useSuggestedPatterns`) there is no
 * `movedFar` gate on the start sound: the sound's own patterns lead the picker anyway, so the library is ranked under
 * them whatever the patch.
 *
 * Only patterns of the patch's category are listed (t-255): a patch not moved far from its start sound is that sound
 * as it came (`asCame`), listed by its tag; one moved far, or with no start, by the category the detector hears. A
 * reading that fails (the detector could not run, the panel could not be worked out), or is not made (opened while
 * something plays, where the detector reads on the page's thread), asks for the library without features, which the
 * endpoint lists by role and name, so the picker is never empty.
 */

import { apiClient } from '@/lib/api/client';
import { movedFar } from '@/lib/app/patterns/suggest';
import type { PatchReadings, PatchStart } from '@/lib/app/patterns/suggest-detect';
// Type only: this module reaches the browser, and the read module holds the database client.
import type { RankResult } from '@/lib/app/patterns/rank-read';
import {
  usePatchAnswer,
  type Ask,
  type PatchAnswer,
} from '@/components/app/sequencer/use-patch-answer';
import type { PanelState } from '@/components/app/sequencer/use-suggested-patterns';
import type { SynthDef } from '@/lib/app/synths/contract';

export interface RankInput {
  /** The page's panel readings, shared with `useSuggestedPatterns` (`usePatchReadings`). */
  readings: PatchReadings;
  synthId: string;
  def: SynthDef;
  /** The panel now. */
  panel: PanelState;
  /**
   * The library sound the patch started as, if it did, as `useSuggestedPatterns` takes it: its own patterns are left
   * out of the sections, and while the patch has not moved far from it the library is limited to its category.
   */
  start: PatchStart | null;
  /** Whether the picker is open. */
  open: boolean;
  /** False while what is on the panel is not settled yet (one of the user's sounds still loading). */
  enabled?: boolean;
  /** Something is playing: nothing is worked out in the background. */
  busy?: boolean;
}

/**
 * `off`: the picker is closed. `reading`: the detector or the endpoint is working. `ready`: `result` holds the answer.
 * `error`: the library could not be read; closing the picker and opening it again tries again.
 */
export type RankState = 'off' | 'reading' | 'ready' | 'error';

export interface RankedPatterns extends Omit<PatchAnswer<RankResult>, 'state'> {
  state: RankState;
}

export function useRankedPatterns(input: RankInput): RankedPatterns {
  const { synthId, start, enabled = true, busy = false } = input;
  const sound = start?.slug ?? null;
  const ask: Ask<RankResult> = (was, features) => {
    // Still the sound as it came: listed by its tag. A patch or start that could not be read is taken to be, as
    // nothing says it has moved.
    const asCame = !!was && (!features || !was.features || !movedFar(was.features, features));
    const group = `${asCame}`;
    return {
      group,
      key: `${group}|${features ? JSON.stringify(features) : ''}`,
      request: () =>
        apiClient.post<RankResult>('/api/v1/library-patterns/rank', {
          body: {
            synthId,
            ...(sound ? { sound } : {}),
            ...(features ? { features } : {}),
            ...(asCame ? { asCame } : {}),
          },
        }),
    };
  };
  const answer = usePatchAnswer<RankResult>({
    readings: input.readings,
    synthId,
    def: input.def,
    panel: input.panel,
    start,
    scope: `${synthId}|${sound ?? ''}`,
    open: input.open,
    enabled,
    busy,
    ask,
    label: 'pattern picker',
  });
  // Ranking never says `near`: there is always a library to rank.
  return { ...answer, state: answer.state === 'near' ? 'ready' : answer.state };
}
