/**
 * Report a shared sound (`f-sharing` h4).
 *
 * POST /api/v1/public/sounds/:slug/report — `{ reason, note? }`. Signed in. One open report per person per sound: a
 * second updates the first (200; a new one is 201). Your own sound is a 400 (`OWN_SOUND`); one nobody else can open is
 * the public read's 404. Capped per user on top of the proxy's section cap (`reportLimiter`): over it, a 429 with the
 * standard rate-limit headers.
 *
 * Nothing about the report goes back but its id. See `lib/app/sounds/reports.ts`.
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { createRateLimitResponse } from '@/lib/security/rate-limit';
import { ReportSoundSchema } from '@/lib/app/sounds/report-data';
import { reportLimiter, reportLimitKey, reportSound } from '@/lib/app/sounds/reports';

const ParamsSchema = z.object({ slug: z.string().min(1).max(64) });

export const POST = withAuth<{ slug: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const limit = reportLimiter.check(reportLimitKey(session.user.id));
    if (!limit.success) {
      log.warn('Sound report rate limit exceeded', { userId: session.user.id });
      return createRateLimitResponse(limit);
    }

    const { slug } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const input = await validateRequestBody(request, ReportSoundSchema);
    const { id, created } = await reportSound(session.user.id, slug, input);

    log.info(created ? 'Sound reported' : 'Sound report updated', {
      reportId: id,
      reason: input.reason,
      userId: session.user.id,
    });
    return successResponse({ id }, undefined, { status: created ? 201 : 200 });
  },
  {
    // Ownership: this route is self-scoped by construction — see RouteOwnership in lib/auth/guards.ts.
    ownership: {
      decidedBy: 'self',
      because:
        "It writes or updates one report under the caller's own id about a sound anyone may open, and returns only its id.",
    },
  }
);
