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
import { INSTRUMENT_KINDS } from '@/lib/app/bank/data';

/** How rows are grouped: A to Z by name, under each maker's brand, or each original with its copies under it. */
export const PICKER_GROUPS = ['name', 'maker', 'lineage'] as const;
export type PickerGroupBy = (typeof PICKER_GROUPS)[number];

/** How rows are ordered: A to Z, newest first, oldest first. */
export const PICKER_ORDERS = ['name', 'new', 'old'] as const;
export type PickerOrder = (typeof PICKER_ORDERS)[number];

/** The kinds of instrument the databank records (`BankInstrument.kind`): its own list, so a new kind is one here too. */
export const PICKER_KINDS = INSTRUMENT_KINDS;
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

/**
 * `kinds` in the databank's order, each once: how a list of kinds is kept, so a kind turned off and on again is the
 * same choice as before, and two lists of the same kinds compare equal.
 */
export function sortKinds(kinds: readonly PickerKind[]): PickerKind[] {
  return PICKER_KINDS.filter((k) => kinds.includes(k));
}

/** `kinds` with `kind` turned on or off, in the databank's order. */
export function toggleKind(kinds: readonly PickerKind[], kind: PickerKind): PickerKind[] {
  return sortKinds(kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind]);
}

/** Whether two values of one choice are the same: kinds as a set, the rest as values. */
function sameChoice<K extends keyof PickerChoices>(
  key: K,
  a: PickerChoices[K],
  b: PickerChoices[K]
): boolean {
  if (key !== 'kinds') return a === b;
  const [x, y] = [a, b].map((v) => (Array.isArray(v) ? sortKinds(v).join() : ''));
  return x === y;
}

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
  return CHOICE_KEYS.filter((k) => {
    const value = mine[k];
    return value !== undefined && !sameChoice(k, value, site[k]);
  }).length;
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
  return sameChoice(key, value, site[key]) ? rest : { ...rest, [key]: value };
}
