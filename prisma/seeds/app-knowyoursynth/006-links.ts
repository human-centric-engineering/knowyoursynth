import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { seedLinks } from '@/lib/app/links/seed';
import type { SeedUnit } from '@/prisma/runner';
import {
  LINK_DATA_DIR,
  linkDataFiles,
  loadLinkData,
} from '@/prisma/seeds/app-knowyoursynth/link-data';

/**
 * Videos and links (`f-videos-and-links` t-199): every link in `./data/links/`, on the databank instruments, library
 * sounds, songs and artists they are about. After `001-catalogue` and `002-bank`, which write those owners. The rules
 * it keeps (checked first, create only, never overwrites an admin's edit, never deletes, reads no provider) are
 * `seedLinks`'s, in `lib/app/links/seed.ts`.
 *
 * The runner re-runs a unit only when its hash changes, so the hash takes in the data files, the loader, and the
 * links code that decides what a URL is stored as.
 */
const here = dirname(fileURLToPath(import.meta.url));

const unit: SeedUnit = {
  name: 'app-knowyoursynth/006-links',
  hashInputs: [
    ...linkDataFiles().map((f) => relative(here, join(LINK_DATA_DIR, f))),
    './link-data.ts',
    '../../../lib/app/links/seed.ts',
    '../../../lib/app/links/providers.ts',
    '../../../lib/app/links/owner-ref.ts',
    // What a URL is cleaned to before it is parsed, and the id shapes an owner must have.
    '../../../lib/security/sanitize.ts',
    '../../../lib/app/bank/data.ts',
    '../../../lib/app/sounds/data.ts',
  ],
  async run({ prisma, logger }) {
    const report = await seedLinks(prisma, loadLinkData());
    logger.info('Links seeded', { ...report, missingOwners: report.missingOwners.length });
    // A data file names an owner the seed data has (the data test), so a miss means a row was removed here.
    if (report.missingOwners.length)
      logger.warn('Links skipped: their owners are not in this database', {
        owners: report.missingOwners,
      });
  },
};

export default unit;
