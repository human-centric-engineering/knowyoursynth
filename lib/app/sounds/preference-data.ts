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
import type { RackFx } from '@/lib/app/synths/audio/fx';
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';

const Level = z.number().min(0).max(1);

/** The effects rack's settings, every field present: the shape `normalizeFx` returns. */
export const RackFxSchema: z.ZodType<RackFx> = z.object({
  on: z.boolean(),
  drive: z.object({ on: z.boolean(), amount: Level, tone: Level }),
  chorus: z.object({ on: z.boolean(), rate: Level, depth: Level }),
  delay: z.object({ on: z.boolean(), time: Level, feedback: Level, mix: Level }),
  reverb: z.object({ on: z.boolean(), size: Level, mix: Level }),
});

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
}

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
