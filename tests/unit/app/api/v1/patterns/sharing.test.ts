/**
 * Unit Tests: sharing, publishing, copying, reporting and unlisting users' patterns (`f-step-sequencer` t-83).
 *
 * `PATCH /api/v1/patterns/:id` (visibility), `POST /api/v1/patterns/:id/publish`, `POST /api/v1/patterns` with
 * `source: { shared }`, `GET /api/v1/public/patterns/:slug`, `GET /api/v1/public/patterns`,
 * `POST /api/v1/public/patterns/:slug/report` and `POST /api/v1/admin/patterns/:id`. Real routes, real guards, the real
 * store, sharing, public, reports and moderation modules. The tables are small stateful fakes that honour the filters
 * the code relies on (`in`, `not`, the unique slug), so a query that dropped the owner, the visibility or `unlistedAt`
 * would reach the wrong row here too. Pins:
 *
 * - a slug is minted the first time a pattern leaves private and kept after; PATCH cannot publish;
 * - publishing without a username is refused (`USERNAME_REQUIRED`) and writes nothing; so are a blocked name, an
 *   unchanged copy and the daily cap, each with its code; a published pattern's rename stays word-checked;
 * - the public read serves link and published patterns, one 404 for everything else, never the owner's ids;
 * - a copy records its source and is credited live: only while the source is published, and not once it is deleted;
 * - a report is one per person per pattern, never on your own; an unlist takes the pattern out of every public read
 *   (its page, Explore, the credit, the copy route, the report route) until a restore brings it back as it was.
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
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({
  logAdminAction: vi.fn(),
  computeChanges: vi.fn(() => ({})),
}));

import { POST as create } from '@/app/api/v1/patterns/route';
import { GET as read, PATCH as change } from '@/app/api/v1/patterns/[id]/route';
import { POST as publish } from '@/app/api/v1/patterns/[id]/publish/route';
import { GET as readShared } from '@/app/api/v1/public/patterns/[slug]/route';
import { GET as explore } from '@/app/api/v1/public/patterns/route';
import { POST as report } from '@/app/api/v1/public/patterns/[slug]/report/route';
import { POST as moderate } from '@/app/api/v1/admin/patterns/[id]/route';
import { GET as queue } from '@/app/api/v1/admin/patterns/route';
import { publishedPatternAddresses } from '@/lib/app/patterns/public';
import { importPhrase } from '@/lib/app/sequencer/import';
import { PATTERN_PUBLISH_DAILY_CAP } from '@/lib/app/patterns/sharing';
import { createMockAuthSession } from '@/tests/helpers/auth';

type Row = Record<string, unknown>;

const riff = importPhrase({
  bpm: 96,
  loop: true,
  steps: [
    [0, 36, 1, 0.5],
    [1, 48, 0.5],
    [2, 43, 1],
  ],
});
const otherRiff = importPhrase({ bpm: 120, loop: true, steps: [[0, 40, 1]] });

function session(id: string, role: 'USER' | 'ADMIN' = 'USER') {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID, userId: id },
    user: { ...base.user, id, role },
  };
}
const signIn = (id: string, role: 'USER' | 'ADMIN' = 'USER') =>
  mockGetSession.mockResolvedValue(session(id, role));

function request(method: string, url: string, body?: unknown) {
  const req = new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest;
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const slugCtx = (slug: string) => ({ params: Promise.resolve({ slug }) });

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
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) =>
    // a relation filter (the queue's `pattern: { unlistedAt }`) is the fake's caller's to apply
    k === 'pattern' ? true : fieldMatches(row[k], v)
  );

/** The user patterns table in memory, with the columns' defaults, the unique slug and the copies count. */
function patternTable() {
  const rows: Row[] = [];
  let n = 0;
  const clash = (data: Row, self?: Row) =>
    typeof data.slug === 'string' && rows.some((r) => r !== self && r.slug === data.slug);
  const withCount = (r: Row) => ({
    ...r,
    _count: { copies: rows.filter((c) => c.sourceUserPatternId === r.id).length },
  });
  return {
    rows,
    client: {
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) =>
        rows.filter((r) => matches(r, where)).map(withCount)
      ),
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      count: vi.fn(
        async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)).length
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const at = new Date(Date.UTC(2026, 9, 22, 0, ++n));
        const row: Row = {
          id: `pat${n}`,
          visibility: 'private',
          slug: null,
          publishedAt: null,
          unlistedAt: null,
          sourceUserPatternId: null,
          createdAt: at,
          updatedAt: at,
          ...data,
        };
        rows.push(row);
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit)
          if (clash(data, r)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        for (const r of hit)
          Object.assign(r, data, { updatedAt: new Date(Date.UTC(2026, 9, 23, 0, ++n)) });
        return { count: hit.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit) {
          rows.splice(rows.indexOf(r), 1);
          // the self-relation's ON DELETE SET NULL
          for (const c of rows) if (c.sourceUserPatternId === r.id) c.sourceUserPatternId = null;
        }
        return { count: hit.length };
      }),
    },
  };
}

