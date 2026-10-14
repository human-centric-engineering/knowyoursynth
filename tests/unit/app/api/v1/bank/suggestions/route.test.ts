/**
 * Unit Tests: synth suggestions (`f-databank` t-37), the user's route and the admin queue.
 *
 * Real routes, real `withAuth` / `withAdminAuth`, the real `lib/app/bank/suggestions.ts` and, for an accept, the real
 * databank create path over the stateful fake of its tables (`tests/helpers/bank-store.ts`). The suggestions table is
 * a small stateful fake here that honours the conditional update a decision relies on. Pins:
 *
 * - suggesting needs a session, is validated, is stored under the caller's id, and is capped per user (the 429);
 * - the queue and its decisions are admin only;
 * - accept creates the instrument the public read layer then serves, and audits both the instrument and the decision;
 * - a refused accept (an id taken, a reference broken) leaves the suggestion pending and audits nothing;
 * - merge needs an instrument the databank holds; decline needs a reason;
 * - a suggestion is decided once, including when two admins decide it at the same moment.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

const mockPrisma = vi.hoisted((): Record<string, unknown> => ({}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

const mockLogAdminAction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/orchestration/audit/admin-audit-logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orchestration/audit/admin-audit-logger')>()),
  logAdminAction: mockLogAdminAction,
}));

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import { POST as suggest } from '@/app/api/v1/bank/suggestions/route';
import { GET as listQueue } from '@/app/api/v1/admin/bank/suggestions/route';
import { POST as decide } from '@/app/api/v1/admin/bank/suggestions/[id]/route';
import { suggestionLimiter, suggestionLimitKey } from '@/lib/app/bank/suggestions';
import { getBankDetail } from '@/lib/app/bank/read';
import { createMockAuthSession } from '@/tests/helpers/auth';
import { bankStore, type BankStore } from '@/tests/helpers/bank-store';

type Row = Record<string, unknown>;

function session(role: 'USER' | 'ADMIN', id = role === 'ADMIN' ? 'admin-1' : 'user-1') {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID, userId: id },
    user: { ...base.user, id, role },
  };
}

function request(method: string, url: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest;
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: Row & Row[];
    error?: {
      code: string;
      message: string;
      details?: { errors?: { path: string; message: string }[] };
    };
  };
}
const auditActions = () =>
  mockLogAdminAction.mock.calls.map(([e]) => (e as { action: string }).action);

/** The suggestions table in memory: what `lib/app/bank/suggestions.ts` calls, with `updateMany` honouring its filter. */
function suggestionTable() {
  const rows: Row[] = [];
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  let n = 0;
  return {
    rows,
    client: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: `sug-${++n}`,
          status: 'PENDING',
          instrumentId: null,
          reason: null,
          decidedAt: null,
          createdAt: new Date(Date.UTC(2026, 9, 14, 0, n)),
          updatedAt: new Date(),
          link: null,
          note: null,
          ...data,
        };
        rows.push(row);
        return { ...row };
      }),
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) =>
        rows
          .filter((r) => matches(r, where))
          .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
          .map((r) => ({ ...r }))
      ),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = rows.find((r) => matches(r, where));
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      }),
    },
  };
}

let store: BankStore;
let suggestions: ReturnType<typeof suggestionTable>;
const suggestion = (id: string) => suggestions.rows.find((r) => r.id === id);

async function suggestOne(body: Row = { name: 'Prophet-5 Rev4', maker: 'Sequential' }) {
  mockGetSession.mockResolvedValue(session('USER'));
  const res = await suggest(request('POST', '/api/v1/bank/suggestions', body));
  mockGetSession.mockResolvedValue(session('ADMIN'));
  return (await json(res)).data?.id as string;
}

const decision = (id: string, body: unknown) =>
  decide(request('POST', `/api/v1/admin/bank/suggestions/${id}`, body), ctx(id));

const NEW_INSTRUMENT = {
  id: 'sequential-prophet-5-rev4',
  name: 'Prophet-5 Rev4',
  maker: 'Sequential',
  year: '2020',
  kind: 'poly',
  text: 'A reissue of the 1978 Prophet-5.',
};

beforeEach(() => {
  vi.clearAllMocks();
  suggestionLimiter.reset(suggestionLimitKey('user-1'));
  store = bankStore();
  suggestions = suggestionTable();
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, store.client, {
    synthSuggestion: suggestions.client,
    user: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.includes('user-1') ? [{ id: 'user-1', name: 'Dana Owner' }] : []
      ),
    },
    orgMembership: {
      findUnique: vi.fn(async () => ({ role: 'OWNER', org: { status: 'ACTIVE' } })),
    },
    aiApiKey: { findFirst: vi.fn(async () => null), update: vi.fn() },
  });
  mockGetSession.mockResolvedValue(session('USER'));
});

