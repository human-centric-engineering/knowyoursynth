/**
 * A signed-in user's favourites (`f-my-sounds` s4): their star on a synth, a library sound or one of their own sounds.
 *
 * **Owner-scoped.** Every read and write is keyed on the caller's user id, so another user's favourite is a 404, the
 * same as one that does not exist.
 *
 * **Only what the user can see.** A synth or library sound has to be on a listed synth the app can play, as a new sound
 * does (a 400 otherwise, as the sounds API says it); one of the user's own sounds has to be theirs (a 404 otherwise, as
 * the sounds API says it). Nothing is stored for either.
 *
 * **One star per thing.** Starring something already starred returns the star it has. The schema's unique keys are what
 * guarantee it, so two requests at once end with one row.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { hasPrismaCode } from '@/lib/app/synths/lib/prisma-errors';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { playableSynth } from '@/lib/app/sounds/store';
import { getSynthDef } from '@/lib/app/synths/defs';
import type { Favourite, FavouriteInput } from '@/lib/app/sounds/favourite-data';

const FAVOURITE_SELECT = {
  id: true,
  createdAt: true,
  synth: { select: { id: true, name: true, listed: true } },
  synthSound: {
    select: { synthId: true, slug: true, name: true, synth: { select: { listed: true } } },
  },
  userSound: {
    select: { id: true, synthId: true, name: true, synth: { select: { listed: true } } },
  },
} as const satisfies Prisma.FavouriteSelect;

type FavouriteRow = Prisma.FavouriteGetPayload<{ select: typeof FAVOURITE_SELECT }>;

/** As the catalogue serves a synth: listed, with a definition to play it. */
const servable = (synthId: string, listed: boolean) => listed && getSynthDef(synthId) !== null;

function toFavourite(row: FavouriteRow): Favourite {
  const base = { id: row.id, createdAt: row.createdAt.toISOString() };
  if (row.synthSound)
    return {
      ...base,
      kind: 'sound',
      synthId: row.synthSound.synthId,
      slug: row.synthSound.slug,
      soundId: null,
      name: row.synthSound.name,
      available: servable(row.synthSound.synthId, row.synthSound.synth.listed),
    };
  if (row.userSound)
    return {
      ...base,
      kind: 'mine',
      synthId: row.userSound.synthId,
      slug: null,
      soundId: row.userSound.id,
      name: row.userSound.name,
      available: servable(row.userSound.synthId, row.userSound.synth.listed),
    };
  // The store writes exactly one target, and each is a Cascade relation, so a row with none cannot be read.
  if (!row.synth) throw new Error(`Favourite ${row.id} stars nothing`);
  return {
    ...base,
    kind: 'synth',
    synthId: row.synth.id,
    slug: null,
    soundId: null,
    name: row.synth.name,
    available: servable(row.synth.id, row.synth.listed),
  };
}

/** The caller's favourites, most recently starred first. */
export async function listFavourites(userId: string): Promise<Favourite[]> {
  const rows = await prisma.favourite.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: FAVOURITE_SELECT,
  });
  return rows.map(toFavourite);
}

/** The one column a favourite of this target sets, once the caller is allowed to star it. */
async function targetOf(
  userId: string,
  input: FavouriteInput
): Promise<{ synthId: string } | { synthSoundId: string } | { userSoundId: string }> {
  if (input.kind === 'mine') {
    const own = await prisma.userSound.findFirst({
      where: { id: input.soundId, userId },
      select: { id: true },
    });
    if (!own) throw new NotFoundError('Patch not found');
    return { userSoundId: own.id };
  }
  const def = await playableSynth(input.synthId);
  if (input.kind === 'synth') return { synthId: def.id };
  const sound = await prisma.synthSound.findUnique({
    where: { synthId_slug: { synthId: def.id, slug: input.slug } },
    select: { id: true },
  });
  if (!sound)
    throw new ValidationError(`${def.id} has no library patch ${input.slug}`, {
      errors: [{ path: 'slug', message: `No library patch ${input.slug} on ${def.id}` }],
    });
  return { synthSoundId: sound.id };
}

/** Star something for the caller. `created` is false when it was already starred, and the star is the one it had. */
export async function addFavourite(
  userId: string,
  input: FavouriteInput
): Promise<{ favourite: Favourite; created: boolean }> {
  const target = await targetOf(userId, input);
  const where = { userId, ...target };
  const existing = await prisma.favourite.findFirst({ where, select: FAVOURITE_SELECT });
  if (existing) return { favourite: toFavourite(existing), created: false };
  try {
    const row = await prisma.favourite.create({ data: where, select: FAVOURITE_SELECT });
    return { favourite: toFavourite(row), created: true };
  } catch (err) {
    // Starred by another request between the read and the write: that star is this one.
    if (!hasPrismaCode(err, 'P2002')) throw err;
    const row = await prisma.favourite.findFirst({ where, select: FAVOURITE_SELECT });
    if (!row) throw err;
    return { favourite: toFavourite(row), created: false };
  }
}

/** Remove one of the caller's favourites, or a 404 when they have none with that id. */
export async function removeFavourite(userId: string, id: string): Promise<void> {
  const { count } = await prisma.favourite.deleteMany({ where: { id, userId } });
  if (count === 0) throw new NotFoundError('Favourite not found');
}
