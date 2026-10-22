/**
 * Published patterns, as Explore lists them (`f-step-sequencer` t-83).
 *
 * GET /api/v1/public/patterns?sort=newest|saves&page= — one page of published patterns, never a link share.
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). A query that does not parse is dropped rather
 * than refused. The owner's id, account name and email are never in the answer; see `lib/app/patterns/public.ts`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { handleAPIError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { EXPLORE_PAGE_SIZE } from '@/lib/app/sounds/data';
import { PatternExploreQuerySchema } from '@/lib/app/patterns/data';
import { listPublishedPatterns } from '@/lib/app/patterns/public';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const params = request.nextUrl.searchParams;
    const query = PatternExploreQuerySchema.parse({
      sort: params.get('sort') ?? undefined,
      page: params.get('page') ?? undefined,
    });
    const { patterns, total } = await listPublishedPatterns(query);

    const log = await getRouteLogger(request);
    log.info('Published patterns listed', { sort: query.sort, total });
    return successResponse(patterns, {
      page: query.page,
      limit: EXPLORE_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / EXPLORE_PAGE_SIZE),
      applied: query,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
