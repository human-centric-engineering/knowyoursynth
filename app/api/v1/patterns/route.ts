/**
 * The signed-in user's own patterns, "My patterns" (`f-step-sequencer` t-81).
 *
 * GET  /api/v1/patterns — the caller's patterns, most recently changed first, without their steps.
 * POST /api/v1/patterns — save one: `{ name, pattern, synthId? }`. 201 with the pattern.
 *
 * The pattern is checked with the sequencer's `PatternSchema` and refused (400) when anything in it is wrong. The
 * section rate limit applies (`proxy.ts`). See `lib/app/patterns/store.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { CreateUserPatternSchema } from '@/lib/app/patterns/data';
import { createUserPattern, listUserPatterns } from '@/lib/app/patterns/store';

export const GET = withAuth(
  async (_request, session) => successResponse(await listUserPatterns(session.user.id)),
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
    const input = await validateRequestBody(request, CreateUserPatternSchema);
    const pattern = await createUserPattern(session.user.id, input);
    log.info('User pattern saved', { patternId: pattern.id, synthId: pattern.synthId });
    return successResponse(pattern, undefined, { status: 201 });
  },
  {
    // Ownership: this route is self-scoped by construction — see RouteOwnership in lib/auth/guards.ts.
    ownership: {
      decidedBy: 'self',
      because: "It writes one pattern under the caller's own user id and returns only that row.",
    },
  }
);
