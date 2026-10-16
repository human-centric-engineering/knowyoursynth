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
  useAccountWriter,
  warnAccount,
} from '@/components/app/synth/account-storage';

const BoolSchema = z.boolean();
const FxSchema = z.unknown().transform(normalizeFx);
const FX_FALLBACK = normalizeFx(null);
/** How each setting is checked on its way out of browser storage. */
const SCHEMAS = {
  tips: BoolSchema,
  dim: BoolSchema,
  heat: BoolSchema,
  harm: BoolSchema,
  fx: FxSchema,
} satisfies Record<SettingKey, z.ZodType>;
const SettingsBySchema = z.string().nullable();

type SettingValue<K extends SettingKey> = NonNullable<AccountSettings[K]>;
type Setting<K extends SettingKey> = [SettingValue<K>, (next: SettingValue<K>) => void];
export type Settings = { [K in SettingKey]: Setting<K> };

/** A setting the browser has stored, or `undefined` when it has none (a default is not a value to fill with). */
function storedSetting(key: SettingKey): boolean | RackFx | undefined {
  const raw = readStored(STORAGE_KEYS[key]);
  if (raw === null) return undefined;
  const parsed = SCHEMAS[key].safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The page's settings: from browser storage, as always, and signed in (`userId`), from the account once it answers.
 * Each setter writes the browser as before and, signed in, queues the change for the account.
 */
export function useSettings(userId: string | null): Settings {
  const signedIn = userId !== null;
  const tips = useStoredPref(STORAGE_KEYS.tips, SCHEMAS.tips, true);
  const dim = useStoredPref(STORAGE_KEYS.dim, SCHEMAS.dim, false);
  const heat = useStoredPref(STORAGE_KEYS.heat, SCHEMAS.heat, false);
  const harm = useStoredPref(STORAGE_KEYS.harm, SCHEMAS.harm, false);
  const fx = useStoredPref<RackFx>(STORAGE_KEYS.fx, SCHEMAS.fx, FX_FALLBACK);

  const [account, setAccount] = useState<AccountSettings | null>(null);
  // Whether the account has answered, for the setters; and what changed before it did (signed in or still finding
  // out), which beats what it says.
  const answered = useRef(false);
  const early = useRef<SettingsPatch>({});
  const writer = useAccountWriter<SettingsPatch>(
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
      .get<AccountSettings>(settingsPath)
      .then((acct) => {
        if (!live) return;
        // Where the account has no value yet, the browser's fills it, once, unless another user changed them last.
        const by = SettingsBySchema.safeParse(readStored(STORAGE_KEYS.settingsBy));
        const theirs = by.success && by.data !== null && by.data !== userId;
        const fill: SettingsPatch = {};
        for (const key of theirs ? [] : SETTING_KEYS) {
          const mine = storedSetting(key);
          if (acct[key] === null && mine !== undefined) Object.assign(fill, { [key]: mine });
        }
        const send = { ...fill, ...early.current };
        if (Object.keys(send).length > 0) queue((w) => ({ ...w, ...send }));
        answered.current = true;
        setAccount({ ...acct, ...send });
      })
      .catch((err: unknown) => warnAccount('read the settings from the account', err));
    return () => {
      live = false;
    };
  }, [userId, queue]);

  // Signed in, a change is the account's too.
  const toAccount = useCallback(
    (change: SettingsPatch) => {
      writeStored(STORAGE_KEYS.settingsBy, userId);
      if (answered.current) setAccount((a) => a && { ...a, ...change });
      else early.current = { ...early.current, ...change };
      if (userId) queue((w) => ({ ...w, ...change }));
    },
    [userId, queue]
  );
  const [setTips, setDim, setHeat, setHarm, setFx] = [tips[1], dim[1], heat[1], harm[1], fx[1]];
  const setters = useMemo(
    () => ({
      tips: (v: boolean) => {
        setTips(v);
        toAccount({ tips: v });
      },
      dim: (v: boolean) => {
        setDim(v);
        toAccount({ dim: v });
      },
      heat: (v: boolean) => {
        setHeat(v);
        toAccount({ heat: v });
      },
      harm: (v: boolean) => {
        setHarm(v);
        toAccount({ harm: v });
      },
      fx: (v: RackFx) => {
        setFx(v);
        toAccount({ fx: v });
      },
    }),
    [toAccount, setTips, setDim, setHeat, setHarm, setFx]
  );

  // Signed in, the account's value once it has one; otherwise the browser's.
  const acct = signedIn ? account : null;
  return {
    tips: [acct?.tips ?? tips[0], setters.tips],
    dim: [acct?.dim ?? dim[0], setters.dim],
    heat: [acct?.heat ?? heat[0], setters.heat],
    harm: [acct?.harm ?? harm[0], setters.harm],
    fx: [acct?.fx ?? fx[0], setters.fx],
  };
}
