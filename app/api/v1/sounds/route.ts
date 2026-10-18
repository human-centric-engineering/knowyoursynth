/**
 * The signed-in user's own sounds (`f-my-sounds` s1).
 *
 * GET  /api/v1/sounds[?synthId=model-d] — the caller's sounds, most recently changed first, without their panels.
 * POST /api/v1/sounds — save one: `{ synthId, name, notes?, panel }`, or a copy of a library sound,
 *      `{ synthId, source: { slug }, name?, notes?, panel? }`, which records its credit, or of a sound someone shared,
 *      `{ synthId, source: { shared }, name?, notes?, panel? }`, which credits it while it is published. Any of them
 *      can carry the sound's `lesson` and `fromTutor`, as a sound the tutor designed does (`f-tutor` t-55). 201 with
 *      the sound.
 *
 * A panel and a lesson are checked against the synth's definition and refused (400) when anything in them is wrong.
 * The section rate limit applies (`proxy.ts`). See `lib/app/sounds/store.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { CreateUserSoundSchema, ListUserSoundsQuerySchema } from '@/lib/app/sounds/data';
import { createUserSound, listUserSounds } from '@/lib/app/sounds/store';

export const GET = withAuth(
  async (request, session) => {
    const { synthId } = validateQueryParams(
      request.nextUrl.searchParams,
      ListUserSoundsQuerySchema
    );
    const sounds = await listUserSounds(session.user.id, synthId);
    return successResponse(sounds);
  },
  {
    // Ownership: this route is self-scoped by construction — see RouteOwnership in lib/auth/guards.ts.
    ownership: {
      decidedBy: 'self',
      because: "It lists only the rows keyed on the caller's own user id.",
    },
  }
);

export const POST = withAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const input = await validateRequestBody(request, CreateUserSoundSchema);
    const sound = await createUserSound(session.user.id, input);
    log.info('User sound saved', {
      soundId: sound.id,
      synthId: sound.synthId,
      source: sound.source?.slug ?? null,
      fromTutor: sound.fromTutor,
    });
    return successResponse(sound, undefined, { status: 201 });
  },
  {
    // Ownership: this route is self-scoped by construction — see RouteOwnership in lib/auth/guards.ts.
    ownership: {
      decidedBy: 'self',
      because: "It writes one sound under the caller's own user id and returns only that row.",
    },
  }
);
