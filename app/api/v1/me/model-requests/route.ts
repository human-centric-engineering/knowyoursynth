/**
 * The synths the signed-in user has asked to be modelled (`f-synth-picker` t-330).
 *
 * GET /api/v1/me/model-requests — `{ instrumentIds }`, oldest request first.
 *
 * See `lib/app/picker/model-requests.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { listMyModelRequests } from '@/lib/app/picker/model-requests';

export const GET = withAuth(
  async (_request, session) =>
    successResponse({ instrumentIds: await listMyModelRequests(session.user.id) }),
  {
    ownership: {
      decidedBy: 'self',
      because: "Reads only the caller's own requests, keyed on `session.user.id`.",
    },
  }
);
