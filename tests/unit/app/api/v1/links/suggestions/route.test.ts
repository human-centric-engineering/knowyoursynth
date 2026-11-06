/**
 * Unit Tests: link suggestions (`f-link-suggestions` t-185), the user's route and the admin queue.
 *
 * Real routes, real `withAuth` / `withAdminAuth`, the real `lib/app/links/suggestions.ts` and, for an accept, the real
 * `createLink` over the stateful fake of the links table and its owners (`tests/helpers/links-store.ts`). The
 * suggestions table is a small stateful fake here that honours the conditional update a decision relies on. Pins:
 *
 * - suggesting needs a session, parses the URL without fetching it, needs a target that exists, refuses a URL the
 *   target already links, is stored under the caller's id, and is capped per user (the 429);
 * - the queue and its decisions are admin only; the queue names each target, or null once it is removed;
 * - accept makes the link on the right owner through `createLink`, records which, and audits both;
 * - a refused accept leaves the suggestion pending; accepting one whose target is gone is a 404;
 * - decline needs a reason; a suggestion is decided once, including when two admins decide it at the same moment.
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

// What the provider says (t-180): nothing, unless a test says otherwise. Both are tested on their own.
const mockResolve = vi.hoisted(() => vi.fn());
vi.mock('@/lib/app/links/details', () => ({ resolveLinkDetails: mockResolve }));
const mockStats = vi.hoisted(() => vi.fn());
vi.mock('@/lib/app/links/stats', () => ({ statsForVideo: mockStats }));

import { POST as suggest } from '@/app/api/v1/links/suggestions/route';
import { GET as listQueue } from '@/app/api/v1/admin/links/suggestions/route';
import { POST as decide } from '@/app/api/v1/admin/links/suggestions/[id]/route';
import { linkSuggestionLimiter, linkSuggestionLimitKey } from '@/lib/app/links/suggestions';
import { createMockAuthSession } from '@/tests/helpers/auth';
import { linksStore, type LinksStore } from '@/tests/helpers/links-store';

type Row = Record<string, unknown>;

const VIDEO = 'dQw4w9WgXcQ';
const MINIMOOG = 'moog-minimoog';

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
    error?: { code: string; message: string };
  };
}
const auditActions = () =>
  mockLogAdminAction.mock.calls.map(([e]) => (e as { action: string }).action);

/** The suggestions table in memory: what `lib/app/links/suggestions.ts` calls, with `updateMany` honouring its filter. */
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
          id: `lsug-${++n}`,
          status: 'PENDING',
          linkId: null,
          reason: null,
          decidedAt: null,
          createdAt: new Date(Date.UTC(2026, 10, 6, 0, n)),
          updatedAt: new Date(),
          ...data,
        };
        rows.push(row);
        return { ...row };
      }),
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
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

let store: LinksStore;
let suggestions: ReturnType<typeof suggestionTable>;
let instruments: { id: string; name: string }[];
const suggestion = (id: string) => suggestions.rows.find((r) => r.id === id);

const body = (over: Row = {}) => ({
  target: { kind: 'instrument', id: MINIMOOG },
  url: `https://www.youtube.com/watch?v=${VIDEO}`,
  kind: 'demo',
  title: 'Minimoog bass demo',
  note: 'The best one I know.',
  ...over,
});
const post = (b: unknown) => suggest(request('POST', '/api/v1/links/suggestions', b));

async function suggestOne(over: Row = {}) {
  mockGetSession.mockResolvedValue(session('USER'));
  const res = await post(body(over));
  mockGetSession.mockResolvedValue(session('ADMIN'));
  return (await json(res)).data?.id as string;
}

