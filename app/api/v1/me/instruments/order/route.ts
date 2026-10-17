/**
 * The order of one of the signed-in user's synth lists (`f-profiles` r2).
 *
 * PUT /api/v1/me/instruments/order — `{ kind, instrumentIds }`: that list, every instrument on it once, in the new
 *     order. Answers both lists. One that has changed since the caller read it is a 409: read the lists again.
 *
 * See `lib/app/profile/instruments.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { ReorderInstrumentsSchema } from '@/lib/app/profile/instruments-data';
import { reorderInstruments } from '@/lib/app/profile/instruments';

export const PUT = withAuth(
  async (request, session) => {
    const input = await validateRequestBody(request, ReorderInstrumentsSchema);
    return successResponse(await reorderInstruments(session.user.id, input));
  },
  {
    ownership: {
      decidedBy: 'self',
      because: "It reads and updates only rows keyed on the caller's own user id.",
    },
  }
);
