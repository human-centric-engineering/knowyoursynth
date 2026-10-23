/**
 * A shared pattern as anyone may see it (`f-step-sequencer` t-83).
 *
 * GET /api/v1/public/patterns/:slug — a link or published pattern: its name, steps, the byline and the credit.
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). Carries an ETag, and is never cached without
 * revalidating, so a pattern made private stops being served on the next request. Private, unlisted, unknown and
 * malformed are each the same 404. The owner's id, account name and email are never in the answer; see
 * `lib/app/patterns/public.ts`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { checkConditional, computeETag } from '@/lib/api/etag';
import { handleAPIError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { getSharedPattern } from '@/lib/app/patterns/public';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  try {
    const pattern = await getSharedPattern((await params).slug);
    if (!pattern) return errorResponse('Not found', { code: 'NOT_FOUND', status: 404 });

    const etag = computeETag(pattern);
    const notModified = checkConditional(request, etag);
    if (notModified) return notModified;

    const log = await getRouteLogger(request);
    log.info('Shared pattern read', { visibility: pattern.visibility });
    return successResponse(pattern, undefined, { headers: { ETag: etag } });
  } catch (error) {
    return handleAPIError(error);
  }
}
