/**
 * Publish one of the signed-in user's own patterns (`f-step-sequencer` t-83).
 *
 * POST /api/v1/patterns/:id/publish — `{ confirm: true }`: lists it on Explore and the user's profile, under their
 *      username. 200 with the pattern.
 *
 * The one way a pattern becomes published; each refusal and its code is in `lib/app/patterns/sharing.ts`. Unpublishing
 * is `PATCH /api/v1/patterns/:id` with `visibility`. Another user's pattern is a 404. The section rate limit applies
 * (`proxy.ts`), and publishing has its own daily cap.
 */
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { PublishUserPatternSchema, UserPatternIdSchema } from '@/lib/app/patterns/data';
import { publishUserPattern } from '@/lib/app/patterns/sharing';
import { getUserPattern } from '@/lib/app/patterns/store';

type Params = { id: string };

export const POST = withAuth<Params>(
  async (request, session, { params }) => {
    const id = UserPatternIdSchema.safeParse((await params).id);
    if (!id.success) return errorResponse('Pattern not found', { code: 'NOT_FOUND', status: 404 });
    const log = await getRouteLogger(request);
    await validateRequestBody(request, PublishUserPatternSchema);
    await publishUserPattern(session.user.id, id.data);
    const pattern = await getUserPattern(session.user.id, id.data);
    log.info('User pattern published', { patternId: pattern.id });
    return successResponse(pattern);
  },
  {
    // Ownership: this route is self-scoped by construction — see RouteOwnership in lib/auth/guards.ts.
    ownership: {
      decidedBy: 'self',
      because: "Every query is keyed on the caller's own user id as well as the pattern's.",
    },
  }
);
