/**
 * Unit Tests: reporting shared sounds and moderating them (`f-sharing` h4).
 *
 * `POST /api/v1/public/sounds/:slug/report`, `GET /api/v1/admin/sounds` and `POST /api/v1/admin/sounds/:id`. Real
 * routes, real `withAuth` / `withAdminAuth`, the real `reports.ts` and `moderation.ts`. The user sounds and reports
 * tables are small stateful fakes that honour the filters the code relies on (`in`, `not`, the `sound` relation) and
 * **project each read to its `select`**, the nested `reports` one included, so a queue read that asked for the reporter
 * would carry it here too. Pins:
 *
 * - reporting needs a session; your own sound is a 400; one nobody else can open is a 404; nothing is stored for either;
 * - one open report per person per sound, a second updates it, under a lock on the sound's row;
 * - the per-user sub-cap returns a 429;
 * - the queue and its actions are admin only; the queue never carries who reported a sound;
 * - unlist, restore and dismiss each change what they say, close the reports they should, write an audit entry, and are
 *   a 409 with nothing audited when there is nothing to change.
 *
 * What an unlisted sound does to the public reads and its owner's writes is pinned in `sharing.test.ts` and
 * `published-sounds.test.ts`.
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

import { POST as report } from '@/app/api/v1/public/sounds/[slug]/report/route';
import { GET as listQueue } from '@/app/api/v1/admin/sounds/route';
import { POST as moderate } from '@/app/api/v1/admin/sounds/[id]/route';
import { reportLimiter, reportLimitKey } from '@/lib/app/sounds/reports';
import { createMockAuthSession } from '@/tests/helpers/auth';

type Row = Record<string, unknown>;

function session(role: 'USER' | 'ADMIN', id: string) {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID, userId: id },
    user: { ...base.user, id, role },
  };
}
const signIn = (id: string, role: 'USER' | 'ADMIN' = 'USER') =>
  mockGetSession.mockResolvedValue(session(role, id));

function request(method: string, url: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest;
}

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: Row & Row[];
    error?: { code: string; message: string };
  };
}

/** One field of a Prisma `where`: a value, or `{ in }`, `{ not }`. */
function fieldMatches(value: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as { in?: unknown[]; not?: unknown };
    if (c.in && !c.in.includes(value)) return false;
    if ('not' in c && value === c.not) return false;
    return true;
  }
  return value === cond;
}

const sounds: Row[] = [];
const reports: Row[] = [];
let n = 0;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 17, 12, minute));

/** A report matches its own fields, and `sound` as a filter on the sound it is about. */
function reportMatches(r: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) =>
    k === 'sound'
      ? soundMatches(
          sounds.find((s) => s.id === r.soundId)!,
          v as Row
        )
      : fieldMatches(r[k], v)
  );
}
const soundMatches = (s: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) => fieldMatches(s[k], v));

/** A row as a `select` reads it: only the keys asked for; a nested relation read by its own `where` and `select`. */
function project(
  row: Row,
  select: Row | undefined,
  relations: Record<string, () => Row[]> = {}
): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [key, want] of Object.entries(select)) {
    if (!want) continue;
    if (key in relations) {
      const nested = want as { where?: Row; select?: Row };
      out[key] = relations[key]()
        .filter((r) => reportMatches(r, nested.where))
        .sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())
        .map((r) => project(r, nested.select));
    } else if (key === 'sound' && typeof want === 'object') {
      out.sound = project(
        sounds.find((s) => s.id === row.soundId)!,
        (want as { select: Row }).select
      );
    } else out[key] = row[key];
  }
  return out;
}

const sortBy = (rows: Row[], key: string, dir: 'asc' | 'desc') =>
  [...rows].sort((a, b) => {
    const d = (a[key] as Date).getTime() - (b[key] as Date).getTime();
    return dir === 'asc' ? d : -d;
  });

