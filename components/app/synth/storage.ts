'use client';

/**
 * What the synth page keeps in browser storage for a visitor who is not signed in (plan §3 "Prototype state").
 *
 * The keys are the prototype's (`kys.*`), so nothing about them has to be explained twice. Everything read back is
 * outside data, so each value is checked on the way in and a bad one falls back to its default. Signed in, the
 * settings and each synth's panel are kept under the account as well (`account-storage.ts`, `settings.ts`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { logger } from '@/lib/logging';
import { CABLE_COLORS } from '@/lib/app/synths/lib/modules';
import { sanitizeCables, sanitizeSet } from '@/lib/app/synths/lib/patch';
import { UserSoundIdSchema } from '@/lib/app/sounds/data';
import type { ControlValues, PatchCable, SynthDef } from '@/lib/app/synths/contract';
import type { PanelView } from '@/components/app/synth/routes';
import { useAccountPanel } from '@/components/app/synth/account-storage';
import type { PanelPrefInput } from '@/lib/app/sounds/preference-data';

export const STORAGE_KEYS = {
  /** The last synth opened: `/synths` reopens it. */
  synth: 'kys.synth',
  /** The last panel view chosen, for a URL that does not say. */
  view: 'kys.view',
  /** Info cards on hover. */
  tips: 'kys.tips',
  /** The effects rack's settings. */
  fx: 'kys.fx',
  /** The effects rack is unfolded. */
  fxOpen: 'kys.fxOpen',
  /** MIDI reconnects on the next visit. */
  midi: 'kys.midi',
  /** The sound map's "Dim unused parts". */
  dim: 'kys.dim',
  /** The sound map's "Show sensitive controls". */
  heat: 'kys.heat',
  /** The harmonics strip under the panel. */
  harm: 'kys.harm',
  /** Who was signed in when the settings above were last changed: no one's (`null`) or a user id. */
  settingsBy: 'kys.settingsBy',
  /** When the settings above were last changed (ms since the epoch), to weigh against the account's copy. */
  settingsAt: 'kys.settingsAt',
} as const;

/** One synth's panel, as it was left. */
export const sessionKey = (synthId: string): string => `kys.session.${synthId}`;

/** Read a key directly, outside React: `null` when it is missing, unreadable or storage is blocked. */
export function readStored(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return value;
  } catch {
    return null;
  }
}

/** Write a key directly, outside React. Storage that is full or blocked is not an error the visitor can act on. */
export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    logger.warn('synth page: could not write browser storage', { key, err: String(err) });
  }
}

/**
 * A stored preference, checked by `schema`. Starts at `fallback` on the server and the first client render, so the
 * page hydrates cleanly, then picks up the stored value.
 */
export function useStoredPref<T>(
  key: string,
  schema: z.ZodType<T>,
  fallback: T
): [T, (next: T) => void] {
  const [raw, setRaw] = useLocalStorage<unknown>(key, fallback);
  const value = useMemo(() => {
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : fallback;
  }, [raw, schema, fallback]);
  return [value, setRaw];
}

export const PanelViewSchema: z.ZodType<PanelView> = z.object({
  outline: z.boolean(),
  long: z.boolean(),
});

/** One synth's panel: the sound it came from, the lesson step, and what has been moved and plugged since. */
export interface Session {
  /** The library sound the panel came from, which the lesson reads. */
  presetId: string | null;
  step: number | null;
  /**
   * The user's own sound open on the panel (`f-my-sounds`), which Save writes back to. Kept when the panel is moved,
   * cleared when a library sound is chosen. Only an id: whether it is still theirs is the API's answer.
   */
  soundId: string | null;
  values: ControlValues;
  cables: PatchCable[];
}

const StoredSessionSchema = z.object({
  presetId: z.string().nullable(),
  step: z.number().int().min(0).nullable(),
  // Stored before `f-my-sounds` without it. One that is not a sound id is dropped, not the panel with it.
  soundId: UserSoundIdSchema.nullable().optional().catch(null),
  values: z.unknown(),
  cables: z.unknown(),
});

/** When a stored panel was last changed and who was signed in then. Stored before t-41 without either. */
const StoredStampSchema = z.object({
  savedAt: z.number().optional().catch(undefined),
  owner: z.string().nullable().optional().catch(undefined),
});

/** When a panel was last changed (ms since the epoch), and the user signed in then, or `null` for no one. */
export interface PanelStamp {
  savedAt: number;
  owner: string | null;
}

/**
 * A stored session, checked against the definition: values outside a control's range, controls the synth no longer
 * has and cables between jacks it does not have are all dropped, and every control missing from what was stored
 * takes its `init`. `null` when nothing usable was stored.
 */
export function parseSession(def: SynthDef, raw: unknown): Session | null {
  const parsed = StoredSessionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { presetId, step } = parsed.data;
  return {
    presetId,
    step,
    soundId: parsed.data.soundId ?? null,
    ...fitPanel(def, parsed.data.values, parsed.data.cables),
  };
}

/**
 * A panel from outside (storage, the sounds API), as the page holds it: checked against the definition the same way
 * as a stored session, with each cable coloured by its place in the list.
 */