describe('POST /api/v1/bank/suggestions', () => {
  it('refuses a visitor without a session and stores nothing', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await suggest(
      request('POST', '/api/v1/bank/suggestions', { name: 'X', maker: 'Y' })
    );
    expect(res.status).toBe(401);
    expect(suggestions.rows).toEqual([]);
  });

  it("stores a suggestion under the caller's id, pending, and returns it", async () => {
    const res = await suggest(
      request('POST', '/api/v1/bank/suggestions', {
        name: '  Prophet-5 Rev4 ',
        maker: 'Sequential',
        link: 'https://sequential.com/product/prophet-5/',
        note: 'The 2020 reissue.',
        userId: 'someone-else',
      })
    );
    expect(res.status).toBe(201);
    expect((await json(res)).data).toMatchObject({ name: 'Prophet-5 Rev4', status: 'PENDING' });
    expect(suggestions.rows).toHaveLength(1);
    expect(suggestions.rows[0]).toMatchObject({
      userId: 'user-1',
      name: 'Prophet-5 Rev4',
      maker: 'Sequential',
      link: 'https://sequential.com/product/prophet-5/',
      note: 'The 2020 reissue.',
      status: 'PENDING',
    });
  });

  it('refuses a missing name or a link that is not a web address, and stores nothing', async () => {
    const noName = await suggest(request('POST', '/api/v1/bank/suggestions', { maker: 'Korg' }));
    const badLink = await suggest(
      request('POST', '/api/v1/bank/suggestions', {
        name: 'MS-20',
        maker: 'Korg',
        link: 'javascript:alert(1)',
      })
    );
    expect([noName.status, badLink.status]).toEqual([400, 400]);
    expect(suggestions.rows).toEqual([]);
  });

  it('caps a user at ten an hour: the eleventh is a 429 with rate-limit headers and is not stored', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await suggest(
        request('POST', '/api/v1/bank/suggestions', { name: `Synth ${i}`, maker: 'Korg' })
      );
      expect(res.status).toBe(201);
    }
    const res = await suggest(
      request('POST', '/api/v1/bank/suggestions', { name: 'One more', maker: 'Korg' })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(suggestions.rows).toHaveLength(10);

    // The cap is per user: another account is not held back by this one.
    mockGetSession.mockResolvedValue(session('USER', 'user-2'));
    const other = await suggest(
      request('POST', '/api/v1/bank/suggestions', { name: 'Minilogue', maker: 'Korg' })
    );
    expect(other.status).toBe(201);
    suggestionLimiter.reset(suggestionLimitKey('user-2'));
  });
});

describe('the admin queue', () => {
  it('is admin only, for reads and decisions, and decides nothing for a non-admin', async () => {
    const id = await suggestOne();
    mockGetSession.mockResolvedValue(session('USER'));
    const responses = [
      await listQueue(request('GET', '/api/v1/admin/bank/suggestions')),
      await decision(id, { action: 'decline', reason: 'no' }),
    ];
    expect(responses.map((r) => r.status)).toEqual([403, 403]);
    expect(suggestion(id)?.status).toBe('PENDING');
  });

  it('lists by status, newest first, naming the suggester or null once they are erased', async () => {
    const first = await suggestOne({ name: 'MS-20', maker: 'Korg' });
    const second = await suggestOne({ name: 'OB-6', maker: 'Sequential' });
    const erased = await suggestOne({ name: 'Juno-60', maker: 'Roland' });
    suggestions.rows.find((r) => r.id === erased)!.userId = null;
    await decision(first, { action: 'decline', reason: 'Not enough to go on' });

    const pending = await json(
      await listQueue(request('GET', '/api/v1/admin/bank/suggestions?status=PENDING'))
    );
    expect(pending.data?.map((s: Row) => [s.id, s.suggestedBy])).toEqual([
      [erased, null],
      [second, 'Dana Owner'],
    ]);

    const all = await json(await listQueue(request('GET', '/api/v1/admin/bank/suggestions')));
    expect(all.data).toHaveLength(3);

    const bad = await listQueue(request('GET', '/api/v1/admin/bank/suggestions?status=NOPE'));
    expect(bad.status).toBe(400);
  });
});