const lockQuery = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  sounds.length = 0;
  reports.length = 0;
  reportLimiter.reset(reportLimitKey('user-1'));

  mockPrisma.userSound = {
    findUnique: vi.fn(async ({ where, select }: { where: Row; select?: Row }) => {
      const row = sounds.find((s) => soundMatches(s, where));
      return row ? project(row, select) : null;
    }),
    findMany: vi.fn(
      async ({
        where,
        orderBy,
        select,
      }: {
        where: Row;
        orderBy?: Record<string, 'asc' | 'desc'>[];
        select?: Row;
      }) => {
        let hit = sounds.filter((s) => soundMatches(s, where));
        const first = orderBy?.[0];
        if (first) {
          const [key, dir] = Object.entries(first)[0];
          hit = sortBy(hit, key, dir);
        }
        return hit.map((s) =>
          project(s, select, { reports: () => reports.filter((r) => r.soundId === s.id) })
        );
      }
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const hit = sounds.filter((s) => soundMatches(s, where));
      hit.forEach((s) => Object.assign(s, data));
      return { count: hit.length };
    }),
  };
  mockPrisma.soundReport = {
    findFirst: vi.fn(async ({ where, select }: { where: Row; select?: Row }) => {
      const row = reports.find((r) => reportMatches(r, where));
      return row ? project(row, select) : null;
    }),
    findMany: vi.fn(async ({ where, select }: { where: Row; select?: Row }) =>
      sortBy(
        reports.filter((r) => reportMatches(r, where)),
        'createdAt',
        'asc'
      ).map((r) => project(r, select))
    ),
    create: vi.fn(async ({ data, select }: { data: Row; select?: Row }) => {
      const row: Row = {
        id: `rep${++n}`,
        note: null,
        status: 'open',
        resolvedById: null,
        resolvedAt: null,
        createdAt: at(n),
        updatedAt: at(n),
        ...data,
      };
      reports.push(row);
      return project(row, select);
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = reports.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return { ...row };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const hit = reports.filter((r) => reportMatches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
  };
  mockPrisma.synthProfile = {
    findMany: vi.fn(async ({ where }: { where: { userId: { in: string[] } } }) =>
      where.userId.in.flatMap((userId) =>
        userId === 'owner-1' ? [{ userId, username: 'patchwork', public: true }] : []
      )
    ),
  };
  mockPrisma.synth = {
    findMany: vi.fn(async () => [{ id: 'model-d', name: 'Model D' }]),
  };
  mockPrisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma));
  mockPrisma.$queryRaw = lockQuery;
  signIn('user-1');
});

/** A sound owned by `owner-1` unless said otherwise. */
function addSound(over: Row = {}): Row {
  n++;
  const row: Row = {
    id: `snd${n}`,
    userId: 'owner-1',
    synthId: 'model-d',
    name: `Sound ${n}`,
    notes: null,
    visibility: 'published',
    slug: `s${String(n).padStart(9, '0')}`,
    unlistedAt: null,
    ...over,
  };
  sounds.push(row);
  return row;
}
/** A report filed directly in the table, as if through the route. */
function addReport(sound: Row, over: Row = {}): Row {
  n++;
  const row: Row = {
    id: `rep${n}`,
    soundId: sound.id,
    reporterId: `reporter-${n}`,
    reason: 'offensive',
    note: null,
    status: 'open',
    resolvedById: null,
    resolvedAt: null,
    createdAt: at(n),
    updatedAt: at(n),
    ...over,
  };
  reports.push(row);
  return row;
}

const reportIt = (slug: unknown, body: unknown = { reason: 'offensive' }) =>
  report(request('POST', `/api/v1/public/sounds/${String(slug)}/report`, body), {
    params: Promise.resolve({ slug: String(slug) }),
  });
const queue = (view?: string) =>
  listQueue(request('GET', `/api/v1/admin/sounds${view ? `?view=${view}` : ''}`));
const act = (id: unknown, action: string) =>
  moderate(request('POST', `/api/v1/admin/sounds/${String(id)}`, { action }), {
    params: Promise.resolve({ id: String(id) }),
  });
const auditActions = () =>
  mockLogAdminAction.mock.calls.map(([e]) => (e as { action: string }).action);

