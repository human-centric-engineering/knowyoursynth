/**
 * Search the databank by name and text.
 *
 * GET /api/v1/bank/search?q=…&kind=…&limit=…
 *   q      required, 1–200 characters
 *   kind   optional: artists | makers | instruments | songs
 *   limit  optional, 1–20 (default 10)
 *
 * Public, like the rest of `/api/v1/bank`: no session needed, and the section rate limit applies (`proxy.ts`). It calls
 * no AI provider: BM25 over the tables, as `lib/app/bank/search.ts` describes. Each result carries its page's URL and the
 * rows it links to. A query with no searchable words (all stop words) finds nothing rather than failing.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRouteLogger } from '@/lib/api/context';
import { handleAPIError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { BANK_KINDS } from '@/lib/app/bank/read';
import { DEFAULT_RESULTS, MAX_QUERY_LENGTH, MAX_RESULTS, searchBank } from '@/lib/app/bank/search';

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  kind: z.enum(BANK_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_RESULTS).default(DEFAULT_RESULTS),
});

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { q, kind, limit } = validateQueryParams(request.nextUrl.searchParams, QuerySchema);
    const results = await searchBank(q, { kind, limit });

    const log = await getRouteLogger(request);
    // The query is a visitor's text, so its length is logged, not its words.
    log.info('Databank searched', { kind, queryLength: q.length, count: results.length });
    return successResponse(results);
  } catch (error) {
    return handleAPIError(error);
  }
}
