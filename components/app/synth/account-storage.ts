'use client';

/**
 * What the synth page keeps under a signed-in user's account (`f-my-sounds` s3), so it follows them to another device:
 * their settings (`/api/v1/me/settings`) and the last panel on each synth (`/api/v1/me/panels/:synthId`). Signed out,
 * none of this runs and the page keeps both in browser storage only (`storage.ts`), as it always has.
 *
 * **Browser storage is still written.** Every change goes to the browser as it did, and to the account as well, so the
 * page reads the same whichever of the two answers.
 *
 * **The newer copy wins.** A panel in the browser says when it was last changed and who was signed in then; the account's
 * says when it was kept. The account's replaces the browser's when it is as new or newer, and is written to the browser
 * too; the browser's, when newer, is sent to the account (work done while signed out, or a last change whose request
 * did not land). One kept while another user was signed in is never sent. Settings have no time, so there the account
 * wins once it has a value, and where it has none yet the browser's fills it, once (unless another user changed them
 * last). A change made before the account answered beats both.
 *
 * **Writes to the server are slower than writes to the browser.** The page writes the browser 400 ms after the panel
 * goes still; sent to the server, that would hit the section's 100-a-minute cap (`proxy.ts`) during active play. So the
 * account copy goes {@link ACCOUNT_WRITE_DELAY_MS} after the last change, and at least every
 * {@link ACCOUNT_WRITE_MAX_WAIT_MS} while changes keep coming. Leaving the page sends whatever is still waiting with
 * `keepalive`, so the request survives the page going away.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { logger } from '@/lib/logging';
import type { PanelPref, PanelPrefInput } from '@/lib/app/sounds/preference-data';

/** How long changes must stop before they go to the account. */
export const ACCOUNT_WRITE_DELAY_MS = 5000;
/** The longest a change waits while changes keep coming. */
export const ACCOUNT_WRITE_MAX_WAIT_MS = 30_000;

export const settingsPath = '/api/v1/me/settings';
export const panelPath = (synthId: string): string =>
  `/api/v1/me/panels/${encodeURIComponent(synthId)}`;

export function warnAccount(what: string, err: unknown): void {
  // The browser still has the change, so there is nothing for the person to do about it.
  logger.warn(`synth page: could not ${what}`, { err: String(err) });
}

/**
 * Collects what is waiting to go to the account and sends it once changes have stopped for
 * {@link ACCOUNT_WRITE_DELAY_MS}, or {@link ACCOUNT_WRITE_MAX_WAIT_MS} after the first one waiting. `send` gets
 * `keepalive` when the page is going away. Nothing is sent while `ready` is false; what is waiting then goes as soon
 * as it turns true.
 *
 * Two sends are never closer than the delay, because each waits that long after a change queued since the last one: at
 * most 60 / 5 = 12 a minute from each writer.
 */
export function useAccountWriter<T>(
  ready: boolean,
  send: (value: T, keepalive: boolean) => void
): { queue: (update: (waiting: T | null) => T) => void; flush: (keepalive: boolean) => void } {
  const waiting = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstAt = useRef(0);
  const sendRef = useRef(send);
  const readyRef = useRef(ready);
  useEffect(() => {
    sendRef.current = send;
    readyRef.current = ready;
  });

  const flush = useCallback((keepalive: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!readyRef.current || waiting.current === null) return;
    const value = waiting.current;
    waiting.current = null;
    sendRef.current(value, keepalive);
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const wait = Math.min(
      ACCOUNT_WRITE_DELAY_MS,
      Math.max(0, firstAt.current + ACCOUNT_WRITE_MAX_WAIT_MS - Date.now())
    );
    timer.current = setTimeout(() => flush(false), wait);
  }, [flush]);

  const queue = useCallback(
    (update: (waiting: T | null) => T) => {
      if (waiting.current === null) firstAt.current = Date.now();
      waiting.current = update(waiting.current);
      schedule();
    },
    [schedule]
  );

  // What waited for the account to answer goes once it has.
  useEffect(() => {
    if (ready && waiting.current !== null) schedule();
  }, [ready, schedule]);

  useEffect(() => {
    const onHide = () => flush(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush(true);
    };
  }, [flush]);

  return useMemo(() => ({ queue, flush }), [queue, flush]);
}

// ── the last panel ──────────────────────────────────────────────────────────

export interface AccountPanel {
  /** The account's last panel on this synth, the moment it arrives, when it is the newer one. */
  onArrive: (pref: PanelPref) => void;
  /** The panel as it now is, to keep. */
  latest: () => PanelPrefInput;
  /** Something was moved on the panel since it opened. */
  touched: () => boolean;
  /** When the panel on the page was last changed (ms), or `null` when it is not this user's to keep. */
  localAt: () => number | null;
}

/**
 * The account side of one synth's panel, for {@link useStoredSession}: reads the account's last panel once signed in,
 * and returns `keep`, which the session calls after each change made on the panel.
 */
export function useAccountPanel(
  synthId: string,
  signedIn: boolean,
  { onArrive, latest, touched, localAt }: AccountPanel
): () => void {
  const [loaded, setLoaded] = useState<string | null>(null);
  const ready = signedIn && loaded === synthId;
  const writer = useAccountWriter<PanelPrefInput & { synthId: string }>(
    ready,
    (value, keepalive) => {
      const { synthId: id, ...body } = value;
      apiClient
        .put(panelPath(id), { body, options: keepalive ? { keepalive } : undefined })
        .catch((err: unknown) => warnAccount('keep the panel in the account', err));
    }
  );

  const arrive = useRef(onArrive);
  const now = useRef(latest);
  const moved = useRef(touched);
  const local = useRef(localAt);
  useEffect(() => {
    arrive.current = onArrive;
    now.current = latest;
    moved.current = touched;
    local.current = localAt;
  });

  const keep = useCallback(
    () => writer.queue(() => ({ synthId, ...now.current() })),
    [writer, synthId]
  );

  useEffect(() => {
    setLoaded(null);
    if (!signedIn) return undefined;
    let live = true;
    apiClient
      .get<PanelPref | null>(panelPath(synthId))
      .then((pref) => {
        if (!live) return;
        const at = local.current();
        // Something moved before the account answered is the newest panel whatever the clocks say.
        if (pref && !moved.current() && (at === null || Date.parse(pref.updatedAt) >= at)) {
          arrive.current(pref);
        } else if (at !== null) {
          // The page's is newer, or the account has none here yet: it goes to the account.
          keep();
        }
        setLoaded(synthId);
      })
      .catch((err: unknown) => {
        // Unread, the account could be overwritten with an older panel; so nothing is sent this visit.
        warnAccount('read the panel from the account', err);
      });
    return () => {
      live = false;
      // Moving to another synth sends what is waiting for this one now, rather than once the next has loaded.
      writer.flush(true);
    };
  }, [synthId, signedIn, keep, writer]);

  return keep;
}
