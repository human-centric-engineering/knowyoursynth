/**
 * One of the signed-in user's favourites (`f-my-sounds` s4).
 *
 * DELETE /api/v1/me/favourites/:id — remove the star. Another user's is a 404, the same as one that does not exist.
 *
 * See `lib/app/sounds/favourites.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { FavouriteIdSchema } from '@/lib/app/sounds/favourite-data';
import { removeFavourite } from '@/lib/app/sounds/favourites';

type Params = { id: string };

export const DELETE = withAuth<Params>(
  async (_request, session, { params }) => {
    const id = FavouriteIdSchema.safeParse((await params).id);
    if (!id.success)
      return errorResponse('Favourite not found', { code: 'NOT_FOUND', status: 404 });
    await removeFavourite(session.user.id, id.data);
    return successResponse({ id: id.data });
  },
  {
    ownership: {
      decidedBy: 'self',
      because: "It deletes only a row keyed on the caller's own user id as well as its own.",
    },
  }
);
