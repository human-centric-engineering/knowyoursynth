/**
 * The tutor's daily allowance (D6). The count is what decides whether a turn is refused, so what matters is what it
 * counts: only the person's own messages, only to the tutor, only messages they sent and the web searches it ran for
 * them, only today (UTC).
 *
 * The message table is in memory and applies the query's filters, so the count is computed, not stubbed.
 *
 * @see lib/app/tutor/allowance.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fakeMessageTable,
  tutorSearches,
  tutorTurns,
  type MessageRow,
} from '@/tests/helpers/tutor';

const table = vi.hoisted(() => ({ current: null as ReturnType<typeof fakeMessageTable> | null }));
const appEnv = vi.hoisted(() => ({ TUTOR_DAILY_TURNS: 30 }));

vi.mock('@/lib/env', () => ({ env: appEnv }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    get aiMessage() {
      return table.current;
    },
  },
}));

import { allowanceSpentMessage, readAllowance } from '@/lib/app/tutor/allowance';

const NOW = new Date('2026-10-18T15:30:00Z');
const TODAY = new Date('2026-10-18T00:00:00Z');

function withMessages(rows: MessageRow[]) {
  table.current = fakeMessageTable(rows);
}

beforeEach(() => {
  withMessages([]);
  appEnv.TUTOR_DAILY_TURNS = 30;
});

describe('readAllowance', () => {
  it('starts the day with the whole allowance, back at the next UTC midnight', async () => {
    expect(await readAllowance('user-1', NOW)).toEqual({
      limit: 30,
      used: 0,
      remaining: 30,
      resetsAt: '2026-10-19T00:00:00.000Z',
    });
  });

  it('counts the turns the person sent to the tutor today', async () => {
    withMessages(tutorTurns('user-1', 12, TODAY));

    const a = await readAllowance('user-1', NOW);

    expect(a.used).toBe(12);
    expect(a.remaining).toBe(18);
  });

  it("does not count another person's turns, another agent's, the tutor's replies or yesterday's", async () => {
    withMessages([
      ...tutorTurns('user-1', 3, TODAY),
      ...tutorTurns('user-2', 30, TODAY),
      ...tutorTurns('user-1', 30, new Date('2026-10-17T20:00:00Z')),
      ...tutorTurns('user-1', 30, TODAY, 'support-bot'),
      { userId: 'user-1', agentSlug: 'synth-tutor', role: 'assistant', createdAt: NOW },
      { userId: 'user-1', agentSlug: 'synth-tutor', role: 'tool', createdAt: NOW },
    ]);

    expect((await readAllowance('user-1', NOW)).used).toBe(3);
  });

  it("does not count turns to an org's own agent that shares the tutor's slug", async () => {
    withMessages([
      ...tutorTurns('user-1', 3, TODAY),
      ...tutorTurns('user-1', 30, TODAY).map((m) => ({ ...m, agentIsSystem: false })),
    ]);

    expect((await readAllowance('user-1', NOW)).used).toBe(3);
  });

  it('counts a turn sent at the very start of the UTC day, and not one a millisecond before', async () => {
    withMessages([
      ...tutorTurns('user-1', 1, TODAY),
      ...tutorTurns('user-1', 1, new Date(TODAY.getTime() - 1)),
    ]);

    expect((await readAllowance('user-1', NOW)).used).toBe(1);
  });

  it('has nothing remaining once the day is spent, and never goes below zero', async () => {
    withMessages(tutorTurns('user-1', 32, TODAY));

    const a = await readAllowance('user-1', NOW);

    expect(a.used).toBe(32);
    expect(a.remaining).toBe(0);
  });

  it('counts each web search that came back as one more turn (D12)', async () => {
    withMessages([...tutorTurns('user-1', 3, TODAY), ...tutorSearches('user-1', 2, TODAY)]);

    expect(await readAllowance('user-1', NOW)).toMatchObject({ used: 5, remaining: 25 });
  });

  it("does not count a refused search, another tool's call, or another person's search", async () => {
    withMessages([
      ...tutorTurns('user-1', 3, TODAY),
      ...tutorSearches('user-1', 4, TODAY, { succeeded: false }),
      ...tutorSearches('user-1', 4, TODAY, { slug: 'search_databank' }),
      ...tutorSearches('user-2', 4, TODAY),
    ]);

    expect((await readAllowance('user-1', NOW)).used).toBe(3);
  });

  it('takes its limit from TUTOR_DAILY_TURNS, so production can tune it without a release', async () => {
    appEnv.TUTOR_DAILY_TURNS = 5;
    withMessages(tutorTurns('user-1', 4, TODAY));

    expect(await readAllowance('user-1', NOW)).toMatchObject({ limit: 5, used: 4, remaining: 1 });
  });
});

describe('allowanceSpentMessage', () => {
  it('names the limit it was given and when the turns come back', () => {
    expect(allowanceSpentMessage(12)).toBe(
      "That's all 12 of today's questions for the tutor. They come back at midnight UTC. The synth and everything else on the page still work."
    );
  });
});
