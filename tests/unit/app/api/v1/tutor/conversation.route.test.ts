/**
 * GET /api/v1/tutor/conversation — the caller's latest tutor conversation on a synth, for the panel to carry on
 * (`f-tutor` t-56).
 *
 * Real `withAuth`; the conversations are an in-memory table that applies the read's filters the way the database
 * would, so a read that returned another person's conversation, another synth's, another agent's or an archived one
 * would show here.
 *
 * @see app/api/v1/tutor/conversation/route.ts
 * @see lib/app/tutor/conversation.ts
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import { GET } from '@/app/api/v1/tutor/conversation/route';
import { TRANSCRIPT_MESSAGES } from '@/lib/app/tutor/conversation';
import { createMockAuthSession } from '@/tests/helpers/auth';

const USER_ID = 'cmjbv4i3x00003wsloputgwul';

interface Message {
  id?: string;
  role: string;
  content: string;
  createdAt: Date;
  metadata?: unknown;
  capabilitySlug?: string;
}
interface Conversation {
  id: string;
  userId: string;
  contextType: string | null;
  contextId: string | null;
  isActive: boolean;
  agent: { slug: string; isActive: boolean; isSystem: boolean };
  createdAt: Date;
  messages: Message[];
}

const TUTOR = { slug: 'synth-tutor', isActive: true, isSystem: true };
const at = (minute: number) => new Date(Date.UTC(2026, 9, 18, 12, minute));

/** The caller's tutor conversation on Model D, unless overridden. */
const conversation = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'conv-mine',
  userId: USER_ID,
  contextType: 'synth',
  contextId: 'model-d',
  isActive: true,
  agent: TUTOR,
  createdAt: at(0),
  messages: [],
  ...over,
});

interface FindFirstArgs {
  where: {
    userId: string;
    contextType: string;
    contextId: string;
    isActive: boolean;
    agent: { slug: string; isActive: boolean; isSystem?: boolean };
  };
  orderBy: { createdAt: 'desc' };
  select: {
    messages: {
      where: {
        role: { in: string[] };
        OR: [{ NOT: { content: string } }, { metadata: { path: [string]; equals: string } }];
      };
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }];
      take: number;
    };
  };
}

/** `prisma.aiConversation.findFirst`, applying the filters, the order and the message selection as the database would. */
function table(rows: Conversation[]) {
  return {
    findFirst: async ({ where, orderBy, select }: FindFirstArgs) => {
      expect(orderBy).toEqual({ createdAt: 'desc' });
      const hit = rows
        .filter(
          (c) =>
            c.userId === where.userId &&
            c.contextType === where.contextType &&
            c.contextId === where.contextId &&
            c.isActive === where.isActive &&
            c.agent.slug === where.agent.slug &&
            c.agent.isActive === where.agent.isActive &&
            (where.agent.isSystem === undefined || c.agent.isSystem === where.agent.isSystem)
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (!hit) return null;
      const m = select.messages;
      expect(m.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      return {
        id: hit.id,
        messages: hit.messages
          .filter((x) => {
            const [notEmpty, ended] = m.where.OR;
            const meta = (x.metadata ?? {}) as Record<string, unknown>;
            return (
              m.where.role.in.includes(x.role) &&
              (x.content !== notEmpty.NOT.content ||
                meta[ended.metadata.path[0]] === ended.metadata.equals)
            );
          })
          .sort(
            (a, b) =>
              b.createdAt.getTime() - a.createdAt.getTime() ||
              (b.id ?? '').localeCompare(a.id ?? '')
          )
          .slice(0, m.take)
          .map(({ id, role, content, metadata, createdAt }) => ({
            id: id ?? '',
            role,
            content,
            metadata: metadata ?? null,
            createdAt,
          })),
      };
    },
  };
}

interface FindManyArgs {
  where: {
    conversationId: string;
    role: string;
    capabilitySlug: { in: string[] };
    createdAt?: { gte: Date };
  };
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }];
  take: number;
}
interface FindFirstMessageArgs {
  where: { conversationId: string; role: string; createdAt: { lte: Date } };
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }];
}

const newestFirst = (a: Message, b: Message) =>
  b.createdAt.getTime() - a.createdAt.getTime() || (b.id ?? '').localeCompare(a.id ?? '');

/** `prisma.aiMessage` over the same conversations' messages, applying the reads' filters and order. */
function messages(rows: Conversation[]) {
  const of = (id: string) => rows.filter((c) => c.id === id).flatMap((c) => c.messages);
  return {
    findFirst: async ({ where, orderBy }: FindFirstMessageArgs) => {
      expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      const hit = of(where.conversationId)
        .filter(
          (x) => x.role === where.role && x.createdAt.getTime() <= where.createdAt.lte.getTime()
        )
        .sort(newestFirst)[0];
      return hit ? { createdAt: hit.createdAt } : null;
    },
    findMany: async ({ where, orderBy, take }: FindManyArgs) => {
      expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      return of(where.conversationId)
        .filter(
          (x) =>
            x.role === where.role &&
            where.capabilitySlug.in.includes(x.capabilitySlug ?? '') &&
            (!where.createdAt || x.createdAt.getTime() >= where.createdAt.gte.getTime())
        )
        .sort(newestFirst)
        .slice(0, take)
        .map(({ id, role, content, createdAt, capabilitySlug }) => ({
          id: id ?? '',
          role,
          content,
          createdAt,
          capabilitySlug: capabilitySlug ?? null,
        }));
    },
  };
}

