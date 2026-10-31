/**
 * The pattern library (`f-pattern-library` t-122): a page of its patterns, by name, optionally of one role.
 *
 * GET /api/v1/library-patterns?role=bass_line&page=1&limit=50
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). A pattern only a hidden synth's sounds list
 * is left out; see `lib/app/patterns/library-read.ts`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { handleAPIError } from '@/lib/api/errors';
import { paginatedResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { LibraryListQuerySchema, listLibraryPatterns } from '@/lib/app/patterns/library-read';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const query = validateQueryParams(request.nextUrl.searchParams, LibraryListQuerySchema);
    const { patterns, total } = await listLibraryPatterns(query);
    const log = await getRouteLogger(request);
    log.info('Library patterns listed', { role: query.role, page: query.page, total });
    return paginatedResponse(patterns, { page: query.page, limit: query.limit, total });
  } catch (error) {
    return handleAPIError(error);
  }
}
