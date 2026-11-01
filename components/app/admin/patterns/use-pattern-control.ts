'use client';

/**
 * usePatternControl — sets the rights risk or status of library patterns through
 * `POST /api/v1/admin/library-patterns/control` (`f-pattern-library` t-156), for the provenance panel and the list's
 * bulk bar alike.
 *
 * A disable that would leave a patch with no enabled pattern is refused, its problems on the `acknowledge` path: the
 * hook holds that change as `warning` until the admin confirms it (sent again with `acknowledge`) or cancels. Anything
 * else refused is a `refusal`. Once a change lands, `onDone` runs, for the page to refresh.
 */

import { useState } from 'react';
import type { PatternRightsRisk, PatternStatus } from '@prisma/client';

import { refusalOf, type Problem, type Refusal } from '@/components/app/admin/synths/problems';
import { apiClient } from '@/lib/api/client';

/** What a control sets: a rights risk, a status or both, with one reason. */
export interface ControlChange {
  rightsRisk?: PatternRightsRisk;
  status?: PatternStatus;
  reason: string;
}

interface ControlResult {
  changed: string[];
  soundsRewritten: string[];
  leftWithout: { synthId: string; slug: string; name: string }[];
}

/** A held change: a disable the server warned about, waiting for the admin's answer. */
export interface ControlWarning {
  ids: string[];
  change: ControlChange;
  problems: Problem[];
}

export interface PatternControl {
  busy: boolean;
  refusal: Refusal | null;
  warning: ControlWarning | null;
  /** What the last change did, once it landed. */
  status: string | null;
  send: (ids: string[], change: ControlChange) => Promise<void>;
  /** Send the held change again, acknowledged. */
  confirm: () => Promise<void>;
  cancel: () => void;
}

/** The path the server names when a disable would leave a patch with nothing to play (`ACKNOWLEDGE_PATH`). */
const ACKNOWLEDGE = 'acknowledge';

export function usePatternControl(onDone: () => void): PatternControl {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [warning, setWarning] = useState<ControlWarning | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function send(ids: string[], change: ControlChange, acknowledge = false) {
    setBusy(true);
    setRefusal(null);
    setStatus(null);
    try {
      const result = await apiClient.post<ControlResult>('/api/v1/admin/library-patterns/control', {
        body: { ids, ...change, acknowledge },
      });
      setWarning(null);
      setStatus(summary(result));
      onDone();
    } catch (err) {
      const refused = refusalOf(err, 'The change could not be saved. Try again.');
      const unplayable = refused.problems.filter((p) => p.path === ACKNOWLEDGE);
      if (!acknowledge && unplayable.length) setWarning({ ids, change, problems: unplayable });
      else setRefusal(refused);
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    refusal,
    warning,
    status,
    send: (ids: string[], change: ControlChange) => send(ids, change),
    confirm: async () => {
      if (warning) await send(warning.ids, warning.change, true);
    },
    cancel: () => setWarning(null),
  };
}

function summary({ changed, soundsRewritten, leftWithout }: ControlResult): string {
  if (!changed.length) return 'Nothing changed: each was already set that way.';
  const parts = [`Saved ${changed.length === 1 ? 'the change' : `${changed.length} changes`}.`];
  if (soundsRewritten.length)
    parts.push(
      `${count(soundsRewritten.length)} now ${soundsRewritten.length === 1 ? 'plays' : 'play'} the next enabled pattern.`
    );
  if (leftWithout.length)
    parts.push(
      `${count(leftWithout.length)} ${leftWithout.length === 1 ? 'has' : 'have'} no enabled pattern and ${leftWithout.length === 1 ? 'keeps its' : 'keep their'} riff.`
    );
  return parts.join(' ');
}

const count = (n: number) => (n === 1 ? '1 patch' : `${n} patches`);
