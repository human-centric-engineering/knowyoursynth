'use client';

/**
 * The synth page's settings (`f-my-sounds` s3): hover help (`kys.tips`), the sound map's two toggles (`dim`, `heat`),
 * the harmonics strip (`harm`) and the effects rack (`fx`). From browser storage, as always, and signed in, from the
 * account as well (`/api/v1/me/settings`). How the two agree, and how often the account is written, is in
 * `account-storage.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';
import { normalizeFx, type RackFx } from '@/lib/app/synths/audio/fx';
import {
  AccountSettingsSchema,
  SETTING_KEYS,
  type AccountSettings,
  type SettingKey,
  type SettingsPatch,
} from '@/lib/app/sounds/preference-data';
import {
  STORAGE_KEYS,
  readStored,
  useStoredPref,
  writeStored,
} from '@/components/app/synth/storage';
import {
  settingsPath,
  skewOf,
  useAccountWriter,
  warnAccount,
} from '@/components/app/synth/account-storage';

const BoolSchema = z.boolean();
const FxSchema = z.unknown().transform(normalizeFx);
/** How each setting is checked on its way out of browser storage. */
const SCHEMAS = {
  tips: BoolSchema,
  dim: BoolSchema,
  heat: BoolSchema,
  harm: BoolSchema,
  fx: FxSchema,
} satisfies Record<SettingKey, z.ZodType>;
const SettingsBySchema = z.string().nullable();
const SettingsAtSchema = z.number();

type SettingValue<K extends SettingKey> = NonNullable<AccountSettings[K]>;
type Setting<K extends SettingKey> = [SettingValue<K>, (next: SettingValue<K>) => void];
export type Settings = { [K in SettingKey]: Setting<K> };
type Setters = { [K in SettingKey]: (next: SettingValue<K>) => void };

/** Each setting before anything has been chosen. */
const DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  tips: true,
  dim: false,
  heat: false,
  harm: false,
  fx: normalizeFx(null),
};

