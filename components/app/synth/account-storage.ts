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
 * says when it was kept, and each answer carries the server's time, so the two are weighed on one clock ({@link skewOf})
 * however far the device's is off. The account's replaces the browser's when it is as new or newer, and is written to the browser
 * too; the browser's, when newer, is sent to the account (work done while signed out, or a last change whose request
 * did not land). One kept while another user was signed in is never sent. Settings are weighed the same way, as one
 * set (`settings.ts`), and where the account has no value yet the browser's fills it. A change made before the account
 * answered beats both.
 *
 * **Writes to the server are slower than writes to the browser.** The page writes the browser 400 ms after the panel
 * goes still; sent to the server, that would hit the section's 100-a-minute cap (`proxy.ts`) during active play. So the
 * account copy goes {@link ACCOUNT_WRITE_DELAY_MS} after the last change, and at least every
 * {@link ACCOUNT_WRITE_MAX_WAIT_MS} while changes keep coming. Leaving the page sends whatever is still waiting with
 * `keepalive`, so the request survives the page going away. Signing out, or another user signing in, drops what is
 * waiting instead: it was the last user's, and their session has gone with them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { logger } from '@/lib/logging';
import {
  PanelPrefReadSchema,
  type PanelPrefInput,
  type PanelPrefReadData,
} from '@/lib/app/sounds/preference-data';

/** How long changes must stop before they go to the account. */
export const ACCOUNT_WRITE_DELAY_MS = 5000;
/** The longest a change waits while changes keep coming. */
export const ACCOUNT_WRITE_MAX_WAIT_MS = 30_000;

export const settingsPath = '/api/v1/me/settings';
export const panelPath = (synthId: string): string =>
  `/api/v1/me/panels/${encodeURIComponent(synthId)}`;

/**
 * How far the server's clock is ahead of the page's (ms), from the server's time as it answered (`now`): what turns a
 * server time into the page's (`server - skew`) and back.
 */
export function skewOf(now: string): number {
  return Date.parse(now) - Date.now();
}

export function warnAccount(what: string, err: unknown): void {
  // The browser still has the change, so there is nothing for the person to do about it.
  logger.warn(`synth page: could not ${what}`, { err: String(err) });
}

/**
 * Collects what is waiting to go to the account and sends it once changes have stopped for
 * {@link ACCOUNT_WRITE_DELAY_MS}, or {@link ACCOUNT_WRITE_MAX_WAIT_MS} after the first one waiting. `send` gets
 * `keepalive` when the page is going away. Nothing is sent while `ready` is false; what is waiting then goes as soon
 * as it turns true. When `owner` (the user signed in) changes, what is waiting is dropped, never sent.
 *
 * Two sends are never closer than the delay, because each waits that long after a change queued since the last one: at
 * most 60 / 5 = 12 a minute from each writer.
 */
export function useAccountWriter<T>(
  owner: string | null,
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

  // Signed out, or someone else signed in: what waited is the last user's, so it goes nowhere.
  const ownerRef = useRef(owner);
  useEffect(() => {
    if (ownerRef.current === owner) return;
    ownerRef.current = owner;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    waiting.current = null;
  }, [owner]);

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
  /**
   * The account's last panel on this synth, the moment it arrives, when it is the newer one, with when it was kept on
   * the page's clock.
   */
  onArrive: (pref: NonNullable<PanelPrefReadData['panel']>, savedAt: number) => void;
  /** The panel as it now is, to keep. */
  latest: () => PanelPrefInput;
  /** Something was moved on the panel since it opened. */
  touched: () => boolean;
  /** When the panel on the page was last changed (ms), or `null` when it is not this user's to keep. */
  localAt: () => number | null;
}

/**
 * The account side of one synth's panel, for {@link useStoredSession}: reads the account's last panel once signed in
 * (`userId`), again for each user who signs in, and returns `keep`, which the session calls after each change made on
 * the panel.
 */
export function useAccountPanel(
  synthId: string,
  userId: string | null,
  { onArrive, latest, touched, localAt }: AccountPanel
): () => void {
  // Whose panel on which synth has been read: nothing is sent for another.
  const [loaded, setLoaded] = useState<string | null>(null);
  const loadKey = userId === null ? null : `${userId}/${synthId}`;
  const ready = loadKey !== null && loaded === loadKey;
  const writer = useAccountWriter<PanelPrefInput & { synthId: string }>(
    userId,
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
    if (loadKey === null) return undefined;
    let live = true;
    apiClient
      .get<unknown>(panelPath(synthId))
      .then((raw) => {
        if (!live) return;
        const { panel: pref, now } = PanelPrefReadSchema.parse(raw);
        const at = local.current();
        const keptAt = pref && Date.parse(pref.updatedAt) - skewOf(now);
        // Something moved before the account answered is the newest panel whatever the clocks say.
        if (pref && keptAt !== null && !moved.current() && (at === null || keptAt >= at)) {
          arrive.current(pref, keptAt);
        } else if (at !== null) {
          // The page's is newer, or the account has none here yet: it goes to the account.
          keep();
        }
        setLoaded(loadKey);
      })
      .catch((err: unknown) => {
        // Unread, the account could be overwritten with an older panel; so nothing is sent this visit.
        warnAccount('read the panel from the account', err);
      });
    return () => {
      live = false;
    };
  }, [synthId, loadKey, keep]);

  // Moving to another synth sends what is waiting for this one now, rather than once the next has loaded. Not on
  // signing out: the writer drops that.
  useEffect(() => () => writer.flush(true), [synthId, writer]);

  return keep;
}
