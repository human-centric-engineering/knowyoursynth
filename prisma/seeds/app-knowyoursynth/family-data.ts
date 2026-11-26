/**
 * Read the synth families' seed data from `./data/families/` (`f-synth-families`): one file per family, at
 * `<id>.json`.
 *
 * Read by the seed unit `007-families.ts`, as the catalogue and databank loaders are kept: the live app reads the
 * tables, never these files (`tests/unit/lib/app/catalogue/seed-data-boundary.test.ts`). Not a seed unit itself: its
 * name has no `NNN-` prefix.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FamilyFileSchema, type FamilyFile } from '@/lib/app/families/data';

/** The data folder. */
export const FAMILY_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'families');

/** Every data file's name, sorted, for the seed unit's `hashInputs`. None when there is no folder. */
export function familyDataFiles(dir = FAMILY_DATA_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

/** Read and shape-check the files. Whether the families fit the tables is the seed's check (`checkFamilies`). */
export function loadFamilyData(dir = FAMILY_DATA_DIR): FamilyFile[] {
  return familyDataFiles(dir).map((name) => {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (error) {
      throw new Error(
        `families/${name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const parsed = FamilyFileSchema.safeParse(json);
    if (!parsed.success) throw new Error(`families/${name}: ${parsed.error.message}`);
    // The id is named twice so a renamed file changes its contents, which is all the runner hashes.
    if (`${parsed.data.id}.json` !== name)
      throw new Error(`families/${name}: names family ${parsed.data.id}, not the file's name`);
    return parsed.data;
  });
}
