/**
 * Unit Tests: links on a user's own sound (`f-link-suggestions` t-187).
 *
 * `PATCH /api/v1/sounds/:id` with `links`, `POST /api/v1/sounds/:id/publish`, a copy through `POST /api/v1/sounds`, and
 * `GET /api/v1/public/sounds/:slug`. Real routes, real `withAuth`, the real store, sharing, publish and links modules
 * and the real link parser; only the provider read (`resolveLinkDetails`) is faked, so no request leaves the test. The
 * tables are the sharing tests' stateful fakes. Pins:
 *
 * - links are stored in the owner's order at their canonical address, titled by the owner or else the provider, and
 *   served with the embed built from the provider's id; an address the sound already had is not read again;
 * - more than five, a plain web address, the same address twice, and a link with no title to be had are each a 400
 *   naming the row, with nothing stored;
 * - a blocked word in a link's title is refused at publish and on an edit to a published sound, whoever wrote it;
 * - a copy carries none; a private or unlisted sound's links are not served; a stored entry that no longer parses is
 *   not served either;
 * - saving links is capped per user (the 429), and a change that sends none does not spend it.
 *
 * The real `links` column, and the export that carries it, are proved against a database in `npm run smoke:sounds`.
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

const mockResolve = vi.hoisted(() => vi.fn());
vi.mock('@/lib/app/links/details', () => ({ resolveLinkDetails: mockResolve }));

import { POST as create } from '@/app/api/v1/sounds/route';
import { PATCH as change } from '@/app/api/v1/sounds/[id]/route';
import { POST as publish } from '@/app/api/v1/sounds/[id]/publish/route';
import { GET as readShared } from '@/app/api/v1/public/sounds/[slug]/route';
import { getSynthDef } from '@/lib/app/synths/defs';
import { soundLinksLimiter, soundLinksLimitKey } from '@/lib/app/sounds/links';
import type { Control } from '@/lib/app/synths/contract';
import { createMockAuthSession } from '@/tests/helpers/auth';
import { synthRows } from '@/tests/helpers/synth-detail';

type Row = Record<string, unknown>;

const modelD = getSynthDef('model-d')!;
const librarySounds = synthRows('model-d').stored.sounds;

const cont = modelD.controls.find(
  (c): c is Extract<Control, { kind: 'cont' }> => c.kind === 'cont'
)!;
const outJack = modelD.jacks.find((j) => j.dir === 'out' && j.signal)!;
const inJack = modelD.jacks.find((j) => j.dir === 'in' && j.dest)!;

const panel = { values: { [cont.id]: cont.min }, cables: [[outJack.id, inJack.id]] };

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
          unlistedAt: null,
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

const VIDEO = 'dQw4w9WgXcQ';
const youtube = `https://www.youtube.com/watch?v=${VIDEO}&feature=share`;
const VIMEO = 'https://vimeo.com/76979871';

/** A sound of user-1's, saved private. */
const mine = () => save({ synthId: 'model-d', name: 'Bass', panel });
/** One of user-1's sounds, published. */
async function published(): Promise<Row> {
  const sound = await mine();
  expect((await publishIt(String(sound.id))).status).toBe(200);
  return sound;
}
const setLinks = (id: unknown, links: unknown) => patch(String(id), { links });
async function refusal(res: Response) {
  const body = await json(res);
  return {
    status: res.status,
    code: body.error?.code,
    paths: (
      (body.error as { details?: { errors?: { path: string }[] } })?.details?.errors ?? []
    ).map((e) => e.path),
  };
}

