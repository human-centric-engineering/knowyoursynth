/**
 * The caller's latest tutor conversation on a synth, for the tutor panel to carry on (`f-tutor` t-56).
 *
 * GET /api/v1/tutor/conversation?synthId=model-d — `{ conversation: { conversationId, messages } | null }`: the
 * conversation the stream route would carry on for this synth, with its last questions and answers, oldest first.
 *
 * Why it exists: Sunrise's consumer conversation routes serve only `public` and `invite_only` agents, and the tutor is
 * `internal`. Without this the panel could not resume, and a new conversation on every visit counts against the
 * admin's `maxConversationsPerUser` (`lib/app/tutor/conversation.ts`).
 *
 * Authentication: any authenticated user, or an API key with the `chat` scope. Scoped to the caller by construction.
 * The section rate limit applies (`proxy.ts`).
 */
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { latestConversation } from '@/lib/app/tutor/conversation';
import { TutorConversationQuerySchema } from '@/lib/app/tutor/request';
import { withAuth } from '@/lib/auth/guards';

export const GET = withAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const { synthId } = validateQueryParams(
      request.nextUrl.searchParams,
      TutorConversationQuerySchema
    );
    const conversation = await latestConversation(session.user.id, synthId);
    log.info('Tutor conversation read', {
      synthId,
      found: conversation !== null,
      messages: conversation?.messages.length ?? 0,
    });
    return successResponse({ conversation });
  },
  {
    // The stream route's companion: a key that can take turns can read the conversation it carries on.
    scope: 'chat',
    // Ownership: this route is self-scoped by construction — see RouteOwnership in lib/auth/guards.ts.
    ownership: {
      decidedBy: 'self',
      because:
        "It reads only conversations keyed on the caller's own user id, and takes no conversation id from the request.",
    },
  }
);