const decision = (id: string, b: unknown) =>
  decide(request('POST', `/api/v1/admin/links/suggestions/${id}`, b), ctx(id));

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockResolvedValue(null);
  mockStats.mockResolvedValue(null);
  linkSuggestionLimiter.reset(linkSuggestionLimitKey('user-1'));
  instruments = [
    { id: MINIMOOG, name: 'Minimoog Model D' },
    { id: 'arp-odyssey', name: 'ARP Odyssey' },
  ];
  store = linksStore({
    instruments,
    songs: [{ id: 'kraftwerk-autobahn', title: 'Autobahn' }],
    synths: [
      { id: 'model-d', listed: true, instrumentIds: [] },
      { id: 'hidden-synth', listed: false, instrumentIds: [] },
    ],
    sounds: [
      { id: 'snd1', synthId: 'model-d', slug: 'stacked-night-bass', name: 'Stacked night bass' },
      { id: 'snd2', synthId: 'hidden-synth', slug: 'secret-pad', name: 'Secret pad' },
    ],
  });
  suggestions = suggestionTable();
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, store.client, {
    linkSuggestion: suggestions.client,
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

describe('POST /api/v1/links/suggestions', () => {
  it('refuses a visitor without a session and stores nothing', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await post(body());
    expect(res.status).toBe(401);
    expect(suggestions.rows).toEqual([]);
  });

  it("stores a suggestion under the caller's id, pending, with its URL parsed and nothing fetched", async () => {
    const res = await post(body({ userId: 'someone-else' }));
    expect(res.status).toBe(201);
    expect((await json(res)).data).toMatchObject({
      target: { kind: 'instrument', id: MINIMOOG },
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      status: 'PENDING',
    });
    expect(suggestions.rows).toHaveLength(1);
    expect(suggestions.rows[0]).toMatchObject({
      userId: 'user-1',
      targetKind: 'instrument',
      targetId: MINIMOOG,
      kind: 'demo',
      title: 'Minimoog bass demo',
      note: 'The best one I know.',
    });
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockStats).not.toHaveBeenCalled();
  });

  it('stores the canonical URL, so the same video pasted another way is the same link', async () => {
    await post(body({ url: `https://youtu.be/${VIDEO}?t=42` }));
    expect(suggestions.rows[0].url).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
  });

  it('refuses a URL the parser refuses, with its reason, and stores nothing', async () => {
    const script = await post(body({ url: 'javascript:alert(1)' }));
    const noVideo = await post(body({ url: 'https://www.youtube.com/' }));
    expect([script.status, noVideo.status]).toEqual([400, 400]);
    expect(suggestions.rows).toEqual([]);
  });

  it('is a 404 for a target that is not there, and stores nothing', async () => {
    const instrument = await post(body({ target: { kind: 'instrument', id: 'no-such-synth' } }));
    const sound = await post(body({ target: { kind: 'sound', id: 'model-d/no-such-patch' } }));
    expect([instrument.status, sound.status]).toEqual([404, 404]);
    expect(suggestions.rows).toEqual([]);
  });

  it('is a 404 for a sound on an unlisted synth, even one whose URL it links, and stores nothing', async () => {
    const target = { kind: 'sound', id: 'hidden-synth/secret-pad' };
    const fresh = await post(body({ target }));
    store.insert({
      soundId: 'snd2',
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      providerId: VIDEO,
      kind: 'demo',
      title: 'Hidden',
    });
    const linked = await post(body({ target }));
    expect([fresh.status, linked.status]).toEqual([404, 404]);
    expect(suggestions.rows).toEqual([]);

    // The same sound's synth listed is suggestable: the 404 was the listing, not the sound.
    const listed = await post(
      body({ target: { kind: 'sound', id: 'model-d/stacked-night-bass' } })
    );
    expect(listed.status).toBe(201);
  });

  it('is a 409 for a URL already waiting as a suggestion for the target, from anyone, until it is decided', async () => {
    const first = await suggestOne({ url: `https://youtu.be/${VIDEO}` });
    mockGetSession.mockResolvedValue(session('USER', 'user-2'));
    const again = await post(body());
    expect(again.status).toBe(409);
    expect(suggestions.rows).toHaveLength(1);

    mockGetSession.mockResolvedValue(session('ADMIN'));
    await decision(first, { action: 'decline', reason: 'Not this one' });
    mockGetSession.mockResolvedValue(session('USER', 'user-2'));
    const afterDecline = await post(body());
    expect(afterDecline.status).toBe(201);
  });

  it('is a 409 for a URL the target already links, however it was pasted, and stores nothing', async () => {
    store.insert({
      instrumentId: MINIMOOG,
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      providerId: VIDEO,
      kind: 'demo',
      title: 'Already here',
    });
    const res = await post(body({ url: `https://youtu.be/${VIDEO}` }));
    expect(res.status).toBe(409);
    expect(suggestions.rows).toEqual([]);

    // Another target is free to have it.
    const other = await post(body({ target: { kind: 'instrument', id: 'arp-odyssey' } }));
    expect(other.status).toBe(201);
  });

  it('caps a user at ten an hour: the eleventh is a 429 with rate-limit headers and is not stored', async () => {
    for (let i = 0; i < 10; i++) {
      // A video each, as the same one twice is a 409 while it waits.
      const res = await post(body({ url: `https://youtu.be/dQw4w9WgXc${i}` }));
      expect(res.status).toBe(201);
    }
    const res = await post(body());
    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(suggestions.rows).toHaveLength(10);

    // The cap is per user: another account is not held back by this one.
    mockGetSession.mockResolvedValue(session('USER', 'user-2'));
    expect((await post(body())).status).toBe(201);
    linkSuggestionLimiter.reset(linkSuggestionLimitKey('user-2'));
  });
});