export function fitPanel(
  def: SynthDef,
  values: unknown,
  cables: unknown
): Pick<Session, 'values' | 'cables'> {
  return {
    values: { ...def.init, ...sanitizeSet(def, values) },
    cables: sanitizeCables(def, cables).map(([from, to], i) => ({
      from,
      to,
      color: CABLE_COLORS[i % CABLE_COLORS.length],
    })),
  };
}

/** A session as it is stored: cables as `[from, to]` pairs, since their colours follow from their order. */
export function storedSession(s: Session, stamp?: PanelStamp): unknown {
  return { ...s, cables: s.cables.map((c) => [c.from, c.to]), ...stamp };
}

/** A session as the account keeps it (`/api/v1/me/panels/:synthId`). */
export function panelPrefOf(s: Session): PanelPrefInput {
  return {
    presetId: s.presetId,
    step: s.step,
    soundId: s.soundId,
    panel: { values: s.values, cables: s.cables.map((c) => [c.from, c.to]) },
  };
}

/** How long the panel must stay still before it is written to storage: a knob drag is many changes, not one. */
export const SESSION_WRITE_DELAY_MS = 400;

/**
 * One synth's session: starts at `fresh` (so server and client agree), then takes up what was stored for this synth
 * once mounted, and writes each change back after the panel has been still for {@link SESSION_WRITE_DELAY_MS}.
 *
 * Signed in (`userId`), the account's last panel then replaces it when it is the newer of the two, and each change is
 * kept in the account too, less often (`account-storage.ts`). Each stored panel says when it was changed and who was
 * signed in then, so another user's is never taken for this one's.
 */
export function useStoredSession(
  def: SynthDef,
  fresh: () => Session,
  userId: string | null = null
): [Session, (fn: (s: Session) => Session) => void] {
  const [session, setSession] = useState<Session>(fresh);
  const key = sessionKey(def.id);
  const signedIn = userId !== null;
  const user = useRef(userId);
  useEffect(() => {
    user.current = userId;
  });

  // Once per synth, not per definition object: a server re-render hands a new (equal) definition, and re-reading
  // storage then would put back a panel the write delay had not yet saved.
  const defRef = useRef(def);
  useEffect(() => {
    defRef.current = def;
  });
  // When the browser's panel for this synth was changed and by whom, and when it was last moved here: what the
  // account's copy is weighed against when it arrives.
  const storedStamp = useRef<{ savedAt: number; owner: string | null | undefined } | null>(null);
  const movedAt = useRef<number | null>(null);
  useEffect(() => {
    const raw = readStored(key);
    const stored = parseSession(defRef.current, raw);
    const stamp = StoredStampSchema.safeParse(raw);
    storedStamp.current = stored && {
      // One stored without a time is older than anything the account has.
      savedAt: (stamp.success && stamp.data.savedAt) || 0,
      owner: stamp.success ? stamp.data.owner : undefined,
    };
    movedAt.current = null;
    if (stored) setSession(stored);
  }, [key]);

  // Only a change the visitor made is written. The fresh panel and the restored one are not: writing either back
  // would race the restore, and React's development remount (or any unmount before the restore re-renders) would
  // then save the fresh panel over the stored one.
  const dirty = useRef(false);
  const latest = useRef(session);
  useEffect(() => {
    latest.current = session;
  });
  const toAccount = useRef(false);
  const update = useCallback((fn: (s: Session) => Session) => {
    dirty.current = true;
    movedAt.current = Date.now();
    toAccount.current = true;
    setSession(fn);
  }, []);
  const stamp = useCallback(
    (): PanelStamp => ({ savedAt: movedAt.current ?? Date.now(), owner: user.current }),
    []
  );

  const keepInAccount = useAccountPanel(def.id, signedIn, {
    onArrive: (pref) => {
      const restored = parseSession(defRef.current, pref);
      if (!restored) return;
      setSession(restored);
      // The browser keeps it too, so signed out (or with the account unread) the page reopens where they left off.
      const savedAt = Date.parse(pref.updatedAt);
      storedStamp.current = { savedAt, owner: user.current };
      writeStored(key, storedSession(restored, { savedAt, owner: user.current }));
    },
    latest: () => panelPrefOf(latest.current),
    touched: () => movedAt.current !== null,
    localAt: () => {
      if (movedAt.current !== null) return movedAt.current;
      const stored = storedStamp.current;
      // Kept while someone else was signed in: theirs, not this user's to keep.
      if (!stored || (stored.owner && stored.owner !== user.current)) return null;
      return stored.savedAt;
    },
  });
  // After `latest` has caught up with the change, so what is queued is the panel as it now is.
  useEffect(() => {
    if (!toAccount.current) return;
    toAccount.current = false;
    if (signedIn) keepInAccount();
  }, [session, signedIn, keepInAccount]);

  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(() => {
      writeStored(key, storedSession(session, stamp()));
      dirty.current = false;
    }, SESSION_WRITE_DELAY_MS);
    return () => clearTimeout(t);
  }, [key, session, stamp]);
  // Leaving the page (or the tab) writes a change the delay has not saved yet, so a move made just before going is
  // not lost.
  useEffect(() => {
    const flush = () => {
      if (dirty.current) writeStored(key, storedSession(latest.current, stamp()));
      dirty.current = false;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [key, stamp]);

  return [session, update];
}
