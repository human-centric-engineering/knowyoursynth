/**
 * Unit Tests: the videos and links admin API (`f-videos-and-links` t-179).
 *
 * Real routes, real `withAdminAuth`, the real `lib/app/links/*`, over a stateful fake of the table and its owners
 * (`tests/helpers/links-store.ts`) that keeps its unique and one-owner rules. Pins:
 *
 * - every route is admin only, and a refusal writes nothing;
 * - create parses the URL (provider and id come from it, not the caller), checks the owner, refuses a duplicate with
 *   409, puts a new "ours" link last among its owner's own, and is audited;
 * - update never moves the owner, drops what was read from an old URL, writes and audits nothing when nothing changed;
 * - delete is audited; a missing link is 404;
 * - reorder names every one of the owner's own videos once, or nothing moves;
 * - the list filters by owner, provider and ours, and pages.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

// What the provider says (t-180): nothing, unless a test says otherwise. Both are tested on their own.
const mockResolve = vi.hoisted(() => vi.fn());
vi.mock('@/lib/app/links/details', () => ({ resolveLinkDetails: mockResolve }));
const mockStats = vi.hoisted(() => vi.fn());
vi.mock('@/lib/app/links/stats', () => ({ statsForVideo: mockStats }));

import { GET as listLinks, POST as postLink } from '@/app/api/v1/admin/links/route';
import {
  DELETE as deleteLink,
  GET as getLink,
  PATCH as patchLink,
} from '@/app/api/v1/admin/links/[id]/route';
import { PUT as putOrder } from '@/app/api/v1/admin/links/order/route';
import { POST as postResolve } from '@/app/api/v1/admin/links/resolve/route';
import { createMockAuthSession } from '@/tests/helpers/auth';
import { linksStore, type LinksStore } from '@/tests/helpers/links-store';

const VIDEO = 'dQw4w9WgXcQ';
const VIDEO2 = 'abcdefghijk';
const MINIMOOG = 'moog-minimoog';

function session(role: 'USER' | 'ADMIN') {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID },
    user: { ...base.user, role },
  };
}

function request(method: string, path: string, body?: unknown) {
  return new Request(`http://localhost/api/v1/admin/links${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest & { nextUrl: URL };
}
/** `withAdminAuth` hands the handler a NextRequest; the list reads `nextUrl`. */
function getRequest(query: string) {
  const req = request('GET', query);
  Object.defineProperty(req, 'nextUrl', { value: new URL(req.url) });
  return req;
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

type Body = {
  success: boolean;
  data?: Record<string, unknown> & Record<string, unknown>[];
  meta?: { total: number; page: number; limit: number };
  error?: { code: string; message: string };
};
const json = async (res: Response) => JSON.parse(await res.text()) as Body;
const audits = () =>
  mockLogAdminAction.mock.calls.map(
    ([e]) =>
      e as {
        action: string;
        entityId: string;
        entityName: string;
        changes: Record<string, unknown> | null;
      }
  );

let store: LinksStore;

async function create(body: Record<string, unknown>) {
  return postLink(request('POST', '', body));
}
const video = (over: Record<string, unknown> = {}) => ({
  owner: { kind: 'instrument', id: MINIMOOG },
  url: `https://youtu.be/${VIDEO}`,
  kind: 'demo',
  title: 'Minimoog demo',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  store = linksStore({
    instruments: [
      { id: MINIMOOG, name: 'Minimoog Model D' },
      { id: 'arp-odyssey', name: 'ARP Odyssey' },
    ],
    songs: [{ id: 'kraftwerk-autobahn', title: 'Autobahn' }],
    artists: [{ id: 'aphex-twin', name: 'Aphex Twin' }],
    synths: [{ id: 'model-d', listed: true, instrumentIds: [MINIMOOG] }],
    sounds: [
      { id: 'snd1', synthId: 'model-d', slug: 'stacked-night-bass', name: 'Stacked night bass' },
    ],
  });
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, store.client, {
    orgMembership: {
      findUnique: vi.fn(async () => ({ role: 'OWNER', org: { status: 'ACTIVE' } })),
    },
    aiApiKey: { findFirst: vi.fn(async () => null), update: vi.fn() },
  });
  mockGetSession.mockResolvedValue(session('ADMIN'));
  mockResolve.mockResolvedValue(null);
  mockStats.mockResolvedValue(null);
});