describe('POST /api/v1/public/sounds/:slug/report', () => {
  it('needs a session', async () => {
    const sound = addSound();
    mockGetSession.mockResolvedValue(null);
    expect((await reportIt(sound.slug)).status).toBe(401);
    expect(reports).toHaveLength(0);
  });

  it("stores a report on someone else's sound under the caller, after locking the sound's row", async () => {
    const sound = addSound();
    const res = await reportIt(sound.slug, {
      reason: 'not_theirs',
      note: '  It is the Lead preset  ',
    });
    expect(res.status).toBe(201);
    expect(reports).toEqual([
      expect.objectContaining({
        soundId: sound.id,
        reporterId: 'user-1',
        reason: 'not_theirs',
        note: 'It is the Lead preset',
        status: 'open',
      }),
    ]);
    // only the id goes back
    expect(Object.keys((await json(res)).data!)).toEqual(['id']);
    expect(lockQuery).toHaveBeenCalledTimes(1);
    expect(lockQuery.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked((mockPrisma.soundReport as { create: () => void }).create).mock
        .invocationCallOrder[0]
    );
  });

  it('keeps one open report per person per sound: a second updates the first', async () => {
    const sound = addSound();
    expect((await reportIt(sound.slug, { reason: 'spam' })).status).toBe(201);
    const again = await reportIt(sound.slug, { reason: 'offensive', note: 'Rude name' });
    expect(again.status).toBe(200);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reason: 'offensive', note: 'Rude name', status: 'open' });

    // once that one is closed, a new report is a new row
    reports[0].status = 'dismissed';
    expect((await reportIt(sound.slug)).status).toBe(201);
    expect(reports).toHaveLength(2);

    // someone else's report is theirs, not an update of this one
    signIn('user-2');
    expect((await reportIt(sound.slug)).status).toBe(201);
    expect(reports.filter((r) => r.status === 'open')).toHaveLength(2);
  });

  it('refuses your own sound, and stores nothing', async () => {
    const sound = addSound({ userId: 'user-1' });
    const res = await reportIt(sound.slug);
    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe('OWN_SOUND');
    expect(reports).toHaveLength(0);
  });

  it('is one 404 for a sound nobody else can open, and stores nothing', async () => {
    const priv = addSound({ visibility: 'private' });
    const unlisted = addSound({ unlistedAt: at(1) });
    for (const slug of [priv.slug, unlisted.slug, 'zzzzzzzzzz', 'NOT-A-SLUG'])
      expect((await reportIt(slug)).status, String(slug)).toBe(404);
    expect(reports).toHaveLength(0);
    // a link share can be reported, as a published one can
    expect((await reportIt(addSound({ visibility: 'link' }).slug)).status).toBe(201);
  });

  it('refuses a reason it does not know', async () => {
    const sound = addSound();
    expect((await reportIt(sound.slug, { reason: 'bad-link' })).status).toBe(400);
    expect(reports).toHaveLength(0);
  });

  it('caps reports per user at 20 a day', async () => {
    const targets = Array.from({ length: 21 }, () => addSound());
    for (const s of targets.slice(0, 20)) expect((await reportIt(s.slug)).status).toBe(201);
    const over = await reportIt(targets[20].slug);
    expect(over.status).toBe(429);
    expect(reports).toHaveLength(20);
  });
});

