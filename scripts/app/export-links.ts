/**
 * Write every link in a database to the seed data (`prisma/seeds/app-knowyoursynth/data/links/`, t-199), one file per
 * owner, so links an admin adds become seed data with one command and a commit. Dev-only.
 *
 *   npm run links:export              # add and update; refuses to drop a committed link
 *   npm run links:export -- --prune   # also drop committed links this database no longer has
 *
 * Refusing by default is what keeps the wrong database (an empty one, or one missing a databank row) from wiping or
 * shrinking the committed data: it names what would go and writes nothing. Each owner's links keep their committed
 * order, with new ones after it, oldest first. What the files hold, and the check that refuses a table the seed would
 * refuse, is `exportLinkData` (`lib/app/links/seed.ts`); this is only the reads and the writes.
 */
import { mkdirSync, rmSync, writeFileSync } from 'fs';
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
  loadLinkData,
} from '@/prisma/seeds/app-knowyoursynth/link-data';

const SHOW = 20;

async function main(): Promise<void> {
  const prune = process.argv.includes('--prune');
  const rows = await prisma.externalLink.findMany({
    include: OWNER_INCLUDE,
    // Ids break a tie on both, so the order never depends on how Postgres returns equal rows.
    orderBy: [{ createdAt: 'asc' }, { url: 'asc' }, { id: 'asc' }],
  });
  // Checked before the old data is touched.
  const { files, dropped } = exportLinkData(
    rows.map((row) => ({ ...row, owner: ownerOf(row) })),
    loadLinkData()
  );
  if (dropped.length && !prune)
    throw new Error(
      `This database lacks ${dropped.length} committed link(s), so the export would drop them. Check DATABASE_URL ` +
        `points at the database you curate in; to drop them on purpose, run it with -- --prune.\n- ` +
        [...dropped.slice(0, SHOW), ...(dropped.length > SHOW ? ['…'] : [])].join('\n- ')
    );

  rmSync(LINK_DATA_DIR, { recursive: true, force: true });
  for (const file of files) {
    const path = join(LINK_DATA_DIR, fileOfOwner({ kind: file.kind, id: file.id }));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
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