/** The pattern reports table in memory. */
function reportTable() {
  const rows: Row[] = [];
  let n = 0;
  return {
    rows,
    client: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        rows.filter((r) => matches(r, where)).map((r) => ({ ...r }))
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `rep${++n}`, status: 'open', createdAt: new Date(n), ...data };
        rows.push(row);
        return { id: row.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        Object.assign(
          rows.find((r) => r.id === where.id)!,
          data
        );
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
    },
  };
}

let table: ReturnType<typeof patternTable>;
let reports: ReturnType<typeof reportTable>;
type Profile = { username: string; public: boolean; recentPatternPublishes: Date[] };
/** Synth profiles by user id: `user-1` private, `user-2` public, `user-3` none. */
let profiles: Map<string, Profile>;
const lockQuery = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  table = patternTable();
  reports = reportTable();
  mockPrisma.userPattern = table.client;
  mockPrisma.patternReport = reports.client;
  profiles = new Map([
    ['user-1', { username: 'moog-fan', public: false, recentPatternPublishes: [] }],
    ['user-2', { username: 'patchwork', public: true, recentPatternPublishes: [] }],
  ]);
  mockPrisma.synthProfile = {
    findMany: vi.fn(async ({ where }: { where: { userId: { in: string[] } } }) =>
      where.userId.in.flatMap((userId) => {
        const p = profiles.get(userId);
        return p ? [{ userId, username: p.username, public: p.public }] : [];
      })
    ),
    findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
      const p = profiles.get(where.userId);
      return p ? { recentPatternPublishes: [...p.recentPatternPublishes] } : null;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { userId: string };
        data: { recentPatternPublishes: Date[] };
      }) => {
        profiles.get(where.userId)!.recentPatternPublishes = data.recentPatternPublishes;
      }
    ),
  };
  // A transaction against the same fakes, put back as it was when its function throws, as a rollback would.
  mockPrisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const rows = table.rows.map((r) => ({ ...r }));
    const saved = new Map([...profiles].map(([k, p]) => [k, { ...p }]));
    try {
      return await fn(mockPrisma);
    } catch (err) {
      table.rows.splice(0, table.rows.length, ...rows);
      profiles = saved;
      throw err;
    }
  });
  mockPrisma.$queryRaw = lockQuery;
  mockPrisma.synth = {
    findMany: vi.fn(async () => [
      {
        id: 'model-d',
        name: 'Model D',
        maker: 'Behringer',
        year: 2018,
        heritage: '',
        summary: '',
        design: 'NEUTRAL',
        _count: { sounds: 0 },
      },
    ]),
  };
  signIn('user-1');
});

async function save(body: Row = { name: 'Acid walk', pattern: riff, synthId: 'model-d' }) {
  const res = await create(request('POST', '/api/v1/patterns', body));
  expect(res.status).toBe(201);
  return (await json(res)).data!;
}
const patch = (id: string, body: unknown) =>
  change(request('PATCH', `/api/v1/patterns/${id}`, body), ctx(id));
const publishIt = (id: string, body: unknown = { confirm: true }) =>
  publish(request('POST', `/api/v1/patterns/${id}/publish`, body), ctx(id));
const shared = (slug: string) =>
  readShared(request('GET', `/api/v1/public/patterns/${slug}`), slugCtx(slug));
const listed = async () =>
  (await json(await explore(request('GET', '/api/v1/public/patterns')))).data as Row[];
const reportIt = (slug: string, body: unknown = { reason: 'spam' }) =>
  report(request('POST', `/api/v1/public/patterns/${slug}/report`, body), slugCtx(slug));