describe('accept', () => {
  it('creates the instrument through the databank, which then serves it, and audits both', async () => {
    const id = await suggestOne();
    const res = await decision(id, { action: 'accept', instrument: NEW_INSTRUMENT });

    expect(res.status).toBe(200);
    expect((await json(res)).data).toMatchObject({
      status: 'ACCEPTED',
      instrumentId: NEW_INSTRUMENT.id,
    });
    expect(suggestion(id)).toMatchObject({
      status: 'ACCEPTED',
      instrumentId: NEW_INSTRUMENT.id,
    });
    expect(suggestion(id)?.decidedAt).toBeInstanceOf(Date);

    const detail = await getBankDetail('instruments', NEW_INSTRUMENT.id);
    expect(detail).toMatchObject({ instrument: { name: 'Prophet-5 Rev4', maker: 'Sequential' } });
    expect(
      store.tables.bankInstrument.find((r) => r.id === NEW_INSTRUMENT.id)?.editedAt
    ).toBeInstanceOf(Date);

    expect(auditActions()).toEqual(['bank_instrument.create', 'synth_suggestion.accept']);
    const entry = mockLogAdminAction.mock.calls[1][0] as Row;
    expect(entry).toMatchObject({
      userId: 'admin-1',
      entityType: 'synth_suggestion',
      entityId: id,
      entityName: 'Prophet-5 Rev4',
      changes: {
        status: { from: 'PENDING', to: 'ACCEPTED' },
        instrumentId: { from: null, to: NEW_INSTRUMENT.id },
      },
    });
  });

  it('leaves the suggestion pending, and audits nothing, when the id is taken', async () => {
    const id = await suggestOne();
    const taken = String(store.tables.bankInstrument[0].id);
    const before = store.tables.bankInstrument.length;

    const res = await decision(id, {
      action: 'accept',
      instrument: { ...NEW_INSTRUMENT, id: taken },
    });

    expect(res.status).toBe(409);
    expect(suggestion(id)).toMatchObject({
      status: 'PENDING',
      instrumentId: null,
      decidedAt: null,
    });
    expect(store.tables.bankInstrument).toHaveLength(before);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('leaves the suggestion pending when the instrument would break a reference, naming it', async () => {
    const id = await suggestOne();
    const res = await decision(id, {
      action: 'accept',
      instrument: { ...NEW_INSTRUMENT, recreationOf: 'no-such-original' },
    });

    expect(res.status).toBe(400);
    const messages = ((await json(res)).error?.details?.errors ?? []).map((e) => e.message);
    expect(messages.join(' ')).toContain('no-such-original');
    expect(suggestion(id)?.status).toBe('PENDING');
    expect(store.tables.bankInstrument.some((r) => r.id === NEW_INSTRUMENT.id)).toBe(false);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('refuses an instrument that does not fit the databank shape before touching the suggestion', async () => {
    const id = await suggestOne();
    const res = await decision(id, {
      action: 'accept',
      instrument: { ...NEW_INSTRUMENT, id: 'Not An Id', kind: 'drum machine' },
    });
    expect(res.status).toBe(400);
    expect(suggestions.client.updateMany).not.toHaveBeenCalled();
  });
});

describe('merge and decline', () => {
  it('merges into an instrument the databank holds', async () => {
    const id = await suggestOne();
    const existing = String(store.tables.bankInstrument[0].id);
    const res = await decision(id, { action: 'merge', instrumentId: existing });

    expect(res.status).toBe(200);
    expect(suggestion(id)).toMatchObject({ status: 'MERGED', instrumentId: existing });
    expect(auditActions()).toEqual(['synth_suggestion.merge']);
  });

  it('refuses a merge into an instrument the databank does not hold, leaving it pending', async () => {
    const id = await suggestOne();
    const res = await decision(id, { action: 'merge', instrumentId: 'no-such-synth' });

    expect(res.status).toBe(400);
    expect(suggestion(id)?.status).toBe('PENDING');
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('declines with the reason kept, and refuses a decline without one', async () => {
    const id = await suggestOne();
    const empty = await decision(id, { action: 'decline', reason: '   ' });
    expect(empty.status).toBe(400);
    expect(suggestion(id)?.status).toBe('PENDING');

    const res = await decision(id, { action: 'decline', reason: 'A drum machine, not a synth' });
    expect(res.status).toBe(200);
    expect(suggestion(id)).toMatchObject({
      status: 'DECLINED',
      reason: 'A drum machine, not a synth',
      instrumentId: null,
    });
    expect(auditActions()).toEqual(['synth_suggestion.decline']);
  });
});

describe('a suggestion is decided once', () => {
  it('refuses a second decision with a 409 and changes nothing', async () => {
    const id = await suggestOne();
    await decision(id, { action: 'decline', reason: 'Duplicate' });
    mockLogAdminAction.mockClear();

    const res = await decision(id, { action: 'accept', instrument: NEW_INSTRUMENT });
    expect(res.status).toBe(409);
    expect(suggestion(id)).toMatchObject({ status: 'DECLINED', reason: 'Duplicate' });
    expect(store.tables.bankInstrument.some((r) => r.id === NEW_INSTRUMENT.id)).toBe(false);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('lets only one of two simultaneous decisions win', async () => {
    const id = await suggestOne();
    const existing = String(store.tables.bankInstrument[0].id);
    const [a, b] = await Promise.all([
      decision(id, { action: 'decline', reason: 'Duplicate' }),
      decision(id, { action: 'merge', instrumentId: existing }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(auditActions()).toHaveLength(1);
    const won = a.status === 200 ? 'DECLINED' : 'MERGED';
    expect(suggestion(id)?.status).toBe(won);
  });

  it('is a 404 for a suggestion that does not exist', async () => {
    mockGetSession.mockResolvedValue(session('ADMIN'));
    const res = await decision('nope', { action: 'decline', reason: 'x' });
    expect(res.status).toBe(404);
  });
});
