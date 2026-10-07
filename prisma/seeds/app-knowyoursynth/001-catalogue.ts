import { readdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { seedCatalogue } from '@/lib/app/catalogue/seed';
import type { SeedUnit } from '@/prisma/runner';
import {
  CATALOGUE_DATA_DIR,
  catalogueDataFiles,
  loadCatalogueData,
} from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

/**
 * The catalogue: synths, their sounds, lineage and notes, from `./data/` (plan §9). The rules it keeps (checked
 * first, idempotent, never overwrites an admin's edit, never deletes) are `seedCatalogue`'s, in
 * `lib/app/catalogue/seed.ts`.
 *
 * The runner re-runs a unit only when its hash changes, so the hash takes in everything that decides what gets
 * written: the data files, the loader and the seed logic, the synth definitions (a row's descriptive columns come from
 * them), and the validator with the contract and control lookup it checks every sound against.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const tsIn = (folder: string) =>
  readdirSync(join(repo, folder), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .map((f) => relative(here, join(repo, folder, f)));

const unit: SeedUnit = {
  name: 'app-knowyoursynth/001-catalogue',
  hashInputs: [
    ...catalogueDataFiles().map((f) => relative(here, join(CATALOGUE_DATA_DIR, f))),
    './catalogue-data.ts',
    ...tsIn('lib/app/catalogue'),
    ...tsIn('lib/app/synths/defs'),
    // What a sound is checked against: the validator, the vocabulary it checks with, and its control lookup.
    '../../../lib/app/synths/validate.ts',
    '../../../lib/app/synths/contract.ts',
    '../../../lib/app/synths/lib/patch.ts',
  ],
  async run({ prisma, logger }) {
    const report = await seedCatalogue(prisma, loadCatalogueData());
    logger.info('Catalogue seeded', { report });
  },
};

export default unit;
