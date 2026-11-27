/**
 * The synths people have asked to be modelled, for admins (`f-synth-picker` t-330).
 *
 * GET /api/v1/admin/synths/model-requests — `ModelRequestTally[]`: each instrument anyone asked for, with how many
 *     asked and when the last did, the most asked first. It names nobody.
 *
 * See `lib/app/picker/model-requests.ts`.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { tallyModelRequests } from '@/lib/app/picker/model-requests';

export const GET = withAdminAuth(async () => successResponse(await tallyModelRequests()), {
  // Ownership: no ownership decision. See RouteOwnership in lib/auth/guards.ts.
  ownership: {
    decidedBy: 'nothing',
    because:
      'A count per databank instrument across every user, naming none of them; no row is returned, and the guard already limits this to admins.',
  },
});
