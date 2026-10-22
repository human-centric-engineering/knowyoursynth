/**
 * One of the signed-in user's own sounds (`f-my-sounds` s1).
 *
 * GET    /api/v1/sounds/:id — the sound with its panel, checked against the synth as it is now.
 * PATCH  /api/v1/sounds/:id — `{ name?, notes?, panel?, lesson?, visibility?, patternId? }`. A new panel is checked and saved on
 *        the current definition, and leaves the lesson as it was. `lesson: null` removes the lesson, the one change a
 *        lesson takes. `visibility` is `private` or `link`: share by link, stop sharing, or unpublish. Publishing is
 *        `POST /api/v1/sounds/:id/publish`. `patternId` points the sound at one of the caller's patterns,
 *        which the sequencer opens on with it, and `null` clears it (`f-step-sequencer` t-81).
 * DELETE /api/v1/sounds/:id
 *
 * Another user's sound is a 404, the same as one that does not exist, never a 403. See `lib/app/sounds/store.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { UpdateUserSoundSchema, UserSoundIdSchema } from '@/lib/app/sounds/data';
import { deleteUserSound, getUserSound, updateUserSound } from '@/lib/app/sounds/store';

type Params = { id: string };

const OWNERSHIP = {
  decidedBy: 'self',
  because: "Every query is keyed on the caller's own user id as well as the sound's.",
} as const;

const notFound = () => errorResponse('Sound not found', { code: 'NOT_FOUND', status: 404 });

export const GET = withAuth<Params>(
  async (_request, session, { params }) => {
    const id = UserSoundIdSchema.safeParse((await params).id);
    if (!id.success) return notFound();
    return successResponse(await getUserSound(session.user.id, id.data));
  },
  { ownership: OWNERSHIP }
);

export const PATCH = withAuth<Params>(
  async (request, session, { params }) => {
    const id = UserSoundIdSchema.safeParse((await params).id);
    if (!id.success) return notFound();
    const log = await getRouteLogger(request);
    const input = await validateRequestBody(request, UpdateUserSoundSchema);
    const sound = await updateUserSound(session.user.id, id.data, input);
    log.info('User sound changed', {
      soundId: sound.id,
      panel: input.panel !== undefined,
      lessonRemoved: input.lesson === null,
      visibility: input.visibility ?? null,
      patternId: input.patternId,
    });
    return successResponse(sound);
  },
  { ownership: OWNERSHIP }
);

export const DELETE = withAuth<Params>(
  async (request, session, { params }) => {
    const id = UserSoundIdSchema.safeParse((await params).id);
    if (!id.success) return notFound();
    const log = await getRouteLogger(request);
    await deleteUserSound(session.user.id, id.data);
    log.info('User sound deleted', { soundId: id.data });
    return successResponse({ id: id.data });
  },
  { ownership: OWNERSHIP }
);
