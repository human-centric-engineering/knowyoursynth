/**
 * POST /api/v1/tutor/stream — one tutor turn (`f-tutor` t-54).
 *
 * The model is not called here; `streamChat` is the seam, and it yields two events so the real `sseResponse` frames
 * them. Real `withAuth`, the real synth registry and `validateSound`, and the real per-user and per-agent chat
 * limiters (reset before each test, never mocked: `.context/security/rate-limiting.md`). The message count is an
 * in-memory table that applies the allowance's filters, so the allowance is counted, not stubbed.
 *
 * What these pin: signed out is a 401; the agent is pinned and the user comes from the session; an unknown or unlisted
 * synth, or a panel the synth cannot hold, is refused before the model is called; a body declared over the cap is a
 * 413 before it is read; the turn past the day's limit is a 429 with the friendly message; the burst caps refuse the
 * turn past them; and a turn that goes ahead passes the synth as the context and the checked panel as
 * `entityContext`.
 *
 * @see app/api/v1/tutor/stream/route.ts
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

vi.mock('@/lib/orchestration/chat', () => ({
  streamChat: vi.fn(async function* () {
    yield { type: 'start', conversationId: 'conv-1', messageId: 'msg-1' };
    yield { type: 'done', tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
  }),
}));

import { POST } from '@/app/api/v1/tutor/stream/route';
import { getSynthDef } from '@/lib/app/synths/defs';
import type { Control } from '@/lib/app/synths/contract';
import { MAX_TUTOR_BODY_BYTES } from '@/lib/app/tutor/request';
import { streamChat } from '@/lib/orchestration/chat';
import { agentChatLimiter, consumerChatLimiter } from '@/lib/security/rate-limit';
import { createMockAuthSession } from '@/tests/helpers/auth';
import { fakeMessageTable, tutorTurns, type MessageRow } from '@/tests/helpers/tutor';

const USER_ID = 'cmjbv4i3x00003wsloputgwul';
const AGENT_ID = 'agent-tutor';
const NOW = new Date('2026-10-18T15:30:00Z');
const TODAY = new Date('2026-10-18T00:00:00Z');

const modelD = getSynthDef('model-d')!;
/** A continuous control on Model D, to set legally and illegally. */
const cont = modelD.controls.find(
  (c): c is Extract<Control, { kind: 'cont' }> => c.kind === 'cont'
)!;
/** A cable Model D's engine models: a signal-carrying output to a destination input. */
const outJack = modelD.jacks.find((j) => j.dir === 'out' && j.signal)!;
const inJack = modelD.jacks.find((j) => j.dir === 'in' && j.dest)!;
const PANEL = { values: { [cont.id]: cont.min }, cables: [[outJack.id, inJack.id]] };

const db = vi.hoisted(() => ({
  agent: null as { id: string; rateLimitRpm: number | null } | null,
  listed: new Set<string>(),
}));

function signIn() {
  const base = createMockAuthSession();
  mockGetSession.mockResolvedValue({
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID, userId: USER_ID },
    user: { ...base.user, id: USER_ID, role: 'USER' },
  });
}

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/tutor/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const turn = (overrides: Record<string, unknown> = {}) =>
  post({ synthId: 'model-d', panel: PANEL, message: 'Make this sound darker', ...overrides });

interface Envelope {
  success: boolean;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown> & { errors?: { path: string }[] };
  };
}

async function json(res: Response): Promise<Envelope> {
  return (await res.json()) as Envelope;
}