const queued = async (view: string) =>
  (await json(await queue(request('GET', `/api/v1/admin/patterns?view=${view}`)))).data as Row[];
const act = (id: string, action: string) =>
  moderate(request('POST', `/api/v1/admin/patterns/${id}`, { action }), ctx(id));

/** user-2 publishes a pattern of theirs; the caller is user-1 again after. */
async function theirPublished(name = 'Their riff'): Promise<{ id: string; slug: string }> {
  signIn('user-2');
  const p = await save({ name, pattern: otherRiff, synthId: 'model-d' });
  expect((await publishIt(String(p.id))).status).toBe(200);
  signIn('user-1');
  const row = table.rows.find((r) => r.id === p.id)!;
  return { id: String(p.id), slug: String(row.slug) };
}

describe('visibility', () => {
  it('mints a slug the first time a pattern leaves private, keeps it after, and serves it only while shared', async () => {
    const p = await save();
    expect(p).toMatchObject({ visibility: 'private', slug: null, unlisted: false });

    const linked = (await json(await patch(String(p.id), { visibility: 'link' }))).data!;
    expect(linked.visibility).toBe('link');
    expect(linked.slug).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/);
    const slug = String(linked.slug);
    expect((await shared(slug)).status).toBe(200);

    const hidden = (await json(await patch(String(p.id), { visibility: 'private' }))).data!;
    expect(hidden).toMatchObject({ visibility: 'private', slug });
    expect((await shared(slug)).status).toBe(404);

    // shared again, the same address works again
    expect((await json(await patch(String(p.id), { visibility: 'link' }))).data!.slug).toBe(slug);
    expect((await shared(slug)).status).toBe(200);
    // every change took the owner's lock first
    expect(lockQuery).toHaveBeenCalled();
  });

  it('refuses publishing through PATCH', async () => {
    const p = await save();
    const res = await patch(String(p.id), { visibility: 'published' });
    expect(res.status).toBe(400);
    expect(table.rows[0].visibility).toBe('private');
  });

  it("is a 404 on another user's pattern, which is left as it was", async () => {
    const p = await save();
    signIn('user-2');
    expect((await patch(String(p.id), { visibility: 'link' })).status).toBe(404);
    expect((await publishIt(String(p.id))).status).toBe(404);
    expect(table.rows[0]).toMatchObject({ visibility: 'private', slug: null });
  });
});

describe('publishing', () => {
  it('refuses without a username, and writes nothing', async () => {
    signIn('user-3');
    const p = await save();
    const res = await publishIt(String(p.id));
    expect(res.status).toBe(409);
    expect((await json(res)).error!.code).toBe('USERNAME_REQUIRED');
    expect(table.rows[0]).toMatchObject({ visibility: 'private', slug: null, publishedAt: null });
  });

  it('lists a published pattern on Explore under its username, and keeps its first publication date', async () => {
    const p = await save();
    const res = await publishIt(String(p.id));
    expect(res.status).toBe(200);
    const first = (await json(res)).data!;
    expect(first).toMatchObject({ visibility: 'published' });
    expect(await listed()).toEqual([
      expect.objectContaining({ name: 'Acid walk', author: 'moog-fan', synthName: 'Model D' }),
    ]);
    // unpublishing keeps the link; republishing keeps the date and does not count again
    await patch(String(p.id), { visibility: 'link' });
    expect(await listed()).toEqual([]);
    expect((await shared(String(first.slug))).status).toBe(200);
    const again = (await json(await publishIt(String(p.id)))).data!;
    expect(again.publishedAt).toBe(first.publishedAt);
    expect(profiles.get('user-1')!.recentPatternPublishes).toHaveLength(1);
  });

  it('needs the tick', async () => {
    const p = await save();
    expect((await publishIt(String(p.id), {})).status).toBe(400);
    expect(table.rows[0].visibility).toBe('private');
  });

  it('refuses a blocked word in the name, at publish and on a published rename', async () => {
    const rude = await save({ name: 'shit riff', pattern: riff });
    const res = await publishIt(String(rude.id));
    expect(res.status).toBe(422);
    expect((await json(res)).error!.code).toBe('NOT_ALLOWED');

    const p = await save();
    await publishIt(String(p.id));
    const renamed = await patch(String(p.id), { name: 'fucking riff' });
    expect(renamed.status).toBe(422);
    expect(table.rows.find((r) => r.id === p.id)!.name).toBe('Acid walk');
    // taken off Explore in the same change, the name is the owner's to choose
    expect((await patch(String(p.id), { name: 'fucking riff', visibility: 'link' })).status).toBe(
      200
    );
  });

  it('stops at the daily cap, which deleting a published pattern does not give back', async () => {
    for (let i = 0; i < PATTERN_PUBLISH_DAILY_CAP; i++) {
      const p = await save({ name: `Riff ${i}`, pattern: riff });
      expect((await publishIt(String(p.id))).status).toBe(200);
    }
    table.rows.splice(0, 1);
    const p = await save({ name: 'One too many', pattern: riff });
    const res = await publishIt(String(p.id));
    expect(res.status).toBe(429);
    expect((await json(res)).error!.code).toBe('PUBLISH_LIMIT');
    expect(table.rows.find((r) => r.id === p.id)!.visibility).toBe('private');
  });
});