beforeEach(() => {
  mockResolve.mockReset();
  mockResolve.mockResolvedValue({
    title: 'From the provider',
    thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO}/maxresdefault.jpg`,
    providerId: null,
  });
  soundLinksLimiter.reset(soundLinksLimitKey('user-1'));
  soundLinksLimiter.reset(soundLinksLimitKey('user-2'));
});

describe('saving links', () => {
  it("stores them in the owner's order at their canonical address, and serves the embed built from the id", async () => {
    const sound = await mine();
    const res = await setLinks(sound.id, [{ url: VIMEO, title: 'My demo' }, { url: youtube }]);
    expect(res.status).toBe(200);
    const links = (await json(res)).data!.links as Row[];
    expect(links).toEqual([
      {
        url: VIMEO,
        provider: 'vimeo',
        title: 'My demo',
        // the fake provider answered with a YouTube picture, which is not on Vimeo's image hosts, so it is not shown
        thumbnailUrl: null,
        embedUrl: 'https://player.vimeo.com/video/76979871?dnt=1',
      },
      {
        // tracking parameters gone, rebuilt from the id; the provider's title, as none was given
        url: `https://www.youtube.com/watch?v=${VIDEO}`,
        provider: 'youtube',
        title: 'From the provider',
        thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO}/maxresdefault.jpg`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${VIDEO}`,
      },
    ]);
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });

  it('does not read an address the sound already has again, and replaces the whole list', async () => {
    const sound = await mine();
    await setLinks(sound.id, [{ url: youtube }]);
    mockResolve.mockClear();
    // sent back with its title, as the form sends it
    const res = await setLinks(sound.id, [
      { url: VIMEO, title: 'New one' },
      { url: youtube, title: 'From the provider' },
    ]);
    expect(res.status).toBe(200);
    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(mockResolve.mock.calls[0][0]).toMatchObject({ provider: 'vimeo' });
    // the kept one keeps what was read for it
    expect(((await json(res)).data!.links as Row[]).map((l) => l.title)).toEqual([
      'New one',
      'From the provider',
    ]);

    const cleared = await setLinks(sound.id, []);
    expect((await json(cleared)).data!.links).toEqual([]);
    expect(rowOf(sound.id).links).toEqual([]);
  });

  it("gives a link the provider's title back when the owner clears theirs, and keeps it if the provider says nothing", async () => {
    const sound = await mine();
    await setLinks(sound.id, [{ url: youtube, title: 'My rough demo' }]);
    const cleared = await setLinks(sound.id, [{ url: youtube }]);
    expect(((await json(cleared)).data!.links as Row[])[0].title).toBe('From the provider');

    await setLinks(sound.id, [{ url: youtube, title: 'Mine again' }]);
    mockResolve.mockResolvedValue(null);
    const unanswered = await setLinks(sound.id, [{ url: youtube }]);
    expect(((await json(unanswered)).data!.links as Row[])[0]).toMatchObject({
      title: 'Mine again',
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO}/maxresdefault.jpg`,
    });
  });

  it('reads a Bandcamp link again until its page gives the id its embed needs', async () => {
    const bandcamp = 'https://artist.bandcamp.com/album/night-drive';
    mockResolve.mockResolvedValue(null);
    const sound = await mine();
    const first = await setLinks(sound.id, [{ url: bandcamp, title: 'Night drive' }]);
    expect(((await json(first)).data!.links as Row[])[0].embedUrl).toBeNull();

    mockResolve.mockResolvedValue({
      title: 'Night Drive',
      thumbnailUrl: null,
      providerId: 'album=123',
    });
    const again = await setLinks(sound.id, [{ url: bandcamp, title: 'Night drive' }]);
    expect(mockResolve).toHaveBeenCalledTimes(2);
    expect(((await json(again)).data!.links as Row[])[0]).toMatchObject({
      title: 'Night drive',
      embedUrl: expect.stringContaining('https://bandcamp.com/EmbeddedPlayer/album=123/'),
    });
    // with its id read, it is kept as it is
    await setLinks(sound.id, [{ url: bandcamp, title: 'Night drive' }]);
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });

  it('refuses more than five, and stores nothing', async () => {
    const sound = await mine();
    const six = Array.from({ length: 6 }, (_, i) => ({ url: `https://youtu.be/dQw4w9WgXc${i}` }));
    expect((await setLinks(sound.id, six)).status).toBe(400);
    expect(rowOf(sound.id).links).toBeUndefined();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('refuses a plain web address and the same address twice, naming each row, and reads no provider', async () => {
    const sound = await mine();
    expect(
      await refusal(
        await setLinks(sound.id, [
          { url: 'https://example.com/my-demo' },
          { url: youtube },
          { url: `https://youtu.be/${VIDEO}` },
        ])
      )
    ).toEqual({ status: 400, code: 'VALIDATION_ERROR', paths: ['links.0.url', 'links.2.url'] });
    expect(rowOf(sound.id).links).toBeUndefined();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('refuses a link with no title when its provider gives none', async () => {
    mockResolve.mockResolvedValue(null);
    const sound = await mine();
    expect(
      await refusal(await setLinks(sound.id, [{ url: VIMEO, title: 'Kept' }, { url: youtube }]))
    ).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      paths: ['links.1.title'],
    });
    expect(rowOf(sound.id).links).toBeUndefined();
  });

  it("is a 404 on someone else's sound, which is left as it was, and reads no provider", async () => {
    const sound = await mine();
    signIn('user-2');
    expect((await setLinks(sound.id, [{ url: youtube }])).status).toBe(404);
    expect(rowOf(sound.id).links).toBeUndefined();
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe('the word check', () => {
  it("refuses a published sound's link title with a blocked word, and writes nothing", async () => {
    const sound = await published();
    const res = await setLinks(sound.id, [{ url: youtube, title: 'Sh1t demo' }]);
    expect(await refusal(res)).toMatchObject({ status: 422, code: 'NOT_ALLOWED' });
    expect(rowOf(sound.id).links).toBeUndefined();
  });

  it("refuses one the provider wrote just the same: it shows on the sound's page either way", async () => {
    mockResolve.mockResolvedValue({
      title: 'A fucking demo',
      thumbnailUrl: null,
      providerId: null,
    });
    const sound = await published();
    expect((await setLinks(sound.id, [{ url: youtube }])).status).toBe(422);
  });

  it('takes it on a private sound, then refuses to publish it until the title changes', async () => {
    const sound = await mine();
    expect((await setLinks(sound.id, [{ url: youtube, title: 'Sh1t demo' }])).status).toBe(200);
    expect(await refusal(await publishIt(String(sound.id)))).toMatchObject({
      status: 422,
      code: 'NOT_ALLOWED',
    });
    expect(rowOf(sound.id).visibility).toBe('private');
    await setLinks(sound.id, [{ url: youtube, title: 'Clean demo' }]);
    expect((await publishIt(String(sound.id))).status).toBe(200);
  });

  it('does not hold a rename of a published sound to links it already has', async () => {
    const sound = await published();
    await setLinks(sound.id, [{ url: youtube, title: 'Fine' }]);
    expect((await patch(String(sound.id), { name: 'Bass two' })).status).toBe(200);
  });
});

describe('a copy and the public read', () => {
  it('a copy of a shared sound carries none of its links', async () => {
    const sound = await published();
    await setLinks(sound.id, [{ url: youtube }]);
    signIn('user-2');
    const copy = await save({ synthId: 'model-d', source: { shared: rowOf(sound.id).slug } });
    expect(copy.links).toEqual([]);
    expect(rowOf(copy.id).links).toBeUndefined();
  });

  it('serves a link share and a published sound with their links, and a private or unlisted one not at all', async () => {
    const sound = await mine();
    await setLinks(sound.id, [{ url: youtube }]);
    await patch(String(sound.id), { visibility: 'link' });
    const slug = String(rowOf(sound.id).slug);
    const byLink = await json(await shared(slug));
    expect((byLink.data!.links as Row[]).map((l) => l.embedUrl)).toEqual([
      `https://www.youtube-nocookie.com/embed/${VIDEO}`,
    ]);
    expect((await publishIt(String(sound.id))).status).toBe(200);
    expect(((await json(await shared(slug))).data!.links as Row[]).length).toBe(1);

    rowOf(sound.id).unlistedAt = new Date();
    expect((await shared(slug)).status).toBe(404);
    rowOf(sound.id).unlistedAt = null;
    await patch(String(sound.id), { visibility: 'private' });
    expect((await shared(slug)).status).toBe(404);
  });

  it('does not serve a stored entry that no longer parses to its provider', async () => {
    const sound = await mine();
    await setLinks(sound.id, [{ url: youtube }]);
    await patch(String(sound.id), { visibility: 'link' });
    const stored = rowOf(sound.id).links as Row[];
    rowOf(sound.id).links = [
      ...stored,
      { ...stored[0], url: 'https://example.com/elsewhere' },
      { ...stored[0], provider: 'other' },
      'not a link',
    ];
    const served = (await json(await shared(String(rowOf(sound.id).slug)))).data!.links as Row[];
    expect(served.map((l) => l.url)).toEqual([`https://www.youtube.com/watch?v=${VIDEO}`]);
  });
});

describe('the sub-cap', () => {
  it('allows twenty saves of links an hour: the next is a 429 with rate-limit headers, and stores nothing', async () => {
    const sound = await mine();
    for (let i = 0; i < 20; i++) expect((await setLinks(sound.id, [])).status).toBe(200);
    const res = await setLinks(sound.id, [{ url: youtube }]);
    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(rowOf(sound.id).links).toEqual([]);
    expect(mockResolve).not.toHaveBeenCalled();

    // a change with no links does not spend it, and another account is not held back by this one
    expect((await patch(String(sound.id), { name: 'Still renamable' })).status).toBe(200);
    signIn('user-2');
    const theirs = await mine();
    expect((await setLinks(theirs.id, [{ url: youtube }])).status).toBe(200);
  });
});
