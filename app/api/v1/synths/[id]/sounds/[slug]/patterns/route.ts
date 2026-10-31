/**
 * A library sound's patterns (`f-pattern-library` t-122), default first. The default is the one the sound plays.
 *
 * GET /api/v1/synths/:id/sounds/:slug/patterns
 *
 * Public: no session needed. The section rate limit applies (`proxy.ts`). A sound that is not on a listed, playable
 * synth is a 404; see `lib/app/patterns/library-read.ts`.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRouteLogger } from '@/lib/api/context';
import { handleAPIError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { SoundSlugSchema, SynthIdSchema } from '@/lib/app/catalogue/edit';
import { getSoundPatterns } from '@/lib/app/patterns/library-read';

const ParamsSchema = z.object({ id: SynthIdSchema, slug: SoundSlugSchema });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slug: string }> }
): Promise<Response> {
  try {
    const parsed = ParamsSchema.safeParse(await params);
    const patterns = parsed.success
      ? await getSoundPatterns(parsed.data.id, parsed.data.slug)
      : null;
    if (!parsed.success || !patterns)
      return errorResponse('Patch not found', { code: 'NOT_FOUND', status: 404 });
    const log = await getRouteLogger(request);
    log.info('Sound patterns read', {
      synthId: parsed.data.id,
      sound: parsed.data.slug,
      count: patterns.length,
    });
    return successResponse(patterns);
  } catch (error) {
    return handleAPIError(error);
  }
}
