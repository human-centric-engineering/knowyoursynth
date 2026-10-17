/**
 * Unit Tests: sharing, publishing and copying users' sounds (`f-sharing` h1).
 *
 * `PATCH /api/v1/sounds/:id` (visibility), `POST /api/v1/sounds/:id/publish`, `POST /api/v1/sounds` with
 * `source: { shared }`, and `GET /api/v1/public/sounds/:slug`. Real routes, real `withAuth`, the real store, sharing
 * and publish modules, the real Model D definition and its library as the seed writes it. The tables are small
 * stateful fakes that honour the filters the code relies on (`in`, `not`, `gte`, the unique slug), so a query that
 * dropped the owner or the visibility would reach the wrong row here too. Pins:
 *
 * - a slug is minted the first time a sound leaves private and kept after; PATCH cannot publish;
 * - publishing refuses each case in `lib/app/sounds/publish.ts` with its code, and writes nothing when it does;
 * - the daily cap is kept on the profile, so deleting published sounds does not give their places back;
 * - publishing and every change take the owner's lock before they read the sound;
 * - a published sound's name, notes and panel stay held to those checks;
 * - the public read serves link and published sounds, one 404 for everything else, never the owner's ids or account;
 * - the byline: a published sound names its owner, a link share only when their profile is public;
 * - a copy of a shared sound records it, carries its library credit, and is credited only while the source is
 *   published; deleting the source leaves the copy with no credit.
 *
 * The `SetNull` foreign key and the export are proved against a real database in `npm run smoke:sounds`.
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

import { POST as create } from '@/app/api/v1/sounds/route';
import { GET as read, PATCH as change } from '@/app/api/v1/sounds/[id]/route';
import { POST as publish } from '@/app/api/v1/sounds/[id]/publish/route';
import { GET as readShared } from '@/app/api/v1/public/sounds/[slug]/route';
import { getSynthDef } from '@/lib/app/synths/defs';
import { libraryPanel } from '@/lib/app/sounds/sharing';
import { PUBLISH_DAILY_CAP } from '@/lib/app/sounds/publish';
import type { Control } from '@/lib/app/synths/contract';
import { createMockAuthSession } from '@/tests/helpers/auth';
import { synthRows } from '@/tests/helpers/synth-detail';

type Row = Record<string, unknown>;

const modelD = getSynthDef('model-d')!;
const librarySounds = synthRows('model-d').stored.sounds;
const firstSound = librarySounds[0];
const libraryTag = firstSound.tags[0];

const cont = modelD.controls.find(
  (c): c is Extract<Control, { kind: 'cont' }> => c.kind === 'cont'
)!;
const outJack = modelD.jacks.find((j) => j.dir === 'out' && j.signal)!;
const inJack = modelD.jacks.find((j) => j.dir === 'in' && j.dest)!;

const panel = { values: { [cont.id]: cont.min }, cables: [[outJack.id, inJack.id]] };
const otherPanel = { values: { [cont.id]: cont.max }, cables: [] };

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
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const slugCtx = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: Row;
    error?: { code: string; message: string };
  };
}

/** One field of a Prisma `where`: a value, or `{ in }`, `{ not }`, `{ gte }`. */
function fieldMatches(value: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as { in?: unknown[]; not?: unknown; gte?: Date };
    if (c.in && !c.in.includes(value)) return false;
    if ('not' in c && value === c.not) return false;
    if (c.gte && !(value instanceof Date && value >= c.gte)) return false;
    return true;
  }
  return value === cond;
}
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) => fieldMatches(row[k], v));

/** The user sounds table in memory, with the columns' defaults and the unique slug. */
function userSoundTable() {
  const rows: Row[] = [];
  let n = 0;
  const clash = (data: Row, self?: Row) =>
    typeof data.slug === 'string' && rows.some((r) => r !== self && r.slug === data.slug);
  return {
    rows,
    client: {
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) =>
        rows.filter((r) => matches(r, where)).map((r) => ({ ...r }))
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
        if (clash(data)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const at = new Date(Date.UTC(2026, 9, 17, 0, ++n));
        const row: Row = {
          id: `snd${n}`,
          notes: null,
          sourceSoundId: null,
          sourceSlug: null,
          sourceName: null,
          sourceRef: null,
          sourceUserSoundId: null,
          visibility: 'private',
          slug: null,
          publishedAt: null,
          tags: [],
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
          Object.assign(r, data, { updatedAt: new Date(Date.UTC(2026, 9, 18, 0, ++n)) });
        return { count: hit.length };
      }),
    },
  };
}

