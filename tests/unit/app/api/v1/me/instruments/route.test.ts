/**
 * Unit Tests: the synths a signed-in user owns and wants (`f-profiles` r2), `/api/v1/me/instruments`.
 *
 * Real routes, real `withAuth`, the real `lib/app/profile/instruments.ts`. The table is a small stateful fake keyed the
 * way the schema keys it (one row per user and instrument), joined to a databank of three instruments, so a query that
 * forgot the owner would reach another user's row here too. Pins:
 *
 * - every route needs a session;
 * - an instrument goes on the end of one list, once; on the other list already, it is refused and pointed at moving;
 * - an instrument the databank does not have is refused, storing nothing;
 * - moving between the lists is an update, to the end of the other list;
 * - a list is reordered only as a whole: one that changed meanwhile is refused, storing nothing;
 * - a list is capped;
 * - another user's entry cannot be moved, removed or reordered, and is never listed.
 *
 * What a unit test cannot prove, because it has no database, is in `npm run smoke:profile`: the unique key, the
 * cascades from the instrument and through `eraseUser`, and the export.
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

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import { GET as list, POST as add } from '@/app/api/v1/me/instruments/route';
import { PATCH as move, DELETE as remove } from '@/app/api/v1/me/instruments/[instrumentId]/route';
import { PUT as reorder } from '@/app/api/v1/me/instruments/order/route';
import { MAX_PER_LIST } from '@/lib/app/profile/instruments-data';
import { createMockAuthSession } from '@/tests/helpers/auth';

type Row = {
  userId: string;
  instrumentId: string;
  kind: 'owned' | 'wishlist';
  position: number;
  createdAt: Date;
};

function session(id: string) {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID, userId: id },
    user: { ...base.user, id, role: 'USER' },
  };
}
const signIn = (id: string) => mockGetSession.mockResolvedValue(session(id));

function request(method: string, url: string, body?: unknown) {
  const req = new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest;
}
const of = (instrumentId: string) => ({ params: Promise.resolve({ instrumentId }) });

interface Answer {
  success: boolean;
  data?: {
    instrumentId?: string;
    kind?: string;
    name?: string;
    owned?: { instrumentId: string }[];
    wishlist?: { instrumentId: string }[];
  };
  error?: { code: string; message: string; details?: Record<string, unknown> };
}
const json = async (res: Response) => JSON.parse(await res.text()) as Answer;

const BANK: Record<string, { name: string; maker: string; year: string }> = {
  'moog-minimoog': { name: 'Minimoog', maker: 'Moog', year: '1970' },
  'roland-juno-60': { name: 'Juno-60', maker: 'Roland', year: '1982' },
  'korg-ms-20': { name: 'MS-20', maker: 'Korg', year: '1978' },
};

let rows: Row[];
let clock: number;

const keyOf = (where: { userId_instrumentId: { userId: string; instrumentId: string } }) =>
  where.userId_instrumentId;
const find = (userId: string, instrumentId: string) =>
  rows.find((r) => r.userId === userId && r.instrumentId === instrumentId);
const matches = (r: Row, where: Partial<Row>) =>
  Object.entries(where).every(([k, v]) => r[k as keyof Row] === v);
const joined = (r: Row) => ({
  ...r,
  instrument: BANK[r.instrumentId],
});
const ordered = (list: Row[]) =>
  [...list].sort(
    (a, b) =>
      a.position - b.position ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.instrumentId.localeCompare(b.instrumentId)
  );

const ownedInstrument = {
  findUnique: vi.fn(async ({ where }: { where: Parameters<typeof keyOf>[0] }) => {
    const { userId, instrumentId } = keyOf(where);
    const row = find(userId, instrumentId);
    return row ? joined(row) : null;
  }),
  findMany: vi.fn(async ({ where }: { where: Partial<Row> }) =>
    ordered(rows.filter((r) => matches(r, where))).map(joined)
  ),
  aggregate: vi.fn(async ({ where }: { where: Partial<Row> }) => {
    const hit = rows.filter((r) => matches(r, where));
    return {
      _count: { _all: hit.length },
      _max: { position: hit.length ? Math.max(...hit.map((r) => r.position)) : null },
    };
  }),
  create: vi.fn(async ({ data }: { data: Omit<Row, 'createdAt'> }) => {
    if (!BANK[data.instrumentId]) throw Object.assign(new Error('fk'), { code: 'P2003' });
    if (find(data.userId, data.instrumentId))
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    const row = { ...data, createdAt: new Date(clock++) };
    rows.push(row);
    return joined(row);
  }),
  updateMany: vi.fn(async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
    const hit = rows.filter((r) => matches(r, where));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  }),
  update: vi.fn(
    async ({ where, data }: { where: Parameters<typeof keyOf>[0]; data: Partial<Row> }) => {
      const { userId, instrumentId } = keyOf(where);
      const row = find(userId, instrumentId);
      if (!row) throw Object.assign(new Error('missing'), { code: 'P2025' });
      Object.assign(row, data);
      return joined(row);
    }
  ),
  deleteMany: vi.fn(async ({ where }: { where: Partial<Row> }) => {
    const before = rows.length;
    rows = rows.filter((r) => !matches(r, where));
    return { count: before - rows.length };
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  clock = 1_000;
  Object.assign(mockPrisma, {
    ownedInstrument,
    bankInstrument: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        BANK[where.id] ? { id: where.id } : null
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
  });
  signIn('user-1');
});

const listOf = async () => (await json(await list(request('GET', '/api/v1/me/instruments')))).data!;
const ids = (entries: { instrumentId: string }[] | undefined) =>
  (entries ?? []).map((e) => e.instrumentId);
const post = (instrumentId: string, kind: string) =>
  add(request('POST', '/api/v1/me/instruments', { instrumentId, kind }));

describe('a session is required', () => {
  it('refuses every route without one, and touches nothing', async () => {
    mockGetSession.mockResolvedValue(null);
    const answers = await Promise.all([
      list(request('GET', '/api/v1/me/instruments')),
      post('moog-minimoog', 'owned'),
      move(
        request('PATCH', '/api/v1/me/instruments/moog-minimoog', { kind: 'owned' }),
        of('moog-minimoog')
      ),
      remove(request('DELETE', '/api/v1/me/instruments/moog-minimoog'), of('moog-minimoog')),
      reorder(request('PUT', '/api/v1/me/instruments/order', { kind: 'owned', instrumentIds: [] })),
    ]);
    expect(answers.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    expect(ownedInstrument.findMany).not.toHaveBeenCalled();
    expect(ownedInstrument.create).not.toHaveBeenCalled();
  });
});

describe('adding', () => {
  it('puts each instrument at the end of its list, with its databank name', async () => {
    const first = await post('moog-minimoog', 'owned');
    expect(first.status).toBe(201);
    expect((await json(first)).data).toMatchObject({
      instrumentId: 'moog-minimoog',
      kind: 'owned',
      name: 'Minimoog',
      maker: 'Moog',
      year: '1970',
    });
    await post('korg-ms-20', 'owned');
    await post('roland-juno-60', 'wishlist');

    const lists = await listOf();
    expect(ids(lists.owned)).toEqual(['moog-minimoog', 'korg-ms-20']);
    expect(ids(lists.wishlist)).toEqual(['roland-juno-60']);
    expect(rows.map((r) => [r.instrumentId, r.position])).toEqual([
      ['moog-minimoog', 0],
      ['korg-ms-20', 1],
      ['roland-juno-60', 0],
    ]);
  });

  it('returns the entry it has when it is already on that list, adding no second row', async () => {
    await post('moog-minimoog', 'owned');
    const again = await post('moog-minimoog', 'owned');
    expect(again.status).toBe(200);
    expect((await json(again)).data).toMatchObject({ instrumentId: 'moog-minimoog' });
    expect(rows).toHaveLength(1);
  });

  it('refuses one already on the other list, pointing at moving it, and changes nothing', async () => {
    await post('moog-minimoog', 'wishlist');
    const res = await post('moog-minimoog', 'owned');
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error?.message).toBe('Minimoog is already on your wishlist. Move it instead.');
    expect(body.error?.details).toMatchObject({ reason: 'on-other-list', kind: 'wishlist' });
    expect(rows).toEqual([expect.objectContaining({ kind: 'wishlist' })]);
  });

  it('answers a lost race as if the other request had come first', async () => {
    // The other request writes between this one's read and its create.
    ownedInstrument.findUnique.mockImplementationOnce(async () => null);
    rows.push({
      userId: 'user-1',
      instrumentId: 'moog-minimoog',
      kind: 'wishlist',
      position: 0,
      createdAt: new Date(1),
    });
    const res = await post('moog-minimoog', 'owned');
    expect(res.status).toBe(409);
    expect(rows).toHaveLength(1);
  });

  it('refuses an instrument the databank does not have, and a bad body, storing nothing', async () => {
    const unknown = await post('moog-nothing', 'owned');
    expect(unknown.status).toBe(400);
    expect((await json(unknown)).error?.code).toBe('VALIDATION_ERROR');
    expect((await post('Moog Minimoog', 'owned')).status).toBe(400);
    expect((await post('moog-minimoog', 'borrowed')).status).toBe(400);
    expect(
      (
        await add(
          request('POST', '/api/v1/me/instruments', {
            instrumentId: 'moog-minimoog',
            kind: 'owned',
            userId: 'user-2',
          })
        )
      ).status
    ).toBe(400);
    expect(rows).toEqual([]);
  });

  it('refuses one removed from the databank between the check and the write', async () => {
    (mockPrisma.bankInstrument as { findUnique: ReturnType<typeof vi.fn> }).findUnique
      // It was there when checked.
      .mockResolvedValueOnce({ id: 'moog-gone' });
    const res = await post('moog-gone', 'owned');
    expect(res.status).toBe(400);
    expect(rows).toEqual([]);
  });

  it(`refuses a list's ${MAX_PER_LIST + 1}st synth, with the remedy`, async () => {
    for (let i = 0; i < MAX_PER_LIST; i++)
      rows.push({
        userId: 'user-1',
        instrumentId: `x-${i}`,
        kind: 'owned',
        position: i,
        createdAt: new Date(i),
      });
    const res = await post('moog-minimoog', 'owned');
    expect(res.status).toBe(409);
    expect((await json(res)).error?.message).toBe(
      `You can list up to ${MAX_PER_LIST} synths you own. Remove one to add another.`
    );
    // The other list is not full.
    expect((await post('moog-minimoog', 'wishlist')).status).toBe(201);
  });
});

describe('moving', () => {
  it('moves an instrument to the end of the other list, as an update', async () => {
    await post('moog-minimoog', 'owned');
    await post('korg-ms-20', 'owned');
    await post('roland-juno-60', 'wishlist');

    const res = await move(
      request('PATCH', '/api/v1/me/instruments/roland-juno-60', { kind: 'owned' }),
      of('roland-juno-60')
    );
    expect(res.status).toBe(200);
    expect((await json(res)).data).toMatchObject({ instrumentId: 'roland-juno-60', kind: 'owned' });

    const lists = await listOf();
    expect(ids(lists.owned)).toEqual(['moog-minimoog', 'korg-ms-20', 'roland-juno-60']);
    expect(ids(lists.wishlist)).toEqual([]);
    expect(ownedInstrument.create).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(3);
  });

  it('leaves one already on that list where it is', async () => {
    await post('moog-minimoog', 'owned');
    await post('korg-ms-20', 'owned');
    const res = await move(
      request('PATCH', '/api/v1/me/instruments/moog-minimoog', { kind: 'owned' }),
      of('moog-minimoog')
    );
    expect(res.status).toBe(200);
    expect(ids((await listOf()).owned)).toEqual(['moog-minimoog', 'korg-ms-20']);
  });

  it('refuses a bad kind', async () => {
    await post('moog-minimoog', 'owned');
    const res = await move(
      request('PATCH', '/api/v1/me/instruments/moog-minimoog', { kind: 'sold' }),
      of('moog-minimoog')
    );
    expect(res.status).toBe(400);
    expect(rows[0].kind).toBe('owned');
  });
});

describe('reordering', () => {
  beforeEach(async () => {
    await post('moog-minimoog', 'owned');
    await post('korg-ms-20', 'owned');
    await post('roland-juno-60', 'owned');
  });
  const put = (body: unknown) => reorder(request('PUT', '/api/v1/me/instruments/order', body));

  it('stores the new order and answers both lists', async () => {
    const res = await put({
      kind: 'owned',
      instrumentIds: ['roland-juno-60', 'moog-minimoog', 'korg-ms-20'],
    });
    expect(res.status).toBe(200);
    expect(ids((await json(res)).data?.owned)).toEqual([
      'roland-juno-60',
      'moog-minimoog',
      'korg-ms-20',
    ]);
    expect(ids((await listOf()).owned)).toEqual(['roland-juno-60', 'moog-minimoog', 'korg-ms-20']);
  });

  it('refuses a list that changed since it was read, or names one twice, storing nothing', async () => {
    const short = await put({ kind: 'owned', instrumentIds: ['korg-ms-20', 'moog-minimoog'] });
    expect(short.status).toBe(409);
    expect((await json(short)).error?.details).toMatchObject({ reason: 'stale' });
    const stranger = await put({
      kind: 'wishlist',
      instrumentIds: ['moog-minimoog'],
    });
    expect(stranger.status).toBe(409);
    const twice = await put({
      kind: 'owned',
      instrumentIds: ['korg-ms-20', 'korg-ms-20', 'moog-minimoog'],
    });
    expect(twice.status).toBe(400);
    expect(ownedInstrument.update).not.toHaveBeenCalled();
    expect(ids((await listOf()).owned)).toEqual(['moog-minimoog', 'korg-ms-20', 'roland-juno-60']);
  });
});

describe('owner-scoped', () => {
  beforeEach(async () => {
    await post('moog-minimoog', 'owned');
    signIn('user-2');
  });

  it('lists none of another user’s entries', async () => {
    const lists = await listOf();
    expect(lists).toEqual({ owned: [], wishlist: [] });
    expect(ownedInstrument.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { userId: 'user-2' } })
    );
  });

  it('answers another user’s entry as a 404, and leaves it alone', async () => {
    const moved = await move(
      request('PATCH', '/api/v1/me/instruments/moog-minimoog', { kind: 'wishlist' }),
      of('moog-minimoog')
    );
    expect(moved.status).toBe(404);
    const removed = await remove(
      request('DELETE', '/api/v1/me/instruments/moog-minimoog'),
      of('moog-minimoog')
    );
    expect(removed.status).toBe(404);
    const reordered = await reorder(
      request('PUT', '/api/v1/me/instruments/order', {
        kind: 'owned',
        instrumentIds: ['moog-minimoog'],
      })
    );
    expect(reordered.status).toBe(409);
    expect(rows).toEqual([
      expect.objectContaining({ userId: 'user-1', instrumentId: 'moog-minimoog', kind: 'owned' }),
    ]);
  });

  it('lets the owner remove it, and then it is a 404', async () => {
    signIn('user-1');
    const res = await remove(
      request('DELETE', '/api/v1/me/instruments/moog-minimoog'),
      of('moog-minimoog')
    );
    expect(res.status).toBe(200);
    expect(rows).toEqual([]);
    const again = await remove(
      request('DELETE', '/api/v1/me/instruments/moog-minimoog'),
      of('moog-minimoog')
    );
    expect(again.status).toBe(404);
  });

  it('answers an id that is not an instrument id as a 404', async () => {
    const res = await remove(request('DELETE', '/api/v1/me/instruments/x'), of('Not An Id'));
    expect(res.status).toBe(404);
  });

  it('lets the same synth be on two users’ lists', async () => {
    expect((await post('moog-minimoog', 'wishlist')).status).toBe(201);
    expect(rows.map((r) => [r.userId, r.kind])).toEqual([
      ['user-1', 'owned'],
      ['user-2', 'wishlist'],
    ]);
  });
});
