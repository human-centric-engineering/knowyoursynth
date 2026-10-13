import { readdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { seedBank } from '@/lib/app/bank/seed';
import type { SeedUnit } from '@/prisma/runner';
import {
  BANK_DATA_DIR,
  bankDataFiles,
  loadBankData,
} from '@/prisma/seeds/app-knowyoursynth/bank-data';

/**
 * The databank: makers, instruments, artists and songs, from `./data/bank/` (plan §9). After `001-catalogue`, whose
 * synths and sounds the databank points at. The rules it keeps (checked first, idempotent, never overwrites an
 * admin's edit, never deletes a row) are `seedBank`'s, in `lib/app/bank/seed.ts`.
 *
 * The runner re-runs a unit only when its hash changes, so the hash takes in the data files, the loader and the
 * databank's code. It does not take in the catalogue: a sound the databank names that the catalogue drops fails the
 * next databank change, and `check:synths` checks the databank against the sounds on every run.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const tsIn = (folder: string) =>
  readdirSync(join(repo, folder), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .map((f) => relative(here, join(repo, folder, f)));

const unit: SeedUnit = {
  name: 'app-knowyoursynth/002-bank',
  hashInputs: [
    ...bankDataFiles().map((f) => relative(here, join(BANK_DATA_DIR, f))),
    './bank-data.ts',
    ...tsIn('lib/app/bank'),
    // sameValue, which decides whether a row has changed.
    '../../../lib/app/catalogue/seed.ts',
  ],
  async run({ prisma, logger }) {
    const report = await seedBank(prisma, loadBankData());
    logger.info('Databank seeded', { report });
  },
};

export default unit;