let table: ReturnType<typeof userSoundTable>;
type Profile = { username: string; public: boolean; recentPublishes: Date[] };
/** Synth profiles by user id: `user-1` private, `user-2` public, `user-3` none. */
let profiles: Map<string, Profile>;
const userTable = { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() };
/** The owner's lock (`lockOwnersSounds`): the only raw query sharing runs. */
const lockQuery = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  table = userSoundTable();
  mockPrisma.userSound = table.client;
  profiles = new Map([
    ['user-1', { username: 'moog-fan', public: false, recentPublishes: [] }],
    ['user-2', { username: 'patchwork', public: true, recentPublishes: [] }],
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
      return p ? { recentPublishes: [...p.recentPublishes] } : null;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { userId: string }; data: { recentPublishes: Date[] } }) => {
        profiles.get(where.userId)!.recentPublishes = data.recentPublishes;
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
  // Nothing in sharing reads the account (the lock only takes its row): a read of it here fails the test that made it.
  mockPrisma.user = userTable;
  mockPrisma.synth = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === 'model-d' ? { listed: true } : null
    ),
  };
  mockPrisma.synthSound = {
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { id?: string; synthId_slug?: { synthId: string; slug: string } };
      }) =>
        librarySounds.find((s) =>
          where.id
            ? s.id === where.id
            : s.synthId === where.synthId_slug!.synthId && s.slug === where.synthId_slug!.slug
        ) ?? null
    ),
    findMany: vi.fn(async ({ where }: { where: { synthId: string } }) =>
      librarySounds.filter((s) => s.synthId === where.synthId).map((s) => ({ tags: s.tags }))
    ),
  };
  signIn('user-1');
});

async function save(body: unknown): Promise<Row> {
  const res = await create(request('POST', '/api/v1/sounds', body));
  expect(res.status).toBe(201);
  return (await json(res)).data!;
}
const patch = (id: string, body: unknown) =>
  change(request('PATCH', `/api/v1/sounds/${id}`, body), ctx(id));
const publishIt = (id: string, body: unknown = { confirm: true }) =>
  publish(request('POST', `/api/v1/sounds/${id}/publish`, body), ctx(id));
const shared = (slug: string) =>
  readShared(request('GET', `/api/v1/public/sounds/${slug}`), slugCtx(slug));
const rowOf = (id: unknown) => table.rows.find((r) => r.id === id)!;

describe('sharing by link', () => {
  it('mints a slug the first time a sound leaves private, and keeps it after', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    expect(sound).toMatchObject({ visibility: 'private', slug: null });

    const linked = (await json(await patch(String(sound.id), { visibility: 'link' }))).data!;
    expect(linked.visibility).toBe('link');
    expect(linked.slug).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/);

    await patch(String(sound.id), { visibility: 'private' });
    expect(rowOf(sound.id)).toMatchObject({ visibility: 'private', slug: linked.slug });
    const again = (await json(await patch(String(sound.id), { visibility: 'link' }))).data!;
    expect(again.slug).toBe(linked.slug);
  });

  it('mints another slug when the first is taken', async () => {
    const a = await save({ synthId: 'model-d', name: 'A', panel });
    const b = await save({ synthId: 'model-d', name: 'B', panel });
    // zero bytes mint '0000000000': the same slug twice, then the real generator
    const zeros = <T extends ArrayBufferView | null>(arr: T): T => arr;
    const spy = vi.spyOn(crypto, 'getRandomValues');
    spy.mockImplementationOnce(zeros).mockImplementationOnce(zeros);
    await patch(String(a.id), { visibility: 'link' });
    const res = await patch(String(b.id), { visibility: 'link' });
    spy.mockRestore();
    expect(rowOf(a.id).slug).toBe('0000000000');
    expect(res.status).toBe(200);
    expect(rowOf(b.id).slug).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/);
    expect(rowOf(b.id).slug).not.toBe('0000000000');
  });

  it('cannot publish through PATCH', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    const res = await patch(String(sound.id), { visibility: 'published' });
    expect(res.status).toBe(400);
    expect(rowOf(sound.id)).toMatchObject({ visibility: 'private', slug: null });
  });

  it("is a 404 on someone else's sound, which is left as it was", async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    signIn('user-2');
    expect((await patch(String(sound.id), { visibility: 'link' })).status).toBe(404);
    expect(rowOf(sound.id)).toMatchObject({ visibility: 'private', slug: null });
  });

  it("takes the owner's lock before it reads the sound", async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    table.client.findFirst.mockClear();
    await patch(String(sound.id), { visibility: 'link' });
    expect(lockQuery).toHaveBeenCalledTimes(1);
    expect(lockQuery.mock.calls[0]).toContain('user-1');
    expect(lockQuery.mock.invocationCallOrder[0]).toBeLessThan(
      table.client.findFirst.mock.invocationCallOrder[0]
    );
  });
});

