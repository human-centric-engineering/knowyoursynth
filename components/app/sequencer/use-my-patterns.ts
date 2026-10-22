'use client';

/**
 * The signed-in user's patterns, "My patterns" (`f-step-sequencer` t-81), as the sequencer reads and writes them:
 * through `/api/v1/patterns` only, so a pattern saved here is the one any device opens.
 *
 * The list is read the first time it is asked for (`refresh`), not with the page: most visits never open it. Every
 * write keeps the list in step with what the API returned, so it does not need reading again.
 */

import { useCallback, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { Pattern } from '@/lib/app/sequencer/pattern';
import type { UserPatternDetail, UserPatternSummary } from '@/lib/app/patterns/data';

export interface MyPatterns {
  /** The list, newest change first; null until it has been read. */
  patterns: UserPatternSummary[] | null;
  /** Reads the list. */
  refresh: () => Promise<void>;
  /** One pattern with its steps. Rejects when it cannot be read. */
  open: (id: string) => Promise<UserPatternDetail>;
  create: (name: string, pattern: Pattern, synthId: string) => Promise<UserPatternDetail>;
  /**
   * Saves a copy of someone's shared pattern, crediting it (t-83): the steps as they are now, under the shared one's
   * name. Rejects when it is not shared any more (`sharedSourceGone`).
   */
  copy: (slug: string, pattern: Pattern, synthId: string) => Promise<UserPatternDetail>;
  /** Changes how it is shared (t-83): `private` or `link`, or `published` through publishing. */
  share: (id: string, to: 'private' | 'link' | 'published') => Promise<UserPatternDetail>;
  /** Saves new steps over one, or renames it. */
  update: (id: string, change: { name?: string; pattern?: Pattern }) => Promise<UserPatternDetail>;
  remove: (id: string) => Promise<void>;
}

const summary = ({ pattern: _p, problems: _q, ...s }: UserPatternDetail): UserPatternSummary => s;
const path = (id: string) => `/api/v1/patterns/${encodeURIComponent(id)}`;

export function useMyPatterns(): MyPatterns {
  const [patterns, setPatterns] = useState<UserPatternSummary[] | null>(null);

  // A saved pattern goes to the top, as the API orders the list.
  const put = useCallback(
    (d: UserPatternDetail) =>
      setPatterns((list) => (list ? [summary(d), ...list.filter((p) => p.id !== d.id)] : list)),
    []
  );

  const refresh = useCallback(async () => {
    setPatterns(await apiClient.get<UserPatternSummary[]>('/api/v1/patterns'));
  }, []);

  const open = useCallback((id: string) => apiClient.get<UserPatternDetail>(path(id)), []);

  const create = useCallback(
    async (name: string, pattern: Pattern, synthId: string) => {
      const d = await apiClient.post<UserPatternDetail>('/api/v1/patterns', {
        body: { name, pattern, synthId },
      });
      put(d);
      return d;
    },
    [put]
  );

  const copy = useCallback(
    async (slug: string, pattern: Pattern, synthId: string) => {
      const d = await apiClient.post<UserPatternDetail>('/api/v1/patterns', {
        body: { source: { shared: slug }, pattern, synthId },
      });
      put(d);
      return d;
    },
    [put]
  );

  const share = useCallback(
    async (id: string, to: 'private' | 'link' | 'published') => {
      const d =
        to === 'published'
          ? await apiClient.post<UserPatternDetail>(`${path(id)}/publish`, {
              body: { confirm: true },
            })
          : await apiClient.patch<UserPatternDetail>(path(id), { body: { visibility: to } });
      put(d);
      return d;
    },
    [put]
  );

  const update = useCallback(
    async (id: string, change: { name?: string; pattern?: Pattern }) => {
      const d = await apiClient.patch<UserPatternDetail>(path(id), { body: change });
      put(d);
      return d;
    },
    [put]
  );

  const remove = useCallback(async (id: string) => {
    await apiClient.delete(path(id));
    setPatterns((list) => list?.filter((p) => p.id !== id) ?? list);
  }, []);

  return { patterns, refresh, open, create, copy, share, update, remove };
}
