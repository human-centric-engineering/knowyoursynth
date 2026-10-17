/**
 * Publishing a user's sound (`f-sharing` h1): the one place a row becomes `published`. Server-side only. The PATCH
 * route takes `private` and `link` only, so nothing else can skip these checks.
 *
 * In order, each refusal with its own code and the words to show:
 *
 * 1. Not yours: 404, as every other write.
 * 2. `USERNAME_REQUIRED` (409): a published sound is listed under its owner's username (D5).
 * 3. A synth no longer listed has no page to publish it on: 400, as a save there is.
 *    `NOT_PLAYABLE` (409): a sound saved on a definition the synth has moved on from, or whose panel no longer
 *    passes, has no panel anyone else could play. Saving it again brings it up to date.
 * 4. `NOT_ALLOWED` (422): a blocked word in the name or notes.
 * 5. `DUPLICATE` (409): it plays the same as the library sound or shared sound it was copied from.
 * 6. A tag that synth's library sounds do not use: 400.
 * 7. `PUBLISH_LIMIT` (429): more than `PUBLISH_DAILY_CAP` first publications in 24 hours. Republishing keeps the
 *    first `publishedAt`, so it neither counts again nor jumps back to the top of the newest.
 *
 * Left out, from BeatBreaker's (`lib/app/breaks/community/publish.ts` there), on purpose: the kill-switch flag, the
 * duplicate check against everyone's published work (a panel is continuous values, so a copy made other than through
 * the copy route all but never matches), and fixing a published sound so it never changes (that is variations, which
 * D5 drops). Planning rulings on `f-sharing`.
 */
import { prisma } from '@/lib/db/client';
import { APIError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { playableSynth } from '@/lib/app/sounds/store';
import {
  assertChanged,
  assertPublishableText,
  usernamesOf,
  visibilityData,
  withFreshSlug,
} from '@/lib/app/sounds/sharing';
import type { PublishUserSound } from '@/lib/app/sounds/data';
import { validateSound } from '@/lib/app/synths/validate';

/** First publications per person per 24 hours. */
export const PUBLISH_DAILY_CAP = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

const refuse = (code: string, status: number, message: string): never => {
  throw new APIError(message, code, status);
};

/** The tags a synth's library sounds use: what a published sound on it may be tagged with. */
export async function libraryTags(synthId: string): Promise<string[]> {
  const rows = await prisma.synthSound.findMany({ where: { synthId }, select: { tags: true } });
  return [...new Set(rows.flatMap((r) => r.tags))].sort();
}

/** Publish one of the caller's sounds, or refuse with the reason. */
export async function publishUserSound(
  userId: string,
  id: string,
  input: PublishUserSound,
  now = new Date()
): Promise<void> {
  const row = await prisma.userSound.findFirst({ where: { id, userId } });
  if (!row) throw new NotFoundError('Sound not found');

  if (!(await usernamesOf([userId])).has(userId))
    refuse(
      'USERNAME_REQUIRED',
      409,
      'Choose a username first: it is the name people will see on your published sounds.'
    );

  const def = await playableSynth(row.synthId);
  const panel =
    row.definitionVersion === def.version
      ? validateSound(def, { values: row.values, cables: row.cables })
      : null;
  if (!panel?.ok)
    return refuse(
      'NOT_PLAYABLE',
      409,
      `This sound was saved on an older ${def.name}. Open it and save it again before publishing.`
    );

  assertPublishableText({ name: row.name, notes: row.notes });
  await assertChanged(def, {
    panel: panel.value,
    sourceSoundId: row.sourceSoundId,
    sourceUserSoundId: row.sourceUserSoundId,
  });

  if (input.tags.length > 0) {
    const known = new Set(await libraryTags(def.id));
    const unknown = input.tags.filter((t) => !known.has(t));
    if (unknown.length > 0)
      throw new ValidationError(`${def.name}'s library has no tag ${unknown.join(', ')}`, {
        errors: unknown.map((t) => ({ path: 'tags', message: `Not a ${def.name} tag: ${t}` })),
      });
  }

  if (!row.publishedAt) {
    const recent = await prisma.userSound.count({
      where: { userId, publishedAt: { gte: new Date(now.getTime() - DAY_MS) } },
    });
    if (recent >= PUBLISH_DAILY_CAP)
      refuse(
        'PUBLISH_LIMIT',
        429,
        `That's ${PUBLISH_DAILY_CAP} sounds published in a day, the limit. Try again tomorrow.`
      );
  }

  // Keyed on the owner again, so a sound deleted meanwhile is a 404 rather than a write to nothing.
  const { count } = await withFreshSlug(() =>
    prisma.userSound.updateMany({
      where: { id, userId },
      data: {
        // a slug if it has none yet; published is set over the top
        ...visibilityData(row, 'link'),
        visibility: 'published',
        publishedAt: row.publishedAt ?? now,
        tags: input.tags,
      },
    })
  );
  if (count === 0) throw new NotFoundError('Sound not found');
}
