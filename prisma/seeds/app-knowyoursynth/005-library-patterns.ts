import { readdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { syncRiffPatterns } from '@/lib/app/patterns/library';
import type { SeedUnit } from '@/prisma/runner';
import {
  CATALOGUE_DATA_DIR,
  catalogueDataFiles,
} from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import { BANK_DATA_DIR, bankDataFiles } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { syncResearchedPatterns } from '@/lib/app/patterns/library-researched';
import {
  PATTERN_DATA_DIR,
  loadPatternData,
  patternDataFiles,
} from '@/prisma/seeds/app-knowyoursynth/pattern-data';

/**
 * The pattern library (`f-pattern-library` t-122): every library sound's riff as a library pattern, at the head of
 * the sound's list. After `001-catalogue`, whose sounds it reads, and `002-bank`, whose artists a riff's Inspired by
 * links to. The rules it keeps (idempotent, safe on empty, never overwrites an admin's edit, never deletes) are
 * `syncRiffPatterns`'s, in `lib/app/patterns/library.ts`.
 *
 * It reads the stored sounds rather than the data files, so a sound an admin edited gives its pattern the riff the
 * admin left, not the file's. Then the research batches under `data/patterns/` (t-127 on), each pattern behind what its
 * sounds already list (`syncResearchedPatterns`, `lib/app/patterns/library-researched.ts`).
 *
 * The runner re-runs a unit only when its hash changes, so the hash takes in what decides those rows: the catalogue,
 * databank and pattern data, and the library's code with the sequencer it imports riffs through.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const tsIn = (folder: string, prefix = '') =>
  readdirSync(join(repo, folder), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && f.startsWith(prefix))
    .sort()
    .map((f) => relative(here, join(repo, folder, f)));

const unit: SeedUnit = {
  name: 'app-knowyoursynth/005-library-patterns',
  hashInputs: [
    ...catalogueDataFiles().map((f) => relative(here, join(CATALOGUE_DATA_DIR, f))),
    ...bankDataFiles().map((f) => relative(here, join(BANK_DATA_DIR, f))),
    ...patternDataFiles().map((f) => relative(here, join(PATTERN_DATA_DIR, f))),
    ...tsIn('lib/app/patterns', 'library'),
    ...tsIn('lib/app/sequencer'),
    // sameValue, which decides whether a row has changed, and what a riff is checked against.
    '../../../lib/app/catalogue/seed.ts',
    '../../../lib/app/synths/validate.ts',
  ],
  async run({ prisma, logger }) {
    const report = await syncRiffPatterns(prisma);
    const researched = await syncResearchedPatterns(prisma, loadPatternData());
    logger.info('Library patterns seeded', { report, researched });
    // A batch names only what its test found in the seed data, so a skip means a row was removed or not seeded yet.
    if (researched.skipped.length)
      logger.warn('Researched patterns skipped', { skipped: researched.skipped });
  },
};

export default unit;
