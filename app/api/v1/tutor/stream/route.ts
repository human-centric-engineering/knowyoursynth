/**
 * The tutor: one turn, streamed (`f-tutor` t-54).
 *
 * POST /api/v1/tutor/stream — `{ synthId, panel, message, conversationId? }` in; Sunrise's chat SSE stream out.
 *
 * Why the app owns this rather than using `/api/v1/chat/stream`: that route carries no per-turn context, and the
 * tutor is no use without the synth and the panel on screen. Here both are checked before the model is called and
 * passed on as the turn's context.
 *
 * - **The agent is pinned.** The body names no agent; the client cannot reach another one through this route.
 * - **The synth and the panel are checked first.** The synth must be one the catalogue lists, and the panel is
 *   validated against its current definition (`validateSound`), as a saved sound's is. Either refused is a 400, and
 *   the model is not called. The synth then goes to the context contributor as `contextId` and to the tools as
 *   `entityContext`, the same synth in both, at the definition version it was checked against.
 * - **A conversation stays on its synth.** A `conversationId` carries on only a conversation the caller started with
 *   the tutor on this synth; any other is a 404 `TUTOR_CONVERSATION_NOT_FOUND`, and the panel starts a new one.
 * - **The daily allowance (D6)** is checked before the model is paid for: a person past it gets a 429 with
 *   `TUTOR_ALLOWANCE_SPENT`, a sentence the panel shows as it is, and `Retry-After` until the reset.
 *
 * Authentication: any authenticated user, or an API key with the `chat` scope; signed out is a 401, and the panel
 * shows a sign-in prompt. `proxy.ts` has
 * applied the section cap. The per-user and per-agent chat caps here are the same ones the consumer chat route
 * applies, so switching surfaces buys no extra turns.
 */
import { getRouteLogger } from '@/lib/api/context';
import { enforceContentLengthCap } from '@/lib/api/multipart-guard';
import { errorResponse } from '@/lib/api/responses';
import { sseResponse } from '@/lib/api/sse';
import { validateRequestBody } from '@/lib/api/validation';
import { checkPanel, playableSynth } from '@/lib/app/sounds/store';
import { TUTOR_AGENT_SLUG } from '@/lib/app/tutor/agent';
import { allowanceSpentMessage, readAllowance } from '@/lib/app/tutor/allowance';
import { TUTOR_CONTEXT_TYPE } from '@/lib/app/tutor/context';
import type { TutorEntityContext } from '@/lib/app/tutor/panel';
import { MAX_TUTOR_BODY_BYTES, TutorStreamRequestSchema } from '@/lib/app/tutor/request';
import { withAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { getRequestId, getVisitorId } from '@/lib/logging/context';
import { platformSlugWhere } from '@/lib/orchestration/agents/platform-agent-guard';
import { streamChat } from '@/lib/orchestration/chat';
import {
  agentChatLimiter,
  consumerChatLimiter,
  createRateLimitResponse,
} from '@/lib/security/rate-limit';

export const POST = withAuth(
  async (request, session) => {
    const userId = session.user.id;
    const userLimit = consumerChatLimiter.check(userId);
    if (!userLimit.success) return createRateLimitResponse(userLimit);

    const tooBig = enforceContentLengthCap(request, {
      maxBytes: MAX_TUTOR_BODY_BYTES,
      errorCode: 'TUTOR_REQUEST_TOO_LARGE',
      errorMessage: 'That is too much to send to the tutor. Shorten the question.',
    });
    if (tooBig) return tooBig;

    const log = await getRouteLogger(request);
    const body = await validateRequestBody(request, TutorStreamRequestSchema);
    const def = await playableSynth(body.synthId);
    const panel = checkPanel(def, body.panel);

    const agent = await prisma.aiAgent.findFirst({
      // As the chat handler loads it: a platform slug is its system row.
      where: { slug: TUTOR_AGENT_SLUG, isActive: true, ...platformSlugWhere(TUTOR_AGENT_SLUG) },
      select: { id: true, rateLimitRpm: true },
    });
    if (!agent) {
      log.warn('Tutor agent missing or inactive');
      return errorResponse(
        "The tutor isn't available right now. The synth and everything else on the page still work.",
        { code: 'TUTOR_UNAVAILABLE', status: 503 }
      );
    }

    const agentLimit = agentChatLimiter.check(`${agent.id}:${userId}`, agent.rateLimitRpm);
    if (!agentLimit.success) return createRateLimitResponse(agentLimit);

    if (body.conversationId) {
      // A conversation is about the synth it started on. Carried on with another one, its history would talk about
      // controls this turn's context and tools do not have.
      const conversation = await prisma.aiConversation.findFirst({
        where: {
          id: body.conversationId,
          userId,
          agentId: agent.id,
          contextType: TUTOR_CONTEXT_TYPE,
          contextId: def.id,
          isActive: true,
        },
        select: { id: true },
      });
      if (!conversation) {
        return errorResponse(
          "That conversation isn't about this synth, or has gone. Start a new one.",
          { code: 'TUTOR_CONVERSATION_NOT_FOUND', status: 404 }
        );
      }
    }

    const allowance = await readAllowance(userId);
    if (allowance.remaining === 0) {
      log.info('Tutor allowance spent', { used: allowance.used, limit: allowance.limit });
      const secondsToReset = Math.ceil((Date.parse(allowance.resetsAt) - Date.now()) / 1000);
      return errorResponse(allowanceSpentMessage(allowance.limit), {
        code: 'TUTOR_ALLOWANCE_SPENT',
        status: 429,
        details: { ...allowance },
        headers: { 'Retry-After': String(Math.max(1, secondsToReset)) },
      });
    }

    log.info('Tutor turn started', {
      synthId: def.id,
      conversationId: body.conversationId,
      turnsUsed: allowance.used + 1,
    });

    const entityContext: TutorEntityContext = { synthId: def.id, version: def.version, panel };
    const events = streamChat({
      message: body.message,
      agentSlug: TUTOR_AGENT_SLUG,
      userId,
      conversationId: body.conversationId,
      contextType: TUTOR_CONTEXT_TYPE,
      contextId: def.id,
      entityContext,
      requestId: await getRequestId(),
      visitorId: await getVisitorId(),
      signal: request.signal,
    });

    return sseResponse(events, { signal: request.signal });
  },
  {
    // A paid turn: an API key reaches it only when minted for chat.
    scope: 'chat',
    // Ownership: this route is self-scoped by construction — see RouteOwnership in lib/auth/guards.ts.
    ownership: {
      decidedBy: 'self',
      because:
        "The conversation, messages and allowance count are all keyed on the caller's own id; an existing conversation is found by id and caller together.",
    },
  }
);
