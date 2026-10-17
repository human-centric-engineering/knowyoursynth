/**
 * The synths the signed-in user owns and wants (`f-profiles` r2).
 *
 * GET  /api/v1/me/instruments — `{ owned, wishlist }`, each in the user's order, each entry with the instrument's
 *      name, maker and year.
 * POST /api/v1/me/instruments — `{ instrumentId, kind: 'owned' | 'wishlist' }`, at the end of that list. 201 with the
 *      new entry, or 200 with the one it already had. An instrument the databank does not have is a 400; one already
 *      on the other list, or a full list, is a 409 with the words to show.
 *
 * See `lib/app/profile/instruments.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { AddInstrumentSchema } from '@/lib/app/profile/instruments-data';
import { addInstrument, listInstruments } from '@/lib/app/profile/instruments';

export const GET = withAuth(
  async (_request, session) => successResponse(await listInstruments(session.user.id)),
  {
    ownership: {
      decidedBy: 'self',
      because: "It lists only the rows keyed on the caller's own user id.",
    },
  }
);

export const POST = withAuth(
  async (request, session) => {
    const input = await validateRequestBody(request, AddInstrumentSchema);
    const { entry, created } = await addInstrument(session.user.id, input);
    return successResponse(entry, undefined, { status: created ? 201 : 200 });
  },
  {
    ownership: {
      decidedBy: 'self',
      because: "It writes one row under the caller's own user id.",
    },
  }
);
