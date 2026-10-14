/**
 * Suggest a synth the databank is missing (`f-databank` t-37).
 *
 * POST /api/v1/bank/suggestions — `{ name, maker, link?, note? }`. Signed in. Recorded as pending for an admin, under
 * the caller's id, and returned. Capped per user on top of the proxy's section cap (`suggestionLimiter`): over it, a
 * 429 with the standard rate-limit headers.
 *
 * See `lib/app/bank/suggestions.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { createRateLimitResponse } from '@/lib/security/rate-limit';
import { SuggestionInputSchema } from '@/lib/app/bank/suggestion-data';
import {
  createSuggestion,
  suggestionLimiter,
  suggestionLimitKey,
} from '@/lib/app/bank/suggestions';

export const POST = withAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const limit = suggestionLimiter.check(suggestionLimitKey(session.user.id));
    if (!limit.success) {
      log.warn('Synth suggestion rate limit exceeded', { userId: session.user.id });
      return createRateLimitResponse(limit);
    }

    const input = await validateRequestBody(request, SuggestionInputSchema);
    const row = await createSuggestion(session.user.id, input);

    log.info('Synth suggested', { suggestionId: row.id, userId: session.user.id });
    return successResponse(
      { id: row.id, name: row.name, maker: row.maker, status: row.status },
      undefined,
      { status: 201 }
    );
  },
  {
    // Ownership: this route is self-scoped by construction — see RouteOwnership in lib/auth/guards.ts.
    ownership: {
      decidedBy: 'self',
      because: "It writes one suggestion under the caller's own id and returns only that row.",
    },
  }
);