describe('the admin queue', () => {
  it('is admin only, for reads and decisions, and decides nothing for a non-admin', async () => {
    const id = await suggestOne();
    mockGetSession.mockResolvedValue(session('USER'));
    const responses = [
      await listQueue(request('GET', '/api/v1/admin/links/suggestions')),
      await decision(id, { action: 'decline', reason: 'no' }),
    ];
    expect(responses.map((r) => r.status)).toEqual([403, 403]);
    expect(suggestion(id)?.status).toBe('PENDING');
  });

  it('lists by status, newest first, naming each target (null once removed) and the suggester', async () => {
    const declined = await suggestOne();
    const sound = await suggestOne({
      target: { kind: 'sound', id: 'model-d/stacked-night-bass' },
    });
    const song = await suggestOne({ target: { kind: 'song', id: 'kraftwerk-autobahn' } });
    const gone = await suggestOne({ target: { kind: 'instrument', id: 'arp-odyssey' } });
    instruments.splice(
      instruments.findIndex((i) => i.id === 'arp-odyssey'),
      1
    );
    suggestions.rows.find((r) => r.id === song)!.userId = null;
    await decision(declined, { action: 'decline', reason: 'Not a demo' });

    const pending = await json(
      await listQueue(request('GET', '/api/v1/admin/links/suggestions?status=PENDING'))
    );
    expect(pending.data?.map((s: Row) => [s.id, s.target, s.suggestedBy])).toEqual([
      [gone, { kind: 'instrument', id: 'arp-odyssey', name: null }, 'Dana Owner'],
      [song, { kind: 'song', id: 'kraftwerk-autobahn', name: 'Autobahn' }, null],
      [
        sound,
        { kind: 'sound', id: 'model-d/stacked-night-bass', name: 'Stacked night bass' },
        'Dana Owner',
      ],
    ]);

    const all = await json(await listQueue(request('GET', '/api/v1/admin/links/suggestions')));
    expect(all.data).toHaveLength(4);

    const bad = await listQueue(request('GET', '/api/v1/admin/links/suggestions?status=MERGED'));
    expect(bad.status).toBe(400);
  });
});

