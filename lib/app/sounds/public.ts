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
 */
import { prisma } from '@/lib/db/client';
import { getUserSound } from '@/lib/app/sounds/store';
import { usernamesOf } from '@/lib/app/sounds/sharing';
import { SharedSlugSchema, type PublicSound } from '@/lib/app/sounds/data';

/** The shared sound at `slug`, or null if there is none to show. */
export async function getSharedSound(slug: string): Promise<PublicSound | null> {
  if (!SharedSlugSchema.safeParse(slug).success) return null;
  const row = await prisma.userSound.findUnique({
    where: { slug },
    select: { id: true, userId: true, visibility: true },
  });
  if (!row || row.visibility === 'private') return null;

  // the owner's own read, so the panel is checked and fitted exactly as theirs is; only public fields leave it
  const [sound, names] = await Promise.all([
    getUserSound(row.userId, row.id),
    usernamesOf([row.userId]),
  ]);
  const owner = names.get(row.userId);
  if (sound.visibility === 'private' || sound.slug === null) return null;
  const named = owner !== undefined && (sound.visibility === 'published' || owner.public);

  return {
    slug: sound.slug,
    synthId: sound.synthId,
    visibility: sound.visibility,
    name: sound.name,
    notes: sound.notes,
    tags: sound.tags,
    publishedAt: sound.visibility === 'published' ? sound.publishedAt : null,
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
