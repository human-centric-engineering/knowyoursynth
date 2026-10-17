/**
 * A shared sound as anyone may see it (`f-sharing` h1): what `GET /api/v1/public/sounds/:slug` answers, and what the
 * sound page (h2) reads.
 *
 * **Link and published only.** A private sound, an unknown address and a malformed one all read as null, the same
 * answer, so a 404 says nothing about which. Visibility is read on every request, so a sound made private stops being
 * served on the next one.
 *
 * **Never the account.** The author is the username, and only as the byline rule allows (`PublicSound.author`). The
 * row's id, its owner's id and the library sound's row id stay here.
 *
 * **Lists are published only** (`listPublishedSounds` for Explore, `publishedSoundsOf` for a profile): a link share is
 * never listed anywhere, and only sounds on a synth the catalogue serves, since any other has no page to open.
 *
 * **Never an unlisted sound** (`f-sharing` h4). One an admin unlisted after a report reads as private everywhere here,
 * whatever its visibility, until an admin restores it. Each read filters on `unlistedAt`.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { listSynths } from '@/lib/app/catalogue/read';
import { quietDetail } from '@/lib/app/sounds/store';
import { usernamesOf } from '@/lib/app/sounds/sharing';
import {
  EXPLORE_PAGE_SIZE,
  SharedSlugSchema,
  type ExploreQuery,
  type PublicSound,
  type PublishedSoundCard,
} from '@/lib/app/sounds/data';

/** The shared sound at `slug`, or null if there is none to show. */
export async function getSharedSound(slug: string): Promise<PublicSound | null> {
  if (!SharedSlugSchema.safeParse(slug).success) return null;
  const row = await prisma.userSound.findUnique({ where: { slug } });
  if (!row || row.visibility === 'private' || row.unlistedAt) return null;

  // read as the owner's own is, so the panel is checked and fitted exactly as theirs is; only public fields leave it
  const [sound, names] = await Promise.all([quietDetail(row), usernamesOf([row.userId])]);
  const owner = names.get(row.userId);
  const published = row.visibility === 'published';
  const named = owner !== undefined && (published || owner.public);

  return {
    slug,
    synthId: sound.synthId,
    visibility: row.visibility,
    name: sound.name,
    notes: sound.notes,
    // chosen at publish, and shown only while it is: a sound taken back to a link share is not listed by them
    tags: published ? sound.tags : [],
    publishedAt: published ? sound.publishedAt : null,
    author: named ? owner.username : null,
    authorProfile: named && owner.public,
    source: sound.source
      ? { slug: sound.source.slug, name: sound.source.name, ref: sound.source.ref }
      : null,
    basedOn: sound.basedOn,
    definitionVersion: sound.definitionVersion,
    playable: sound.playable,
    panel: sound.panel,
    problems: sound.problems,
    fitted: sound.fitted,
  };
}

const CARD_SELECT = {
  slug: true,
  synthId: true,
  name: true,
  tags: true,
  publishedAt: true,
  userId: true,
  _count: { select: { copies: true } },
} as const satisfies Prisma.UserSoundSelect;

/** Published rows as cards. One whose owner has no username is left out: it has no byline to give. */
async function toCards(
  rows: Prisma.UserSoundGetPayload<{ select: typeof CARD_SELECT }>[],
  synthNames: Map<string, string>
): Promise<PublishedSoundCard[]> {
  const names = await usernamesOf(rows.map((r) => r.userId));
  return rows.flatMap((r) => {
    const owner = names.get(r.userId);
    const synthName = synthNames.get(r.synthId);
    if (!owner || !r.slug || !r.publishedAt || !synthName) return [];
    return [
      {
        slug: r.slug,
        synthId: r.synthId,
        synthName,
        name: r.name,
        tags: r.tags,
        publishedAt: r.publishedAt.toISOString(),
        author: owner.username,
        authorProfile: owner.public,
        saves: r._count.copies,
      },
    ];
  });
}

/** Every tag a published sound could carry: the tags the library sounds use, on one synth or every served one. */
export async function exploreTags(synthId?: string): Promise<string[]> {
  const ids = synthId ? [synthId] : (await listSynths()).map((s) => s.id);
  const rows = await prisma.synthSound.findMany({
    where: { synthId: { in: ids } },
    select: { tags: true },
  });
  return [...new Set(rows.flatMap((r) => r.tags))].sort();
}

/**
 * One page of Explore: published sounds, optionally on one synth and with one tag, newest first or most saved first.
 * A synth the catalogue does not serve is dropped from the query, as one that does not parse is, and so is a tag no
 * library sound uses; `applied` says what was used.
 */
export async function listPublishedSounds(query: ExploreQuery): Promise<{
  sounds: PublishedSoundCard[];
  total: number;
  applied: ExploreQuery;
}> {
  const synths = await listSynths();
  const synthNames = new Map(synths.map((s) => [s.id, s.name]));
  const synth = query.synth && synthNames.has(query.synth) ? query.synth : undefined;
  const tag = query.tag && (await exploreTags(synth)).includes(query.tag) ? query.tag : undefined;
  const applied: ExploreQuery = { synth, tag, sort: query.sort, page: query.page };

  const where: Prisma.UserSoundWhereInput = {
    visibility: 'published',
    slug: { not: null },
    unlistedAt: null,
    synthId: synth ?? { in: [...synthNames.keys()] },
    ...(tag ? { tags: { has: tag } } : {}),
  };
  // the id last, so a page boundary between equal sounds is the same on every request
  const orderBy: Prisma.UserSoundOrderByWithRelationInput[] =
    query.sort === 'saves'
      ? [{ copies: { _count: 'desc' } }, { publishedAt: 'desc' }, { id: 'desc' }]
      : [{ publishedAt: 'desc' }, { id: 'desc' }];

  const [rows, total] = await Promise.all([
    prisma.userSound.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * EXPLORE_PAGE_SIZE,
      take: EXPLORE_PAGE_SIZE,
      select: CARD_SELECT,
    }),
    prisma.userSound.count({ where }),
  ]);
  return { sounds: await toCards(rows, synthNames), total, applied };
}

/** One user's published sounds, newest first, for their profile. Never their link shares. */
export async function publishedSoundsOf(userId: string): Promise<PublishedSoundCard[]> {
  const synths = await listSynths();
  const synthNames = new Map(synths.map((s) => [s.id, s.name]));
  const rows = await prisma.userSound.findMany({
    where: {
      userId,
      visibility: 'published',
      slug: { not: null },
      unlistedAt: null,
      synthId: { in: [...synthNames.keys()] },
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    select: CARD_SELECT,
  });
  return toCards(rows, synthNames);
}

/** Every published sound's address, for the sitemap. Never a link share. */
export async function publishedSoundAddresses(): Promise<{ synthId: string; slug: string }[]> {
  const served = (await listSynths()).map((s) => s.id);
  const rows = await prisma.userSound.findMany({
    where: {
      visibility: 'published',
      slug: { not: null },
      unlistedAt: null,
      synthId: { in: served },
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    select: { synthId: true, slug: true },
  });
  return rows.flatMap((r) => (r.slug ? [{ synthId: r.synthId, slug: r.slug }] : []));
}
