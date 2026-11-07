/**
 * Write every link in a database to the seed data (`prisma/seeds/app-knowyoursynth/data/links/`, t-199), one file per
 * owner, so links an admin adds become seed data with one command and a commit. Dev-only.
 *
 *   npm run links:export              # add and update; refuses to drop a committed link
 *   npm run links:export -- --prune   # also drop committed links this database no longer has
 *
 * What the files hold, and both refusals (a committed link the table lacks, without `--prune`; data the seed would
 * refuse), are `exportLinkData` (`lib/app/links/seed.ts`), so they are decided before anything here is touched. This is
 * only the reads and the writes: every file is written first, and only then are the data files no owner has any more
 * removed. Anything else kept in the folder stays.
 */
import { mkdirSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { OWNER_INCLUDE, ownerOf } from '@/lib/app/links/owner';
import { exportLinkData } from '@/lib/app/links/seed';
import {
  fileOfOwner,
  LINK_DATA_DIR,
  linkDataFiles,
  loadLinkData,
} from '@/prisma/seeds/app-knowyoursynth/link-data';

async function main(): Promise<void> {
  const rows = await prisma.externalLink.findMany({
    include: OWNER_INCLUDE,
    // Ids break a tie on both, so the order never depends on how Postgres returns equal rows.
    orderBy: [{ createdAt: 'asc' }, { url: 'asc' }, { id: 'asc' }],
  });
  const { files, dropped } = exportLinkData(
    rows.map((row) => ({ ...row, owner: ownerOf(row) })),
    loadLinkData(),
    { prune: process.argv.includes('--prune') }
  );

  const before = linkDataFiles();
  const written = new Set<string>();
  for (const file of files) {
    const rel = fileOfOwner({ kind: file.kind, id: file.id });
    const path = join(LINK_DATA_DIR, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    written.add(rel);
  }
  for (const rel of before) {
    if (written.has(rel)) continue;
    rmSync(join(LINK_DATA_DIR, rel));
    // A sound's file sits in its synth's folder: remove the folder once its last file has gone.
    const folder = dirname(join(LINK_DATA_DIR, rel));
    if (folder !== LINK_DATA_DIR && readdirSync(folder).length === 0) rmdirSync(folder);
  }
  logger.info('Links exported', {
    links: rows.length,
    owners: files.length,
    dropped: dropped.length,
  });
}

runAsOrg(INSTALL_ORG_ID, main, { source: 'job' })
  .catch((error: unknown) => {
    logger.error('Links export failed', error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
