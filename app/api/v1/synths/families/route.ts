/**
 * The synth families: every original, its revisions and the instruments that copy it, with their members.
 *
 * GET /api/v1/synths/families
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`), and this read is cheap enough to need no
 * sub-cap. Its own route rather than a field on `GET /api/v1/synths`, whose data is the list of synths itself: the
 * picker reads both to group a family's members into one entry. Read from the tables only (D13); see
 * `lib/app/families/read.ts` and `.context/app/synth-families.md`.
 */
import { NextRequest } from 'next/server';
import { getRouteLogger } from '@/lib/api/context';
import { checkConditional, computeETag } from '@/lib/api/etag';
import { handleAPIError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { listFamilies } from '@/lib/app/families/read';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const families = await listFamilies();
    const etag = computeETag(families);
    const notModified = checkConditional(request, etag);
    if (notModified) return notModified;

    const log = await getRouteLogger(request);
    log.info('Families listed', { count: families.length });
    return successResponse(families, undefined, { headers: { ETag: etag } });
  } catch (error) {
    return handleAPIError(error);
  }
}