describe('copies and their credit', () => {
  it("copies a shared pattern's name and steps, and credits it while it is published", async () => {
    const theirs = await theirPublished();
    const copy = await save({ source: { shared: theirs.slug }, synthId: 'model-d' });
    expect(copy).toMatchObject({
      name: 'Their riff',
      basedOn: { name: 'Their riff', username: 'patchwork', slug: theirs.slug },
    });
    expect(
      (await json(await read(request('GET', '/x'), ctx(String(copy.id))))).data!.pattern
    ).toEqual(otherRiff);
    expect(table.rows.find((r) => r.id === copy.id)!.sourceUserPatternId).toBe(theirs.id);

    // read live: taken back to a link share, the credit goes; published again, it comes back
    signIn('user-2');
    await patch(theirs.id, { visibility: 'link' });
    signIn('user-1');
    expect(
      (await json(await read(request('GET', '/x'), ctx(String(copy.id))))).data!.basedOn
    ).toBeNull();
    signIn('user-2');
    await publishIt(theirs.id);
    signIn('user-1');
    expect(
      (await json(await read(request('GET', '/x'), ctx(String(copy.id))))).data!.basedOn
    ).toEqual({ name: 'Their riff', username: 'patchwork', slug: theirs.slug });
    // and on the copy's public read
    await patch(String(copy.id), { visibility: 'link' });
    const slug = String(table.rows.find((r) => r.id === copy.id)!.slug);
    expect((await json(await shared(slug))).data!.basedOn).toMatchObject({ slug: theirs.slug });
  });

  it('leaves no credit once the source is deleted', async () => {
    const theirs = await theirPublished();
    const copy = await save({ source: { shared: theirs.slug } });
    await mockPrismaDelete(theirs.id);
    expect(
      (await json(await read(request('GET', '/x'), ctx(String(copy.id))))).data!.basedOn
    ).toBeNull();
  });

  it('refuses publishing an unchanged copy, and allows it once changed', async () => {
    const theirs = await theirPublished();
    const copy = await save({ source: { shared: theirs.slug } });
    const res = await publishIt(String(copy.id));
    expect(res.status).toBe(409);
    expect((await json(res)).error!.code).toBe('DUPLICATE');
    await patch(String(copy.id), { pattern: riff });
    expect((await publishIt(String(copy.id))).status).toBe(200);
    // and a published copy's steps cannot be put back to the source's
    expect((await patch(String(copy.id), { pattern: otherRiff })).status).toBe(409);
  });

  it('refuses a copy of a private pattern on source.shared, and records no source for your own', async () => {
    const mine = await save();
    await patch(String(mine.id), { visibility: 'link' });
    const slug = String(table.rows[0].slug);
    const own = await save({ source: { shared: slug } });
    expect(table.rows.find((r) => r.id === own.id)!.sourceUserPatternId).toBeNull();

    await patch(String(mine.id), { visibility: 'private' });
    const res = await create(request('POST', '/api/v1/patterns', { source: { shared: slug } }));
    expect(res.status).toBe(400);
    expect(JSON.stringify((await json(res)).error)).toContain('source.shared');
  });
});

/** Delete one row as its owner would: through the table, so the copies' SET NULL applies. */
async function mockPrismaDelete(id: string) {
  await table.client.deleteMany({ where: { id } });
}

