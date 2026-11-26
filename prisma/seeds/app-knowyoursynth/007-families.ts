import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { seedFamilies } from '@/lib/app/families/seed';
import type { SeedUnit } from '@/prisma/runner';
import {
  FAMILY_DATA_DIR,
  familyDataFiles,
  loadFamilyData,
} from '@/prisma/seeds/app-knowyoursynth/family-data';

/**
 * Synth families (`f-synth-families`): every family in `./data/families/`, after `001-catalogue` and `002-bank`, which
 * write the synths and instruments a member names. The rules it keeps (checked first against the tables, idempotent,
 * never overwrites an admin's edit, never deletes) are `seedFamilies`'s, in `lib/app/families/seed.ts`.
 *
 * The runner re-runs a unit only when its hash changes, so the hash takes in the data files, the loader, and the
 * shapes, check and seed logic. A change to the databank or catalogue alone does not re-run it: their rows are only
 * read here, and a family that no longer fits them is the admin's to fix (the read serves what it can).
 */
const here = dirname(fileURLToPath(import.meta.url));

const unit: SeedUnit = {
  name: 'app-knowyoursynth/007-families',
  hashInputs: [
    ...familyDataFiles().map((f) => relative(here, join(FAMILY_DATA_DIR, f))),
    './family-data.ts',
    '../../../lib/app/families/data.ts',
    '../../../lib/app/families/seed.ts',
    '../../../lib/app/bank/data.ts',
  ],
  async run({ prisma, logger }) {
    const report = await seedFamilies(prisma, loadFamilyData());
    logger.info('Families seeded', { ...report, synthTaken: report.synthTaken.length });
    if (report.synthTaken.length)
      logger.warn('Family members written without their synth: another member has it', {
        members: report.synthTaken,
      });
  },
};

export default unit;
