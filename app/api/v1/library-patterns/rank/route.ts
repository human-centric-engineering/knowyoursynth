/**
 * Every public library pattern, in a section per role, ordered by how well each suits the patch on the panel
 * (`f-pattern-picker` t-212): what the Play deck's pattern picker lists.
 *
 * POST /api/v1/library-patterns/rank
 *   { synthId, sound?, features? }
 *
 * `features` is what the sound detector heard (`soundFeatures`, run in the browser's probe worker), once it has; with
 * none, or a silent patch, the sections are in role order and the patterns by name. `sound` is the library sound the
 * patch started as, if it did: its own patterns are left out. Each pattern is a lean row, without its notes. A POST
 * because the features are a body, but it writes nothing.
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`), with no handler cap. An unknown synth or
 * sound is a 404; see `lib/app/patterns/rank-read.ts`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { handleAPIError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { RankBodySchema, rankLibraryFor } from '@/lib/app/patterns/rank-read';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await validateRequestBody(request, RankBodySchema);
    const result = await rankLibraryFor(body);
    if (!result) return errorResponse('Patch not found', { code: 'NOT_FOUND', status: 404 });
    const log = await getRouteLogger(request);
    log.info('Library ranked', {
      synthId: body.synthId,
      sound: body.sound,
      role: result.reading?.role,
      count: result.sections.reduce((n, s) => n + s.patterns.length, 0),
    });
    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
