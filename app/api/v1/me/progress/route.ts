/**
 * The signed-in user's progress through the library's lessons (`f-my-sounds` s4).
 *
 * GET /api/v1/me/progress[?synthId=model-d] — every lesson the caller has started, or those on one synth, most recently
 *     moved first: the library sound, its step count, the furthest step reached and when it was first finished.
 *
 * See `lib/app/sounds/progress.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { ListProgressQuerySchema } from '@/lib/app/sounds/progress-data';
import { listProgress } from '@/lib/app/sounds/progress';

export const GET = withAuth(
  async (request, session) => {
    const { synthId } = validateQueryParams(request.nextUrl.searchParams, ListProgressQuerySchema);
    return successResponse(await listProgress(session.user.id, synthId));
  },
  {
    ownership: {
      decidedBy: 'self',
      because: "It lists only the rows keyed on the caller's own user id.",
    },
  }
);
