/**
 * The databank: every artist, maker, instrument or song.
 *
 * GET /api/v1/bank/:kind   (kind: artists | makers | instruments | songs)
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). Each list is sorted as the prototype's
 * databank lists it, carries an ETag, and is read from the tables only (D13); see `lib/app/bank/read.ts`. Any other
 * kind is a 404.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRouteLogger } from '@/lib/api/context';
import { checkConditional, computeETag } from '@/lib/api/etag';
import { handleAPIError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { BANK_KINDS, listBank } from '@/lib/app/bank/read';

const KindSchema = z.enum(BANK_KINDS);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
): Promise<Response> {
  try {
    const kind = KindSchema.safeParse((await params).kind);
    if (!kind.success) return errorResponse('Not found', { code: 'NOT_FOUND', status: 404 });

    const rows = await listBank(kind.data);
    const etag = computeETag(rows);
    const notModified = checkConditional(request, etag);
    if (notModified) return notModified;

    const log = await getRouteLogger(request);
    log.info('Databank listed', { kind: kind.data, count: rows.length });
    return successResponse(rows, undefined, { headers: { ETag: etag } });
  } catch (error) {
    return handleAPIError(error);
  }
}
