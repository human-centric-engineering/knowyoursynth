/**
 * Unit Tests: a signed-in user's lesson progress and favourites (`f-my-sounds` s4), `/api/v1/me/progress` and
 * `/api/v1/me/favourites`.
 *
 * Real routes, real `withAuth`, the real `lib/app/sounds/progress.ts` and `favourites.ts`. The tables are small stateful
 * fakes keyed the way the schema keys them, joined to a catalogue of two synths (one listed, one not), so a query that
 * forgot the owner would reach another user's row here too. Pins:
 *
 * - every route needs a session;
 * - progress records the furthest step and the first finish, never moves back, and is each user's own;
 * - a step past the lesson, a library sound the synth does not have, and an unlisted synth are refused, storing nothing;
 * - a favourite of a synth, a library sound or the caller's own sound is kept once, listed and removed;
 * - a favourite of a sound the user cannot see (another user's, an unlisted synth's) is refused, storing nothing;
 * - another user's favourite cannot be removed.
 *
 * What a unit test cannot prove, because it has no database, is in `npm run smoke:sounds`: the hand-written cascades
 * that erase both through `eraseUser`, and the export that carries them.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
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

import { GET as listProgress } from '@/app/api/v1/me/progress/route';
import { PUT as recordProgress } from '@/app/api/v1/me/progress/[synthId]/[slug]/route';
import { GET as listFavourites, POST as addFavourite } from '@/app/api/v1/me/favourites/route';
import { DELETE as removeFavourite } from '@/app/api/v1/me/favourites/[id]/route';
import { createMockAuthSession } from '@/tests/helpers/auth';

type Row = Record<string, unknown>;

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
const at = (synthId: string, slug: string) => ({ params: Promise.resolve({ synthId, slug }) });
const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: Row & Row[];
    error?: { code: string };
  };
}

// ── the catalogue: model-d is listed, minimoog is not ──
const SYNTHS: Record<string, { id: string; name: string; listed: boolean }> = {
  'model-d': { id: 'model-d', name: 'Model D', listed: true },
  minimoog: { id: 'minimoog', name: 'Minimoog', listed: false },
};
const SOUNDS = [
  {
    id: 'ss-bass',
    synthId: 'model-d',
    slug: 'stacked-night-bass',
    name: 'Night bass',
    steps: [1, 2, 3, 4],
  },
  { id: 'ss-lead', synthId: 'model-d', slug: 'lead', name: 'Lead', steps: [1, 2] },
  { id: 'ss-mini', synthId: 'minimoog', slug: 'hidden', name: 'Hidden', steps: [1, 2] },
];
// user-1 owns cmmine1; user-2 owns cmtheirs.
const USER_SOUNDS = [
  { id: 'cmmine1', userId: 'user-1', synthId: 'model-d', name: 'My bass' },
  { id: 'cmtheirs', userId: 'user-2', synthId: 'model-d', name: 'Their bass' },
];

const soundView = (soundId: string) => {
  const s = SOUNDS.find((x) => x.id === soundId)!;
  return { ...s, synth: { listed: SYNTHS[s.synthId].listed } };
};

/** Whether `row` meets a `where` of plain values and `{ lt }` / `null` conditions. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'sound') return soundView(String(row.soundId)).synthId === (v as Row).synthId;
    if (v !== null && typeof v === 'object' && 'lt' in v)
      return (row[k] as number) < (v as { lt: number }).lt;
    return (row[k] ?? null) === v;
  });
}

let progress: Row[];
let favourites: Row[];
let nextId: number;

const progressView = (r: Row) => ({ ...r, sound: soundView(String(r.soundId)) });
const favouriteView = (r: Row) => ({
  id: r.id,
  createdAt: r.createdAt,
  synth: r.synthId ? SYNTHS[r.synthId as string] : null,
  synthSound: r.synthSoundId ? soundView(r.synthSoundId as string) : null,
  userSound: r.userSoundId
    ? (() => {
        const u = USER_SOUNDS.find((x) => x.id === r.userSoundId)!;
        return { ...u, synth: { listed: SYNTHS[u.synthId].listed } };
      })()
    : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  progress = [];
  favourites = [];
  nextId = 1;
  const pkey = (w: Row) => w.userId_soundId as { userId: string; soundId: string };
  const findP = (w: Row) =>
    progress.find((r) => r.userId === pkey(w).userId && r.soundId === pkey(w).soundId);
  mockPrisma.lessonProgress = {
    findMany: vi.fn(async ({ where }: { where: Row }) =>
      progress.filter((r) => matches(r, where)).map(progressView)
    ),
    upsert: vi.fn(async ({ where, create }: { where: Row; create: Row }) => {
      let row = findP(where);
      if (!row) {
        row = { ...create, createdAt: new Date(), updatedAt: new Date() };
        progress.push(row);
      }
      return { ...row };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const hit = progress.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data, { updatedAt: new Date() }));
      return { count: hit.length };
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: Row }) => progressView(findP(where)!)),
  };
  mockPrisma.favourite = {
    findMany: vi.fn(async ({ where }: { where: Row }) =>
      favourites.filter((r) => matches(r, where)).map(favouriteView)
    ),
    findFirst: vi.fn(async ({ where }: { where: Row }) => {
      const row = favourites.find((r) => matches(r, where));
      return row ? favouriteView(row) : null;
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = {
        synthId: null,
        synthSoundId: null,
        userSoundId: null,
        ...data,
        id: `cmfav${nextId++}`,
        createdAt: new Date(),
      };
      favourites.push(row);
      return favouriteView(row);
    }),
    deleteMany: vi.fn(async ({ where }: { where: Row }) => {
      const before = favourites.length;
      favourites = favourites.filter((r) => !matches(r, where));
      return { count: before - favourites.length };
    }),
  };
  mockPrisma.synth = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => SYNTHS[where.id] ?? null),
  };
  mockPrisma.synthSound = {
    findUnique: vi.fn(
      async ({ where }: { where: { synthId_slug: { synthId: string; slug: string } } }) =>
        SOUNDS.find(
          (s) => s.synthId === where.synthId_slug.synthId && s.slug === where.synthId_slug.slug
        ) ?? null
    ),
  };
  mockPrisma.userSound = {
    findFirst: vi.fn(
      async ({ where }: { where: { id: string; userId: string } }) =>
        USER_SOUNDS.find((s) => s.id === where.id && s.userId === where.userId) ?? null
    ),
  };
  signIn('user-1');
});

const step = (slug: string, body: unknown, synthId = 'model-d') =>
  recordProgress(request('PUT', `/api/v1/me/progress/${synthId}/${slug}`, body), at(synthId, slug));
const star = (body: unknown) => addFavourite(request('POST', '/api/v1/me/favourites', body));

describe('a session is required', () => {
  it('refuses every route without one, and touches nothing', async () => {
    mockGetSession.mockResolvedValue(null);
    const responses = [
      await listProgress(request('GET', '/api/v1/me/progress')),
      await step('lead', { step: 0 }),
      await listFavourites(request('GET', '/api/v1/me/favourites')),
      await star({ kind: 'synth', synthId: 'model-d' }),
      await removeFavourite(request('DELETE', '/api/v1/me/favourites/cmfav1'), byId('cmfav1')),
    ];
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    expect(progress).toEqual([]);
    expect(favourites).toEqual([]);
  });
});

describe('lesson progress', () => {
  it('records the furthest step reached and never moves back', async () => {
    expect((await json(await step('stacked-night-bass', { step: 2 }))).data).toMatchObject({
      slug: 'stacked-night-bass',
      furthestStep: 2,
      steps: 4,
      completedAt: null,
    });
    const back = await json(await step('stacked-night-bass', { step: 1 }));
    expect(back.data).toMatchObject({ furthestStep: 2 });
    expect((await json(await step('stacked-night-bass', { step: 3 }))).data).toMatchObject({
      furthestStep: 3,
    });
    expect(progress).toHaveLength(1);
  });

  it('records the first finish, and keeps it', async () => {
    const done = await json(await step('lead', { step: 1, completed: true }));
    expect(done.data).toMatchObject({ furthestStep: 1, completedAt: expect.any(String) });
    const first = done.data!.completedAt;
    const again = await json(await step('lead', { step: 1, completed: true }));
    expect(again.data!.completedAt).toBe(first);
    const stepBack = await json(await step('lead', { step: 0 }));
    expect(stepBack.data).toMatchObject({ furthestStep: 1, completedAt: first });
  });

  it('lists the caller’s lessons, on one synth or all, and nobody else’s', async () => {
    await step('lead', { step: 0 });
    signIn('user-2');
    await step('stacked-night-bass', { step: 3 });
    signIn('user-1');
    const list = await json(await listProgress(request('GET', '/api/v1/me/progress')));
    expect(list.data!.map((e: Row) => [e.slug, e.furthestStep, e.available])).toEqual([
      ['lead', 0, true],
    ]);
    const one = await json(
      await listProgress(request('GET', '/api/v1/me/progress?synthId=model-d'))
    );
    expect(one.data).toHaveLength(1);
    expect(
      vi.mocked((mockPrisma.lessonProgress as { findMany: (a: unknown) => unknown }).findMany)
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', sound: { synthId: 'model-d' } } })
    );
  });

  it('refuses a step past the lesson, an unknown sound, an unlisted synth and a bad body, storing nothing', async () => {
    const refused = [
      await step('lead', { step: 2 }),
      await step('no-such-sound', { step: 0 }),
      await step('hidden', { step: 0 }, 'minimoog'),
      await step('lead', { step: -1 }),
      await step('lead', { step: 0, extra: true }),
      await step('BAD SLUG', { step: 0 }),
    ];
    expect(refused.map((r) => r.status)).toEqual([400, 400, 400, 400, 400, 400]);
    expect(progress).toEqual([]);
  });
});

describe('favourites', () => {
  it('star a synth, a library sound and the caller’s own sound, each once', async () => {
    const synth = await star({ kind: 'synth', synthId: 'model-d' });
    expect(synth.status).toBe(201);
    expect((await json(synth)).data).toMatchObject({
      kind: 'synth',
      synthId: 'model-d',
      name: 'Model D',
      available: true,
    });
    const sound = await json(await star({ kind: 'sound', synthId: 'model-d', slug: 'lead' }));
    expect(sound.data).toMatchObject({ kind: 'sound', slug: 'lead', name: 'Lead' });
    const mine = await star({ kind: 'mine', soundId: 'cmmine1' });
    expect((await json(mine)).data).toMatchObject({
      kind: 'mine',
      soundId: 'cmmine1',
      name: 'My bass',
    });

    const again = await star({ kind: 'sound', synthId: 'model-d', slug: 'lead' });
    expect(again.status).toBe(200);
    expect((await json(again)).data!.id).toBe(sound.data!.id);
    expect(favourites).toHaveLength(3);
    expect(favourites.every((f) => f.userId === 'user-1')).toBe(true);
  });

  it('refuse a sound the caller cannot see, storing nothing', async () => {
    const theirs = await star({ kind: 'mine', soundId: 'cmtheirs' });
    expect(theirs.status).toBe(404);
    const hiddenSynth = await star({ kind: 'synth', synthId: 'minimoog' });
    const hiddenSound = await star({ kind: 'sound', synthId: 'minimoog', slug: 'hidden' });
    const noSound = await star({ kind: 'sound', synthId: 'model-d', slug: 'no-such-sound' });
    const twoTargets = await star({ kind: 'synth', synthId: 'model-d', slug: 'lead' });
    expect([hiddenSynth, hiddenSound, noSound, twoTargets].map((r) => r.status)).toEqual([
      400, 400, 400, 400,
    ]);
    expect(favourites).toEqual([]);
  });

  it('return the star another request made first, when the create loses the race', async () => {
    type Create = Mock<(args: { data: Row }) => Promise<Row>>;
    const fav = mockPrisma.favourite as { create: Create };
    const real = fav.create.getMockImplementation()!;
    fav.create.mockImplementationOnce((args: { data: Row }) =>
      // The other request's row lands, then this one's create hits the unique key.
      real(args).then(() => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      })
    );
    const res = await star({ kind: 'synth', synthId: 'model-d' });
    expect(res.status).toBe(200);
    expect((await json(res)).data).toMatchObject({ kind: 'synth', synthId: 'model-d' });
    expect(favourites).toHaveLength(1);
  });

  it('fail on any other write error, rather than reporting a star that was not kept', async () => {
    const fav = mockPrisma.favourite as { create: ReturnType<typeof vi.fn> };
    fav.create.mockRejectedValueOnce(new Error('connection lost'));
    const res = await star({ kind: 'synth', synthId: 'model-d' });
    expect(res.status).toBe(500);
    expect(favourites).toEqual([]);
  });

  it('show a star on a synth no longer listed as not available', async () => {
    await star({ kind: 'synth', synthId: 'model-d' });
    SYNTHS['model-d'].listed = false;
    try {
      const list = await json(await listFavourites(request('GET', '/api/v1/me/favourites')));
      expect(list.data!.map((f: Row) => f.available)).toEqual([false]);
    } finally {
      SYNTHS['model-d'].listed = true;
    }
  });

  it('are listed and removed by their owner only', async () => {
    const { data } = await json(await star({ kind: 'synth', synthId: 'model-d' }));
    const id = String(data!.id);

    signIn('user-2');
    expect(
      (await json(await listFavourites(request('GET', '/api/v1/me/favourites')))).data
    ).toEqual([]);
    const notTheirs = await removeFavourite(
      request('DELETE', `/api/v1/me/favourites/${id}`),
      byId(id)
    );
    expect(notTheirs.status).toBe(404);
    expect(favourites).toHaveLength(1);

    signIn('user-1');
    const list = await json(await listFavourites(request('GET', '/api/v1/me/favourites')));
    expect(list.data!.map((f: Row) => f.id)).toEqual([id]);
    const gone = await removeFavourite(request('DELETE', `/api/v1/me/favourites/${id}`), byId(id));
    expect(gone.status).toBe(200);
    expect(favourites).toEqual([]);
    const malformed = await removeFavourite(
      request('DELETE', '/api/v1/me/favourites/NOT-AN-ID'),
      byId('NOT-AN-ID')
    );
    expect(malformed.status).toBe(404);
  });
});
