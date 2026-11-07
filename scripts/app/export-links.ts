/**
 * Write every link in a database to the seed data (`prisma/seeds/app-knowyoursynth/data/links/`, t-199), one file per
 * owner, so links an admin adds become seed data with one command and a commit. Dev-only.
 *
 *   npm run links:export
 *
 * The folder is rewritten whole: a link deleted here drops out of the data, and the next seed elsewhere does not bring
 * it back. Each owner's links are in the order they were added, then by URL, so a second run changes nothing. What
 * the files hold, and the check that refuses a table the seed would refuse, is `exportLinkData`
 * (`lib/app/links/seed.ts`); this is only the read and the writes.
 */
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { OWNER_INCLUDE, ownerOf } from '@/lib/app/links/owner';
import { exportLinkData } from '@/lib/app/links/seed';
import { fileOfOwner, LINK_DATA_DIR } from '@/prisma/seeds/app-knowyoursynth/link-data';

async function main(): Promise<void> {
  const rows = await prisma.externalLink.findMany({
    include: OWNER_INCLUDE,
    // Ids break a tie on both, so the order never depends on how Postgres returns equal rows.
    orderBy: [{ createdAt: 'asc' }, { url: 'asc' }, { id: 'asc' }],
  });
  // Checked before the old data is touched.
  const files = exportLinkData(rows.map((row) => ({ ...row, owner: ownerOf(row) })));

  rmSync(LINK_DATA_DIR, { recursive: true, force: true });
  for (const { owner, links } of files) {
    const file = join(LINK_DATA_DIR, fileOfOwner(owner));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(links, null, 2)}\n`);
  }
  logger.info('Links exported', { links: rows.length, owners: files.length });
}

runAsOrg(INSTALL_ORG_ID, main, { source: 'job' })
  .catch((error: unknown) => {
    logger.error('Links export failed', error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
