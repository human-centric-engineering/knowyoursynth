/**
 * Unit Tests: a synth profile as anyone may see it (`f-profiles` r3), `GET /api/v1/profiles/:username`.
 *
 * Real route, real `lib/app/profile/public.ts`, over a stateful fake that honours `select` and can join the user's own
 * row (`tests/helpers/public-profile-db.ts`). Pins:
 *
 * - no session is needed; the answer carries only what the profile switched on, each list in the user's order;
 * - a private profile, an unknown username and a held one are each the same 404;
 * - the account name and email are never in the answer;
 * - another user's synths never reach someone's lists.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

import { GET } from '@/app/api/v1/profiles/[username]/route';
import {
  ACCOUNT_EMAIL,
  ACCOUNT_NAME,
  publicProfileDelegates,
  seedPublicProfileDb,
  type PublicProfileDb,
} from '@/tests/helpers/public-profile-db';

let db: PublicProfileDb;
let delegates: ReturnType<typeof publicProfileDelegates>;

beforeEach(() => {
  vi.clearAllMocks();
  db = seedPublicProfileDb();
  delegates = publicProfileDelegates(db);
  Object.assign(mockPrisma, delegates);
});

const profileOf = (username: string) => {
  const p = db.profiles.find((r) => r.username === username);
  if (!p) throw new Error(`no profile ${username}`);
  return p;
};

async function read(username: string, headers: Record<string, string> = {}) {
  const request = new NextRequest(`http://localhost/api/v1/profiles/${username}`, { headers });
  return GET(request, { params: Promise.resolve({ username }) });
}

describe('GET /api/v1/profiles/:username', () => {
  it('answers a public profile signed out, with its links and both lists in the user’s order', async () => {
    const res = await read('moog_fan');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: {
        username: 'moog_fan',
        links: [
          { platform: 'youtube', url: 'https://www.youtube.com/@moogfan', display: '@moogfan' },
          {
            platform: 'instagram',
            url: 'https://www.instagram.com/moogfan',
            display: '@moogfan',
          },
          {
            platform: 'bandcamp',
            url: 'https://moogfan.bandcamp.com',
            display: 'moogfan.bandcamp.com',
          },
        ],
        owned: [
          {
            instrumentId: 'minimoog-model-d',
            name: 'Minimoog Model D',
            maker: 'Moog',
            year: '1970',
          },
          { instrumentId: 'juno-60', name: 'Juno-60', maker: 'Roland', year: '1982' },
        ],
        wishlist: [{ instrumentId: 'cs-80', name: 'CS-80', maker: 'Yamaha', year: '1977' }],
        // published only: the link share and the private one are not listed (`f-sharing` h2)
        sounds: [
          {
            slug: 's1xxxxxxxx',
            synthId: 'model-d',
            synthName: 'Model D',
            name: 'Night bass',
            tags: [],
            publishedAt: '2026-10-16T00:00:00.000Z',
            author: 'moog_fan',
            authorProfile: true,
            saves: 0,
          },
        ],
        // published and not unlisted only (`f-step-sequencer` t-83); the fake's steps cannot be read, so 0
        patterns: [
          {
            slug: 'p1yyyyyyyy',
            name: 'Acid walk',
            synthId: 'model-d',
            synthName: 'Model D',
            steps: 0,
            parts: 0,
            publishedAt: '2026-10-22T00:00:00.000Z',
            author: 'moog_fan',
            authorProfile: true,
            saves: 0,
          },
        ],
      },
    });
    expect(res.headers.get('ETag')).toBeTruthy();
  });

  it('never carries the account name or email, in a non-empty answer', async () => {
    const text = await (await read('moog_fan')).text();
    // the answer is populated, so the absence below is not an empty body's
    expect(text).toContain('moog_fan');
    expect(text).toContain('Minimoog Model D');
    expect(text).not.toContain(ACCOUNT_NAME);
    expect(text).not.toContain(ACCOUNT_EMAIL);
    expect(text).not.toContain('u1');
  });

  it('leaves out a list the user hides, rather than sending it empty', async () => {
    profileOf('moog_fan').showOwned = false;
    const { data } = await (await read('moog_fan')).json();
    expect(data).not.toHaveProperty('owned');
    expect(data.wishlist).toHaveLength(1);

    profileOf('moog_fan').showWishlist = false;
    const { data: neither } = await (await read('moog_fan')).json();
    expect(neither).not.toHaveProperty('owned');
    expect(neither).not.toHaveProperty('wishlist');
    expect(delegates.ownedInstrument.findMany).toHaveBeenCalledTimes(1);
  });

  it('sends a shown list that is empty as empty', async () => {
    db.owned = db.owned.filter((r) => r.kind !== 'wishlist');
    const { data } = await (await read('moog_fan')).json();
    expect(data.wishlist).toEqual([]);
  });

  it('reads only that user’s synths', async () => {
    profileOf('quiet_one').public = true;
    const { data } = await (await read('quiet_one')).json();
    expect(data.owned).toEqual([
      { instrumentId: 'tb-303', name: 'TB-303', maker: 'Roland', year: '1981' },
    ]);
    expect(data.wishlist).toEqual([]);
  });

  it('drops a stored link that no longer passes its platform’s rules', async () => {
    profileOf('moog_fan').youtube = 'https://youtube.com.evil.example/@moogfan';
    const { data } = await (await read('moog_fan')).json();
    expect(data.links.map((l: { platform: string }) => l.platform)).toEqual([
      'instagram',
      'bandcamp',
    ]);
  });

  it('finds a username whatever its case', async () => {
    const { data } = await (await read('Moog_Fan')).json();
    expect(data.username).toBe('moog_fan');
  });

  it('answers 304 to a reader holding the current ETag', async () => {
    const etag = (await read('moog_fan')).headers.get('ETag') ?? '';
    const res = await read('moog_fan', { 'If-None-Match': etag });
    expect(res.status).toBe(304);
  });

  describe('the 404s', () => {
    const notFound = async (username: string) => {
      const res = await read(username);
      expect(res.status).toBe(404);
      return res.json();
    };

    it('is the same 404 for a private profile, an unknown name and a held one', async () => {
      // a held name: moog_fan changed to synth_wiz, and the old name is held
      const heldBefore = await notFound('synth_wiz');
      profileOf('moog_fan').username = 'synth_wiz';
      const held = await notFound('moog_fan');
      const priv = await notFound('quiet_one');
      const unknown = await notFound('nobody_here');
      expect(priv).toEqual(unknown);
      expect(held).toEqual(unknown);
      expect(heldBefore).toEqual(unknown);
      expect(unknown).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it('does not follow a held name to the new one', async () => {
      profileOf('moog_fan').username = 'synth_wiz';
      const res = await read('moog_fan');
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain('synth_wiz');
      // and the new name is there, so the 404 above is about the old one
      expect((await read('synth_wiz')).status).toBe(200);
    });

    it('says nothing of a private profile, not even its links', async () => {
      const text = await (await read('quiet_one')).text();
      expect(text).not.toContain('quietone');
    });

    it.each(['ab', 'a b', 'x'.repeat(25), '-lead', '%00'])(
      'is a 404 for %j without asking the database',
      async (name) => {
        await notFound(name);
        expect(delegates.synthProfile.findUnique).not.toHaveBeenCalled();
      }
    );
  });
});
