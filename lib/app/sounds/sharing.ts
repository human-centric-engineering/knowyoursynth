/**
 * Sharing a user's sound by link, and crediting the shared sound a copy came from (`f-sharing` h1). Server-side only.
 *
 * BeatBreaker's model (`lib/app/breaks/community/sharing.ts` there), re-derived:
 *
 * - **The slug** is minted the first time a sound leaves private, and kept after. A link that stopped working when
 *   its sound went private works again when it is shared again, and a published sound that goes back to a link share
 *   keeps its address. Ten characters of lower-case Crockford base32: 50 bits, not enumerable.
 * - **The credit is read, never kept.** The library credit is a snapshot (`store.ts`), because a library sound names
 *   an artist, not a user. A shared sound names a user, and a snapshot of their username would outlive their erasure.
 *   So it is read through `sourceUserSoundId` (`SetNull`) while the source is **published** and its owner has a
 *   username. A link share is never credited: the credit links to it, and a copy shared onward would hand a link-only
 *   address to strangers.
 */
import type { Prisma, SynthSound } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { APIError } from '@/lib/api/errors';
import { hasPrismaCode } from '@/lib/app/synths/lib/prisma-errors';
import { textIsBlocked } from '@/lib/app/profile/words';
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';
import type { AppSynthDef } from '@/lib/app/synths/defs';
import { presetState } from '@/lib/app/synths/lib/patch';
import { validatePreset, validateSound } from '@/lib/app/synths/validate';
import type { SharedSource, SoundVisibility } from '@/lib/app/sounds/data';
import { lessonText, type SoundLessonInput } from '@/lib/app/sounds/lesson';

/* Crockford's base32, lower-case: no i, l, o or u, so an address read aloud or copied by hand survives. */
const SLUG_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const SLUG_LENGTH = 10;

/** A fresh public address. `withFreshSlug` retries on the (vanishing) unique clash. */
export function mintSlug(): string {
  // 32 symbols: the low five bits of each byte are uniform, so there is no bias
  const bytes = crypto.getRandomValues(new Uint8Array(SLUG_LENGTH));
  return Array.from(bytes, (b) => SLUG_ALPHABET[b & 31]).join('');
}

/**
 * The columns that move a sound to `next`: a slug the first time it leaves private, the one it has otherwise. Going
 * private keeps the slug, so sharing again brings the same address back.
 */
export function visibilityData(
  current: { slug: string | null },
  next: SoundVisibility
): Pick<Prisma.UserSoundUpdateManyMutationInput, 'visibility' | 'slug'> {
  if (next === 'private' || current.slug) return { visibility: next };
  return { visibility: next, slug: mintSlug() };
}

/**
 * Run a write that may mint a slug, again if the slug it minted was taken. At 50 bits a clash will not happen. `slug`
 * is the only unique column a user-sound write can clash on besides the id, which is never written. A clash aborts
 * the transaction it is in, so the whole transaction is what is run again.
 */
export async function withFreshSlug<T>(storeWithSlug: () => Promise<T>, tries = 3): Promise<T> {
  // not named `write`: scripts/ci/shared-settings-writes.ts follows calls by name, and a catalogue writer has that one
  for (let attempt = 1; ; attempt++) {
    try {
      return await storeWithSlug();
    } catch (err) {
      if (attempt >= tries || !hasPrismaCode(err, 'P2002')) throw err;
    }
  }
}

/**
 * Take the lock that orders one user's sound changes and publishes, held to the end of `tx`. Each reads the sound
 * after taking it, so the checks run against the row the write lands on: two link shares do not mint two slugs, an
 * edit racing a publish is checked as the published sound it becomes, and the daily cap is read and spent as one.
 */
export async function lockOwnersSounds(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
}

/** The usernames of these users, from one query. A user with no profile is absent. */
export async function usernamesOf(
  userIds: string[]
): Promise<Map<string, { username: string; public: boolean }>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const rows = await prisma.synthProfile.findMany({
    where: { userId: { in: unique } },
    select: { userId: true, username: true, public: true },
  });
  return new Map(rows.map((r) => [r.userId, { username: r.username, public: r.public }]));
}

/**
 * The credit for each of these source ids, from two queries however many there are: only a source that is published
 * and not unlisted, whose owner has a username. Every other id is absent: the credit links to the source's page.
 */
