/**
 * Sharing a user's pattern by link, publishing it, and crediting the shared pattern a copy came from
 * (`f-step-sequencer` t-83). Server-side only.
 *
 * Sounds' sharing (`lib/app/sounds/sharing.ts`, `publish.ts`), re-derived for a pattern:
 *
 * - **The slug, the lock and the username carry over unchanged**, and so do their reasons: an address minted the
 *   first time it leaves private and kept after, so a link works again when it is shared again; one owner's changes
 *   ordered by one lock (the same user-row lock their sounds take); publishing is choosing to be named.
 * - **The credit is read, never kept**, for the same reason as a sound's: it names a user, and a snapshot would outlive
 *   their erasure. Only a published source, not unlisted, whose owner has a username, is credited.
 * - **The word check covers the name.** A pattern has no notes, and no lesson. Its notes are numbers, which say nothing.
 * - **"Plays the same" is the pattern itself**, compared key by key (`patternKey`). A pattern is discrete, unlike a
 *   panel's continuous values, so an unchanged copy compares equal exactly. Only the shared pattern it was copied from
 *   is compared: a pattern does not record a library riff it was opened from (t-81), so an imported riff published
 *   unchanged is not caught. It is the app's own riff, credited to nobody here, not someone else's work.
 * - **No tags.** A sound's tags are its synth's library's, and a pattern has no synth.
 * - **A daily cap of its own** (`recentPatternPublishes`), so publishing patterns does not spend the day's sounds.
 */