describe('publishing', () => {
  it('lists the sound with a slug, the first date and its tags', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    const res = await publishIt(String(sound.id), { confirm: true, tags: [libraryTag] });
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data).toMatchObject({ visibility: 'published', tags: [libraryTag] });
    expect(data!.slug).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/);
    expect(rowOf(sound.id).publishedAt).toBeInstanceOf(Date);
  });

  it('keeps the first date when republished, and does not count it again', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    await publishIt(String(sound.id));
    const first = rowOf(sound.id).publishedAt;
    await patch(String(sound.id), { visibility: 'link' });
    expect(rowOf(sound.id)).toMatchObject({ visibility: 'link', publishedAt: first });
    const again = await publishIt(String(sound.id));
    expect(again.status).toBe(200);
    expect(rowOf(sound.id).publishedAt).toBe(first);
    expect(profiles.get('user-1')!.recentPublishes).toEqual([first]);
  });

  it('keeps the tags it had when republished with none sent, and drops one the library no longer uses', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    await publishIt(String(sound.id), { confirm: true, tags: [libraryTag] });
    await patch(String(sound.id), { visibility: 'link' });
    rowOf(sound.id).tags = [libraryTag, 'gone-from-the-library'];
    expect((await publishIt(String(sound.id))).status).toBe(200);
    expect(rowOf(sound.id).tags).toEqual([libraryTag]);
    expect((await publishIt(String(sound.id), { confirm: true, tags: [] })).status).toBe(200);
    expect(rowOf(sound.id).tags).toEqual([]);
  });

  it("takes the owner's lock before it reads the sound", async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    table.client.findFirst.mockClear();
    await publishIt(String(sound.id));
    expect(lockQuery).toHaveBeenCalledTimes(1);
    expect(lockQuery.mock.calls[0]).toContain('user-1');
    expect(lockQuery.mock.invocationCallOrder[0]).toBeLessThan(
      table.client.findFirst.mock.invocationCallOrder[0]
    );
  });

  async function refused(id: unknown, body: unknown = { confirm: true }) {
    const before = { ...rowOf(id) };
    const spent = [...(profiles.get('user-1')?.recentPublishes ?? [])];
    const res = await publishIt(String(id), body);
    expect(rowOf(id)).toEqual(before);
    expect(profiles.get('user-1')?.recentPublishes ?? []).toEqual(spent);
    return { status: res.status, code: (await json(res)).error?.code };
  }

  it('needs the confirmation', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    expect(await refused(sound.id, {})).toMatchObject({ status: 400 });
  });

  it("is a 404 on someone else's sound", async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    signIn('user-2');
    expect(await refused(sound.id)).toEqual({ status: 404, code: 'NOT_FOUND' });
  });

  it('needs a username', async () => {
    signIn('user-3');
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    expect(await refused(sound.id)).toEqual({ status: 409, code: 'USERNAME_REQUIRED' });
  });

  it('refuses a sound saved on a definition the synth has moved on from', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    rowOf(sound.id).definitionVersion = modelD.version - 1;
    const res = await publishIt(String(sound.id));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatchObject({
      code: 'NOT_PLAYABLE',
      message: expect.stringContaining('saved on an older'),
    });
  });

  it('refuses a panel that no longer passes, without blaming the version', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    rowOf(sound.id).values = { 'not-a-control': 1 };
    const res = await publishIt(String(sound.id));
    expect(res.status).toBe(409);
    const { error } = await json(res);
    expect(error).toMatchObject({
      code: 'NOT_PLAYABLE',
      message: expect.stringContaining('no longer fit'),
    });
    expect(error!.message).not.toContain('older');
  });

  it('refuses a blocked word in the name or the notes', async () => {
    const named = await save({ synthId: 'model-d', name: 'Sh1t bass', panel });
    expect(await refused(named.id)).toEqual({ status: 422, code: 'NOT_ALLOWED' });
    const noted = await save({ synthId: 'model-d', name: 'Bass', notes: 'a fucking bass', panel });
    expect(await refused(noted.id)).toEqual({ status: 422, code: 'NOT_ALLOWED' });
    // a word that merely contains one is fine
    const fine = await save({ synthId: 'model-d', name: 'Scunthorpe bass', panel });
    expect((await publishIt(String(fine.id))).status).toBe(200);
  });

  it('refuses an unchanged copy of a library sound, and takes a changed one', async () => {
    const copy = await save({ synthId: 'model-d', source: { slug: firstSound.slug } });
    expect(await refused(copy.id)).toEqual({ status: 409, code: 'DUPLICATE' });
    await patch(String(copy.id), { panel: otherPanel });
    expect((await publishIt(String(copy.id))).status).toBe(200);
  });

  it('refuses an unchanged copy of a shared sound', async () => {
    signIn('user-2');
    const original = await save({ synthId: 'model-d', name: 'Theirs', panel });
    await patch(String(original.id), { visibility: 'link' });
    signIn('user-1');
    const copy = await save({
      synthId: 'model-d',
      source: { shared: String(rowOf(original.id).slug) },
    });
    expect(await refused(copy.id)).toEqual({ status: 409, code: 'DUPLICATE' });
  });

  it("refuses a tag the synth's library does not use", async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    expect(await refused(sound.id, { confirm: true, tags: ['not-a-model-d-tag'] })).toMatchObject({
      status: 400,
    });
    expect(
      await refused(sound.id, { confirm: true, tags: [libraryTag, libraryTag] })
    ).toMatchObject({ status: 400 });
  });

  it(`refuses more than ${PUBLISH_DAILY_CAP} first publications in a day`, async () => {
    for (let i = 0; i < PUBLISH_DAILY_CAP; i++) {
      const s = await save({ synthId: 'model-d', name: `Sound ${i}`, panel });
      expect((await publishIt(String(s.id))).status).toBe(200);
    }
    const one = await save({ synthId: 'model-d', name: 'One more', panel });
    expect(await refused(one.id)).toEqual({ status: 429, code: 'PUBLISH_LIMIT' });
  });

  it('does not give a place back when a published sound is deleted', async () => {
    for (let i = 0; i < PUBLISH_DAILY_CAP; i++) {
      const s = await save({ synthId: 'model-d', name: `Sound ${i}`, panel });
      await publishIt(String(s.id));
    }
    table.rows.splice(0, table.rows.length);
    const one = await save({ synthId: 'model-d', name: 'One more', panel });
    expect(await refused(one.id)).toEqual({ status: 429, code: 'PUBLISH_LIMIT' });
  });

  it('counts only the last 24 hours, and forgets the older ones', async () => {
    const now = Date.now();
    const old = Array.from(
      { length: PUBLISH_DAILY_CAP },
      () => new Date(now - 25 * 60 * 60 * 1000)
    );
    profiles.get('user-1')!.recentPublishes = old;
    const one = await save({ synthId: 'model-d', name: 'One more', panel });
    expect((await publishIt(String(one.id))).status).toBe(200);
    expect(profiles.get('user-1')!.recentPublishes).toHaveLength(1);
  });
});

