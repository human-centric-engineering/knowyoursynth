/**
 * The tutor's daily allowance (D6): how many turns a person may take a day. Borrowed from BeatBuddy's, and the
 * reasons hold here: it is a cost cap, and the cost is per turn.
 *
 * Sunrise has no per-user daily cap, so the app counts. A turn is one message the person sent to the tutor: an
 * `AiMessage` with `role: 'user'` in one of their tutor conversations. Nothing else is stored, because the count is read
 * from the transcript. So deleting a conversation gives its turns back, which is fine for a cost cap and not worth a
 * table.
 *
 * The day is the UTC day. One boundary for everybody is simple to state ("back at midnight UTC") and needs nothing
 * from the browser.
 */
import { TUTOR_AGENT_SLUG } from '@/lib/app/tutor/agent';
import { prisma } from '@/lib/db/client';
import { env } from '@/lib/env';

/** 30 turns a day by default, as BeatBuddy's. Tuned through `TUTOR_DAILY_TURNS`; the production number is f-launch x4's. */
export function tutorDailyTurns(): number {
  return env.TUTOR_DAILY_TURNS;
}

export interface TutorAllowance {
  limit: number;
  used: number;
  remaining: number;
  /** When today's count starts again: the next UTC midnight, ISO 8601. */
  resetsAt: string;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The person's allowance as it stands. `userId` comes from the session.
 *
 * A soft cap: two turns sent at the same instant can both read 29 and both go ahead. That overshoots by a turn or two,
 * never by a day's worth, which is fine for a cost limit (Sunrise's conversation cap makes the same trade). The burst
 * cap in the stream route keeps it to a few.
 */
export async function readAllowance(userId: string, now = new Date()): Promise<TutorAllowance> {
  const dayStart = startOfUtcDay(now);
  const used = await prisma.aiMessage.count({
    where: {
      role: 'user',
      createdAt: { gte: dayStart },
      conversation: { userId, agent: { slug: TUTOR_AGENT_SLUG } },
    },
  });
  const limit = tutorDailyTurns();
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsAt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/** What the tutor panel shows, as it is, when the day's turns are gone. */
export function allowanceSpentMessage(limit: number): string {
  return `That's all ${limit} of today's questions for the tutor. They come back at midnight UTC. The synth and everything else on the page still work.`;
}