export async function sharedSourcesOf(
  sourceIds: (string | null)[]
): Promise<Map<string, SharedSource>> {
  const ids = [...new Set(sourceIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.userSound.findMany({
    where: { id: { in: ids }, visibility: 'published', slug: { not: null }, unlistedAt: null },
    select: { id: true, name: true, synthId: true, slug: true, userId: true },
  });
  const names = await usernamesOf(rows.map((r) => r.userId));
  const out = new Map<string, SharedSource>();
  for (const r of rows) {
    const owner = names.get(r.userId);
    if (owner && r.slug)
      out.set(r.id, { name: r.name, username: owner.username, synthId: r.synthId, slug: r.slug });
  }
  return out;
}

/**
 * A panel as it plays: every control at its value or its `init`, and the cables in one order. Two panels with the same
 * key sound the same, however they were stored.
 */
export function panelKey(
  def: AppSynthDef,
  panel: { values: ControlValues; cables: CablePair[] }
): string {
  const values: ControlValues = { ...def.init, ...panel.values };
  const sorted = Object.keys(values)
    .sort()
    .map((k) => [k, values[k]]);
  const cables = panel.cables.map(([from, to]) => `${from}>${to}`).sort();
  return JSON.stringify([sorted, cables]);
}

/**
 * A library sound's panel as it ends, every step applied, or null when the synth cannot play it as it is now (another
 * definition version, or a preset that no longer passes): what a copy of it starts from, and what an unchanged copy
 * would still be.
 */
export function libraryPanel(
  def: AppSynthDef,
  row: Pick<
    SynthSound,
    'slug' | 'definitionVersion' | 'name' | 'ref' | 'artist' | 'tags' | 'level' | 'blurb' | 'how'
  > & { phrase: unknown; steps: unknown; context: unknown; tweaks: unknown }
): { values: ControlValues; cables: CablePair[] } | null {
  if (row.definitionVersion !== def.version) return null;
  const preset = validatePreset(def, {
    id: row.slug,
    name: row.name,
    ref: row.ref,
    artist: row.artist,
    tags: row.tags,
    level: row.level,
    blurb: row.blurb,
    how: row.how,
    phrase: row.phrase,
    steps: row.steps,
    context: row.context,
    tweaks: row.tweaks,
  });
  if (!preset.ok) return null;
  const state = presetState(def, preset.value);
  return { values: state.values, cables: state.cables.map((c) => [c.from, c.to]) };
}

const refuse = (code: string, status: number, message: string): never => {
  throw new APIError(message, code, status);
};

/**
 * A sound an admin unlisted after a report cannot be shared or published again (`UNLISTED`, 409) until an admin restores
 * it (`f-sharing` h4). Making it private is still allowed: that takes nothing public.
 */
export function assertNotUnlisted(row: { unlistedAt: Date | null }): void {
  if (row.unlistedAt)
    refuse(
      'UNLISTED',
      409,
      'Moderators unlisted this sound after a report, so it cannot be shared again for now.'
    );
}

/**
 * What a public sound's name, notes and lesson may not say: a blocked word (`NOT_ALLOWED`, 422). Run at publish, and on
 * any change to a published sound's name or notes, so an edit after publishing cannot put up what publishing refuses.
 * None of it is HTML-sanitised: every surface renders it as text.
 *
 * The lesson (`f-tutor` t-55) is checked at publish only, since it cannot change after. Its refusal has its own code,
 * `LESSON_NOT_ALLOWED`: a lesson cannot be reworded, only removed, so the page offers to remove it, and the sound can
 * then be published without it. Any client can send a lesson, so it is checked whoever wrote it.
 */
export function assertPublishableText(text: {
  name: string;
  notes: string | null;
  lesson?: SoundLessonInput | null;
}): void {
  if (textIsBlocked(text.name) || (text.notes !== null && textIsBlocked(text.notes)))
    refuse(
      'NOT_ALLOWED',
      422,
      "That name or those notes can't be published. Change the wording and try again."
    );
  if (text.lesson && lessonText(text.lesson).some(textIsBlocked))
    refuse(
      'LESSON_NOT_ALLOWED',
      422,
      "The lesson saved with this sound has wording that can't be published. Remove the lesson to publish the sound without it."
    );
}

/**
 * An unchanged copy cannot be published (`DUPLICATE`, 409): a panel that plays the same as the library sound or the
 * shared sound it was copied from would put someone else's sound up as yours. Compared as each plays now, so the
 * library sound as it ends and the shared sound as it is stored. A source that has gone, or that the synth cannot
 * play as it is now, has nothing to compare with.
 *
 * Run at every publish and on a panel change to a published sound, not on a rename: a source changing after the copy
 * was published must not lock it out of its own name.
 */
export async function assertChanged(
  def: AppSynthDef,
  sound: {
    panel: { values: ControlValues; cables: CablePair[] };
    sourceSoundId: string | null;
    sourceUserSoundId: string | null;
  }
): Promise<void> {
  const key = panelKey(def, sound.panel);
  if (sound.sourceUserSoundId) {
    const shared = await prisma.userSound.findUnique({
      where: { id: sound.sourceUserSoundId },
      select: { name: true, synthId: true, definitionVersion: true, values: true, cables: true },
    });
    // read through the definition, as every stored panel is (`store.ts`); one that fails has nothing to compare
    const stored =
      shared && shared.synthId === def.id && shared.definitionVersion === def.version
        ? validateSound(def, { values: shared.values, cables: shared.cables })
        : null;
    if (shared && stored?.ok && panelKey(def, stored.value) === key)
      refuse(
        'DUPLICATE',
        409,
        `This plays the same as “${shared.name}”, the sound it was copied from. Change something first.`
      );
  }
  if (sound.sourceSoundId) {
    const library = await prisma.synthSound.findUnique({ where: { id: sound.sourceSoundId } });
    const panel = library && library.synthId === def.id ? libraryPanel(def, library) : null;
    if (library && panel && panelKey(def, panel) === key)
      refuse(
        'DUPLICATE',
        409,
        `This plays the same as “${library.name}” from the library. Change something first.`
      );
  }
}