/** A setting the browser has stored, or `undefined` when it has none (a default is not a value to fill with). */
function storedSetting(key: SettingKey): boolean | RackFx | undefined {
  const raw = readStored(STORAGE_KEYS[key]);
  if (raw === null) return undefined;
  const parsed = SCHEMAS[key].safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function setOne<K extends SettingKey>(to: Settings, key: K, value: SettingValue<K>): void {
  to[key][1](value);
}

function patchOf<K extends SettingKey>(key: K, value: SettingValue<K>): SettingsPatch {
  return Object.assign({}, { [key]: value });
}

/**
 * The page's settings: from browser storage, as always, and signed in (`userId`), from the account once it answers.
 * Each setter writes the browser as before and, signed in, queues the change for the account.
 */
export function useSettings(userId: string | null): Settings {
  const signedIn = userId !== null;
  const browser: Settings = {
    tips: useStoredPref(STORAGE_KEYS.tips, SCHEMAS.tips, DEFAULTS.tips),
    dim: useStoredPref(STORAGE_KEYS.dim, SCHEMAS.dim, DEFAULTS.dim),
    heat: useStoredPref(STORAGE_KEYS.heat, SCHEMAS.heat, DEFAULTS.heat),
    harm: useStoredPref(STORAGE_KEYS.harm, SCHEMAS.harm, DEFAULTS.harm),
    fx: useStoredPref<RackFx>(STORAGE_KEYS.fx, SCHEMAS.fx, DEFAULTS.fx),
  };
  // The browser's settings and setters, for the account's to be written back once they arrive.
  const toBrowser = useRef(browser);
  useEffect(() => {
    toBrowser.current = browser;
  });

  const [account, setAccount] = useState<AccountSettings | null>(null);
  // Whether the account has answered, for the setters; and what changed before it did (signed in or still finding
  // out), which beats what it says.
  const answered = useRef(false);
  const early = useRef<SettingsPatch>({});
  const writer = useAccountWriter<SettingsPatch>(
    userId,
    signedIn && account !== null,
    (patch, keepalive) => {
      apiClient
        .patch(settingsPath, { body: patch, options: keepalive ? { keepalive } : undefined })
        .catch((err: unknown) => warnAccount('keep the settings in the account', err));
    }
  );
  const { queue } = writer;

  useEffect(() => {
    setAccount(null);
    answered.current = false;
    // Kept through the wait for the session, so a change made then still counts once it says who is signed in.
    if (!userId) {
      early.current = {};
      return undefined;
    }
    let live = true;
    apiClient
      .get<unknown>(settingsPath)
      .then((raw) => {
        if (!live) return;
        const acct = AccountSettingsSchema.parse(raw);
        // Unless another user changed them last, the browser's settings fill what the account has no value for, and
        // replace what it has when they were changed after it was kept (a change whose request did not land).
        const by = SettingsBySchema.safeParse(readStored(STORAGE_KEYS.settingsBy));
        const theirs = by.success && by.data !== null && by.data !== userId;
        const at = SettingsAtSchema.safeParse(readStored(STORAGE_KEYS.settingsAt));
        // When the account's were kept, on the page's clock.
        const kept = acct.updatedAt === null ? null : Date.parse(acct.updatedAt) - skewOf(acct.now);
        const newer = at.success && (kept === null || at.data > kept);
        const fill: SettingsPatch = {};
        for (const key of theirs ? [] : SETTING_KEYS) {
          const mine = storedSetting(key);
          if (mine !== undefined && (acct[key] === null || newer))
            Object.assign(fill, { [key]: mine });
        }
        const send = { ...fill, ...early.current };
        if (Object.keys(send).length > 0) queue((w) => ({ ...w, ...send }));
        answered.current = true;
        const merged = { ...acct, ...send };
        setAccount(merged);
        // The browser keeps the account's too, so signed out (or with the account unread) the page shows the same.
        // Where the account has no value, another user's is not left in its place: the browser goes back to the default.
        for (const key of SETTING_KEYS) {
          const value = merged[key] ?? (theirs ? DEFAULTS[key] : null);
          if (value !== null) setOne(toBrowser.current, key, value);
        }
        writeStored(STORAGE_KEYS.settingsBy, userId);
        // Another user's time is not this one's: with none, the browser fills only what the account lacks.
        if (theirs) writeStored(STORAGE_KEYS.settingsAt, null);
        else if (Object.keys(send).length === 0 && kept !== null)
          writeStored(STORAGE_KEYS.settingsAt, kept);
      })
      .catch((err: unknown) => warnAccount('read the settings from the account', err));
    return () => {
      live = false;
    };
  }, [userId, queue]);

  // Signed in, a change is the account's too. The browser's settings are marked as this user's only once the account
  // has answered: until then they can still be another user's, which that answer has to see.
  const toAccount = useCallback(
    (change: SettingsPatch) => {
      if (userId && answered.current) writeStored(STORAGE_KEYS.settingsBy, userId);
      writeStored(STORAGE_KEYS.settingsAt, Date.now());
      if (answered.current) setAccount((a) => a && { ...a, ...change });
      else early.current = { ...early.current, ...change };
      if (userId) queue((w) => ({ ...w, ...change }));
    },
    [userId, queue]
  );
  const change = useCallback(
    <K extends SettingKey>(key: K, value: SettingValue<K>) => {
      setOne(toBrowser.current, key, value);
      toAccount(patchOf(key, value));
    },
    [toAccount]
  );
  const setters = useMemo(
    (): Setters => ({
      tips: (v) => change('tips', v),
      dim: (v) => change('dim', v),
      heat: (v) => change('heat', v),
      harm: (v) => change('harm', v),
      fx: (v) => change('fx', v),
    }),
    [change]
  );

  // Signed in, the account's value once it has one; otherwise the browser's.
  const acct = signedIn ? account : null;
  const setting = <K extends SettingKey>(key: K): Setting<K> => [
    acct?.[key] ?? browser[key][0],
    setters[key],
  ];
  return {
    tips: setting('tips'),
    dim: setting('dim'),
    heat: setting('heat'),
    harm: setting('harm'),
    fx: setting('fx'),
  };
}
