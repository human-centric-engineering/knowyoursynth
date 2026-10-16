'use client';

/**
 * A signed-in user's favourites on the synth page (`f-my-sounds` s4): the stars on the synth picker, the library and
 * My sounds. Read once from `GET /api/v1/me/favourites`, then kept in step with each star added or removed.
 *
 * A star changes at once and is put back if the request fails. While one is on its way, pressing it again does
 * nothing, so a quick double press cannot leave two requests racing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';
import { FavouriteReadSchema } from '@/lib/app/sounds/favourite-data';
import type { FavouriteInput, FavouriteRead } from '@/lib/app/sounds/favourite-data';

/** What a favourite stars, as one string: `synth:model-d`, `sound:model-d/lead`, `mine:<id>`. */
export function favouriteKey(f: FavouriteInput | FavouriteRead): string {
  if (f.kind === 'synth') return `synth:${f.synthId}`;
  if (f.kind === 'sound') return `sound:${f.synthId}/${f.slug ?? ''}`;
  return `mine:${f.soundId ?? ''}`;
}

export interface Favourites {
  /** Whether it is starred; `null` while signed out or still loading, when no star shows. */
  isOn: (target: FavouriteInput) => boolean | null;
  toggle: (target: FavouriteInput) => void;
}

export function useFavourites(userId: string | null): Favourites {
  // Key → the favourite's id, or `null` for one still being added.
  const [stars, setStars] = useState<Map<string, string | null> | null>(null);
  const starsRef = useRef(stars);
  useEffect(() => {
    starsRef.current = stars;
  });
  const pending = useRef(new Set<string>());
  const owner = useRef(userId);

  useEffect(() => {
    owner.current = userId;
    pending.current = new Set();
    setStars(null);
    if (!userId) return undefined;
    let live = true;
    apiClient
      .get<unknown>('/api/v1/me/favourites')
      .then((raw) => {
        const list = z.array(FavouriteReadSchema).safeParse(raw);
        if (live && list.success) setStars(new Map(list.data.map((f) => [favouriteKey(f), f.id])));
      })
      // No stars rather than stars that may be wrong.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId]);

  const isOn = useCallback(
    (target: FavouriteInput) => (stars ? stars.has(favouriteKey(target)) : null),
    [stars]
  );

  const toggle = useCallback((target: FavouriteInput) => {
    const user = owner.current;
    const now = starsRef.current;
    const key = favouriteKey(target);
    if (!user || !now || pending.current.has(key)) return;
    pending.current.add(key);
    const set = (fn: (m: Map<string, string | null>) => void) =>
      setStars((m) => {
        if (!m || owner.current !== user) return m;
        const next = new Map(m);
        fn(next);
        return next;
      });
    const done = () => pending.current.delete(key);

    const id = now.get(key);
    if (id) {
      set((m) => m.delete(key));
      apiClient
        .delete(`/api/v1/me/favourites/${encodeURIComponent(id)}`)
        .catch(() => set((m) => m.set(key, id)))
        .finally(done);
      return;
    }
    set((m) => m.set(key, null));
    apiClient
      .post<unknown>('/api/v1/me/favourites', { body: target })
      .then((raw) => {
        const f = FavouriteReadSchema.safeParse(raw);
        if (f.success) set((m) => m.set(key, f.data.id));
        else set((m) => m.delete(key));
      })
      .catch(() => set((m) => m.delete(key)))
      .finally(done);
  }, []);

  return { isOn, toggle };
}

export interface StarButtonProps {
  on: boolean;
  /** What it stars, for its label: "Model D", "Night bass". */
  name: string;
  onToggle: () => void;
  className?: string;
}

/** A star that adds or removes a favourite. */
export function StarButton({ on, name, onToggle, className = '' }: StarButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      title={on ? 'In your favourites' : 'Add to favourites'}
      className={`shrink-0 rounded-md p-1.5 ${on ? 'text-(--kys-accent)' : 'text-(--kys-faint) hover:text-(--kys-text)'} ${className}`}
    >
      <StarIcon filled={on} />
    </button>
  );
}

export function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
