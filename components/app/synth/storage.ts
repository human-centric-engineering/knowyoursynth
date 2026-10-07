'use client';

/**
 * What the synth page keeps in browser storage for a visitor who is not signed in (plan §3 "Prototype state").
 *
 * The keys are the prototype's (`kys.*`), so nothing about them has to be explained twice. Everything read back is
 * outside data, so each value is checked on the way in and a bad one falls back to its default. Signed-in storage
 * is `f-my-sounds`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { logger } from '@/lib/logging';
import { CABLE_COLORS } from '@/lib/app/synths/lib/modules';
import { sanitizeCables, sanitizeSet } from '@/lib/app/synths/lib/patch';
import type { ControlValues, PatchCable, SynthDef } from '@/lib/app/synths/contract';
import type { PanelView } from '@/components/app/synth/routes';

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
  presetId: string | null;
  step: number | null;
  values: ControlValues;
  cables: PatchCable[];
}

const StoredSessionSchema = z.object({
  presetId: z.string().nullable(),
  step: z.number().int().min(0).nullable(),
  values: z.unknown(),
  cables: z.unknown(),
});

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
    values: { ...def.init, ...sanitizeSet(def, parsed.data.values) },
    cables: sanitizeCables(def, parsed.data.cables).map(([from, to], i) => ({
      from,
      to,
      color: CABLE_COLORS[i % CABLE_COLORS.length],
    })),
  };
}

/** A session as it is stored: cables as `[from, to]` pairs, since their colours follow from their order. */
export function storedSession(s: Session): unknown {
  return { ...s, cables: s.cables.map((c) => [c.from, c.to]) };
}

/** How long the panel must stay still before it is written to storage: a knob drag is many changes, not one. */
export const SESSION_WRITE_DELAY_MS = 400;

/**
 * One synth's session: starts at `fresh` (so server and client agree), then takes up what was stored for this synth
 * once mounted, and writes each change back after the panel has been still for {@link SESSION_WRITE_DELAY_MS}.
 */
export function useStoredSession(
  def: SynthDef,
  fresh: () => Session
): [Session, (fn: (s: Session) => Session) => void] {
  const [session, setSession] = useState<Session>(fresh);
  const restored = useRef(false);
  const key = sessionKey(def.id);

  useEffect(() => {
    const stored = parseSession(def, readStored(key));
    restored.current = true;
    if (stored) setSession(stored);
  }, [def, key]);

  useEffect(() => {
    if (!restored.current) return undefined;
    const t = setTimeout(() => writeStored(key, storedSession(session)), SESSION_WRITE_DELAY_MS);
    return () => clearTimeout(t);
  }, [key, session]);

  const update = useCallback((fn: (s: Session) => Session) => setSession(fn), []);
  return [session, update];
}
