'use client';

/**
 * A library sound's patterns (`f-pattern-library` t-123), default first, for the sequencer's pattern picker: one read
 * of `GET /api/v1/synths/:id/sounds/:slug/patterns` per sound, and none per pattern.
 *
 * Read the first time the sequencer is open with the sound on the panel, not with the page: most visits never open
 * it. Kept for the visit, so closing and opening the sequencer, or going back to a sound, reads nothing again. A read
 * that failed is tried again by `retry`, or the next time the sequencer opens.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api/client';
// Type only: this module reaches the browser, and the library module holds the database client.
import type { LibraryPatternView } from '@/lib/app/patterns/library';
import { logger } from '@/lib/logging';

/** The library sound on the panel. */
export interface LibrarySound {
  synthId: string;
  slug: string;
  name: string;
}

export interface SoundPatterns {
  /** The sound they are for. */
  sound: LibrarySound;
  /** Default first; null while they are being read, or when they could not be. */
  patterns: LibraryPatternView[] | null;
  error: boolean;
  /** Reads them again, after a read that failed. */
  retry: () => void;
}

const keyOf = (s: LibrarySound) => `${s.synthId}/${s.slug}`;

/** `sound`'s patterns once `enabled` (the sequencer open), or null with no library sound on the panel. */
export function useSoundPatterns(
  sound: LibrarySound | null,
  enabled: boolean
): SoundPatterns | null {
  // Each sound's read, kept from when it is sent: one in flight when the sequencer closes and opens is not sent again.
  const reads = useRef(new Map<string, Promise<LibraryPatternView[]>>());
  const cache = useRef(new Map<string, LibraryPatternView[]>());
  // What the last read came back with, for the sound it was for: a sound chosen since shows nothing of it.
  const [read, setRead] = useState<{
    key: string;
    patterns: LibraryPatternView[] | null;
    error: boolean;
  } | null>(null);
  const [tries, setTries] = useState(0);
  const retry = useCallback(() => setTries((n) => n + 1), []);
  const key = sound ? keyOf(sound) : null;
  const synthId = sound?.synthId;
  const slug = sound?.slug;

  useEffect(() => {
    if (!key || !synthId || !slug || !enabled) return undefined;
    const kept = cache.current.get(key);
    if (kept) {
      setRead({ key, patterns: kept, error: false });
      return undefined;
    }
    let live = true;
    setRead({ key, patterns: null, error: false });
    let sent = reads.current.get(key);
    if (!sent) {
      sent = apiClient.get<LibraryPatternView[]>(
        `/api/v1/synths/${encodeURIComponent(synthId)}/sounds/${encodeURIComponent(slug)}/patterns`
      );
      reads.current.set(key, sent);
      sent.then(
        (patterns) => cache.current.set(key, patterns),
        (err: unknown) => {
          reads.current.delete(key);
          logger.warn('sequencer: sound patterns could not be read', { key, err: String(err) });
        }
      );
    }
    sent.then(
      (patterns) => {
        if (live) setRead({ key, patterns, error: false });
      },
      () => {
        if (live) setRead({ key, patterns: null, error: true });
      }
    );
    return () => {
      live = false;
    };
  }, [key, synthId, slug, enabled, tries]);

  if (!sound) return null;
  const mine = read?.key === key ? read : null;
  return {
    sound,
    patterns: mine?.patterns ?? null,
    error: mine?.error ?? false,
    retry,
  };
}
