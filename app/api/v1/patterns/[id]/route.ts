/**
 * One of the signed-in user's own patterns (`f-step-sequencer` t-81).
 *
 * GET    /api/v1/patterns/:id — the pattern with its steps, checked as the sequencer reads one.
 * PATCH  /api/v1/patterns/:id — `{ name?, pattern? }`: rename it, or save new steps over it.
 * DELETE /api/v1/patterns/:id — the caller's sounds that played it by default play none after.
 *
 * Another user's pattern is a 404, the same as one that does not exist, never a 403. See `lib/app/patterns/store.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { UpdateUserPatternSchema, UserPatternIdSchema } from '@/lib/app/patterns/data';
import { deleteUserPattern, getUserPattern, updateUserPattern } from '@/lib/app/patterns/store';

type Params = { id: string };

const OWNERSHIP = {
  decidedBy: 'self',
  because: "Every query is keyed on the caller's own user id as well as the pattern's.",
} as const;

const notFound = () => errorResponse('Pattern not found', { code: 'NOT_FOUND', status: 404 });

export const GET = withAuth<Params>(
  async (_request, session, { params }) => {
    const id = UserPatternIdSchema.safeParse((await params).id);
    if (!id.success) return notFound();
    return successResponse(await getUserPattern(session.user.id, id.data));
  },
  { ownership: OWNERSHIP }
);

export const PATCH = withAuth<Params>(
  async (request, session, { params }) => {
    const id = UserPatternIdSchema.safeParse((await params).id);
    if (!id.success) return notFound();
    const log = await getRouteLogger(request);
    const input = await validateRequestBody(request, UpdateUserPatternSchema);
    const pattern = await updateUserPattern(session.user.id, id.data, input);
    log.info('User pattern changed', {
      patternId: pattern.id,
      renamed: input.name !== undefined,
      steps: input.pattern !== undefined,
    });
    return successResponse(pattern);
  },
  { ownership: OWNERSHIP }
);

export const DELETE = withAuth<Params>(
  async (request, session, { params }) => {
    const id = UserPatternIdSchema.safeParse((await params).id);
    if (!id.success) return notFound();
    const log = await getRouteLogger(request);
    await deleteUserPattern(session.user.id, id.data);
    log.info('User pattern deleted', { patternId: id.data });
    return successResponse({ id: id.data });
  },
  { ownership: OWNERSHIP }
);
