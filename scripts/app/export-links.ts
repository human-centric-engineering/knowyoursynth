/**
 * Write every link in a database to the seed data (`prisma/seeds/app-knowyoursynth/data/links/`, t-199), one file per
 * owner, so links an admin adds become seed data with one command and a commit. Dev-only.
 *
 *   npm run links:export
 *
 * The folder is rewritten whole: a link deleted here drops out of the data, and the next seed elsewhere does not bring
 * it back. Each owner's links are in the order they were added, then by URL, so a second run changes nothing.
 */
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { OWNER_INCLUDE, ownerOf } from '@/lib/app/links/owner';
import { checkLinkData, LinkSeedFileSchema, toSeedLink } from '@/lib/app/links/seed';
import type { LinkSeedData } from '@/lib/app/links/seed';
import { fileOfOwner, LINK_DATA_DIR } from '@/prisma/seeds/app-knowyoursynth/link-data';

type SeedFileLink = ReturnType<typeof toSeedLink>;

async function main(): Promise<void> {
  const rows = await prisma.externalLink.findMany({
    include: OWNER_INCLUDE,
    // Ids break a tie on both, so the order never depends on how Postgres returns equal rows.
    orderBy: [{ createdAt: 'asc' }, { url: 'asc' }, { id: 'asc' }],
  });

  // Each owner's file, as the seed will read it back.
  const files = new Map<string, { owner: LinkSeedData[number]['owner']; links: SeedFileLink[] }>();
  for (const row of rows) {
    const owner = ownerOf(row);
    const rel = fileOfOwner(owner);
    const file = files.get(rel) ?? { owner: { kind: owner.kind, id: owner.id }, links: [] };
    file.links.push(toSeedLink(row));
    files.set(rel, file);
  }

  // What the seed would refuse is refused here, before the old data is touched.
  const data: LinkSeedData = [...files.values()].map(({ owner, links }) => ({
    owner,
    links: LinkSeedFileSchema.parse(links),
  }));
  const problems = checkLinkData(data);
  if (problems.length) throw new Error(`The links would not seed:\n- ${problems.join('\n- ')}`);

  rmSync(LINK_DATA_DIR, { recursive: true, force: true });
  for (const [rel, { links }] of files) {
    const file = join(LINK_DATA_DIR, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(links, null, 2)}\n`);
  }
  logger.info('Links exported', { links: rows.length, owners: files.size });
}

runAsOrg(INSTALL_ORG_ID, main, { source: 'job' })
  .catch((error: unknown) => {
    logger.error('Links export failed', error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