describe('the moderation queue', () => {
  it('is for admins only', async () => {
    const sound = addSound();
    addReport(sound);
    expect((await queue()).status).toBe(403);
    expect((await act(sound.id, 'unlist')).status).toBe(403);
    expect(sound.unlistedAt).toBeNull();
  });

  it('lists sounds with open reports, the longest-waiting first, with the owner and never a reporter', async () => {
    signIn('admin-1', 'ADMIN');
    const later = addSound({ name: 'Later' });
    const earlier = addSound({ name: 'Earlier', userId: 'owner-2', visibility: 'link' });
    const dismissedOnly = addSound({ name: 'Dismissed only' });
    const unlisted = addSound({ name: 'Unlisted', unlistedAt: at(0) });
    addReport(earlier, { reason: 'spam', note: 'Selling things' });
    addReport(later, { reason: 'not_theirs' });
    addReport(earlier, { reason: 'offensive' });
    addReport(earlier, { reason: 'other', status: 'dismissed' });
    addReport(dismissedOnly, { status: 'dismissed' });
    addReport(unlisted);

    const res = await queue();
    expect(res.status).toBe(200);
    const body = await res.text();
    const data = JSON.parse(body).data as Row[];
    expect(data.map((s) => s.name)).toEqual(['Earlier', 'Later']);
    expect(data[0]).toMatchObject({
      id: earlier.id,
      synthName: 'Model D',
      owner: null,
      visibility: 'link',
      reports: [
        { reason: 'spam', note: 'Selling things', status: 'open' },
        { reason: 'offensive', status: 'open' },
      ],
    });
    expect(data[1]).toMatchObject({ owner: 'patchwork' });
    // reporters were filed under ids like `reporter-12`, and the owner's account id is not shown either
    expect(body).not.toContain('reporter-');
    expect(body).not.toContain('owner-1');
  });

  it('lists unlisted sounds, the most recent first, with the reports that unlisted them', async () => {
    signIn('admin-1', 'ADMIN');
    const old = addSound({ name: 'Old', unlistedAt: at(1) });
    const recent = addSound({ name: 'Recent', unlistedAt: at(5) });
    addSound({ name: 'Listed' });
    addReport(old, { status: 'actioned' });
    addReport(old, { status: 'dismissed' });

    const data = (await json(await queue('unlisted'))).data!;
    expect(data.map((s) => s.name)).toEqual(['Recent', 'Old']);
    expect(data[1].reports).toEqual([expect.objectContaining({ status: 'actioned' })]);
    expect(recent.unlistedAt).not.toBeNull();
  });
});

describe('POST /api/v1/admin/sounds/:id', () => {
  beforeEach(() => signIn('admin-1', 'ADMIN'));

  it('unlists a sound, actions its open reports, and audits it; a second unlist is a 409', async () => {
    const sound = addSound({ name: 'Rude bass' });
    const open = addReport(sound);
    const closed = addReport(sound, { status: 'dismissed' });

    const res = await act(sound.id, 'unlist');
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({ id: sound.id, unlisted: true });
    expect(sound.unlistedAt).toBeInstanceOf(Date);
    expect(sound.visibility).toBe('published');
    expect(open).toMatchObject({ status: 'actioned', resolvedById: 'admin-1' });
    expect(closed).toMatchObject({ status: 'dismissed', resolvedById: null });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'user_sound.unlist',
        entityType: 'user_sound',
        entityId: sound.id,
        entityName: 'Rude bass',
      })
    );

    mockLogAdminAction.mockClear();
    const again = await act(sound.id, 'unlist');
    expect(again.status).toBe(409);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('restores an unlisted sound as its owner left it, and audits it; restoring a listed one is a 409', async () => {
    const sound = addSound({ visibility: 'link', unlistedAt: at(1) });
    const res = await act(sound.id, 'restore');
    expect(res.status).toBe(200);
    expect(sound).toMatchObject({ unlistedAt: null, visibility: 'link' });
    expect(auditActions()).toEqual(['user_sound.restore']);

    expect((await act(sound.id, 'restore')).status).toBe(409);
    expect(auditActions()).toEqual(['user_sound.restore']);
  });

  it('dismisses the open reports and leaves the sound up, and audits it; with none open it is a 409', async () => {
    const sound = addSound();
    const a = addReport(sound);
    const b = addReport(sound);
    const res = await act(sound.id, 'dismiss');
    expect(res.status).toBe(200);
    expect(sound.unlistedAt).toBeNull();
    expect([a.status, b.status]).toEqual(['dismissed', 'dismissed']);
    expect(a.resolvedById).toBe('admin-1');
    expect(auditActions()).toEqual(['user_sound.dismiss']);

    expect((await act(sound.id, 'dismiss')).status).toBe(409);
    expect(auditActions()).toEqual(['user_sound.dismiss']);
  });

  it('is a 404 for a sound that does not exist, and a 400 for an action it does not know', async () => {
    expect((await act('nosuchsound', 'unlist')).status).toBe(404);
    const sound = addSound();
    expect((await act(sound.id, 'delete')).status).toBe(400);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});
