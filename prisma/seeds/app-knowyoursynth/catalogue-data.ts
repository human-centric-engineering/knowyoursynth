/**
 * Read the catalogue's seed data from `./data/` (plan §2).
 *
 * One of the only two readers of these files: the seed unit `001-catalogue.ts` and `scripts/check-synths.ts`. The live
 * app reads the tables (D13), and `tests/unit/lib/app/catalogue/seed-data-boundary.test.ts` fails on any other reader.
 * Not a seed unit itself: its name has no `NNN-` prefix, so the runner does not pick it up.
 */
import { readdirSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import type { z } from 'zod';
import {
  LineageFileSchema,
  NotesFileSchema,
  SharedNotesFileSchema,
  SoundsFileSchema,
  SynthListingFileSchema,
  type CatalogueSeedData,
} from '@/lib/app/catalogue/data';

/** The data folder. */
export const CATALOGUE_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');

function readJson<S extends z.ZodType>(file: string, schema: S): z.infer<S> {
  const parsed = schema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success)
    throw new Error(`${relative(CATALOGUE_DATA_DIR, file)}: ${parsed.error.message}`);
  return parsed.data;
}

/** Every per-synth file in a subfolder, in name order. */
function perSynth<S extends z.ZodType>(dir: string, sub: string, schema: S): z.infer<S>[] {
  const folder = join(dir, sub);
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json') && f !== 'shared.json')
    .sort()
    .map((f) => readJson(join(folder, f), schema));
}

/** Read and shape-check every data file. Fit against the definitions is the seed's check (`planCatalogue`). */
export function loadCatalogueData(dir = CATALOGUE_DATA_DIR): CatalogueSeedData {
  return {
    listing: readJson(join(dir, 'synths.json'), SynthListingFileSchema),
    sounds: perSynth(dir, 'sounds', SoundsFileSchema),
    lineage: perSynth(dir, 'lineage', LineageFileSchema),
    notes: perSynth(dir, 'notes', NotesFileSchema),
    shared: readJson(join(dir, 'notes', 'shared.json'), SharedNotesFileSchema),
  };
}

/** Every data file, relative to `dir`, for the seed unit's `hashInputs`. */
export function catalogueDataFiles(dir = CATALOGUE_DATA_DIR): string[] {
  const walk = (folder: string): string[] =>
    readdirSync(folder, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(join(folder, e.name)) : [join(folder, e.name)]))
      .filter((f) => f.endsWith('.json'));
  return walk(dir)
    .map((f) => relative(dir, f))
    .sort();
}
