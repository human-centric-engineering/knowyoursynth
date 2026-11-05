/**
 * Videos and links about one thing (`f-videos-and-links` t-179).
 *
 * GET /api/v1/links?instrument=<id> | synth=<id> | sound=<synth>/<patch> | song=<id> | artist=<id> — exactly one.
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). Ours first, then a popularity-weighted
 * draw that differs on each read, so the response is `no-store`. A synth's links are its databank instruments';
 * a synth or sound that is hidden or not there has none. See `lib/app/links/read.ts`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { handleAPIError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { listPublicLinks, PublicLinkQuerySchema } from '@/lib/app/links/read';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const query = validateQueryParams(request.nextUrl.searchParams, PublicLinkQuerySchema);
    const links = await listPublicLinks(query);
    const log = await getRouteLogger(request);
    log.info('Links listed', { target: query.target, count: links.length });
    return successResponse(links, undefined, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleAPIError(error);
  }
}
