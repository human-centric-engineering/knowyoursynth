/**
 * The shapes of a signed-in user's favourites (`f-my-sounds` s4): what `/api/v1/me/favourites` takes and returns.
 * Shapes only, with no database client, so the synth page checks with the same schemas the routes do.
 *
 * A favourite is a star on exactly one thing: a synth (`synth`), a library sound (`sound`, by synth and slug, as the
 * page names it) or one of the user's own sounds (`mine`).
 */
import { z } from 'zod';
import { SoundSlugSchema, SynthIdSchema, UserSoundIdSchema } from '@/lib/app/sounds/data';

export const FAVOURITE_KINDS = ['synth', 'sound', 'mine'] as const;
export type FavouriteKind = (typeof FAVOURITE_KINDS)[number];

/** `POST /api/v1/me/favourites`: what to star. */
export const FavouriteInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('synth'), synthId: SynthIdSchema }).strict(),
  z.object({ kind: z.literal('sound'), synthId: SynthIdSchema, slug: SoundSlugSchema }).strict(),
  z.object({ kind: z.literal('mine'), soundId: UserSoundIdSchema }).strict(),
]);
export type FavouriteInput = z.infer<typeof FavouriteInputSchema>;

/** A favourite's id, as Prisma's `cuid()` writes them. */
export const FavouriteIdSchema = UserSoundIdSchema;

/** A favourite as the API returns it. */
export interface Favourite {
  id: string;
  kind: FavouriteKind;
  synthId: string;
  /** The library sound's slug, for `sound`. */
  slug: string | null;
  /** The user's own sound, for `mine`. */
  soundId: string | null;
  /** The synth's, library sound's or own sound's name. */
  name: string;
  /** Whether its synth is listed, so it has a page to open. */
  available: boolean;
  createdAt: string;
}

/** One favourite as the page reads it: outside data, so checked. */
export const FavouriteReadSchema = z.object({
  id: z.string(),
  kind: z.enum(FAVOURITE_KINDS),
  synthId: z.string(),
  slug: z.string().nullable(),
  soundId: z.string().nullable(),
});
export type FavouriteRead = z.infer<typeof FavouriteReadSchema>;
