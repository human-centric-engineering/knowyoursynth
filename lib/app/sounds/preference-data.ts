/**
 * The shapes of a signed-in user's settings and last panels (`f-my-sounds` s3): what `/api/v1/me/settings` and
 * `/api/v1/me/panels/:synthId` take and return. Shapes only, with no database client, so the synth page checks with the
 * same schemas the routes do.
 *
 * They are the browser's `kys.tips`, `dim`, `heat`, `harm`, `fx` and `kys.session.<id>`
 * (`components/app/synth/storage.ts`), kept under the account. Screen-only keys stay in the browser (D4).
 */
import { z } from 'zod';
import { PanelInputSchema, SoundSlugSchema, UserSoundIdSchema } from '@/lib/app/sounds/data';
import { normalizeFx, type RackFx } from '@/lib/app/synths/audio/fx';
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';

/** Whether `a` has exactly the fields and values of `b` (a plain object of objects, booleans and numbers). */
function sameFx(a: unknown, b: unknown): boolean {
  if (typeof b !== 'object' || b === null) return Object.is(a, b);
  if (typeof a !== 'object' || a === null) return false;
  const got = new Map(Object.entries(a));
  const want = Object.entries(b);
  return got.size === want.length && want.every(([k, v]) => got.has(k) && sameFx(got.get(k), v));
}

/**
 * The effects rack's settings, every field present: what `normalizeFx` returns, and nothing it would change. Taken
 * from `normalizeFx` rather than written out again, so a field added to the rack is one this takes.
 */
export const RackFxSchema = z
  .unknown()
  .refine((v) => sameFx(v, normalizeFx(v)), { message: 'Not an effects rack setting' })
  .transform(normalizeFx);

/** `PATCH /api/v1/me/settings`: the settings that changed. One left out is left as it is. */
export const SettingsPatchSchema = z
  .object({
    tips: z.boolean().optional(),
    dim: z.boolean().optional(),
    heat: z.boolean().optional(),
    harm: z.boolean().optional(),
    fx: RackFxSchema.optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to change' });
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

/** The account's settings. `null` is one it has no value for yet: the page fills it once from the browser's. */
export interface AccountSettings {
  tips: boolean | null;
  dim: boolean | null;
  heat: boolean | null;
  harm: boolean | null;
  fx: RackFx | null;
  /** When they were last changed, or `null` when the account has none yet. */
  updatedAt: string | null;
  /** The server's time as it answered, so the page can weigh `updatedAt` against its own clock. */
  now: string;
}

/** The account's settings as the page reads them: outside data, so checked. */
export const AccountSettingsSchema = z.object({
  tips: z.boolean().nullable(),
  dim: z.boolean().nullable(),
  heat: z.boolean().nullable(),
  harm: z.boolean().nullable(),
  fx: RackFxSchema.nullable(),
  updatedAt: z.iso.datetime().nullable(),
  now: z.iso.datetime(),
});

/** The settings the account keeps, in the order the page reads them. */
export const SETTING_KEYS = ['tips', 'dim', 'heat', 'harm', 'fx'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** More lesson steps than any sound has. */
export const MAX_STEP = 1000;

/** `PUT /api/v1/me/panels/:synthId`: the panel as it was left, with the sound and step it came from. */
export const PanelPrefInputSchema = z.object({
  /** The library sound the panel came from (its slug). */
  presetId: SoundSlugSchema.nullable(),
  step: z.number().int().min(0).max(MAX_STEP).nullable(),
  /** The user's own sound open on the panel. */
  soundId: UserSoundIdSchema.nullable(),
  panel: PanelInputSchema,
});
export type PanelPrefInput = z.infer<typeof PanelPrefInputSchema>;

/** A last panel as the account returns it, fitted to the synth's definition as it is now. */
export interface PanelPref {
  synthId: string;
  presetId: string | null;
  step: number | null;
  soundId: string | null;
  values: ControlValues;
  cables: CablePair[];
  updatedAt: string;
}

/** `GET /api/v1/me/panels/:synthId`: the last panel, or `null` when there is none, and the server's time. */
export interface PanelPrefRead {
  panel: PanelPref | null;
  now: string;
}

/**
 * A last panel as the page reads it: outside data, so checked. The values and cables are fitted to the definition by
 * the page, as a panel from storage is, so they are not checked here.
 */
export const PanelPrefReadSchema = z.object({
  panel: z
    .object({
      presetId: z.string().nullable(),
      step: z.number().nullable(),
      soundId: z.string().nullable(),
      values: z.unknown(),
      cables: z.unknown(),
      updatedAt: z.iso.datetime(),
    })
    .nullable(),
  now: z.iso.datetime(),
});
export type PanelPrefReadData = z.infer<typeof PanelPrefReadSchema>;