/** Both reads, over the same conversations. */
function serve(rows: Conversation[]) {
  mockPrisma.aiConversation = table(rows);
  mockPrisma.aiMessage = messages(rows);
}

const get = (synthId = 'model-d') =>
  GET(
    new NextRequest(
      `http://localhost:3000/api/v1/tutor/conversation?synthId=${encodeURIComponent(synthId)}`
    )
  );

beforeEach(() => {
  vi.clearAllMocks();
  const base = createMockAuthSession();
  mockGetSession.mockResolvedValue({
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID, userId: USER_ID },
    user: { ...base.user, id: USER_ID, role: 'USER' },
  });
  serve([]);
});

describe('GET /api/v1/tutor/conversation', () => {
  it("returns the caller's latest conversation on the synth, its questions and answers oldest first", async () => {
    serve([
      conversation({ id: 'conv-older', createdAt: at(0) }),
      conversation({
        id: 'conv-latest',
        createdAt: at(30),
        messages: [
          { role: 'user', content: 'Make it darker', createdAt: at(31) },
          { role: 'assistant', content: '', createdAt: at(32) },
          { role: 'tool', content: '{"success":true}', createdAt: at(33) },
          { role: 'assistant', content: 'Turn CUTOFF down.', createdAt: at(34) },
        ],
      }),
    ]);

    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        conversation: {
          conversationId: 'conv-latest',
          messages: [
            { role: 'user', content: 'Make it darker' },
            { role: 'assistant', content: 'Turn CUTOFF down.' },
          ],
        },
      },
    });
  });

  it("returns none of another person's, another synth's, another agent's or an archived one", async () => {
    serve([
      conversation({ id: 'theirs', userId: 'someone-else' }),
      conversation({ id: 'other-synth', contextId: 'pro-1' }),
      conversation({ id: 'other-agent', agent: { ...TUTOR, slug: 'beatbuddy' } }),
      conversation({ id: 'org-agent', agent: { ...TUTOR, isSystem: false } }),
      conversation({ id: 'tutor-off', agent: { ...TUTOR, isActive: false } }),
      conversation({ id: 'archived', isActive: false }),
    ]);

    const res = await get();

    expect(await res.json()).toEqual({ success: true, data: { conversation: null } });
    // the same table does answer for the synth one of them is on, so the nulls above are the filters'
    const other = await get('pro-1');
    expect((await other.json()).data.conversation.conversationId).toBe('other-synth');
  });

  it("says how an answer that did not finish ended, without Sunrise's marker text, and orders rows saved together by id", async () => {
    const MARKER = '[An error occurred and the response could not be completed.]';
    serve([
      conversation({
        messages: [
          { id: 'm01', role: 'user', content: 'Make it darker', createdAt: at(1) },
          {
            id: 'm02',
            role: 'assistant',
            content: MARKER,
            createdAt: at(2),
            metadata: { error: true, errorCode: 'http_500' },
          },
          { id: 'm03', role: 'user', content: 'Again?', createdAt: at(3) },
          {
            id: 'm04',
            role: 'assistant',
            content: MARKER,
            createdAt: at(4),
            metadata: { error: true, errorCode: 'aborted' },
          },
          { id: 'm05', role: 'user', content: 'Design a dub bass', createdAt: at(5) },
          // the cost cap stopped it before any text: kept, though empty
          {
            id: 'm06',
            role: 'assistant',
            content: '',
            createdAt: at(6),
            metadata: { endedReason: 'budget_exceeded' },
          },
          // an empty step with no marker is still left out
          { id: 'm07', role: 'assistant', content: '', createdAt: at(7) },
          { id: 'm08', role: 'user', content: 'Explain it', createdAt: at(8) },
          {
            id: 'm09',
            role: 'assistant',
            content: 'It starts with',
            createdAt: at(9),
            metadata: { endedReason: 'budget_exceeded' },
          },
          { id: 'm11', role: 'assistant', content: 'Second', createdAt: at(10) },
          { id: 'm10', role: 'assistant', content: 'First', createdAt: at(10) },
          {
            id: 'm12',
            role: 'assistant',
            content: 'Kept',
            createdAt: at(11),
            metadata: { error: false },
          },
        ],
      }),
    ]);

    const body = await (await get()).json();

    expect(body.data.conversation.messages).toEqual([
      { role: 'user', content: 'Make it darker' },
      { role: 'assistant', content: '', ended: 'failed' },
      { role: 'user', content: 'Again?' },
      { role: 'assistant', content: '', ended: 'stopped' },
      { role: 'user', content: 'Design a dub bass' },
      { role: 'assistant', content: '', ended: 'cost' },
      { role: 'user', content: 'Explain it' },
      { role: 'assistant', content: 'It starts with', ended: 'cost' },
      { role: 'assistant', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'assistant', content: 'Kept' },
    ]);
  });

  it("puts each turn's search results under the answer that followed them", async () => {
    const databank = {
      success: true,
      data: {
        results: [
          {
            kind: 'artists',
            id: 'vangelis',
            name: 'Vangelis',
            href: '/bank/artists/vangelis',
            about: 'composer',
            excerpt: 'Blade Runner.',
            related: [],
            matchedBy: ['lexical'],
          },
          // not a databank page: dropped
          { kind: 'artists', id: 'x', name: 'X', href: 'javascript:alert(1)' },
        ],
        search: 'lexical',
      },
    };
    const webResult = {
      success: true,
      data: { results: [{ title: 'CS-80', url: 'https://example.com/cs80', snippet: '' }] },
    };
    const failed = { success: false, error: { code: 'web_search_failed', message: 'No.' } };
    const tool = (id: string, minute: number, capabilitySlug: string, result: unknown) => ({
      id,
      role: 'tool',
      content: JSON.stringify(result),
      createdAt: at(minute),
      capabilitySlug,
    });
    serve([
      conversation({
        messages: [
          { id: 'm01', role: 'user', content: 'Who played the CS-80?', createdAt: at(1) },
          { id: 'm02', role: 'assistant', content: 'Let me look.', createdAt: at(2) },
          tool('m03', 3, 'search_databank', databank),
          tool('m04', 4, 'web_search', webResult),
          // another tool's result is not a source
          tool('m05', 4, 'describe_synth', databank),
          { id: 'm06', role: 'assistant', content: 'Vangelis did.', createdAt: at(5) },
          { id: 'm07', role: 'user', content: 'And who else?', createdAt: at(6) },
          tool('m08', 7, 'web_search', failed),
          { id: 'm09', role: 'assistant', content: 'From what I know…', createdAt: at(8) },
          { id: 'm10', role: 'user', content: 'What does CUTOFF do?', createdAt: at(9) },
          { id: 'm11', role: 'assistant', content: 'It darkens.', createdAt: at(10) },
          // stored as something that is not JSON: read as no result
          { ...tool('m12', 11, 'web_search', null), content: '{not json' },
        ],
      }),
    ]);

    const body = await (await get()).json();

    expect(body.data.conversation.messages).toEqual([
      { role: 'user', content: 'Who played the CS-80?' },
      { role: 'assistant', content: 'Let me look.' },
      {
        role: 'assistant',
        content: 'Vangelis did.',
        sources: [
          { type: 'databank', kind: 'artists', name: 'Vangelis', href: '/bank/artists/vangelis' },
          { type: 'web', title: 'CS-80', url: 'https://example.com/cs80' },
        ],
      },
      { role: 'user', content: 'And who else?' },
      // the search failed: no sources
      { role: 'assistant', content: 'From what I know…' },
      { role: 'user', content: 'What does CUTOFF do?' },
      { role: 'assistant', content: 'It darkens.' },
    ]);
  });

  it("keeps an answer's sources when the transcript opens on it, its question cut off", async () => {
    const found = {
      success: true,
      data: { results: [{ title: 'CS-80', url: 'https://example.com/cs80', snippet: '' }] },
    };
    // An answer, then enough questions and answers after it that only it and they fit.
    const later = Array.from({ length: TRANSCRIPT_MESSAGES - 1 }, (_, i) => ({
      id: `m${String(i + 10).padStart(3, '0')}`,
      role: i % 2 ? 'assistant' : 'user',
      content: `later ${i}`,
      createdAt: at(10 + i),
    }));
    serve([
      conversation({
        messages: [
          { id: 'm001', role: 'user', content: 'Who played the CS-80?', createdAt: at(1) },
          {
            id: 'm002',
            role: 'tool',
            content: JSON.stringify(found),
            createdAt: at(2),
            capabilitySlug: 'web_search',
          },
          { id: 'm003', role: 'assistant', content: 'Vangelis did.', createdAt: at(3) },
          ...later,
        ],
      }),
    ]);

    const body = await (await get()).json();

    const [first] = body.data.conversation.messages;
    expect(first).toEqual({
      role: 'assistant',
      content: 'Vangelis did.',
      sources: [{ type: 'web', title: 'CS-80', url: 'https://example.com/cs80' }],
    });
  });

  it(`returns the last ${TRANSCRIPT_MESSAGES} messages of a long conversation`, async () => {
    const messages = Array.from({ length: TRANSCRIPT_MESSAGES + 10 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `message ${i}`,
      createdAt: at(i),
    }));
    serve([conversation({ messages })]);

    const body = await (await get()).json();

    const got = body.data.conversation.messages as { content: string }[];
    expect(got).toHaveLength(TRANSCRIPT_MESSAGES);
    expect(got[0].content).toBe('message 10');
    expect(got.at(-1)?.content).toBe(`message ${TRANSCRIPT_MESSAGES + 9}`);
  });

  it('refuses a synth id that is not one, and a caller with no session', async () => {
    expect((await get('Model D!')).status).toBe(400);

    mockGetSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });
});
