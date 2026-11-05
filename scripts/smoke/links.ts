/**
 * Smoke: videos and links against the real dev database (`f-videos-and-links` t-179).
 *
 *   npm run smoke:links            (after `npm run db:migrate:deploy`)
 *
 * What no unit test can prove, because unit tests have no database:
 *
 * 1. The table's CHECK refuses a link with no owner and one with two (`external_link_one_owner`).
 * 2. Its unique index refuses the same URL twice on one owner, through `createLink` (409), and allows it on another.
 * 3. The public read serves a databank song's link.
 * 4. Removing the song through the admin path (`removeBankRow`) succeeds and takes its links with it (Cascade).
 *
 * Writes a throwaway song (`smoke-links-*`), its links and the removal record, and removes them all again, whatever
 * happens. Printing goes through `console`, not `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */
import { prisma } from '@/lib/db/client';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { removeBankRow, saveBankRow } from '@/lib/app/bank/admin';
import { loadBank } from '@/lib/app/bank/read';
import { createLink } from '@/lib/app/links/admin';
import { listPublicLinks } from '@/lib/app/links/read';

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const SONG = `smoke-links-${Date.now()}`;
const OTHER = `${SONG}-b`;

async function refused(write: () => Promise<unknown>): Promise<string | null> {
  try {
    await write();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function cleanUp(): Promise<void> {
  await prisma.externalLink.deleteMany({ where: { songId: { in: [SONG, OTHER] } } });
  await prisma.bankSong.deleteMany({ where: { id: { in: [SONG, OTHER] } } });
  await prisma.bankRemoval.deleteMany({ where: { id: { in: [SONG, OTHER] } } });
}

async function main(): Promise<void> {
  // Throwaway songs cloned from a seeded one through the admin path, so each is a whole, valid databank row.
  const template = (await loadBank()).songs[0];
  if (!template) throw new Error('The databank has no songs: run `npm run db:seed` first');
  for (const id of [SONG, OTHER]) {
    const { id: _id, ...fields } = template;
    await saveBankRow('songs', id, { ...fields, title: `Smoke ${id}` }, 'create');
  }

  // 1. The CHECK.
  const none = await refused(() =>
    prisma.externalLink.create({
      data: { url: 'https://example.com/none', provider: 'other', kind: 'demo', title: 'None' },
    })
  );
  check(
    none?.includes('external_link_one_owner') ?? false,
    'a link with no owner is refused by the CHECK'
  );
  const two = await refused(() =>
    prisma.externalLink.create({
      data: {
        songId: SONG,
        artistId: null,
        instrumentId: 'moog-minimoog',
        url: 'https://example.com/two',
        provider: 'other',
        kind: 'demo',
        title: 'Two',
      },
    })
  );
  check(
    two?.includes('external_link_one_owner') ?? false,
    'a link with two owners is refused by the CHECK'
  );

  // 2. The unique index, through the admin layer.
  const link = await createLink({
    owner: { kind: 'song', id: SONG },
    url: 'https://youtu.be/dQw4w9WgXcQ',
    kind: 'original',
    title: 'The original',
    ours: false,
    rating: null,
  });
  const dup = await refused(() =>
    createLink({
      owner: { kind: 'song', id: SONG },
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3',
      kind: 'demo',
      title: 'Again',
      ours: false,
      rating: null,
    })
  );
  check(
    dup === 'That address is already linked here',
    'the same video twice on one song is refused (409)'
  );
  const elsewhere = await refused(() =>
    createLink({
      owner: { kind: 'song', id: OTHER },
      url: 'https://youtu.be/dQw4w9WgXcQ',
      kind: 'original',
      title: 'Elsewhere',
      ours: false,
      rating: null,
    })
  );
  check(elsewhere === null, 'the same video on another song is allowed');

  // 3. The public read.
  const listed = await listPublicLinks({ target: 'song', id: SONG });
  check(
    listed.length === 1 &&
      listed[0].id === link.id &&
      listed[0].embedUrl === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'the public read serves the song’s link with its embed'
  );

  // 4. Cascade through the admin removal.
  await removeBankRow('songs', SONG);
  const left = await prisma.externalLink.count({ where: { songId: SONG } });
  check(left === 0, 'removing the song through the admin path takes its links with it');
  check(
    (await prisma.externalLink.count({ where: { songId: OTHER } })) === 1,
    'the other song’s link is untouched'
  );
}

runAsOrg(INSTALL_ORG_ID, main, { source: 'job' })
  .catch((err: unknown) => {
    failures.push(err instanceof Error ? err.message : String(err));
    console.log('ERR', err);
  })
  .finally(async () => {
    await cleanUp().catch((err: unknown) => console.log('cleanup failed', err));
    await prisma.$disconnect();
    process.exit(failures.length ? 1 : 0);
  });
