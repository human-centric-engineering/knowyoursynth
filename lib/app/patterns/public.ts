/**
 * A shared pattern as anyone may see it (`f-step-sequencer` t-83): what `GET /api/v1/public/patterns/:slug` answers,
 * what the pattern's page reads, and the published lists (Explore, a profile, the sitemap).
 *
 * The rules are a shared sound's (`lib/app/sounds/public.ts`), for the same reasons:
 *
 * - **Link and published only**, and **never unlisted**: private, unlisted, unknown and malformed all read as null.
 * - **Never the account.** The author is the username, and only as the byline rule allows: always on a published
 *   pattern, on a link share only when the owner's profile is public.
 * - **Lists are published only.** A link share is never listed anywhere.
 *
 * Unlike a sound, a pattern belongs to no synth, so a list does not drop one made on a synth the catalogue stopped
 * serving: its page opens on another (`patternHomeSynth`).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { listSynths } from '@/lib/app/catalogue/read';
import { EXPLORE_PAGE_SIZE, SharedSlugSchema } from '@/lib/app/sounds/data';
import { usernamesOf } from '@/lib/app/sounds/sharing';
import { readablePattern, sharedPatternSourcesOf } from '@/lib/app/patterns/sharing';
import type {
  PatternExploreQuery,
  PublicPattern,
  PublishedPatternCard,
} from '@/lib/app/patterns/data';
import { PATTERN_VERSION, PatternSchema } from '@/lib/app/sequencer/pattern';

/** What a published pattern's every read needs: published, with an address, and not unlisted. */
const PUBLISHED = {
  visibility: 'published',
  slug: { not: null },
  unlistedAt: null,
} as const satisfies Prisma.UserPatternWhereInput;

/**
 * The synth a pattern's page opens on: the one it was made on while the catalogue serves it, or the catalogue's first.
 * Null only when the catalogue serves none.
 */
export function patternHomeSynth(
  synthId: string | null,
  served: readonly { id: string }[]
): string | null {
  if (synthId && served.some((s) => s.id === synthId)) return synthId;
  return served[0]?.id ?? null;
}

/** The shared pattern at `slug`, or null if there is none to show. */
export async function getSharedPattern(slug: string): Promise<PublicPattern | null> {
  if (!SharedSlugSchema.safeParse(slug).success) return null;
  const row = await prisma.userPattern.findUnique({ where: { slug } });
  if (!row || row.visibility === 'private' || row.unlistedAt) return null;

  const [names, credits] = await Promise.all([
    usernamesOf([row.userId]),
    sharedPatternSourcesOf([row.sourceUserPatternId]),
  ]);
  const owner = names.get(row.userId);
  const published = row.visibility === 'published';
  const named = owner !== undefined && (published || owner.public);
  // read as the owner's read reads it; not logged, so anyone holding the address cannot fill the error log
  const pattern = readablePattern(row);
  const problems = pattern
    ? []
    : row.version !== PATTERN_VERSION
      ? [`Saved as pattern version ${row.version}, which the sequencer no longer reads`]
      : (PatternSchema.safeParse(row.pattern)
          .error?.issues.slice(0, 5)
          .map((i) => i.message) ?? []);

  return {
    slug,
    visibility: row.visibility,
    name: row.name,
    synthId: row.synthId,
    publishedAt: published ? (row.publishedAt?.toISOString() ?? null) : null,
    author: named ? owner.username : null,
    authorProfile: named && owner.public,
    basedOn: row.sourceUserPatternId ? (credits.get(row.sourceUserPatternId) ?? null) : null,
    pattern,
    problems,
    steps: pattern ? pattern.parts[0].steps.length : 0,
    parts: pattern ? pattern.parts.length : 0,
  };
}

const CARD_SELECT = {
  slug: true,
  name: true,
  synthId: true,
  version: true,
  pattern: true,
  publishedAt: true,
  userId: true,
  _count: { select: { copies: true } },
} as const satisfies Prisma.UserPatternSelect;

/** Published rows as cards. One whose owner has no username is left out: it has no byline to give. */
async function toCards(
  rows: Prisma.UserPatternGetPayload<{ select: typeof CARD_SELECT }>[]
): Promise<PublishedPatternCard[]> {
  const [names, synths] = await Promise.all([usernamesOf(rows.map((r) => r.userId)), listSynths()]);
  const synthNames = new Map(synths.map((s) => [s.id, s.name]));
  return rows.flatMap((r) => {
    const owner = names.get(r.userId);
    if (!owner || !r.slug || !r.publishedAt) return [];
    const pattern = readablePattern(r);
    const synthName = r.synthId ? (synthNames.get(r.synthId) ?? null) : null;
    return [
      {
        slug: r.slug,
        name: r.name,
        synthId: synthName ? r.synthId : null,
        synthName,
        steps: pattern ? pattern.parts[0].steps.length : 0,
        parts: pattern ? pattern.parts.length : 0,
        publishedAt: r.publishedAt.toISOString(),
        author: owner.username,
        authorProfile: owner.public,
        saves: r._count.copies,
      },
    ];
  });
}

/** One page of Explore's patterns: newest first, or most saved first. */
export async function listPublishedPatterns(
  query: PatternExploreQuery
): Promise<{ patterns: PublishedPatternCard[]; total: number }> {
  // the id last, so a page boundary between equal patterns is the same on every request
  const orderBy: Prisma.UserPatternOrderByWithRelationInput[] =
    query.sort === 'saves'
      ? [{ copies: { _count: 'desc' } }, { publishedAt: 'desc' }, { id: 'desc' }]
      : [{ publishedAt: 'desc' }, { id: 'desc' }];
  const [rows, total] = await Promise.all([
    prisma.userPattern.findMany({
      where: PUBLISHED,
      orderBy,
      skip: (query.page - 1) * EXPLORE_PAGE_SIZE,
      take: EXPLORE_PAGE_SIZE,
      select: CARD_SELECT,
    }),
    prisma.userPattern.count({ where: PUBLISHED }),
  ]);
  return { patterns: await toCards(rows), total };
}

/** One user's published patterns, newest first, for their profile. Never their link shares. */
export async function publishedPatternsOf(userId: string): Promise<PublishedPatternCard[]> {
  const rows = await prisma.userPattern.findMany({
    where: { userId, ...PUBLISHED },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    select: CARD_SELECT,
  });
  return toCards(rows);
}

/** Every published pattern's address and the synth its page opens on, for the sitemap. Never a link share. */
export async function publishedPatternAddresses(): Promise<{ synthId: string; slug: string }[]> {
  const [rows, served] = await Promise.all([
    prisma.userPattern.findMany({
      where: PUBLISHED,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: { synthId: true, slug: true },
    }),
    listSynths(),
  ]);
  return rows.flatMap((r) => {
    const synthId = patternHomeSynth(r.synthId, served);
    return r.slug && synthId ? [{ synthId, slug: r.slug }] : [];
  });
}