function turnsUsed(rows: MessageRow[]) {
  mockPrisma.aiMessage = fakeMessageTable(rows);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  consumerChatLimiter.reset(USER_ID);
  agentChatLimiter.reset(`${AGENT_ID}:${USER_ID}`);
  db.agent = { id: AGENT_ID, rateLimitRpm: null };
  db.listed = new Set(['model-d']);
  mockPrisma.synth = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      getSynthDef(where.id) ? { listed: db.listed.has(where.id) } : null
    ),
  };
  mockPrisma.aiAgent = {
    findFirst: vi.fn(
      async ({ where }: { where: { slug: string; isActive: boolean; isSystem?: boolean } }) =>
        where.slug === 'synth-tutor' && where.isActive && where.isSystem === true ? db.agent : null
    ),
  };
  turnsUsed([]);
  signIn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/v1/tutor/stream', () => {
  it('streams a turn with the tutor pinned, the synth as its context and the checked panel as entityContext', async () => {
    const res = await POST(turn());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(await res.text()).toContain('event: start');
    expect(streamChat).toHaveBeenCalledTimes(1);
    expect(vi.mocked(streamChat).mock.calls[0][0]).toMatchObject({
      message: 'Make this sound darker',
      agentSlug: 'synth-tutor',
      userId: USER_ID,
      contextType: 'synth',
      contextId: 'model-d',
      entityContext: {
        synthId: 'model-d',
        version: modelD.version,
        panel: { values: { [cont.id]: cont.min }, cables: [[outJack.id, inJack.id]] },
      },
    });
  });

  it('ignores an agent, a user id or an entity context in the body; the client cannot choose what the turn acts on', async () => {
    await POST(
      turn({
        agentSlug: 'some-admin-agent',
        userId: 'someone-else',
        contextType: 'admin',
        entityContext: { synthId: 'deepmind-12d' },
      })
    );

    const request = vi.mocked(streamChat).mock.calls[0][0];
    expect(request.agentSlug).toBe('synth-tutor');
    expect(request.userId).toBe(USER_ID);
    expect(request.contextType).toBe('synth');
    expect(request.entityContext).toMatchObject({ synthId: 'model-d' });
  });

  it('carries on an existing conversation when given its id', async () => {
    await POST(turn({ conversationId: 'cmjbv4i3x00003wsloputgaaa' }));

    expect(vi.mocked(streamChat).mock.calls[0][0].conversationId).toBe('cmjbv4i3x00003wsloputgaaa');
  });

  it('refuses a caller with no session, before the model is called', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(turn());

    expect(res.status).toBe(401);
    expect(streamChat).not.toHaveBeenCalled();
  });

  describe('the synth and the panel are checked before the model is called', () => {
    it('refuses a synth the registry does not have', async () => {
      const res = await POST(turn({ synthId: 'not-a-synth' }));

      expect(res.status).toBe(400);
      const { error } = await json(res);
      expect(error?.code).toBe('VALIDATION_ERROR');
      expect(error?.details?.errors?.map((e) => e.path)).toEqual(['synthId']);
      expect(streamChat).not.toHaveBeenCalled();
    });

    it('refuses a synth the catalogue does not list, as the page does', async () => {
      db.listed.delete('model-d');

      const res = await POST(turn());

      expect(res.status).toBe(400);
      expect(streamChat).not.toHaveBeenCalled();
    });

    it('refuses a control value the synth cannot take, naming where it is', async () => {
      const res = await POST(
        turn({ panel: { values: { [cont.id]: cont.max + 1000 }, cables: [] } })
      );

      expect(res.status).toBe(400);
      const { error } = await json(res);
      expect(error?.details?.errors?.map((e) => e.path)).toEqual([`panel.values.${cont.id}`]);
      expect(streamChat).not.toHaveBeenCalled();
    });

    it('refuses a control id the synth does not have', async () => {
      const res = await POST(turn({ panel: { values: { 'no.such.knob': 1 }, cables: [] } }));

      expect(res.status).toBe(400);
      expect(streamChat).not.toHaveBeenCalled();
    });

    it('refuses a cable between jacks the synth does not have', async () => {
      const res = await POST(turn({ panel: { values: {}, cables: [['nowhere', 'nothing']] } }));

      expect(res.status).toBe(400);
      expect(streamChat).not.toHaveBeenCalled();
    });

    it('refuses a turn with no panel or no message', async () => {
      expect((await POST(post({ synthId: 'model-d', message: 'hi' }))).status).toBe(400);
      expect((await POST(post({ synthId: 'model-d', panel: PANEL, message: '  ' }))).status).toBe(
        400
      );
      expect(streamChat).not.toHaveBeenCalled();
    });
  });

  it('refuses a body declared over the cap from its Content-Length, before reading it', async () => {
    const res = await POST(
      post(
        { synthId: 'model-d', panel: PANEL, message: 'hi' },
        { 'Content-Length': String(MAX_TUTOR_BODY_BYTES + 1) }
      )
    );

    expect(res.status).toBe(413);
    expect((await json(res)).error?.code).toBe('TUTOR_REQUEST_TOO_LARGE');
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('says the tutor is unavailable when its agent is missing or switched off', async () => {
    db.agent = null;

    const res = await POST(turn());

    expect(res.status).toBe(503);
    expect((await json(res)).error?.code).toBe('TUTOR_UNAVAILABLE');
    expect(streamChat).not.toHaveBeenCalled();
  });

  describe('the daily allowance', () => {
    it('allows the 30th turn of the day', async () => {
      turnsUsed(tutorTurns(USER_ID, 29, TODAY));

      const res = await POST(turn());

      expect(res.status).toBe(200);
      expect(streamChat).toHaveBeenCalledTimes(1);
    });

    it('refuses the 31st turn with the friendly message, and the model is not called', async () => {
      turnsUsed(tutorTurns(USER_ID, 30, TODAY));

      const res = await POST(turn());

      expect(res.status).toBe(429);
      const { error } = await json(res);
      expect(error?.code).toBe('TUTOR_ALLOWANCE_SPENT');
      expect(error?.message).toBe(
        "That's all 30 of today's questions for the tutor. They come back at midnight UTC. The synth and everything else on the page still work."
      );
      expect(error?.details).toEqual({
        limit: 30,
        used: 30,
        remaining: 0,
        resetsAt: '2026-10-19T00:00:00.000Z',
      });
      expect(streamChat).not.toHaveBeenCalled();
    });

    it("counts only the caller's tutor turns today: someone else's full day, another agent's or the caller's own yesterday do not refuse them", async () => {
      turnsUsed([
        ...tutorTurns('another-user', 30, TODAY),
        ...tutorTurns(USER_ID, 30, TODAY, 'support-bot'),
        ...tutorTurns(USER_ID, 30, new Date('2026-10-17T09:00:00Z')),
      ]);

      const res = await POST(turn());

      expect(res.status).toBe(200);
    });
  });

  describe('the burst caps', () => {
    it('refuses the turn past the per-user chat cap in a minute, before reading the body', async () => {
      for (let i = 0; i < 10; i++) expect((await POST(turn())).status).toBe(200);

      // Not a valid body: the cap answers before it is read.
      const res = await POST(post({ nonsense: true }));

      expect(res.status).toBe(429);
      expect((await json(res)).error?.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(streamChat).toHaveBeenCalledTimes(10);
    });

    it("refuses the turn past the tutor's own per-minute limit when an admin has set one", async () => {
      db.agent = { id: AGENT_ID, rateLimitRpm: 2 };

      expect((await POST(turn())).status).toBe(200);
      expect((await POST(turn())).status).toBe(200);
      const res = await POST(turn());

      expect(res.status).toBe(429);
      expect(streamChat).toHaveBeenCalledTimes(2);
    });
  });
});