describe('the public read', () => {
  it('never carries the owner, the row id or the source id, and names a link share only on a public profile', async () => {
    const p = await save();
    await patch(String(p.id), { visibility: 'link' });
    const slug = String(table.rows[0].slug);
    const body = (await json(await shared(slug))).data!;
    expect(body).toMatchObject({ slug, name: 'Acid walk', author: null, pattern: riff, steps: 12 });
    const text = JSON.stringify(body);
    expect(text).not.toContain(String(p.id));
    expect(text).not.toContain('user-1');

    // user-2's profile is public, so their link share is bylined
    signIn('user-2');
    const q = await save({ name: 'Theirs', pattern: riff });
    await patch(String(q.id), { visibility: 'link' });
    const theirs = String(table.rows.find((r) => r.id === q.id)!.slug);
    expect((await json(await shared(theirs))).data!.author).toBe('patchwork');
  });

  it('answers 304 to a reader holding the current ETag, and the publish route 404s a malformed id', async () => {
    const p = await save();
    await patch(String(p.id), { visibility: 'link' });
    const slug = String(table.rows[0].slug);
    const etag = (await shared(slug)).headers.get('ETag')!;
    const req = request('GET', `/api/v1/public/patterns/${slug}`);
    req.headers.set('If-None-Match', etag);
    expect((await readShared(req, slugCtx(slug))).status).toBe(304);
    expect((await publishIt('not an id!')).status).toBe(404);
  });

  it('is one 404 for a malformed or unknown address', async () => {
    expect((await shared('nope')).status).toBe(404);
    expect((await shared('0000000000')).status).toBe(404);
  });
});

describe('reports and unlisting', () => {
  it('takes one report per person, never on your own', async () => {
    const theirs = await theirPublished();
    expect((await reportIt(theirs.slug)).status).toBe(201);
    expect((await reportIt(theirs.slug, { reason: 'offensive', note: 'Rude' })).status).toBe(200);
    expect(reports.rows).toEqual([
      expect.objectContaining({ reason: 'offensive', note: 'Rude', reporterId: 'user-1' }),
    ]);
    signIn('user-2');
    const own = await reportIt(theirs.slug);
    expect(own.status).toBe(400);
    expect((await json(own)).error!.code).toBe('OWN_PATTERN');
  });

  it('takes an unlisted pattern out of every public read until it is restored as it was', async () => {
    const theirs = await theirPublished();
    const copy = await save({ source: { shared: theirs.slug } });
    await reportIt(theirs.slug);

    signIn('admin-1', 'ADMIN');
    expect((await act(theirs.id, 'unlist')).status).toBe(200);
    expect(reports.rows[0]).toMatchObject({ status: 'actioned', resolvedById: 'admin-1' });
    expect((await act(theirs.id, 'unlist')).status).toBe(409);

    signIn('user-1');
    // its page, Explore, the credit on a copy, the copy route and the report route
    expect((await shared(theirs.slug)).status).toBe(404);
    expect(await listed()).toEqual([]);
    expect(
      (await json(await read(request('GET', '/x'), ctx(String(copy.id))))).data!.basedOn
    ).toBeNull();
    expect(
      (await create(request('POST', '/api/v1/patterns', { source: { shared: theirs.slug } })))
        .status
    ).toBe(400);
    expect((await reportIt(theirs.slug)).status).toBe(404);

    // its owner can make it private, but not share it again
    signIn('user-2');
    const again = await patch(theirs.id, { visibility: 'link' });
    expect(again.status).toBe(409);
    expect((await json(again)).error!.code).toBe('UNLISTED');
    expect((await json(await publishIt(theirs.id))).error!.code).toBe('UNLISTED');
    expect((await json(await read(request('GET', '/x'), ctx(theirs.id)))).data!).toMatchObject({
      visibility: 'published',
      unlisted: true,
    });

    signIn('admin-1', 'ADMIN');
    expect((await act(theirs.id, 'restore')).status).toBe(200);
    signIn('user-1');
    expect((await shared(theirs.slug)).status).toBe(200);
    expect(await listed()).toHaveLength(1);
  });

  it('refuses the queue and its actions to anyone but an admin', async () => {
    const theirs = await theirPublished();
    expect((await act(theirs.id, 'unlist')).status).toBe(403);
    expect(table.rows.find((r) => r.id === theirs.id)!.unlistedAt).toBeNull();
  });
});