describe('a published sound stays held to the checks', () => {
  it('refuses a blocked name and writes nothing', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    await publishIt(String(sound.id));
    const res = await patch(String(sound.id), { name: 'Twat bass' });
    expect(res.status).toBe(422);
    expect(rowOf(sound.id).name).toBe('Night bass');
  });

  it('refuses a panel put back to the library sound it was copied from', async () => {
    const copy = await save({ synthId: 'model-d', source: { slug: firstSound.slug } });
    await patch(String(copy.id), { panel: otherPanel });
    await publishIt(String(copy.id));
    const res = await patch(String(copy.id), { panel: libraryPanel(modelD, firstSound) });
    expect(res.status).toBe(409);
    expect(rowOf(copy.id).values).toEqual(otherPanel.values);
  });

  it('takes the same change when it unpublishes in the same edit', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    await publishIt(String(sound.id));
    const res = await patch(String(sound.id), { name: 'Twat bass', visibility: 'private' });
    expect(res.status).toBe(200);
  });
});

describe('the public read', () => {
  it('serves a link and a published sound with their panels', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', notes: 'darker', panel });
    await patch(String(sound.id), { visibility: 'link' });
    const slug = String(rowOf(sound.id).slug);
    const link = await json(await shared(slug));
    expect(link.data).toMatchObject({
      slug,
      synthId: 'model-d',
      visibility: 'link',
      name: 'Night bass',
      notes: 'darker',
      playable: true,
      panel,
      publishedAt: null,
    });

    await publishIt(String(sound.id));
    const pub = await json(await shared(slug));
    expect(pub.data).toMatchObject({ visibility: 'published', panel });
    expect(pub.data!.publishedAt).toEqual(expect.any(String));
  });

  it('shows tags only while the sound is published', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    await publishIt(String(sound.id), { confirm: true, tags: [libraryTag] });
    const slug = String(rowOf(sound.id).slug);
    expect((await json(await shared(slug))).data!.tags).toEqual([libraryTag]);
    await patch(String(sound.id), { visibility: 'link' });
    expect((await json(await shared(slug))).data!.tags).toEqual([]);
  });

  it('logs nothing for a stored panel that no longer passes, however often it is read', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    await patch(String(sound.id), { visibility: 'link' });
    rowOf(sound.id).values = { 'not-a-control': 1 };
    const slug = String(rowOf(sound.id).slug);
    const res = await shared(slug);
    await shared(slug);
    expect((await json(res)).data).toMatchObject({ playable: false, panel: null });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('is one 404 for private, unknown and malformed', async () => {
    const sound = await save({ synthId: 'model-d', name: 'Night bass', panel });
    await patch(String(sound.id), { visibility: 'link' });
    const slug = String(rowOf(sound.id).slug);
    await patch(String(sound.id), { visibility: 'private' });

    const answers = await Promise.all(
      [slug, 'zzzzzzzzzz', 'NOT-A-SLUG', 'iiiiiiiiii'].map(async (s) => {
        const res = await shared(s);
        return { status: res.status, body: await res.text() };
      })
    );
    expect(answers.map((a) => a.status)).toEqual([404, 404, 404, 404]);
    expect(new Set(answers.map((a) => a.body)).size).toBe(1);
  });

  it("never carries the owner's id, the row's id or the account", async () => {
    const copy = await save({ synthId: 'model-d', source: { slug: firstSound.slug } });
    await patch(String(copy.id), { panel: otherPanel });
    await publishIt(String(copy.id));
    const res = await shared(String(rowOf(copy.id).slug));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(body).data.source).toMatchObject({ slug: firstSound.slug });
    expect(body).not.toContain('user-1');
    expect(body).not.toContain(String(copy.id));
    expect(body).not.toContain(String(firstSound.id));
    expect(body).not.toMatch(/userId|email/);
    expect(userTable.findUnique).not.toHaveBeenCalled();
    expect(userTable.findMany).not.toHaveBeenCalled();
    expect(userTable.findFirst).not.toHaveBeenCalled();
  });

  it('names the owner of a published sound, and of a link share only when their profile is public', async () => {
    // user-1's profile is private
    const mine = await save({ synthId: 'model-d', name: 'Mine', panel });
    await patch(String(mine.id), { visibility: 'link' });
    const slug = String(rowOf(mine.id).slug);
    expect((await json(await shared(slug))).data).toMatchObject({
      author: null,
      authorProfile: false,
    });
    await publishIt(String(mine.id));
    expect((await json(await shared(slug))).data).toMatchObject({
      author: 'moog-fan',
      authorProfile: false,
    });

    // user-2's profile is public
    signIn('user-2');
    const theirs = await save({ synthId: 'model-d', name: 'Theirs', panel });
    await patch(String(theirs.id), { visibility: 'link' });
    expect((await json(await shared(String(rowOf(theirs.id).slug)))).data).toMatchObject({
      author: 'patchwork',
      authorProfile: true,
    });
  });
});