describe('admin only', () => {
  it('refuses a signed-in user who is not an admin, on every route, and writes nothing', async () => {
    const existing = store.insert({
      instrumentId: MINIMOOG,
      url: 'https://example.com/a',
      provider: 'other',
      title: 'A',
    });
    mockGetSession.mockResolvedValue(session('USER'));
    const responses = [
      await listLinks(getRequest('')),
      await create(video()),
      await getLink(request('GET', `/${String(existing.id)}`), ctx(String(existing.id))),
      await patchLink(
        request('PATCH', `/${String(existing.id)}`, { title: 'x' }),
        ctx(String(existing.id))
      ),
      await deleteLink(request('DELETE', `/${String(existing.id)}`), ctx(String(existing.id))),
      await putOrder(
        request('PUT', '/order', { owner: { kind: 'instrument', id: MINIMOOG }, ids: [] })
      ),
      await postResolve(request('POST', '/resolve', { url: `https://youtu.be/${VIDEO}` })),
    ];
    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});

describe('POST', () => {
  it('adds a link with the provider and id read from its URL, and audits it', async () => {
    const res = await create(video({ provider: 'vimeo', providerId: 'evil' }));
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data).toMatchObject({
      owner: { kind: 'instrument', id: MINIMOOG, name: 'Minimoog Model D' },
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      providerId: VIDEO,
      embedUrl: `https://www.youtube-nocookie.com/embed/${VIDEO}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO}/hqdefault.jpg`,
      ours: false,
      rating: null,
    });
    expect(store.links).toHaveLength(1);
    expect(store.links[0]).toMatchObject({
      instrumentId: MINIMOOG,
      soundId: null,
      provider: 'youtube',
    });
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'external_link.create',
        entityId: store.links[0].id,
        entityName: 'Minimoog demo',
        changes: expect.objectContaining({
          owner: { from: undefined, to: `instrument:${MINIMOOG}` },
          url: { from: undefined, to: `https://www.youtube.com/watch?v=${VIDEO}` },
        }),
      }),
    ]);
  });

  it('links a library patch by <synth>/<patch>, and a song and an artist by their ids', async () => {
    const owners = [
      { kind: 'sound', id: 'model-d/stacked-night-bass' },
      { kind: 'song', id: 'kraftwerk-autobahn' },
      { kind: 'artist', id: 'aphex-twin' },
    ];
    for (const owner of owners) expect((await create(video({ owner }))).status).toBe(201);
    expect(store.links.map((l) => [l.soundId, l.songId, l.artistId])).toEqual([
      ['snd1', null, null],
      [null, 'kraftwerk-autobahn', null],
      [null, null, 'aphex-twin'],
    ]);
  });

  it('refuses a URL the parser refuses, with its reason, and writes nothing', async () => {
    const res = await create(video({ url: 'javascript:alert(1)' }));
    expect(res.status).toBe(400);
    expect((await json(res)).error?.message).toMatch(/not a web address/);
    const http = await create(video({ url: `http://youtu.be/${VIDEO}` }));
    expect(http.status).toBe(400);
    expect(store.writes).toEqual([]);
  });

  it('refuses an owner that is not there, or an id not of its kind, and writes nothing', async () => {
    expect((await create(video({ owner: { kind: 'instrument', id: 'nope' } }))).status).toBe(400);
    expect((await create(video({ owner: { kind: 'sound', id: 'model-d' } }))).status).toBe(400);
    expect((await create(video({ owner: { kind: 'sound', id: 'model-d/missing' } }))).status).toBe(
      400
    );
    expect((await create(video({ owner: { kind: 'synth', id: 'model-d' } }))).status).toBe(400);
    expect(store.writes).toEqual([]);
  });

  it('refuses the same video twice on one owner, however it was pasted, but allows it on another', async () => {
    expect((await create(video())).status).toBe(201);
    const again = await create(video({ url: `https://www.youtube.com/watch?v=${VIDEO}&t=10s` }));
    expect(again.status).toBe(409);
    // Refused before the provider is asked: a duplicate costs no outbound read or quota.
    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(mockStats).toHaveBeenCalledTimes(1);
    expect((await create(video({ owner: { kind: 'instrument', id: 'arp-odyssey' } }))).status).toBe(
      201
    );
    expect(store.links).toHaveLength(2);
  });

  it('refuses a title missing, a rating out of range and a kind it does not know', async () => {
    expect((await create(video({ title: '   ' }))).status).toBe(400);
    expect((await create(video({ rating: 6 }))).status).toBe(400);
    expect((await create(video({ kind: 'advert' }))).status).toBe(400);
    expect(store.writes).toEqual([]);
  });

  it('answers an owner removed between the check and the write with 400, and passes other errors on', async () => {
    const create = store.client.externalLink.create;
    store.client.externalLink.create = vi.fn(async () => {
      throw Object.assign(new Error('fk'), { code: 'P2003' });
    });
    expect((await postLink(request('POST', '', video()))).status).toBe(400);
    store.client.externalLink.create = vi.fn(async () => {
      throw new Error('connection lost');
    });
    expect((await postLink(request('POST', '', video()))).status).toBe(500);
    store.client.externalLink.create = create;
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('puts each new "ours" link last among its owner’s own', async () => {
    await create(video({ ours: true }));
    await create(video({ url: `https://youtu.be/${VIDEO2}`, ours: true }));
    await create(video({ url: 'https://example.com/review', ours: false }));
    expect(store.links.map((l) => [l.ours, l.order])).toEqual([
      [true, 0],
      [true, 1],
      [false, 0],
    ]);
  });
});

