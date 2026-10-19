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

/**
 * How an answer ended when it did not end as an answer, as the panel said at the time: the learner pressed Stop, it
 * failed, or it went over the per-turn cost cap.
 */
export type TutorAnswerEnd = 'stopped' | 'failed' | 'cost';

export interface TutorTranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Not a whole answer: the panel shows its own line for how it ended. */
  ended?: TutorAnswerEnd;
}

export interface TutorTranscript {
  conversationId: string;
  /** Oldest first: the learner's questions and the tutor's answers, without tool calls or empty steps. */
  messages: TutorTranscriptMessage[];
}

const isTranscriptRole = (role: string): role is TutorTranscriptMessage['role'] =>
  role === 'user' || role === 'assistant';

/**
 * The two markers Sunrise saves for an answer that did not finish, read from the message's metadata. They are there so
 * a client can show the turn rather than an unanswered question.
 *
 * - **A failure** (`streaming-handler.ts`, `persistErrorMarker`): `{ error: true, errorCode }`, in place of the answer,
 *   with text written for an admin ("[An error occurred…]"), which is dropped. A Stop is one too, `errorCode: 'aborted'`.
 * - **The per-turn cost cap** mid-loop: `{ endedReason: 'budget_exceeded' }` on what the model had written so far,
 *   which may be nothing.
 */
const EndedSchema = z.union([
  z
    .object({ error: z.literal(true), errorCode: z.string().optional() })
    .transform((m): TutorAnswerEnd => (m.errorCode === 'aborted' ? 'stopped' : 'failed')),
  z.object({ endedReason: z.literal('budget_exceeded') }).transform((): TutorAnswerEnd => 'cost'),
]);

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
        where: {
          role: { in: ['user', 'assistant'] },
          // An empty step is left out, unless it is where the cost cap stopped the answer.
          OR: [
            { NOT: { content: '' } },
            { metadata: { path: ['endedReason'], equals: 'budget_exceeded' } },
          ],
        },
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
      .flatMap((m): TutorTranscriptMessage[] => {
        if (!isTranscriptRole(m.role)) return [];
        const ended = EndedSchema.safeParse(m.metadata);
        if (!ended.success) return [{ role: m.role, content: m.content }];
        return [
          { role: m.role, content: ended.data === 'cost' ? m.content : '', ended: ended.data },
        ];
      })
      .reverse(),
  };
}
