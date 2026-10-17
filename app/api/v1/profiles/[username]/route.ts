/**
 * A synth profile as anyone may see it (`f-profiles` r3).
 *
 * GET /api/v1/profiles/:username — `{ username, links: [{ platform, url, display }], owned?, wishlist? }`, each list
 *     `[{ instrumentId, name, maker, year }]` in the user's order and present only when they show it.
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). Carries an ETag. A private profile, an
 * unknown username and one held after a change are each a 404, the same 404. The account name and email are never in
 * the answer; see `lib/app/profile/public.ts`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { checkConditional, computeETag } from '@/lib/api/etag';
import { handleAPIError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { getPublicProfile } from '@/lib/app/profile/public';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
): Promise<Response> {
  try {
    const profile = await getPublicProfile((await params).username);
    if (!profile) return errorResponse('Not found', { code: 'NOT_FOUND', status: 404 });

    const etag = computeETag(profile);
    const notModified = checkConditional(request, etag);
    if (notModified) return notModified;

    const log = await getRouteLogger(request);
    log.info('Public profile read');
    return successResponse(profile, undefined, { headers: { ETag: etag } });
  } catch (error) {
    return handleAPIError(error);
  }
}