describe('PATCH', () => {
  it('drops the thumbnail and stats read from an old URL when the URL changes, and audits the change', async () => {
    const row = store.insert({
      instrumentId: MINIMOOG,
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      providerId: VIDEO,
      title: 'Old',
      thumbnailUrl: 'https://i.ytimg.com/old.jpg',
      views: 1234,
      likes: 5,
      statsAt: new Date(),
    });
    const res = await patchLink(
      request('PATCH', `/${String(row.id)}`, { url: 'https://vimeo.com/76979871' }),
      ctx(String(row.id))
    );
    expect(res.status).toBe(200);
    expect(store.links[0]).toMatchObject({
      url: 'https://vimeo.com/76979871',
      provider: 'vimeo',
      providerId: '76979871',
      thumbnailUrl: null,
      views: null,
      likes: null,
      statsAt: null,
      instrumentId: MINIMOOG,
    });
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'external_link.update',
        changes: {
          url: {
            from: `https://www.youtube.com/watch?v=${VIDEO}`,
            to: 'https://vimeo.com/76979871',
          },
        },
      }),
    ]);
  });

  it('writes and audits nothing when nothing changed, the same video pasted another way included', async () => {
    const row = store.insert({
      instrumentId: MINIMOOG,
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      providerId: VIDEO,
      title: 'Same',
      views: 99,
    });
    const res = await patchLink(
      request('PATCH', `/${String(row.id)}`, { url: `https://youtu.be/${VIDEO}`, title: 'Same' }),
      ctx(String(row.id))
    );
    expect(res.status).toBe(200);
    expect(store.writes).toEqual([]);
    expect(store.links[0].views).toBe(99);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('changes kind, title and rating together, and audits each', async () => {
    const row = store.insert({
      songId: 'kraftwerk-autobahn',
      url: 'https://example.com/o',
      provider: 'other',
      title: 'Old',
      rating: 2,
    });
    const id = String(row.id);
    const res = await patchLink(
      request('PATCH', `/${id}`, { kind: 'original', title: 'The original', rating: null }),
      ctx(id)
    );
    expect(res.status).toBe(200);
    expect(store.links[0]).toMatchObject({ kind: 'original', title: 'The original', rating: null });
    expect(audits()[0].changes).toEqual({
      kind: { from: 'demo', to: 'original' },
      title: { from: 'Old', to: 'The original' },
      rating: { from: 2, to: null },
    });
  });

  it('marks a song’s or a patch’s link ours at the end of that owner’s own, and unmarks keeping its order', async () => {
    store.insert({
      songId: 'kraftwerk-autobahn',
      url: 'https://example.com/a',
      provider: 'other',
      title: 'A',
      ours: true,
      order: 2,
    });
    const song = store.insert({
      songId: 'kraftwerk-autobahn',
      url: 'https://example.com/b',
      provider: 'other',
      title: 'B',
    });
    const sound = store.insert({
      soundId: 'snd1',
      url: 'https://example.com/c',
      provider: 'other',
      title: 'C',
    });
    const artist = store.insert({
      artistId: 'aphex-twin',
      url: 'https://example.com/d',
      provider: 'other',
      title: 'D',
    });
    for (const r of [song, sound, artist])
      await patchLink(request('PATCH', `/${String(r.id)}`, { ours: true }), ctx(String(r.id)));
    expect(store.links.slice(1).map((l) => [l.ours, l.order])).toEqual([
      [true, 3],
      [true, 0],
      [true, 0],
    ]);
    await patchLink(request('PATCH', `/${String(song.id)}`, { ours: false }), ctx(String(song.id)));
    expect(store.links[1]).toMatchObject({ ours: false, order: 3 });
  });

  it('answers a link removed mid-save with 404, and passes an unexpected database error on', async () => {
    const row = store.insert({
      instrumentId: MINIMOOG,
      url: 'https://example.com/a',
      provider: 'other',
      title: 'A',
    });
    const id = String(row.id);
    const update = store.client.externalLink.update;
    store.client.externalLink.update = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { code: 'P2025' });
    });
    expect((await patchLink(request('PATCH', `/${id}`, { title: 'B' }), ctx(id))).status).toBe(404);
    store.client.externalLink.update = vi.fn(async () => {
      throw new Error('connection lost');
    });
    expect((await patchLink(request('PATCH', `/${id}`, { title: 'B' }), ctx(id))).status).toBe(500);
    store.client.externalLink.update = update;
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('ignores an attempt to move the link to another owner', async () => {
    const row = store.insert({
      instrumentId: MINIMOOG,
      url: 'https://example.com/a',
      provider: 'other',
      title: 'A',
    });
    const res = await patchLink(
      request('PATCH', `/${String(row.id)}`, { owner: { kind: 'song', id: 'kraftwerk-autobahn' } }),
      ctx(String(row.id))
    );
    // An owner is not a field the update knows, so the body has nothing to change.
    expect(res.status).toBe(400);
    expect(store.links[0]).toMatchObject({ instrumentId: MINIMOOG, songId: null });
  });

  it('marks a link ours at the end of its owner’s own, and refuses a URL already linked there', async () => {
    store.insert({
      instrumentId: MINIMOOG,
      url: 'https://example.com/a',
      provider: 'other',
      title: 'A',
      ours: true,
      order: 4,
    });
    const b = store.insert({
      instrumentId: MINIMOOG,
      url: 'https://example.com/b',
      provider: 'other',
      title: 'B',
    });
    await patchLink(request('PATCH', `/${String(b.id)}`, { ours: true }), ctx(String(b.id)));
    expect(store.links[1]).toMatchObject({ ours: true, order: 5 });
    const clash = await patchLink(
      request('PATCH', `/${String(b.id)}`, { url: 'https://example.com/a' }),
      ctx(String(b.id))
    );
    expect(clash.status).toBe(409);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('is 404 for a link that is not there, and 400 for an id that cannot be one', async () => {
    expect(
      (await patchLink(request('PATCH', '/cmissing0001', { title: 'x' }), ctx('cmissing0001')))
        .status
    ).toBe(404);
    expect(
      (await patchLink(request('PATCH', '/NOT_AN_ID', { title: 'x' }), ctx('NOT_AN_ID'))).status
    ).toBe(400);
  });
});

describe('GET one and DELETE', () => {
  it('reads one link with its owner, removes it with an audit entry, then reads 404', async () => {
    const row = store.insert({
      artistId: 'aphex-twin',
      url: 'https://example.com/a',
      provider: 'other',
      title: 'Profile',
    });
    const id = String(row.id);
    const got = await json(await getLink(request('GET', `/${id}`), ctx(id)));
    expect(got.data).toMatchObject({
      owner: { kind: 'artist', id: 'aphex-twin', name: 'Aphex Twin' },
      embedUrl: null,
    });

    const res = await deleteLink(request('DELETE', `/${id}`), ctx(id));
    expect(res.status).toBe(200);
    expect(store.links).toEqual([]);
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'external_link.delete',
        entityId: id,
        entityName: 'Profile',
      }),
    ]);
    expect((await getLink(request('GET', `/${id}`), ctx(id))).status).toBe(404);
    expect((await deleteLink(request('DELETE', `/${id}`), ctx(id))).status).toBe(404);
  });
});

