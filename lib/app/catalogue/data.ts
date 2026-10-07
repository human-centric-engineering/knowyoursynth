/**
 * The shapes of the catalogue's seed data: the JSON files `prototype/tools/export-content.mjs` writes under
 * `prisma/seeds/app-knowyoursynth/data/` (plan §2, §9).
 *
 * Shapes only. This module never reads the files: the seed unit and `scripts/check-synths.ts` are the only readers
 * (D13, guarded by `tests/unit/lib/app/catalogue/seed-data-boundary.test.ts`), and the live app reads the tables.
 * A sound is shaped by the validator's own `PresetSchema`; whether it fits its synth is the seed's check, not this
 * module's.
 */
import { z } from 'zod';

const text = z.string().trim().min(1);

/** `synths.json`: which synths the catalogue lists, and in what order. */
export const SynthListingFileSchema = z.object({
  synths: z.array(z.object({ id: text, order: z.number().int().min(0), listed: z.boolean() })),
});

/**
 * `sounds/<id>.json`: a synth's library, in library order, made on one definition version. Each sound is checked
 * against `PresetSchema` and the definition by the seed (`validatePreset`), so here it is only an object.
 */
export const SoundsFileSchema = z.object({
  synth: text,
  version: z.number().int().min(1),
  sounds: z.array(z.record(z.string(), z.unknown())),
});

export const LineageEntrySchema = z.object({
  year: text,
  name: text,
  tag: text.optional(),
  text,
});

export const LineageRelativeSchema = z.object({ name: text, years: text, text });

/** `lineage/<id>.json`: the history section, without "Heard on" (that comes from the databank). */
export const LineageFileSchema = z.object({
  synth: text,
  title: text,
  intro: text,
  timeline: z.array(LineageEntrySchema).min(1),
  relatives: z.array(LineageRelativeSchema),
  users: z.array(text).optional(),
  note: text.optional(),
});

/** A titled "What is not modelled" entry. */
export const LimitSchema = z.object({ title: text, text });

/** `notes/<id>.json`: "Unusual on…" notes, keyed by control, jack or area id, and the synth's limits. */
export const NotesFileSchema = z.object({
  synth: text,
  unusual: z.array(z.object({ target: text, text })),
  limits: z.object({ intro: text, items: z.array(LimitSchema) }),
});

/** `notes/shared.json`: the limits true of every panel. */
export const SharedNotesFileSchema = z.object({ limits: z.array(LimitSchema).min(1) });

export type SynthListingFile = z.infer<typeof SynthListingFileSchema>;
export type SoundsFile = z.infer<typeof SoundsFileSchema>;
export type LineageFile = z.infer<typeof LineageFileSchema>;
export type NotesFile = z.infer<typeof NotesFileSchema>;
export type SharedNotesFile = z.infer<typeof SharedNotesFileSchema>;

/** Everything the seed writes, as read from the data folder. */
export interface CatalogueSeedData {
  listing: SynthListingFile;
  sounds: SoundsFile[];
  lineage: LineageFile[];
  notes: NotesFile[];
  shared: SharedNotesFile;
}

/**
 * The stable key a seeded note is matched on (`SynthNote.key`). A limit is keyed by its title, so reordering the
 * list in the data moves rows rather than rewriting them.
 */
export const noteKey = {
  unusual: (synth: string, target: string): string => `${synth}/unusual/${target}`,
  limitIntro: (synth: string): string => `${synth}/limit-intro`,
  limit: (synth: string | null, title: string): string =>
    `${synth ?? 'shared'}/limit/${slug(title)}`,
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
