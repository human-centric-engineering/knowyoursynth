/**
 * The signed-in user's progress through one library sound's lesson (`f-my-sounds` s4).
 *
 * PUT /api/v1/me/progress/:synthId/:slug — `{ step, completed? }`: a step reached, and whether the lesson was finished
 *     from it. Progress only moves forward, so the answer can be further on than `step`. A synth that is not listed, a
 *     library sound it does not have, or a step the lesson does not have is refused (400).
 *
 * The section rate limit applies (`proxy.ts`); the page sends a step only when it is further than the user had got. See
 * `lib/app/sounds/progress.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { SoundSlugSchema, SynthIdSchema } from '@/lib/app/sounds/data';
import { ProgressInputSchema } from '@/lib/app/sounds/progress-data';
import { recordProgress } from '@/lib/app/sounds/progress';

type Params = { synthId: string; slug: string };

export const PUT = withAuth<Params>(
  async (request, session, { params }) => {
    const raw = await params;
    const synthId = SynthIdSchema.safeParse(raw.synthId);
    const slug = SoundSlugSchema.safeParse(raw.slug);
    if (!synthId.success || !slug.success)
      return errorResponse('Not a library patch', { code: 'VALIDATION_ERROR', status: 400 });
    const input = await validateRequestBody(request, ProgressInputSchema);
    return successResponse(await recordProgress(session.user.id, synthId.data, slug.data, input));
  },
  {
    ownership: {
      decidedBy: 'self',
      because: "It writes and returns only the row keyed on the caller's own user id.",
    },
  }
);
