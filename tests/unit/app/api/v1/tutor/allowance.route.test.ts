/**
 * GET /api/v1/tutor/allowance — the caller's tutor turns today (`f-tutor` t-54).
 *
 * Real `withAuth`; the message count is an in-memory table that applies the allowance's filters, so a count that took
 * another person's turns would show here. What the count includes is pinned in `tests/unit/lib/app/tutor/allowance.test.ts`.
 *
 * @see app/api/v1/tutor/allowance/route.ts
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single', TUTOR_DAILY_TURNS: 30 }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

const mockPrisma = vi.hoisted((): Record<string, unknown> => ({}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import { GET } from '@/app/api/v1/tutor/allowance/route';
import { createMockAuthSession } from '@/tests/helpers/auth';
import { fakeMessageTable, tutorTurns } from '@/tests/helpers/tutor';

const USER_ID = 'cmjbv4i3x00003wsloputgwul';
const NOW = new Date('2026-10-18T15:30:00Z');
const TODAY = new Date('2026-10-18T00:00:00Z');

const get = () => GET(new NextRequest('http://localhost:3000/api/v1/tutor/allowance'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  const base = createMockAuthSession();
  mockGetSession.mockResolvedValue({
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID, userId: USER_ID },
    user: { ...base.user, id: USER_ID, role: 'USER' },
  });
  mockPrisma.aiMessage = fakeMessageTable([
    ...tutorTurns(USER_ID, 7, TODAY),
    ...tutorTurns('another-user', 20, TODAY),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/v1/tutor/allowance', () => {
  it("returns the caller's own count today, the limit and when it resets", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { limit: 30, used: 7, remaining: 23, resetsAt: '2026-10-19T00:00:00.000Z' },
    });
  });

  it('refuses a caller with no session', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await get();

    expect(res.status).toBe(401);
  });
});
