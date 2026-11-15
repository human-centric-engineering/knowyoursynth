/**
 * Read the research batches from `./data/patterns/` (`f-pattern-library` t-127 on): the researched patterns, the
 * sounds each is for, and the record kept with each (`.context/app/pattern-library.md`, Research method).
 *
 * Read by the seed unit `005-library-patterns.ts` only, as the catalogue's loader is: the live app reads the tables.
 * Not a seed unit itself: its name has no `NNN-` prefix, so the runner does not pick it up.
 */
import { readdirSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { ResearchBatchSchema, type ResearchBatch } from '@/lib/app/patterns/library-researched';
import { PatternDefaultsSchema, type PatternDefaults } from '@/lib/app/patterns/library-defaults';

/** The data folder. */
export const PATTERN_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'patterns');

/** Every batch file, relative to `dir`, in name order, for reading and for the seed unit's `hashInputs`. */
export function patternDataFiles(dir = PATTERN_DATA_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => relative(dir, join(dir, f)));
}

/**
 * Read and shape-check every batch. A key is used once across all of them, since the seed matches on it: a key in two
 * files would be created twice. Whether a batch's sounds and links resolve is the seed's check.
 */
export function loadPatternData(dir = PATTERN_DATA_DIR): ResearchBatch[] {
  const seen = new Map<string, string>();
  return patternDataFiles(dir).map((rel) => {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
    } catch (error) {
      throw new Error(`patterns/${rel}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const parsed = ResearchBatchSchema.safeParse(json);
    if (!parsed.success) throw new Error(`patterns/${rel}: ${parsed.error.message}`);
    for (const { key } of parsed.data.patterns) {
      const first = seen.get(key);
      if (first) throw new Error(`patterns/${rel}: ${key} is already used in patterns/${first}`);
      seen.set(key, rel);
    }
    return parsed.data;
  });
}

/** The researched defaults (t-254): beside the batches, not among them, since the batch loader reads every file there. */
export const PATTERN_DEFAULTS_FILE = join(dirname(PATTERN_DATA_DIR), 'pattern-defaults.json');

/** Read and shape-check the researched defaults. Whether each sound and pattern resolves is the seed's check. */
export function loadPatternDefaults(file = PATTERN_DEFAULTS_FILE): PatternDefaults {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `pattern-defaults.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const parsed = PatternDefaultsSchema.safeParse(json);
  if (!parsed.success) throw new Error(`pattern-defaults.json: ${parsed.error.message}`);
  return parsed.data;
}
