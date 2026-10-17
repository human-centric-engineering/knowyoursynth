/**
 * Publish one of the signed-in user's own sounds (`f-sharing` h1).
 *
 * POST /api/v1/sounds/:id/publish — `{ confirm: true, tags?: string[] }`: lists it under the user's username, with up
 *      to three of the tags that synth's library sounds use. 200 with the sound.
 *
 * The one way a sound becomes published; each refusal and its code is in `lib/app/sounds/publish.ts`. Unpublishing is
 * `PATCH /api/v1/sounds/:id` with `visibility`. Another user's sound is a 404. The section rate limit applies
 * (`proxy.ts`), and publishing has its own daily cap.
 */
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { PublishUserSoundSchema, UserSoundIdSchema } from '@/lib/app/sounds/data';
import { publishUserSound } from '@/lib/app/sounds/publish';
import { getUserSound } from '@/lib/app/sounds/store';

type Params = { id: string };

export const POST = withAuth<Params>(
  async (request, session, { params }) => {
    const id = UserSoundIdSchema.safeParse((await params).id);
    if (!id.success) return errorResponse('Sound not found', { code: 'NOT_FOUND', status: 404 });
    const log = await getRouteLogger(request);
    const input = await validateRequestBody(request, PublishUserSoundSchema);
    await publishUserSound(session.user.id, id.data, input);
    const sound = await getUserSound(session.user.id, id.data);
    log.info('User sound published', { soundId: sound.id, synthId: sound.synthId });
    return successResponse(sound);
  },
  {
    // Ownership: this route is self-scoped by construction — see RouteOwnership in lib/auth/guards.ts.
    ownership: {
      decidedBy: 'self',
      because: "Every query is keyed on the caller's own user id as well as the sound's.",
    },
  }
);
