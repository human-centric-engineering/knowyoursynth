/**
 * Patterns that suit the sound on the panel (`f-pattern-library` t-125), best first, each with why.
 *
 * POST /api/v1/library-patterns/suggest
 *   { synthId, sound?, features, limit? }
 *
 * `features` is what the sound detector heard (`soundFeatures`, run in the browser's probe worker); `sound` is the
 * library sound the patch started as, if it did. A POST because the features are a body, but it writes nothing.
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`); the page asks once the patch settles, and
 * only when it has moved far from its sound. An unknown synth or sound is a 404; see
 * `lib/app/patterns/suggest-read.ts`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { handleAPIError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { SuggestBodySchema, suggestPatterns } from '@/lib/app/patterns/suggest-read';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await validateRequestBody(request, SuggestBodySchema);
    const result = await suggestPatterns(body);
    if (!result) return errorResponse('Patch not found', { code: 'NOT_FOUND', status: 404 });
    const log = await getRouteLogger(request);
    log.info('Patterns suggested', {
      synthId: body.synthId,
      sound: body.sound,
      role: result.reading?.role,
      count: result.suggestions.length,
    });
    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