describe('DELETE races', () => {
  it('answers a link removed by someone else first with 404, passes other errors on, and audits neither', async () => {
    const row = store.insert({
      instrumentId: MINIMOOG,
      url: 'https://example.com/a',
      provider: 'other',
      title: 'A',
    });
    const id = String(row.id);
    const remove = store.client.externalLink.delete;
    store.client.externalLink.delete = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { code: 'P2025' });
    });
    expect((await deleteLink(request('DELETE', `/${id}`), ctx(id))).status).toBe(404);
    store.client.externalLink.delete = vi.fn(async () => {
      throw new Error('connection lost');
    });
    expect((await deleteLink(request('DELETE', `/${id}`), ctx(id))).status).toBe(500);
    store.client.externalLink.delete = remove;
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});

describe('PUT /order', () => {
  function threeOfOurs() {
    return ['a', 'b', 'c'].map((x, order) =>
      store.insert({
        instrumentId: MINIMOOG,
        url: `https://example.com/${x}`,
        provider: 'other',
        title: x,
        ours: true,
        order,
      })
    );
  }
  const owner = { kind: 'instrument', id: MINIMOOG };

  it('puts the owner’s own videos in the order given, and audits it', async () => {
    const [a, b, c] = threeOfOurs().map((r) => String(r.id));
    const res = await putOrder(request('PUT', '/order', { owner, ids: [c, a, b] }));
    expect(res.status).toBe(200);
    const orderOf = (id: string) => store.links.find((l) => l.id === id)?.order;
    expect([orderOf(c), orderOf(a), orderOf(b)]).toEqual([0, 1, 2]);
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'external_link.reorder',
        entityId: `instrument:${MINIMOOG}`,
        changes: { order: { from: [a, b, c], to: [c, a, b] } },
      }),
    ]);
  });

  it('refuses a list that misses one, repeats one or names another, and moves nothing', async () => {
    const [a, b, c] = threeOfOurs().map((r) => String(r.id));
    const theirs = store.insert({
      instrumentId: MINIMOOG,
      url: 'https://example.com/t',
      provider: 'other',
      title: 't',
    });
    for (const ids of [
      [a, b],
      [a, a, b],
      [a, b, String(theirs.id)],
      [a, b, c, String(theirs.id)],
    ]) {
      expect((await putOrder(request('PUT', '/order', { owner, ids }))).status).toBe(400);
    }
    expect(store.writes).toEqual([]);
  });

  it('refuses with 409 when one of its own videos was unmarked mid-reorder, writing nothing onto it (the transaction rolls back the rest)', async () => {
    const [a, b, c] = threeOfOurs().map((r) => String(r.id));
    // The read passes, then another admin unmarks `b` before the writes land.
    const findMany = store.client.externalLink.findMany;
    store.client.externalLink.findMany = vi.fn(async (args: Parameters<typeof findMany>[0]) => {
      const rows = await findMany(args);
      const row = store.links.find((l) => l.id === b);
      if (row) row.ours = false;
      return rows;
    });
    const res = await putOrder(request('PUT', '/order', { owner, ids: [b, c, a] }));
    store.client.externalLink.findMany = findMany;
    expect(res.status).toBe(409);
    expect(store.links.find((l) => l.id === b)).toMatchObject({ ours: false, order: 1 });
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('saves the order asked for even when the stored orders have gaps, a link left in place included', async () => {
    // A0, C2, D3: B (order 1) was removed. Reorder to D, C, A: C stays at index 1 but is stored as 2.
    const [a, c, d] = [
      ['a', 0],
      ['c', 2],
      ['d', 3],
    ].map(([x, order]) =>
      String(
        store.insert({
          instrumentId: MINIMOOG,
          url: `https://example.com/${x}`,
          provider: 'other',
          title: String(x),
          ours: true,
          order,
        }).id
      )
    );
    expect((await putOrder(request('PUT', '/order', { owner, ids: [d, c, a] }))).status).toBe(200);
    const orderOf = (id: string) => store.links.find((l) => l.id === id)?.order;
    expect([orderOf(d), orderOf(c), orderOf(a)]).toEqual([0, 1, 2]);
  });

  it('writes only the links that moved', async () => {
    const [a, b, c] = threeOfOurs().map((r) => String(r.id));
    expect((await putOrder(request('PUT', '/order', { owner, ids: [a, c, b] }))).status).toBe(200);
    expect(store.writes).toEqual([`update ${c}`, `update ${b}`]);
  });

  it('writes and audits nothing when the order is unchanged', async () => {
    const ids = threeOfOurs().map((r) => String(r.id));
    expect((await putOrder(request('PUT', '/order', { owner, ids }))).status).toBe(200);
    expect(store.writes).toEqual([]);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});

describe('GET list', () => {
  it('filters by owner, provider and ours, newest edit first, and pages', async () => {
    store.insert({
      instrumentId: MINIMOOG,
      url: 'https://example.com/1',
      provider: 'other',
      title: '1',
    });
    store.insert({
      instrumentId: MINIMOOG,
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      providerId: VIDEO,
      title: '2',
      ours: true,
    });
    store.insert({
      songId: 'kraftwerk-autobahn',
      url: 'https://example.com/3',
      provider: 'other',
      title: '3',
    });
    store.insert({ soundId: 'snd1', url: 'https://example.com/4', provider: 'other', title: '4' });

    const titles = async (query: string) =>
      ((await json(await listLinks(getRequest(query)))).data ?? []).map((l) => l.title);

    expect(await titles('')).toEqual(['4', '3', '2', '1']);
    expect(await titles(`?instrument=${MINIMOOG}`)).toEqual(['2', '1']);
    expect(await titles('?sound=model-d/stacked-night-bass')).toEqual(['4']);
    expect(await titles('?provider=youtube')).toEqual(['2']);
    expect(await titles('?ours=false')).toEqual(['4', '3', '1']);
    expect(await titles('?instrument=unknown-synth')).toEqual([]);

    const paged = await json(await listLinks(getRequest('?limit=2&page=2')));
    expect(paged.data?.map((l) => l.title)).toEqual(['2', '1']);
    expect(paged.meta).toMatchObject({ total: 4, page: 2, limit: 2 });
  });

  it('refuses two owner filters at once, or an id not of its kind', async () => {
    expect((await listLinks(getRequest(`?instrument=${MINIMOOG}&song=x`))).status).toBe(400);
    expect((await listLinks(getRequest('?sound=no-slash'))).status).toBe(400);
  });
});

describe('what the provider says (t-180)', () => {
  const BANDCAMP = 'https://someartist.bandcamp.com/album/selected-works';

  it('takes the provider’s title when none is given, and stores its picture', async () => {
    mockResolve.mockResolvedValue({
      title: 'Minimoog Model D demo',
      thumbnailUrl: 'https://i.ytimg.com/vi/x/maxresdefault.jpg',
      providerId: null,
    });
    const res = await create(video({ title: undefined }));
    expect(res.status).toBe(201);
    expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({ provider: 'youtube' }));
    expect(store.links[0]).toMatchObject({
      title: 'Minimoog Model D demo',
      thumbnailUrl: 'https://i.ytimg.com/vi/x/maxresdefault.jpg',
    });
  });

  it('keeps the admin’s title over the provider’s', async () => {
    mockResolve.mockResolvedValue({ title: 'Theirs', thumbnailUrl: null, providerId: null });
    expect((await create(video({ title: 'Ours' }))).status).toBe(201);
    expect(store.links[0].title).toBe('Ours');
  });

  it('refuses a link with no title when the provider gives none, and writes nothing', async () => {
    const res = await create(video({ title: undefined }));
    expect(res.status).toBe(400);
    expect((await json(res)).error?.message).toMatch(/title could not be read/);
    expect(store.writes).toEqual([]);
  });

  it('saves a link whose provider did not answer, with the admin’s title', async () => {
    expect((await create(video())).status).toBe(201);
    expect(store.links[0]).toMatchObject({
      title: 'Minimoog demo',
      thumbnailUrl: null,
      views: null,
    });
  });

  it('stores a Bandcamp id read from its page, so it embeds', async () => {
    mockResolve.mockResolvedValue({ title: null, thumbnailUrl: null, providerId: 'album=123' });
    const res = await create(video({ url: BANDCAMP }));
    const { data } = await json(res);
    expect(data).toMatchObject({
      provider: 'bandcamp',
      providerId: 'album=123',
      embedUrl: expect.stringMatching(/^https:\/\/bandcamp\.com\/EmbeddedPlayer\/album=123\//),
    });
  });

  it('reads a YouTube link’s counts when it is added, and only a YouTube link’s', async () => {
    mockStats.mockResolvedValue({ views: 1234, likes: 56 });
    expect((await create(video())).status).toBe(201);
    expect(mockStats).toHaveBeenCalledWith(VIDEO);
    expect(store.links[0]).toMatchObject({ views: 1234, likes: 56, statsAt: expect.any(Date) });

    mockStats.mockClear();
    expect((await create(video({ url: 'https://vimeo.com/76979871' }))).status).toBe(201);
    expect(mockStats).not.toHaveBeenCalled();
    expect(store.links[1]).toMatchObject({ views: null, statsAt: null });
  });

  it('reads the provider again for a new URL, keeping the admin’s title', async () => {
    const row = store.insert({
      instrumentId: MINIMOOG,
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      providerId: VIDEO,
      title: 'Old',
      thumbnailUrl: 'https://i.ytimg.com/vi/old/hq.jpg',
      views: 99,
    });
    mockResolve.mockResolvedValue({
      title: 'New title',
      thumbnailUrl: 'https://f4.bcbits.com/img/a1_5.jpg',
      providerId: 'track=7',
    });
    const id = String(row.id);
    expect((await patchLink(request('PATCH', `/${id}`, { url: BANDCAMP }), ctx(id))).status).toBe(
      200
    );
    expect(store.links[0]).toMatchObject({
      title: 'Old',
      provider: 'bandcamp',
      providerId: 'track=7',
      thumbnailUrl: 'https://f4.bcbits.com/img/a1_5.jpg',
      views: null,
    });
  });
});

describe('POST /resolve (t-180)', () => {
  it('gives the stored URL, the provider’s title and picture, and the embed, writing nothing', async () => {
    mockResolve.mockResolvedValue({
      title: 'Selected Works',
      thumbnailUrl: 'https://f4.bcbits.com/img/a1_5.jpg',
      providerId: 'album=123',
    });
    const res = await postResolve(
      request('POST', '/resolve', { url: 'https://SomeArtist.bandcamp.com/album/Selected-Works' })
    );
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({
      url: 'https://someartist.bandcamp.com/album/selected-works',
      provider: 'bandcamp',
      title: 'Selected Works',
      thumbnailUrl: 'https://f4.bcbits.com/img/a1_5.jpg',
      embedUrl: expect.stringMatching(/^https:\/\/bandcamp\.com\/EmbeddedPlayer\/album=123\//),
    });
    expect(store.writes).toEqual([]);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('gives nulls when the provider says nothing, and YouTube’s own picture', async () => {
    const res = await postResolve(
      request('POST', '/resolve', { url: `https://youtu.be/${VIDEO}` })
    );
    expect((await json(res)).data).toEqual({
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      title: null,
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO}/hqdefault.jpg`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${VIDEO}`,
    });
  });

  it('refuses a URL the parser refuses, without asking anyone', async () => {
    const res = await postResolve(request('POST', '/resolve', { url: 'http://youtu.be/x' }));
    expect(res.status).toBe(400);
    expect(mockResolve).not.toHaveBeenCalled();
    expect((await postResolve(request('POST', '/resolve', {}))).status).toBe(400);
  });
});
