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
import { platformSlugWhere } from '@/lib/orchestration/agents/platform-agent-guard';

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
 * A soft cap: turns sent together all read the count before any of them is saved, so all go ahead. The stream route's
 * per-minute chat cap (10 by default, per server process) bounds how many can arrive together, so a day's overshoot is
 * at most that many on each server process. That is fine for a cost limit; Sunrise's conversation cap makes the same
 * trade.
 *
 * A turn counts once `streamChat` saves the message, which is before the model answers, so a turn the provider fails
 * still counts, and a learner who retries through a provider outage spends a turn on each try. Counting only answered
 * turns would put the transcript's shape into the query; that is worth it only if outages turn out to be common.
 */
export async function readAllowance(userId: string, now = new Date()): Promise<TutorAllowance> {
  const dayStart = startOfUtcDay(now);
  const used = await prisma.aiMessage.count({
    where: {
      role: 'user',
      createdAt: { gte: dayStart },
      // The tutor as the route loads it: the platform's row, never an org's own agent under the same slug.
      conversation: {
        userId,
        agent: { slug: TUTOR_AGENT_SLUG, ...platformSlugWhere(TUTOR_AGENT_SLUG) },
      },
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