describe('accept', () => {
  it('makes the link on the right owner through createLink, records it, and audits both', async () => {
    const id = await suggestOne({ target: { kind: 'sound', id: 'model-d/stacked-night-bass' } });
    const res = await decision(id, { action: 'accept' });

    expect(res.status).toBe(200);
    expect(store.links).toHaveLength(1);
    const link = store.links[0];
    expect(link).toMatchObject({
      soundId: 'snd1',
      instrumentId: null,
      provider: 'youtube',
      providerId: VIDEO,
      kind: 'demo',
      title: 'Minimoog bass demo',
      ours: false,
    });
    expect((await json(res)).data).toMatchObject({ status: 'ACCEPTED', linkId: link.id });
    expect(suggestion(id)).toMatchObject({ status: 'ACCEPTED', linkId: link.id });
    expect(suggestion(id)?.decidedAt).toBeInstanceOf(Date);
    // Accepting is when the provider is read, as any admin create.
    expect(mockResolve).toHaveBeenCalledTimes(1);

    expect(auditActions()).toEqual(['external_link.create', 'link_suggestion.accept']);
    expect(mockLogAdminAction.mock.calls[1][0]).toMatchObject({
      userId: 'admin-1',
      entityType: 'link_suggestion',
      entityId: id,
      changes: {
        status: { from: 'PENDING', to: 'ACCEPTED' },
        linkId: { from: null, to: link.id },
      },
    });
  });

  it("takes the admin's kind and title over the user's", async () => {
    const id = await suggestOne();
    await decision(id, { action: 'accept', kind: 'review', title: 'Sound On Sound review' });
    expect(store.links[0]).toMatchObject({
      instrumentId: MINIMOOG,
      kind: 'review',
      title: 'Sound On Sound review',
    });
  });

  it('is a 404 when the target has been removed since, leaving it pending for a decline', async () => {
    const id = await suggestOne();
    instruments.splice(0, 1);

    const res = await decision(id, { action: 'accept' });
    expect(res.status).toBe(404);
    expect(suggestion(id)).toMatchObject({ status: 'PENDING', decidedAt: null });
    expect(suggestions.client.updateMany).not.toHaveBeenCalled();
    expect(store.links).toEqual([]);
    expect(mockLogAdminAction).not.toHaveBeenCalled();

    expect((await decision(id, { action: 'decline', reason: 'The synth is gone' })).status).toBe(
      200
    );
  });

  it('leaves the suggestion pending, and audits nothing, when the link is refused', async () => {
    // No title from the user, and none from the provider: createLink refuses it.
    const id = await suggestOne({ title: undefined });
    const res = await decision(id, { action: 'accept' });

    expect(res.status).toBe(400);
    expect(suggestion(id)).toMatchObject({ status: 'PENDING', linkId: null, decidedAt: null });
    expect(store.links).toEqual([]);
    expect(mockLogAdminAction).not.toHaveBeenCalled();

    // Given a title, the same suggestion is accepted.
    expect((await decision(id, { action: 'accept', title: 'A title' })).status).toBe(200);
  });

  it('is a 409, left pending, when an admin linked the same URL after it was suggested', async () => {
    const id = await suggestOne();
    store.insert({
      instrumentId: MINIMOOG,
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      providerId: VIDEO,
      kind: 'demo',
      title: 'Added by hand',
    });

    const res = await decision(id, { action: 'accept' });
    expect(res.status).toBe(409);
    expect(suggestion(id)?.status).toBe('PENDING');
    expect(store.links).toHaveLength(1);
  });

  it('still reports the refusal, and logs it, when handing the suggestion back fails', async () => {
    const id = await suggestOne({ title: undefined });
    const handBack = new Error('connection lost');
    suggestions.client.update.mockRejectedValueOnce(handBack);

    const res = await decision(id, { action: 'accept' });
    expect(res.status).toBe(400);
    expect(mockLog.error).toHaveBeenCalledWith(
      'Could not hand a refused link suggestion back to pending',
      handBack,
      { suggestionId: id }
    );
  });
});

describe('decline', () => {
  it('declines with the reason kept, and refuses a decline without one', async () => {
    const id = await suggestOne();
    const empty = await decision(id, { action: 'decline', reason: '   ' });
    const none = await decision(id, { action: 'decline' });
    expect([empty.status, none.status]).toEqual([400, 400]);
    expect(suggestion(id)?.status).toBe('PENDING');

    const res = await decision(id, { action: 'decline', reason: 'Not about this synth' });
    expect(res.status).toBe(200);
    expect(suggestion(id)).toMatchObject({
      status: 'DECLINED',
      reason: 'Not about this synth',
      linkId: null,
    });
    expect(store.links).toEqual([]);
    expect(auditActions()).toEqual(['link_suggestion.decline']);
  });
});

describe('a suggestion is decided once', () => {
  it('refuses a second decision with a 409 and changes nothing', async () => {
    const id = await suggestOne();
    await decision(id, { action: 'decline', reason: 'Duplicate' });
    mockLogAdminAction.mockClear();

    const res = await decision(id, { action: 'accept' });
    expect(res.status).toBe(409);
    expect(suggestion(id)).toMatchObject({ status: 'DECLINED', reason: 'Duplicate' });
    expect(store.links).toEqual([]);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('lets only one of two simultaneous decisions win', async () => {
    const id = await suggestOne();
    const [a, b] = await Promise.all([
      decision(id, { action: 'decline', reason: 'Duplicate' }),
      decision(id, { action: 'accept' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const won = a.status === 200 ? 'DECLINED' : 'ACCEPTED';
    expect(suggestion(id)?.status).toBe(won);
    // The loser made nothing: a link exists only if the accept won.
    expect(store.links).toHaveLength(won === 'ACCEPTED' ? 1 : 0);
    expect(auditActions().filter((a) => a.startsWith('link_suggestion.'))).toHaveLength(1);
  });

  it('is a 404 for a suggestion that does not exist', async () => {
    mockGetSession.mockResolvedValue(session('ADMIN'));
    const res = await decision('nope', { action: 'decline', reason: 'x' });
    expect(res.status).toBe(404);
  });
});
