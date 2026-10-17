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
import { quietDetail } from '@/lib/app/sounds/store';
import { usernamesOf } from '@/lib/app/sounds/sharing';
import { SharedSlugSchema, type PublicSound } from '@/lib/app/sounds/data';

/** The shared sound at `slug`, or null if there is none to show. */
export async function getSharedSound(slug: string): Promise<PublicSound | null> {
  if (!SharedSlugSchema.safeParse(slug).success) return null;
  const row = await prisma.userSound.findUnique({ where: { slug } });
  if (!row || row.visibility === 'private') return null;

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