describe('copying a shared sound', () => {
  async function theirs(visibility: 'link' | 'published') {
    signIn('user-2');
    const copyOfLibrary = await save({ synthId: 'model-d', source: { slug: firstSound.slug } });
    await patch(String(copyOfLibrary.id), { panel: otherPanel, name: 'Their bass' });
    if (visibility === 'published') await publishIt(String(copyOfLibrary.id));
    else await patch(String(copyOfLibrary.id), { visibility: 'link' });
    signIn('user-1');
    return rowOf(copyOfLibrary.id);
  }

  it('records the source, takes its panel, name and notes, and carries its library credit', async () => {
    const source = await theirs('published');
    const copy = await save({ synthId: 'model-d', source: { shared: String(source.slug) } });
    expect(rowOf(copy.id)).toMatchObject({
      userId: 'user-1',
      visibility: 'private',
      sourceUserSoundId: source.id,
      sourceSoundId: firstSound.id,
      sourceSlug: firstSound.slug,
    });
    expect(copy).toMatchObject({
      name: 'Their bass',
      panel: { values: { ...otherPanel.values }, cables: [] },
      source: { slug: firstSound.slug },
      basedOn: {
        name: 'Their bass',
        username: 'patchwork',
        synthId: 'model-d',
        slug: source.slug,
      },
    });
  });

  it('is credited only while the source is published', async () => {
    const source = await theirs('published');
    const copy = await save({ synthId: 'model-d', source: { shared: String(source.slug) } });
    const credit = async () =>
      (
        await json(
          await read(request('GET', `/api/v1/sounds/${String(copy.id)}`), ctx(String(copy.id)))
        )
      ).data!.basedOn;
    expect(await credit()).toMatchObject({ username: 'patchwork' });

    rowOf(source.id).visibility = 'link';
    expect(await credit()).toBeNull();

    rowOf(source.id).visibility = 'published';
    expect(await credit()).toMatchObject({ username: 'patchwork' });

    // the source deleted, or its owner erased: the SetNull leaves nothing to credit
    table.rows.splice(table.rows.indexOf(rowOf(source.id)), 1);
    rowOf(copy.id).sourceUserSoundId = null;
    expect(await credit()).toBeNull();
  });

  it('copies a link share with no credit', async () => {
    const source = await theirs('link');
    const copy = await save({ synthId: 'model-d', source: { shared: String(source.slug) } });
    expect(rowOf(copy.id).sourceUserSoundId).toBe(source.id);
    expect(copy.basedOn).toBeNull();
  });

  it('refuses a private sound as it refuses an unknown one, and stores nothing', async () => {
    const source = await theirs('link');
    rowOf(source.id).visibility = 'private';
    const before = table.rows.length;
    const res = await create(
      request('POST', '/api/v1/sounds', {
        synthId: 'model-d',
        source: { shared: String(source.slug) },
      })
    );
    const unknown = await create(
      request('POST', '/api/v1/sounds', { synthId: 'model-d', source: { shared: 'zzzzzzzzzz' } })
    );
    expect([res.status, unknown.status]).toEqual([400, 400]);
    expect((await json(res)).error!.message).toBe((await json(unknown)).error!.message);
    expect(table.rows).toHaveLength(before);
  });

  it('records no source for a copy of your own', async () => {
    const mine = await save({ synthId: 'model-d', name: 'Mine', panel });
    await patch(String(mine.id), { visibility: 'link' });
    const copy = await save({
      synthId: 'model-d',
      source: { shared: String(rowOf(mine.id).slug) },
    });
    expect(rowOf(copy.id).sourceUserSoundId).toBeNull();
  });
});
