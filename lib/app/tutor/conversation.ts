/**
 * The learner's latest conversation with the tutor on one synth, for the tutor panel to carry on (`f-tutor` t-56).
 *
 * **Why the panel resumes rather than starting afresh.** Every new conversation counts against Sunrise's
 * `maxConversationsPerUser` when an admin sets it, and a learner cannot archive a tutor conversation through the
 * consumer routes (the tutor is an internal agent, which they do not serve). A panel that opened a new conversation on
 * every visit would lock a learner out at the cap. Carrying on the latest one keeps it to about one per synth.
 *
 * Read as the stream route checks a conversation it carries on: the caller's own, with the tutor, about this synth, and
 * still active. So the id this returns is one that route takes. The caller's own rows only (`userId` from the session),
 * which is why this file is declared to the ownerless-surface guard (`lib/app/ci.ts`).
 */
import { z } from 'zod';
import { TUTOR_AGENT_SLUG } from '@/lib/app/tutor/agent';
import { TUTOR_CONTEXT_TYPE } from '@/lib/app/tutor/context';
import { prisma } from '@/lib/db/client';
import { platformSlugWhere } from '@/lib/orchestration/agents/platform-agent-guard';

/** The most messages the panel shows from a resumed conversation: the last twenty or so questions and answers. */
export const TRANSCRIPT_MESSAGES = 40;

export interface TutorTranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorTranscript {
  conversationId: string;
  /** Oldest first: the learner's questions and the tutor's answers, without tool calls or empty steps. */
  messages: TutorTranscriptMessage[];
}

const isTranscriptRole = (role: string): role is TutorTranscriptMessage['role'] =>
  role === 'user' || role === 'assistant';

/**
 * The marker Sunrise saves in place of an answer that failed ("[An error occurred…]"), flagged in its metadata. Its own
 * history read drops it, and so does this: the panel said what went wrong at the time, in the learner's words.
 */
const ErrorMarkerSchema = z.object({ error: z.literal(true) });

/** The caller's latest active tutor conversation on `synthId`, with its last messages, or null when there is none. */
export async function latestConversation(
  userId: string,
  synthId: string
): Promise<TutorTranscript | null> {
  const conversation = await prisma.aiConversation.findFirst({
    where: {
      userId,
      contextType: TUTOR_CONTEXT_TYPE,
      contextId: synthId,
      isActive: true,
      // The tutor as the stream route loads it: the platform's active row, never an org's own agent under the slug.
      agent: { slug: TUTOR_AGENT_SLUG, isActive: true, ...platformSlugWhere(TUTOR_AGENT_SLUG) },
    },
    // Newest first: a conversation that filled up was followed by a new one, which is the one to carry on.
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      messages: {
        where: { role: { in: ['user', 'assistant'] }, NOT: { content: '' } },
        // `id` breaks a tie between rows saved in the same millisecond, as Sunrise's own history read does.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: TRANSCRIPT_MESSAGES,
        select: { role: true, content: true, metadata: true },
      },
    },
  });
  if (!conversation) return null;
  return {
    conversationId: conversation.id,
    messages: conversation.messages
      .flatMap((m) =>
        isTranscriptRole(m.role) && !ErrorMarkerSchema.safeParse(m.metadata).success
          ? [{ role: m.role, content: m.content }]
          : []
      )
      .reverse(),
  };
}
