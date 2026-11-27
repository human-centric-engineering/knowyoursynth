/**
 * How the synth picker lists synths (`f-synth-picker` t-329): the choices, a visitor's own changes to them, the site's
 * defaults an admin sets, and how the three combine. Shapes and pure functions only, with no database client, so the
 * page, the routes and the admin form check with the same schemas.
 *
 * - **The site's settings** are admin config (`SynthPickerSettings`, one row; `FACTORY_PICKER` until an admin saves).
 * - **A visitor's settings** are only what they changed (`PickerPrefs`), kept with their account and in the browser,
 *   so one who changed the grouping still follows the admin's order. `{}` is "the site's defaults".
 * - With `visitorsMayChange` off, every visitor gets the site's settings; theirs are kept, unused, for when it is on.
 *
 * See `.context/app/synth-picker.md`.
 */
import { z } from 'zod';

/** How rows are grouped: A to Z by name, under each maker's brand, or each original with its copies under it. */
export const PICKER_GROUPS = ['name', 'maker', 'lineage'] as const;
export type PickerGroupBy = (typeof PICKER_GROUPS)[number];

/** How rows are ordered: A to Z, newest first, oldest first. */
export const PICKER_ORDERS = ['name', 'new', 'old'] as const;
export type PickerOrder = (typeof PICKER_ORDERS)[number];

/** The kinds of instrument the databank records (`BankInstrument.kind`). */
export const PICKER_KINDS = [
  'mono',
  'paraphonic',
  'poly',
  'semi-modular',
  'modular',
  'module',
  'sequencer',
] as const;
export type PickerKind = (typeof PICKER_KINDS)[number];

const KindsSchema = z
  .array(z.enum(PICKER_KINDS))
  .max(PICKER_KINDS.length)
  .refine((k) => new Set(k).size === k.length, { message: 'A kind is listed twice' });

/** How the picker lists synths. `kinds` empty lists every kind. */
export const PickerChoicesSchema = z
  .object({
    group: z.enum(PICKER_GROUPS),
    order: z.enum(PICKER_ORDERS),
    kinds: KindsSchema,
    thumbs: z.boolean(),
  })
  .strict();
export type PickerChoices = z.infer<typeof PickerChoicesSchema>;

/** A visitor's own changes to the site's choices: only those they made. `{}` follows the site. */
export const PickerPrefsSchema = PickerChoicesSchema.partial().strict();
export type PickerPrefs = z.infer<typeof PickerPrefsSchema>;

/** The site's settings: the choices every visitor starts with, and what visitors are offered. */
export const SitePickerSettingsSchema = PickerChoicesSchema.extend({
  /** Whether a visitor may change the choices (the Advanced search window). */
  visitorsMayChange: z.boolean(),
  /** Whether "All synths ever made" is offered (`f-synth-picker` t-330). */
  offerAll: z.boolean(),
}).strict();
export type SitePickerSettings = z.infer<typeof SitePickerSettingsSchema>;

/** The site's settings until an admin saves any: grouped by maker, A to Z, every kind, with thumbnails. */
export const FACTORY_PICKER: SitePickerSettings = {
  group: 'maker',
  order: 'name',
  kinds: [],
  thumbs: true,
  visitorsMayChange: true,
  offerAll: true,
};

const CHOICE_KEYS = [
  'group',
  'order',
  'kinds',
  'thumbs',
] as const satisfies readonly (keyof PickerChoices)[];

const sameChoice = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The choices a visitor's picker lists by: the site's, with the visitor's own changes when the site allows them. */
export function pickerChoices(site: SitePickerSettings, mine: PickerPrefs): PickerChoices {
  const out: PickerChoices = {
    group: site.group,
    order: site.order,
    kinds: site.kinds,
    thumbs: site.thumbs,
  };
  return site.visitorsMayChange ? { ...out, ...mine } : out;
}

/** How many of the visitor's choices differ from the site's: 0 when they follow it, or may not change it. */
export function changedChoices(site: SitePickerSettings, mine: PickerPrefs): number {
  if (!site.visitorsMayChange) return 0;
  return CHOICE_KEYS.filter((k) => mine[k] !== undefined && !sameChoice(mine[k], site[k])).length;
}

/**
 * A visitor's settings after changing one choice. A value that matches the site's is dropped rather than kept, so a
 * visitor who changes something back follows the site's later changes to it again.
 */
export function withChoice<K extends keyof PickerChoices>(
  site: SitePickerSettings,
  mine: PickerPrefs,
  key: K,
  value: PickerChoices[K]
): PickerPrefs {
  const rest: PickerPrefs = { ...mine };
  delete rest[key];
  return sameChoice(value, site[key]) ? rest : { ...rest, [key]: value };
}
