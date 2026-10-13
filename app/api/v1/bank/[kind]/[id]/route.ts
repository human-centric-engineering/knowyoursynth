/**
 * One artist, maker, instrument or song, with what the databank joins to it: an artist's records and instruments, a
 * maker's instruments, an instrument's people, records, artists and recreations, a song's artists and instruments.
 *
 * GET /api/v1/bank/:kind/:id   (kind: artists | makers | instruments | songs)
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). Carries an ETag. Read from the tables only
 * (D13); see `lib/app/bank/read.ts`. An unknown kind or id is a 404.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRouteLogger } from '@/lib/api/context';
import { checkConditional, computeETag } from '@/lib/api/etag';
import { handleAPIError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { BankIdSchema } from '@/lib/app/bank/data';
import { BANK_KINDS, getBankDetail } from '@/lib/app/bank/read';

const ParamsSchema = z.object({ kind: z.enum(BANK_KINDS), id: BankIdSchema.max(128) });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> }
): Promise<Response> {
  try {
    const parsed = ParamsSchema.safeParse(await params);
    const detail = parsed.success ? await getBankDetail(parsed.data.kind, parsed.data.id) : null;
    if (!parsed.success || !detail)
      return errorResponse('Not found', { code: 'NOT_FOUND', status: 404 });

    const etag = computeETag(detail);
    const notModified = checkConditional(request, etag);
    if (notModified) return notModified;

    const log = await getRouteLogger(request);
    log.info('Databank row read', { kind: parsed.data.kind, id: parsed.data.id });
    return successResponse(detail, undefined, { headers: { ETag: etag } });
  } catch (error) {
    return handleAPIError(error);
  }
}
