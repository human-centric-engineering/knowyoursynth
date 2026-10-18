/**
 * The tutor's daily allowance (D6), for the tutor panel's meter (`f-tutor` t-54).
 *
 * GET /api/v1/tutor/allowance — `{ limit, used, remaining, resetsAt }` for the caller, today (UTC). The stream route
 * refuses a turn when `remaining` is 0.
 *
 * Authentication: any authenticated user, or an API key with the `chat` scope. Scoped to the caller by construction.
 * The section rate limit applies
 * (`proxy.ts`).
 */
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { readAllowance } from '@/lib/app/tutor/allowance';
import { withAuth } from '@/lib/auth/guards';

export const GET = withAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const allowance = await readAllowance(session.user.id);
    log.info('Tutor allowance read', { used: allowance.used });
    return successResponse(allowance);
  },
  {
    // The stream route's companion: a key that can take turns can read how many are left.
    scope: 'chat',
    // Ownership: this route is self-scoped by construction — see RouteOwnership in lib/auth/guards.ts.
    ownership: {
      decidedBy: 'self',
      because: "It counts the caller's own tutor messages and takes no id from the request.",
    },
  }
);
