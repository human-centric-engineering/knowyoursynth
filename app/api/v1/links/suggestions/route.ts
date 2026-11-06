/**
 * Suggest a video or link (`f-link-suggestions` t-185).
 *
 * POST /api/v1/links/suggestions — `{ target: { kind, id }, url, kind, title?, note? }`. Signed in. The URL is parsed,
 * not fetched. A target that is not there is a 404; a URL it already links is a 409. Recorded as pending for an admin,
 * under the caller's id, and returned. Capped per user on top of the proxy's section cap (`linkSuggestionLimiter`):
 * over it, a 429 with the standard rate-limit headers.
 *
 * See `lib/app/links/suggestions.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { createRateLimitResponse } from '@/lib/security/rate-limit';
import { LinkSuggestionInputSchema } from '@/lib/app/links/suggestion-data';
import {
  createLinkSuggestion,
  linkSuggestionLimiter,
  linkSuggestionLimitKey,
} from '@/lib/app/links/suggestions';

export const POST = withAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const limit = linkSuggestionLimiter.check(linkSuggestionLimitKey(session.user.id));
    if (!limit.success) {
      log.warn('Link suggestion rate limit exceeded', { userId: session.user.id });
      return createRateLimitResponse(limit);
    }

    const input = await validateRequestBody(request, LinkSuggestionInputSchema);
    const row = await createLinkSuggestion(session.user.id, input);

    log.info('Link suggested', {
      suggestionId: row.id,
      target: `${row.targetKind}:${row.targetId}`,
      userId: session.user.id,
    });
    return successResponse(
      {
        id: row.id,
        target: { kind: row.targetKind, id: row.targetId },
        url: row.url,
        kind: row.kind,
        status: row.status,
      },
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
