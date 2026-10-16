/**
 * Unit Tests: a signed-in user's synth profile (`f-profiles` r1), `/api/v1/me/profile`.
 *
 * Real route, real `withAuth`, the real `lib/app/profile/` rules and store. Both tables are small stateful fakes that
 * key and index the way the schema does (the profile on `userId`, a unique `username`; a held name on `username`), so
 * a query that forgot the owner, or a clash the store failed to catch, shows here too. Pins:
 *
 * - every route needs a session; before a username is chosen the profile reads as null;
 * - a new profile is private with owned and wishlist hidden unless the user says otherwise;
 * - a username is unique whatever its case; a taken one, a held one, a reserved one and a badly shaped one are refused;
 * - a change is held to once in 30 days, and the old name is held for 30 days for nobody else, then released;
 * - each link must be its own platform's, and what is stored is the URL rebuilt from it;
 * - each user reads and writes only their own profile.
 *
 * What a unit test cannot prove, because it has no database, is in `npm run smoke:profile`: the hand-written cascade
 * that erases the profile through `eraseUser`, and the export that carries it.
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

import { GET, PUT } from '@/app/api/v1/me/profile/route';
import { createMockAuthSession } from '@/tests/helpers/auth';

type Row = Record<string, unknown>;

const DAY = 24 * 60 * 60 * 1000;

function session(id: string) {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID, userId: id },
    user: { ...base.user, id, role: 'USER' },
  };
}
const signIn = (id: string) => mockGetSession.mockResolvedValue(session(id));

/** A unique clash as Prisma raises it. */
const clash = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

let profiles: Map<string, Row>;
let held: Map<string, Row>;
/** The fake's own create, which a test can call to land another request's write first. */
let createProfile: (args: { data: Row }) => Promise<Row>;

function installFakes() {
  profiles = new Map();
  held = new Map();
  const byUsername = (username: unknown) =>
    [...profiles.values()].find((r) => r.username === username);

  createProfile = async ({ data }: { data: Row }) => {
    const userId = String(data.userId);
    if (profiles.has(userId) || byUsername(data.username)) throw clash();
    const row: Row = {
      usernameChangedAt: null,
      youtube: null,
      spotify: null,
      instagram: null,
      bandcamp: null,
      public: false,
      showOwned: false,
      showWishlist: false,
      createdAt: new Date(),
      ...data,
      updatedAt: new Date(),
    };
    profiles.set(userId, row);
    return row;
  };
  const synthProfile = {
    findUnique: vi.fn(async ({ where }: { where: Row }) => {
      if (typeof where.userId === 'string') return profiles.get(where.userId) ?? null;
      return byUsername(where.username) ?? null;
    }),
    create: vi.fn(createProfile),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const userId = String(where.userId);
      const current = profiles.get(userId);
      if (!current) throw Object.assign(new Error('Not found'), { code: 'P2025' });
      const other = data.username === undefined ? undefined : byUsername(data.username);
      if (other && other.userId !== userId) throw clash();
      const row = { ...current, ...data, updatedAt: new Date() };
      profiles.set(userId, row);
      return row;
    }),
  };
  const heldUsername = {
    findUnique: vi.fn(
      async ({ where }: { where: Row }) => held.get(String(where.username)) ?? null
    ),
    deleteMany: vi.fn(
      async ({ where }: { where: { username: string; heldUntil: { lte: Date } } }) => {
        const row = held.get(where.username);
        if (row && (row.heldUntil as Date) <= where.heldUntil.lte) {
          held.delete(where.username);
          return { count: 1 };
        }
        return { count: 0 };
      }
    ),
    upsert: vi.fn(async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
      const key = String(where.username);
      const row = held.has(key) ? { ...held.get(key), ...update } : { ...create };
      held.set(key, row);
      return row;
    }),
  };
  Object.assign(mockPrisma, {
    synthProfile,
    heldUsername,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
  });
}

