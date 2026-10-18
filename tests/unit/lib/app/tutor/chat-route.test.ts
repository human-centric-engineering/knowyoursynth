/**
 * Sunrise's generic `POST /api/v1/chat/stream` cannot reach the tutor.
 *
 * That route serves any `public` or `invite_only` agent to any signed-in user, with no daily allowance, so a tutor it
 * could reach would be a way round the app's own route and its limit (BeatBreaker found this in Phase 8). The tutor's
 * definition leaves visibility to the platform baseline, `internal`.
 *
 * The real route runs against an agent table holding the tutor as the reconcile writes it (the baseline overlaid by the
 * definition), and the lookup is answered by applying the route's own `where` to that row. So this fails if the tutor
 * is made `public` or `invite_only`, and if the route stops filtering on visibility. The control case, the same row made
 * `public`, shows the harness can reach an agent at all.
 *
 * @see app/api/v1/chat/stream/route.ts · lib/app/tutor/agent.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiAgent: { findFirst: vi.fn() },
    aiAgentInviteToken: { findFirst: vi.fn(), update: vi.fn() },
    orgMembership: { findUnique: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/security/rate-limit', () => ({
  consumerChatLimiter: {
    check: vi.fn(() => ({ success: true, limit: 20, remaining: 19, reset: 0 })),
  },
  agentChatLimiter: { check: vi.fn(() => ({ success: true })), reset: vi.fn() },
  imageLimiter: { check: vi.fn(() => ({ success: true })) },
  createRateLimitResponse: vi.fn(() => Response.json({ success: false }, { status: 429 })),
}));
vi.mock('@/lib/security/ip', () => ({ getClientIP: vi.fn(() => '127.0.0.1') }));
vi.mock('@/lib/orchestration/chat', () => ({ streamChat: vi.fn() }));
vi.mock('@/lib/api/sse', () => ({
  sseResponse: vi.fn(() => new Response('data: ok\n\n', { status: 200 })),
}));
vi.mock('@/lib/logging/context', () => ({
  getRequestId: vi.fn(() => Promise.resolve('req-1')),
  getVisitorId: vi.fn(() => Promise.resolve('vid-1')),
}));

import { POST } from '@/app/api/v1/chat/stream/route';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db/client';
import { streamChat } from '@/lib/orchestration/chat';
import { TUTOR_AGENT, TUTOR_AGENT_SLUG } from '@/lib/app/tutor/agent';
import { PLATFORM_AGENT_BASELINE } from '@/lib/orchestration/agents/platform-agents';

/** The tutor's row as the reconcile writes it: the baseline, overlaid by the definition. */
const tutorRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'agent-tutor',
  slug: TUTOR_AGENT_SLUG,
  isSystem: true,
  rateLimitRpm: null,
  ...PLATFORM_AGENT_BASELINE,
  ...TUTOR_AGENT.agent,
  ...overrides,
});

/** Answers `findFirst` by applying the parts of its `where` the route sets: slug, active, visibility, system row. */
function agentTable(rows: Record<string, unknown>[]) {
  vi.mocked(prisma.aiAgent.findFirst).mockImplementation(((args: {
    where: Record<string, unknown>;
  }) => {
    const where = args.where;
    const visibility = where.visibility as { in?: string[] } | undefined;
    const found = rows.find(
      (r) =>
        r.slug === where.slug &&
        (where.isActive === undefined || r.isActive === where.isActive) &&
        (where.isSystem === undefined || r.isSystem === where.isSystem) &&
        (!visibility?.in || visibility.in.includes(r.visibility as string))
    );
    return Promise.resolve(found ?? null);
  }) as never);
}

function request(body: unknown): NextRequest {
  const url = new URL('http://localhost:3000/api/v1/chat/stream');
  return {
    json: () => Promise.resolve(body),
    headers: new Headers(),
    url: url.toString(),
    nextUrl: { searchParams: url.searchParams },
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    session: {
      id: 's-1',
      userId: 'user-1',
      token: 't',
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    user: {
      id: 'user-1',
      name: 'Learner',
      email: 'learner@example.com',
      emailVerified: true,
      role: 'USER',
    },
  } as never);
});

describe('the generic chat route', () => {
  it('cannot reach the tutor', async () => {
    agentTable([tutorRow()]);
    const response = await POST(
      request({ agentSlug: TUTOR_AGENT_SLUG, message: 'Make this darker' })
    );
    expect(response.status).toBe(404);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('would reach it if it were public (the control)', async () => {
    agentTable([tutorRow({ visibility: 'public' })]);
    const response = await POST(
      request({ agentSlug: TUTOR_AGENT_SLUG, message: 'Make this darker' })
    );
    expect(response.status).toBe(200);
    expect(streamChat).toHaveBeenCalledTimes(1);
  });
});
