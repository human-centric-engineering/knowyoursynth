/**
 * The catalogue: every listed synth.
 *
 * GET /api/v1/synths
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`), and this read is cheap enough to need no
 * sub-cap. Read from the tables only (D13); see `lib/app/catalogue/read.ts`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { checkConditional, computeETag } from '@/lib/api/etag';
import { handleAPIError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { listSynths } from '@/lib/app/catalogue/read';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const synths = await listSynths();
    const etag = computeETag(synths);
    const notModified = checkConditional(request, etag);
    if (notModified) return notModified;

    const log = await getRouteLogger(request);
    log.info('Catalogue listed', { count: synths.length });
    return successResponse(synths, undefined, { headers: { ETag: etag } });
  } catch (error) {
    return handleAPIError(error);
  }
}
