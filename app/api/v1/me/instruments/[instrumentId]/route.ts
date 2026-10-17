/**
 * One of the synths on the signed-in user's lists (`f-profiles` r2).
 *
 * PATCH  /api/v1/me/instruments/:instrumentId — `{ kind }`: move it to the end of that list (a full list is a 409).
 * DELETE /api/v1/me/instruments/:instrumentId — take it off.
 *
 * Another user's entry is a 404, the same as one on neither list.
 *
 * See `lib/app/profile/instruments.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { InstrumentIdSchema, MoveInstrumentSchema } from '@/lib/app/profile/instruments-data';
import { moveInstrument, removeInstrument } from '@/lib/app/profile/instruments';

type Params = { instrumentId: string };

const notListed = () => errorResponse('Not on your lists', { code: 'NOT_FOUND', status: 404 });

export const PATCH = withAuth<Params>(
  async (request, session, { params }) => {
    const id = InstrumentIdSchema.safeParse((await params).instrumentId);
    if (!id.success) return notListed();
    const { kind } = await validateRequestBody(request, MoveInstrumentSchema);
    return successResponse(await moveInstrument(session.user.id, id.data, kind));
  },
  {
    ownership: {
      decidedBy: 'self',
      because: "It updates only a row keyed on the caller's own user id.",
    },
  }
);

export const DELETE = withAuth<Params>(
  async (_request, session, { params }) => {
    const id = InstrumentIdSchema.safeParse((await params).instrumentId);
    if (!id.success) return notListed();
    await removeInstrument(session.user.id, id.data);
    return successResponse({ instrumentId: id.data });
  },
  {
    ownership: {
      decidedBy: 'self',
      because: "It deletes only a row keyed on the caller's own user id.",
    },
  }
);
