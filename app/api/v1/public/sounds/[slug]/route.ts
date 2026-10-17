/**
 * A shared sound as anyone may see it (`f-sharing` h1).
 *
 * GET /api/v1/public/sounds/:slug — a link or published sound: its name, notes, tags, panel, the byline and credits.
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). Carries an ETag, and is never cached
 * without revalidating, so a sound made private stops being served on the next request. Private, unknown and malformed are each the same 404.
 * The owner's id, account name and email are never in the answer; see `lib/app/sounds/public.ts`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { checkConditional, computeETag } from '@/lib/api/etag';
import { handleAPIError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { getSharedSound } from '@/lib/app/sounds/public';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  try {
    const sound = await getSharedSound((await params).slug);
    if (!sound) return errorResponse('Not found', { code: 'NOT_FOUND', status: 404 });

    const etag = computeETag(sound);
    const notModified = checkConditional(request, etag);
    if (notModified) return notModified;

    const log = await getRouteLogger(request);
    log.info('Shared sound read', { synthId: sound.synthId });
    return successResponse(sound, undefined, { headers: { ETag: etag } });
  } catch (error) {
    return handleAPIError(error);
  }
}