describe('the moderation queue', () => {
  beforeEach(() => {
    // the queue's reads: reports joined to their pattern's unlistedAt, and each pattern with its reports
    reports.client.findMany.mockImplementation(async ({ where }: { where: Row }) =>
      reports.rows
        .filter((r) => matches(r, where))
        .filter((r) => {
          const on = (where.pattern as { unlistedAt?: null } | undefined)?.unlistedAt;
          return (
            on === undefined || table.rows.find((p) => p.id === r.patternId)?.unlistedAt === null
          );
        })
        .map((r) => ({ ...r }))
    );
    table.client.findMany.mockImplementation(
      async ({ where, select }: { where?: Row; select?: Row } = {}) =>
        table.rows
          .filter((r) => matches(r, where))
          .map((r) => ({
            ...r,
            _count: { copies: 0 },
            ...(select?.reports
              ? {
                  reports: reports.rows
                    .filter(
                      (x) =>
                        x.patternId === r.id &&
                        fieldMatches(
                          x.status,
                          (select.reports as { where: { status: unknown } }).where.status
                        )
                    )
                    .map(({ reason, note, status, createdAt }) => ({
                      reason,
                      note,
                      status,
                      createdAt,
                    })),
                }
              : {}),
          }))
    );
  });

  it('lists reported patterns with their open reports and owner, never the reporter, and unlisted ones apart', async () => {
    const theirs = await theirPublished();
    await reportIt(theirs.slug, { reason: 'offensive', note: 'Rude' });
    signIn('admin-1', 'ADMIN');
    const reported = await queued('reported');
    expect(reported).toEqual([
      expect.objectContaining({
        id: theirs.id,
        name: 'Their riff',
        synthName: 'Model D',
        owner: 'patchwork',
        unlistedAt: null,
        reports: [expect.objectContaining({ reason: 'offensive', note: 'Rude', status: 'open' })],
      }),
    ]);
    expect(JSON.stringify(reported)).not.toContain('user-1');
    expect(await queued('unlisted')).toEqual([]);

    await act(theirs.id, 'unlist');
    expect(await queued('reported')).toEqual([]);
    expect(await queued('unlisted')).toEqual([
      expect.objectContaining({
        id: theirs.id,
        reports: [expect.objectContaining({ status: 'actioned' })],
      }),
    ]);
  });

  it('dismisses open reports and leaves the pattern up; with none open it is a 409', async () => {
    const theirs = await theirPublished();
    await reportIt(theirs.slug);
    signIn('admin-1', 'ADMIN');
    expect((await act(theirs.id, 'dismiss')).status).toBe(200);
    expect(reports.rows[0]).toMatchObject({ status: 'dismissed', resolvedById: 'admin-1' });
    expect((await act(theirs.id, 'dismiss')).status).toBe(409);
    expect((await act(theirs.id, 'restore')).status).toBe(409);
    expect((await act('cmnosuchpattern', 'unlist')).status).toBe(404);
    signIn('user-1');
    expect((await shared(theirs.slug)).status).toBe(200);
  });

  it('refuses the queue to anyone but an admin', async () => {
    expect((await queue(request('GET', '/api/v1/admin/patterns'))).status).toBe(403);
  });
});

describe('the sitemap read and an unreadable pattern', () => {
  it('gives each published pattern the synth its page opens on, never a link share or an unlisted one', async () => {
    const theirs = await theirPublished();
    table.rows.find((r) => r.id === theirs.id)!.synthId = 'gone-synth';
    const link = await save();
    await patch(String(link.id), { visibility: 'link' });
    expect(await publishedPatternAddresses()).toEqual([{ synthId: 'model-d', slug: theirs.slug }]);
    table.rows.find((r) => r.id === theirs.id)!.unlistedAt = new Date();
    expect(await publishedPatternAddresses()).toEqual([]);
  });

  it('serves a pattern stored in a shape it cannot read with no steps and the reason, and refuses to publish it', async () => {
    const p = await save();
    await patch(String(p.id), { visibility: 'link' });
    Object.assign(table.rows[0], { version: 99 });
    const body = (await json(await shared(String(table.rows[0].slug)))).data!;
    expect(body).toMatchObject({ pattern: null, steps: 0 });
    expect(String((body.problems as string[])[0])).toMatch(/version 99/);
    const res = await publishIt(String(p.id));
    expect((await json(res)).error!.code).toBe('NOT_PLAYABLE');
  });
});
