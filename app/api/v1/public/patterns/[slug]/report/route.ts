/**
 * Report a shared pattern (`f-step-sequencer` t-83).
 *
 * POST /api/v1/public/patterns/:slug/report — `{ reason, note? }`. Signed in. One open report per person per pattern:
 * a second updates the first (200; a new one is 201). Your own pattern is a 400 (`OWN_PATTERN`); one nobody else can
 * open is the public read's 404. Capped per user on top of the proxy's section cap: over it, a 429 with the standard
 * rate-limit headers.
 *
 * Nothing about the report goes back but its id. See `lib/app/patterns/reports.ts`.
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { createRateLimitResponse } from '@/lib/security/rate-limit';
import { ReportPatternSchema } from '@/lib/app/patterns/report-data';
import {
  patternReportLimiter,
  patternReportLimitKey,
  reportPattern,
} from '@/lib/app/patterns/reports';

const ParamsSchema = z.object({ slug: z.string().min(1).max(64) });

export const POST = withAuth<{ slug: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const limit = patternReportLimiter.check(patternReportLimitKey(session.user.id));
    if (!limit.success) {
      log.warn('Pattern report rate limit exceeded', { userId: session.user.id });
      return createRateLimitResponse(limit);
    }

    const { slug } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const input = await validateRequestBody(request, ReportPatternSchema);
    const { id, created } = await reportPattern(session.user.id, slug, input);

    log.info(created ? 'Pattern reported' : 'Pattern report updated', {
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
        "It writes or updates one report under the caller's own id about a pattern anyone may open, and returns only its id.",
    },
  }
);
