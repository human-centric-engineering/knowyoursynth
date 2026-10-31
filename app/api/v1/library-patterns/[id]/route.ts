/**
 * One library pattern (`f-pattern-library` t-122): its notes, role, Inspired by, fidelity, sources and the facts
 * matching reads.
 *
 * GET /api/v1/library-patterns/:id
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). A pattern only a hidden synth's sounds list
 * is a 404, as is an id that cannot be one.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { handleAPIError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { getLibraryPattern, LibraryPatternIdSchema } from '@/lib/app/patterns/library-read';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const parsed = LibraryPatternIdSchema.safeParse((await params).id);
    const pattern = parsed.success ? await getLibraryPattern(parsed.data) : null;
    if (!pattern) return errorResponse('Pattern not found', { code: 'NOT_FOUND', status: 404 });
    const log = await getRouteLogger(request);
    log.info('Library pattern read', { patternId: pattern.id });
    return successResponse(pattern);
  } catch (error) {
    return handleAPIError(error);
  }
}
