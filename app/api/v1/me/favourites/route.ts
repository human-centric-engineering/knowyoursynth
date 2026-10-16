/**
 * The signed-in user's favourites (`f-my-sounds` s4): their stars on synths, library sounds and their own sounds.
 *
 * GET  /api/v1/me/favourites — every one, most recently starred first, each with the name of what it stars.
 * POST /api/v1/me/favourites — `{ kind: 'synth', synthId }`, `{ kind: 'sound', synthId, slug }` or
 *      `{ kind: 'mine', soundId }`. 201 with the new star, or 200 with the one it already had. A synth or library sound
 *      the user cannot see is refused (400); a sound that is not theirs is a 404.
 *
 * See `lib/app/sounds/favourites.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { FavouriteInputSchema } from '@/lib/app/sounds/favourite-data';
import { addFavourite, listFavourites } from '@/lib/app/sounds/favourites';

export const GET = withAuth(
  async (_request, session) => successResponse(await listFavourites(session.user.id)),
  {
    ownership: {
      decidedBy: 'self',
      because: "It lists only the rows keyed on the caller's own user id.",
    },
  }
);

export const POST = withAuth(
  async (request, session) => {
    const input = await validateRequestBody(request, FavouriteInputSchema);
    const { favourite, created } = await addFavourite(session.user.id, input);
    return successResponse(favourite, undefined, { status: created ? 201 : 200 });
  },
  {
    ownership: {
      decidedBy: 'self',
      because:
        "It writes one row under the caller's own user id, and a sound of theirs only when it is keyed on that id too.",
    },
  }
);