import type { Prisma, UserPattern } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { APIError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { textIsBlocked } from '@/lib/app/profile/words';
import { PATTERN_VERSION, PatternSchema, type Pattern } from '@/lib/app/sequencer/pattern';
import {
  lockOwnersSounds,
  usernamesOf,
  visibilityData,
  withFreshSlug,
} from '@/lib/app/sounds/sharing';
import { SharedSlugSchema } from '@/lib/app/sounds/data';
import type { SharedPatternSource } from '@/lib/app/patterns/data';

/** First publications of patterns per person per 24 hours, as for sounds. */
export const PATTERN_PUBLISH_DAILY_CAP = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

const refuse = (code: string, status: number, message: string): never => {
  throw new APIError(message, code, status);
};

/** The columns that move a pattern to `next`: `visibilityData`, as a sound's. */
export const patternVisibilityData = (
  current: { slug: string | null },
  next: 'private' | 'link'
): Pick<Prisma.UserPatternUpdateManyMutationInput, 'visibility' | 'slug'> =>
  visibilityData(current, next);

/** Take the owner's lock for a pattern change (`lockOwnersSounds`: one lock for their sounds and patterns). */
export const lockOwnersPatterns = lockOwnersSounds;

/** JSON with every object's keys in order, so two patterns that are the same compare equal however they were stored. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .flatMap((k) => {
        const v = (value as Record<string, unknown>)[k];
        return v === undefined ? [] : [`${JSON.stringify(k)}:${canonical(v)}`];
      })
      .join(',')}}`;
  return JSON.stringify(value);
}

/** A pattern as it plays, as a string: two patterns with the same key are the same pattern. */
export const patternKey = (pattern: Pattern): string => canonical(pattern);

/** The stored pattern, if the sequencer can read it as it is now. */
export function readablePattern(row: Pick<UserPattern, 'version' | 'pattern'>): Pattern | null {
  if (row.version !== PATTERN_VERSION) return null;
  const parsed = PatternSchema.safeParse(row.pattern);
  return parsed.success ? parsed.data : null;
}

/**
 * The credit for each of these source ids, from two queries however many there are: only a source that is published
 * and not unlisted, whose owner has a username. Every other id is absent.
 */
export async function sharedPatternSourcesOf(
  sourceIds: (string | null)[]
): Promise<Map<string, SharedPatternSource>> {
  const ids = [...new Set(sourceIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.userPattern.findMany({
    where: { id: { in: ids }, visibility: 'published', slug: { not: null }, unlistedAt: null },
    select: { id: true, name: true, slug: true, userId: true },
  });
  const names = await usernamesOf(rows.map((r) => r.userId));
  const out = new Map<string, SharedPatternSource>();
  for (const r of rows) {
    const owner = names.get(r.userId);
    if (owner && r.slug) out.set(r.id, { name: r.name, username: owner.username, slug: r.slug });
  }
  return out;
}

/** A pattern moderators unlisted cannot be shared or published again (`UNLISTED`, 409) until they restore it. */
export function assertPatternNotUnlisted(row: { unlistedAt: Date | null }): void {
  if (row.unlistedAt)
    refuse(
      'UNLISTED',
      409,
      'Moderators unlisted this pattern after a report, so it cannot be shared again for now.'
    );
}

/** A public pattern's name may not hold a blocked word (`NOT_ALLOWED`, 422): at publish, and on a published rename. */
export function assertPublishableName(name: string): void {
  if (textIsBlocked(name))
    refuse('NOT_ALLOWED', 422, "That name can't be published. Change the wording and try again.");
}

/**
 * An unchanged copy cannot be published (`DUPLICATE`, 409): it would put someone else's pattern up as yours. A source
 * that has gone, or that the sequencer can no longer read, has nothing to compare with. Run at publish and on new steps
 * for a published pattern, never on a rename: the source changing after must not lock the copy out of its own name.
 */
export async function assertPatternChanged(
  pattern: Pattern,
  sourceUserPatternId: string | null,
  db: Prisma.TransactionClient = prisma
): Promise<void> {
  if (!sourceUserPatternId) return;
  const source = await db.userPattern.findUnique({
    where: { id: sourceUserPatternId },
    select: { name: true, version: true, pattern: true },
  });
  const theirs = source ? readablePattern(source) : null;
  if (source && theirs && patternKey(theirs) === patternKey(pattern))
    refuse(
      'DUPLICATE',
      409,
      `This is the same as “${source.name}”, the pattern it was copied from. Change something first.`
    );
}

/**
 * The shared pattern at `slug` that a copy may be made from, or a 400 on `source.shared` (`sharedSourceGone` on the
 * page reads that path): a private, unlisted or unknown one is the same answer.
 */
export async function sharedCopySource(slug: string): Promise<UserPattern> {
  const row = SharedSlugSchema.safeParse(slug).success
    ? await prisma.userPattern.findUnique({ where: { slug } })
    : null;
  if (!row || row.visibility === 'private' || row.unlistedAt)
    throw new ValidationError('That pattern is not shared', {
      errors: [{ path: 'source.shared', message: 'No shared pattern has that address' }],
    });
  return row;
}

/**
 * Publish one of the caller's patterns, or refuse with the reason. In order:
 *
 * 1. Not yours: 404. `UNLISTED` (409): moderators unlisted it.
 * 2. `USERNAME_REQUIRED` (409): a published pattern is listed under its owner's username.
 * 3. `NOT_PLAYABLE` (409): saved as a shape the sequencer has moved on from, or one that no longer passes.
 * 4. `NOT_ALLOWED` (422): a blocked word in the name.
 * 5. `DUPLICATE` (409): it is the shared pattern it was copied from, unchanged.
 * 6. `PUBLISH_LIMIT` (429): more than `PATTERN_PUBLISH_DAILY_CAP` first publications in 24 hours. A republish keeps the
 *    first `publishedAt` and does not count.
 *
 * All of it under the owner's lock, so publishes sent together are counted one after another, and an edit sent with
 * this one is checked as the published pattern it becomes.
 */
export async function publishUserPattern(
  userId: string,
  id: string,
  now = new Date()
): Promise<void> {
  await withFreshSlug(() =>
    prisma.$transaction(async (tx) => {
      await lockOwnersPatterns(tx, userId);
      const row = await tx.userPattern.findFirst({ where: { id, userId } });
      if (!row) throw new NotFoundError('Pattern not found');
      assertPatternNotUnlisted(row);

      const profile = await tx.synthProfile.findUnique({
        where: { userId },
        select: { recentPatternPublishes: true },
      });
      if (!profile)
        return refuse(
          'USERNAME_REQUIRED',
          409,
          'Choose a username first: it is the name people will see on your published patterns.'
        );

      const pattern = readablePattern(row);
      if (!pattern)
        return refuse(
          'NOT_PLAYABLE',
          409,
          'This pattern was saved in a shape the sequencer no longer reads. Open it and save it again before publishing.'
        );
      assertPublishableName(row.name);
      await assertPatternChanged(pattern, row.sourceUserPatternId, tx);

      if (!row.publishedAt) {
        const recent = profile.recentPatternPublishes.filter(
          (t) => t.getTime() > now.getTime() - DAY_MS
        );
        if (recent.length >= PATTERN_PUBLISH_DAILY_CAP)
          refuse(
            'PUBLISH_LIMIT',
            429,
            `That's ${PATTERN_PUBLISH_DAILY_CAP} patterns published in a day, the limit. Try again tomorrow.`
          );
        await tx.synthProfile.update({
          where: { userId },
          data: { recentPatternPublishes: [...recent, now] },
        });
      }

      // keyed on the owner again: a pattern deleted meanwhile (a delete takes no lock) is a 404, and the place is given back
      const { count } = await tx.userPattern.updateMany({
        where: { id, userId },
        data: {
          ...patternVisibilityData(row, 'link'),
          visibility: 'published',
          publishedAt: row.publishedAt ?? now,
        },
      });
      if (count === 0) throw new NotFoundError('Pattern not found');
    })
  );
}
