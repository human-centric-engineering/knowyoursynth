'use client';

/**
 * The note above the panel on a screen too small to play it whole (D10): a tablet held upright is told to turn it,
 * and anything else under 1024 px wide (a phone, a narrow window) is told the panel wants a bigger screen. It is a
 * notice, not a block: the panel still works, and the note can be put away for good.
 */

import { useCallback, useState, useSyncExternalStore } from 'react';
import { readStored, STORAGE_KEYS, writeStored } from '@/components/app/synth/storage';

/** Narrower than a landscape tablet. */
export const SMALL_QUERY = '(max-width: 1023px)';
/**
 * A tablet held upright: portrait, too wide to be a phone, and with a touch screen (a tall, narrow desktop window is not
 * one). Any pointer, not just the main one: a tablet with a trackpad attached is still a tablet.
 */
export const PORTRAIT_TABLET_QUERY =
  '(orientation: portrait) and (min-width: 600px) and (any-pointer: coarse)';

/** Whether a media query matches, kept up to date. False on the server and where `matchMedia` is missing. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (change: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener('change', change);
      return () => mq.removeEventListener('change', change);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false
  );
}

const subscribeStorage = (change: () => void) => {
  window.addEventListener('storage', change);
  return () => window.removeEventListener('storage', change);
};
/** Whether the note was put away. Read as the page renders, not after, so it never shows for a frame first. */
const readSeen = () => readStored(STORAGE_KEYS.rotateSeen) === true;

export function RotatePrompt() {
  const small = useMediaQuery(SMALL_QUERY);
  const tablet = useMediaQuery(PORTRAIT_TABLET_QUERY);
  const stored = useSyncExternalStore(subscribeStorage, readSeen, () => false);
  const [dismissed, setDismissed] = useState(false);
  const setSeen = () => {
    writeStored(STORAGE_KEYS.rotateSeen, true);
    setDismissed(true);
  };
  if (!small || stored || dismissed) return null;
  return (
    <div
      role="note"
      className="flex items-start justify-between gap-3 rounded-lg border border-(--kys-line) bg-(--kys-surface) px-3 py-2.5 text-sm"
    >
      <p className="leading-snug text-(--kys-muted)">
        {tablet
          ? 'Turn your tablet sideways to play the full panel. It is laid out for a landscape screen.'
          : 'The full panel is made for a landscape tablet or a bigger screen. Here you can fit it to the page, zoom in and scroll around it, and the rest of the page works as usual.'}
      </p>
      <button
        type="button"
        onClick={setSeen}
        className="kys-label h-11 shrink-0 rounded-md border border-(--kys-line) px-3 text-(--kys-muted) hover:text-(--kys-text)"
      >
        OK
      </button>
    </div>
  );
}
