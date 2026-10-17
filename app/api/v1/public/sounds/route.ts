/**
 * Published sounds, as Explore lists them (`f-sharing` h2).
 *
 * GET /api/v1/public/sounds?synth=&tag=&sort=newest|saves&page= — one page of published sounds, never a link share.
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). A filter that does not parse, or names a
 * synth the catalogue does not serve or a tag no library sound uses, is dropped rather than refused; `meta.applied`
 * says what was used. The owner's id, account name and email are never in the answer; see `lib/app/sounds/public.ts`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { handleAPIError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { EXPLORE_PAGE_SIZE, ExploreQuerySchema } from '@/lib/app/sounds/data';
import { listPublishedSounds } from '@/lib/app/sounds/public';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const params = request.nextUrl.searchParams;
    const query = ExploreQuerySchema.parse({
      synth: params.get('synth') ?? undefined,
      tag: params.get('tag') ?? undefined,
      sort: params.get('sort') ?? undefined,
      page: params.get('page') ?? undefined,
    });
    const { sounds, total, applied } = await listPublishedSounds(query);

    const log = await getRouteLogger(request);
    log.info('Published sounds listed', { synth: applied.synth, tag: applied.tag, total });
    return successResponse(sounds, {
      page: applied.page,
      limit: EXPLORE_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / EXPLORE_PAGE_SIZE),
      applied,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
