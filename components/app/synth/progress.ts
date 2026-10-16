'use client';

/**
 * A signed-in user's progress through this synth's lessons (`f-my-sounds` s4): read once from
 * `GET /api/v1/me/progress?synthId=`, and moved forward as they step through a lesson. Signed out, there is none.
 *
 * Only a step further than the user had got, or a first finish, is sent, so stepping back and forth through a lesson
 * costs nothing. The server keeps progress forward-only too, so a request that lands late cannot move it back.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';
import { LessonProgressReadSchema } from '@/lib/app/sounds/progress-data';
import type { LessonProgressRead } from '@/lib/app/sounds/progress-data';

/** How far the user has got through one lesson. */
export interface LessonMark {
  /** The furthest step reached, from 0. */
  furthestStep: number;
  completed: boolean;
}

/** Library sound slug → how far the user has got through its lesson. */
export type LessonMarks = ReadonlyMap<string, LessonMark>;

const markOf = (e: LessonProgressRead): LessonMark => ({
  furthestStep: e.furthestStep,
  completed: e.completedAt !== null,
});

/** The further of two marks for one lesson. */
const further = (a: LessonMark | undefined, b: LessonMark): LessonMark =>
  a
    ? {
        furthestStep: Math.max(a.furthestStep, b.furthestStep),
        completed: a.completed || b.completed,
      }
    : b;

export interface LessonProgress {
  /** `null` while signed out or still loading. */
  marks: LessonMarks | null;
  /** The user reached `step` of a lesson, and finished it from there when `completed`. */
  record: (slug: string, step: number, completed?: boolean) => void;
}

export function useLessonProgress(synthId: string, userId: string | null): LessonProgress {
  const [marks, setMarks] = useState<Map<string, LessonMark> | null>(null);
  // Read by `record`, so a step taken twice before a render is sent once.
  const known = useRef(new Map<string, LessonMark>());
  const owner = useRef(userId);
  // Moves on with the synth or the user, so a request answered after either changed is not written into the new marks.
  const epoch = useRef(0);

  useEffect(() => {
    owner.current = userId;
    epoch.current++;
    known.current = new Map();
    setMarks(null);
    if (!userId) return undefined;
    let live = true;
    apiClient
      .get<unknown>('/api/v1/me/progress', { params: { synthId } })
      .then((raw) => {
        const list = z.array(LessonProgressReadSchema).safeParse(raw);
        if (!live || !list.success) return;
        // A step recorded before the list arrived stays: the list may have been read before it was.
        for (const e of list.data)
          known.current.set(e.slug, further(known.current.get(e.slug), markOf(e)));
        setMarks(new Map(known.current));
      })
      .catch(() => {
        // Nothing to show; steps taken this visit are still recorded.
        if (live) setMarks(new Map(known.current));
      });
    return () => {
      live = false;
    };
  }, [synthId, userId]);

  const record = useCallback(
    (slug: string, step: number, completed = false) => {
      const user = owner.current;
      if (!user) return;
      const at = epoch.current;
      const before = known.current.get(slug);
      const next = further(before, { furthestStep: step, completed });
      if (
        before &&
        next.furthestStep === before.furthestStep &&
        next.completed === before.completed
      )
        return;
      known.current.set(slug, next);
      setMarks(new Map(known.current));
      apiClient
        .put<unknown>(
          `/api/v1/me/progress/${encodeURIComponent(synthId)}/${encodeURIComponent(slug)}`,
          { body: { step, ...(completed && { completed: true }) } }
        )
        .then((raw) => {
          const e = LessonProgressReadSchema.safeParse(raw);
          if (!e.success || epoch.current !== at) return;
          known.current.set(slug, further(known.current.get(slug), markOf(e.data)));
          setMarks(new Map(known.current));
        })
        .catch(() => {
          // Not kept: forget it, so the next step that reaches as far sends it again. A later step that has moved it on
          // since is its own request, and stands.
          if (epoch.current !== at || known.current.get(slug) !== next) return;
          if (before) known.current.set(slug, before);
          else known.current.delete(slug);
          setMarks(new Map(known.current));
        });
    },
    [synthId]
  );

  return { marks, record };
}