function request(method: string, body?: unknown): NextRequest {
  return new Request('http://localhost/api/v1/me/profile', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const NO_LINKS = { youtube: null, spotify: null, instagram: null, bandcamp: null };

function input(overrides: Row = {}) {
  return {
    username: 'tape_loops',
    links: NO_LINKS,
    public: false,
    showOwned: false,
    showWishlist: false,
    ...overrides,
  };
}

async function read() {
  const res = await GET(request('GET'));
  return { status: res.status, body: (await res.json()) as { success: boolean; data: Row | null } };
}

async function save(body: unknown) {
  const res = await PUT(request('PUT', body));
  return {
    status: res.status,
    body: (await res.json()) as {
      success: boolean;
      data?: Row;
      error?: { code: string; message: string; details?: Record<string, unknown> };
    },
  };
}

beforeEach(() => {
  vi.useRealTimers();
  mockGetSession.mockReset();
  installFakes();
});

describe('/api/v1/me/profile', () => {
  it('needs a session for both reading and saving', async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await read()).status).toBe(401);
    expect((await save(input())).status).toBe(401);
    expect(profiles.size).toBe(0);
  });

  it('reads as null before a username is chosen', async () => {
    signIn('user-a');
    expect((await read()).body).toEqual({ success: true, data: null });
  });

  it('creates a private profile with owned and wishlist hidden, and reads it back', async () => {
    signIn('user-a');
    const saved = await save(input({ username: 'Tape_Loops' }));
    expect(saved.status).toBe(200);
    const expected = {
      username: 'tape_loops',
      nextChangeAt: null,
      links: NO_LINKS,
      public: false,
      showOwned: false,
      showWishlist: false,
    };
    expect(saved.body.data).toEqual(expected);
    expect((await read()).body.data).toEqual(expected);
    expect(profiles.get('user-a')).toMatchObject({ username: 'tape_loops', public: false });
  });

  it('stores each link rebuilt, and blank as none', async () => {
    signIn('user-a');
    const saved = await save(
      input({
        links: {
          youtube: 'https://youtube.com/@TapeLoops?si=track',
          spotify: 'https://open.spotify.com/intl-de/artist/4tZwfgrHOc3mvqYlEYSvVi?si=x',
          instagram: '  ',
          bandcamp: 'https://tapeloops.bandcamp.com/music',
        },
        public: true,
        showOwned: true,
      })
    );
    expect(saved.status).toBe(200);
    expect(saved.body.data?.links).toEqual({
      youtube: 'https://www.youtube.com/@TapeLoops',
      spotify: 'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi',
      instagram: null,
      bandcamp: 'https://tapeloops.bandcamp.com',
    });
    expect(profiles.get('user-a')).toMatchObject({
      youtube: 'https://www.youtube.com/@TapeLoops',
      instagram: null,
      public: true,
      showOwned: true,
      showWishlist: false,
    });
  });

  it.each([
    ['youtube', 'https://youtube.com.evil.example/@tapeloops'],
    ['youtube', 'https://www.instagram.com/tapeloops'],
    ['spotify', 'https://www.youtube.com/@tapeloops'],
    ['instagram', 'http://www.instagram.com/tapeloops'],
    ['bandcamp', 'https://evil.example/tapeloops.bandcamp.com'],
  ])(
    'refuses a %s link that is not its own platform’s page (%s), storing nothing',
    async (platform, url) => {
      signIn('user-a');
      const saved = await save(input({ links: { ...NO_LINKS, [platform]: url } }));
      expect(saved.status).toBe(400);
      expect(saved.body.error?.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(saved.body.error?.details)).toContain(platform);
      expect(profiles.size).toBe(0);
    }
  );

  it.each([
    ['badly shaped', 'x'],
    ['reserved', 'synths'],
    ['a look-alike', '4dm1n'],
  ])('refuses a username that is %s with a 400, storing nothing', async (_why, username) => {
    signIn('user-a');
    const saved = await save(input({ username }));
    expect(saved.status).toBe(400);
    expect(profiles.size).toBe(0);
  });

  it('refuses a malformed body', async () => {
    signIn('user-a');
    expect((await save({ username: 'tape_loops' })).status).toBe(400);
    expect((await save(input({ public: 'yes' }))).status).toBe(400);
    expect(profiles.size).toBe(0);
  });

  it('refuses a username someone else holds, whatever its case', async () => {
    signIn('user-a');
    await save(input({ username: 'tape_loops' }));
    signIn('user-b');
    const saved = await save(input({ username: 'TAPE_LOOPS' }));
    expect(saved.status).toBe(409);
    expect(saved.body.error?.message).toBe("That one's taken. Try another.");
    expect(profiles.has('user-b')).toBe(false);
  });

  it('tells the second of two people claiming one free name at once that it is taken', async () => {
    signIn('user-b');
    // user-a's create lands between user-b's availability check and user-b's own create
    const synthProfile = mockPrisma.synthProfile as {
      create: ReturnType<typeof vi.fn<typeof createProfile>>;
    };
    synthProfile.create.mockImplementationOnce(async (args) => {
      await createProfile({ data: { userId: 'user-a', username: 'tape_loops' } });
      return createProfile(args);
    });
    const saved = await save(input({ username: 'tape_loops' }));
    expect(saved.status).toBe(409);
    expect(profiles.get('user-a')?.username).toBe('tape_loops');
    expect(profiles.has('user-b')).toBe(false);
  });

  it('answers a first save sent twice with the profile that landed, not as taken', async () => {
    signIn('user-a');
    const synthProfile = mockPrisma.synthProfile as {
      create: ReturnType<typeof vi.fn<typeof createProfile>>;
    };
    synthProfile.create.mockImplementationOnce(async (args) => {
      await createProfile(args); // the other request's create
      return createProfile(args);
    });
    const saved = await save(input({ username: 'tape_loops' }));
    expect(saved.status).toBe(200);
    expect(saved.body.data?.username).toBe('tape_loops');
  });

  it('lets a user save their own name again, with other changes, as no change of name', async () => {
    signIn('user-a');
    await save(input());
    const saved = await save(input({ public: true }));
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      username: 'tape_loops',
      public: true,
      nextChangeAt: null,
    });
    expect(profiles.get('user-a')?.usernameChangedAt).toBeNull();
    expect(held.size).toBe(0);
  });

  it('holds a changed-from name for 30 days for nobody else, then releases it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    signIn('user-a');
    await save(input({ username: 'tape_loops' }));

    const changed = await save(input({ username: 'reel_to_reel' }));
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({
      username: 'reel_to_reel',
      nextChangeAt: '2026-10-31T12:00:00.000Z',
    });
    expect(held.get('tape_loops')?.heldUntil).toEqual(new Date('2026-10-31T12:00:00Z'));

    signIn('user-b');
    vi.setSystemTime(new Date('2026-10-31T11:59:00Z'));
    expect((await save(input({ username: 'tape_loops' }))).status).toBe(409);

    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    const claimed = await save(input({ username: 'tape_loops' }));
    expect(claimed.status).toBe(200);
    expect(profiles.get('user-b')?.username).toBe('tape_loops');
    expect(held.has('tape_loops')).toBe(false);
  });

  it('refuses a second change inside 30 days, saying when the next one can be made', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    signIn('user-a');
    await save(input({ username: 'tape_loops' }));
    await save(input({ username: 'reel_to_reel' }));

    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const again = await save(input({ username: 'cassette' }));
    expect(again.status).toBe(409);
    expect(again.body.error?.message).toContain('2026-10-31');
    expect(profiles.get('user-a')?.username).toBe('reel_to_reel');

    vi.setSystemTime(new Date('2026-10-31T12:00:01Z'));
    expect((await save(input({ username: 'cassette' }))).status).toBe(200);
  });

  it('lets a user take back the name they just gave up only once the hold is over, like anyone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    signIn('user-a');
    await save(input({ username: 'tape_loops' }));
    await save(input({ username: 'reel_to_reel' }));
    vi.setSystemTime(new Date(Date.parse('2026-10-31T12:00:01Z')));
    expect((await save(input({ username: 'tape_loops' }))).status).toBe(200);
    expect(held.has('tape_loops')).toBe(false);
    expect(held.get('reel_to_reel')?.heldUntil).toEqual(
      new Date(Date.parse('2026-10-31T12:00:01Z') + 30 * DAY)
    );
  });

  it("reads and writes only the caller's own profile", async () => {
    signIn('user-a');
    await save(input({ username: 'tape_loops', public: true }));
    signIn('user-b');
    expect((await read()).body.data).toBeNull();
    await save(input({ username: 'reel_to_reel' }));
    expect(profiles.get('user-a')).toMatchObject({ username: 'tape_loops', public: true });
    expect(profiles.get('user-b')).toMatchObject({ username: 'reel_to_reel', public: false });
  });

  it('reads a stored link that no longer passes as none', async () => {
    signIn('user-a');
    await save(input());
    profiles.set('user-a', { ...profiles.get('user-a'), youtube: 'https://evil.example/@x' });
    expect((await read()).body.data?.links).toEqual(NO_LINKS);
  });
});
