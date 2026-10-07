/**
 * One synth: its catalogue entry, library sounds, lineage and notes.
 *
 * GET /api/v1/synths/:id
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). An id that is not a listed, playable synth
 * is a 404. The payload is the whole library, so it carries an ETag and a repeat visit revalidates instead of
 * re-downloading. Read from the tables only (D13); see `lib/app/catalogue/read.ts`.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRouteLogger } from '@/lib/api/context';
import { checkConditional, computeETag } from '@/lib/api/etag';
import { handleAPIError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { getSynthDetail } from '@/lib/app/catalogue/read';

/** A synth id as the registry writes them (`model-d`, `2-xm`). Anything else cannot be one, so it is not looked up. */
const SynthIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const parsed = SynthIdSchema.safeParse((await params).id);
    const detail = parsed.success ? await getSynthDetail(parsed.data) : null;
    if (!detail) return errorResponse('Synth not found', { code: 'NOT_FOUND', status: 404 });
    const id = parsed.data;

    const etag = computeETag(detail);
    const notModified = checkConditional(request, etag);
    if (notModified) return notModified;

    const log = await getRouteLogger(request);
    log.info('Synth read', { synthId: id, sounds: detail.sounds.length });
    return successResponse(detail, undefined, { headers: { ETag: etag } });
  } catch (error) {
    return handleAPIError(error);
  }
}
