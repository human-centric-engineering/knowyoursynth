/**
 * Unit Tests: YouTube view counts for links (`f-videos-and-links` t-180).
 *
 * The real `stats.ts` and `fetch.ts` over the stateful links fake (`tests/helpers/links-store.ts`), with `fetch`
 * stubbed as the YouTube Data API. Pins: nothing without a key; ≤50 ids a call; only changed rows written, keeping
 * their `updatedAt`; non-YouTube rows untouched; one failed batch does not stop the others; counts capped at the
 * largest Int; a link given another URL, or edited, mid-run is not written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted((): { YOUTUBE_API_KEY?: string } => ({}));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
const mockPrisma = vi.hoisted((): Record<string, unknown> => ({}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security/safe-dispatcher', () => ({
  withOutboundDispatcher: <T>(init: T) => init,
}));

import { refreshYouTubeStats, statsForVideo } from '@/lib/app/links/stats';
import { linksStore, type LinksStore } from '@/tests/helpers/links-store';

const KEY = 'test-key';
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
let store: LinksStore;

/** An 11-character YouTube id for `n`. */
function vid(n: number): string {
  return `v${String(n).padStart(10, '0')}`;
}

function idsAsked(call: number): string[] {
  return (new URL(fetchMock.mock.calls[call][0]).searchParams.get('id') ?? '').split(',');
}

/** Answer each call with these counts for whichever of its ids are in `counts`. */
function youtubeAnswers(counts: Record<string, { views?: string; likes?: string }>) {
  fetchMock.mockImplementation(async (url) => {
    const ids = new URL(url).searchParams.get('id')?.split(',') ?? [];
    const items = ids
      .filter((id) => counts[id])
      .map((id) => ({
        id,
        statistics: { viewCount: counts[id].views, likeCount: counts[id].likes },
      }));
    return new Response(JSON.stringify({ items }), { status: 200 });
  });
}

function youtube(n: number, over: Record<string, unknown> = {}) {
  return store.insert({
    instrumentId: `inst-${n}`,
    url: `https://www.youtube.com/watch?v=${vid(n)}`,
    provider: 'youtube',
    providerId: vid(n),
    title: `Video ${n}`,
    ...over,
  });
}

beforeEach(() => {
  store = linksStore();
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, store.client);
  mockEnv.YOUTUBE_API_KEY = KEY;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshYouTubeStats', () => {
  it('does nothing without a key: no call, no write', async () => {
    mockEnv.YOUTUBE_API_KEY = undefined;
    youtube(1);
    expect(await refreshYouTubeStats()).toEqual({
      status: 'skipped',
      reason: 'YOUTUBE_API_KEY is not set',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });

  it('asks for at most 50 videos a call, each once, with the key, at the Data API', async () => {
    for (let n = 0; n < 120; n++) youtube(n);
    youtube(0, { instrumentId: null, songId: 'song-0' }); // the same video, linked twice
    youtubeAnswers({});
    await refreshYouTubeStats();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const asked = [idsAsked(0), idsAsked(1), idsAsked(2)];
    expect(asked.map((a) => a.length)).toEqual([50, 50, 20]);
    expect(new Set(asked.flat()).size).toBe(120);
    const first = new URL(fetchMock.mock.calls[0][0]);
    expect(`${first.origin}${first.pathname}`).toBe('https://www.googleapis.com/youtube/v3/videos');
    expect(first.searchParams.get('part')).toBe('statistics');
    expect(first.searchParams.get('key')).toBe(KEY);
  });

  it('writes only the rows whose counts changed, to every link of that video, keeping updatedAt', async () => {
    const same = youtube(1, { views: 500, likes: 5 });
    const stale = youtube(2, { views: 10, likes: 1 });
    const twin = youtube(2, { instrumentId: null, songId: 'song-2' });
    const now = new Date('2026-11-06T00:00:00Z');
    youtubeAnswers({
      [vid(1)]: { views: '500', likes: '5' },
      [vid(2)]: { views: '900', likes: '9' },
    });

    const summary = await refreshYouTubeStats(now);

    expect(summary).toEqual({ videos: 2, updated: 2, unchanged: 1, missing: 0, failed: 0 });
    expect(store.writes.sort()).toEqual(
      [`update ${String(stale.id)}`, `update ${String(twin.id)}`].sort()
    );
    for (const row of [stale, twin]) {
      const after = store.links.find((l) => l.id === row.id);
      expect(after).toMatchObject({ views: 900, likes: 9, statsAt: now, updatedAt: row.updatedAt });
    }
    expect(store.links.find((l) => l.id === same.id)).toEqual(same);
  });

  it('writes nothing on a second run when nothing changed', async () => {
    youtube(1);
    youtubeAnswers({ [vid(1)]: { views: '42', likes: '2' } });
    await refreshYouTubeStats();
    expect(store.writes).toHaveLength(1);
    await refreshYouTubeStats();
    expect(store.writes).toHaveLength(1);
  });

  it('never touches a link from another provider', async () => {
    const vimeo = store.insert({
      instrumentId: 'inst-v',
      url: 'https://vimeo.com/1',
      provider: 'vimeo',
      providerId: '1',
      title: 'V',
    });
    youtubeAnswers({});
    expect(await refreshYouTubeStats()).toMatchObject({ videos: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.links).toEqual([vimeo]);
  });

  it('survives a batch the API refuses: the other batches are still written', async () => {
    for (let n = 0; n < 60; n++) youtube(n);
    let call = 0;
    fetchMock.mockImplementation(async (url) => {
      call++;
      if (call === 1) return new Response('{"error":"quotaExceeded"}', { status: 403 });
      const ids = new URL(url).searchParams.get('id')?.split(',') ?? [];
      return new Response(
        JSON.stringify({ items: ids.map((id) => ({ id, statistics: { viewCount: '7' } })) }),
        { status: 200 }
      );
    });

    const summary = await refreshYouTubeStats();

    expect(summary).toMatchObject({ videos: 60, updated: 10, failed: 50 });
    expect(store.links.filter((l) => l.views === 7)).toHaveLength(10);
  });

  it('keeps the counts of a video YouTube no longer returns', async () => {
    const gone = youtube(1, { views: 123 });
    youtubeAnswers({});
    expect(await refreshYouTubeStats()).toMatchObject({ missing: 1, updated: 0 });
    expect(store.links[0]).toEqual(gone);
  });

  it('caps a count at the largest Int, and reads a hidden like count as none', async () => {
    youtube(1, { likes: 3 });
    youtubeAnswers({ [vid(1)]: { views: '99999999999' } });
    await refreshYouTubeStats();
    expect(store.links[0]).toMatchObject({ views: 2_147_483_647, likes: null });
  });

  it('does not write a video’s counts onto a link given another URL during the run', async () => {
    const row = youtube(1);
    fetchMock.mockImplementation(async () => {
      // An admin changes the link's URL while the call is out.
      Object.assign(row, { providerId: vid(9), url: `https://www.youtube.com/watch?v=${vid(9)}` });
      return new Response(
        JSON.stringify({ items: [{ id: vid(1), statistics: { viewCount: '5' } }] }),
        { status: 200 }
      );
    });
    expect(await refreshYouTubeStats()).toMatchObject({ updated: 0, failed: 0 });
    expect(store.links[0].views).toBeNull();
  });
});

describe('an edit during the run', () => {
  it('keeps the admin’s own updatedAt, leaving the counts for the next run', async () => {
    const row = youtube(1);
    const edited = new Date('2026-11-06T09:00:00Z');
    fetchMock.mockImplementation(async () => {
      // An admin retitles the link while the call is out.
      Object.assign(row, { title: 'Retitled', updatedAt: edited });
      return new Response(
        JSON.stringify({ items: [{ id: vid(1), statistics: { viewCount: '5' } }] }),
        { status: 200 }
      );
    });
    expect(await refreshYouTubeStats()).toMatchObject({ updated: 0, failed: 0 });
    expect(store.links[0]).toMatchObject({ title: 'Retitled', updatedAt: edited, views: null });

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: vid(1), statistics: { viewCount: '5' } }] }), {
        status: 200,
      })
    );
    expect(await refreshYouTubeStats()).toMatchObject({ updated: 1 });
    expect(store.links[0]).toMatchObject({ updatedAt: edited, views: 5 });
  });
});

describe('statsForVideo', () => {
  it('reads one video’s counts', async () => {
    youtubeAnswers({ [vid(1)]: { views: '10', likes: '1' } });
    expect(await statsForVideo(vid(1))).toEqual({ views: 10, likes: 1 });
    expect(idsAsked(0)).toEqual([vid(1)]);
  });

  it('is null without a key, or when YouTube does not answer', async () => {
    mockEnv.YOUTUBE_API_KEY = undefined;
    expect(await statsForVideo(vid(1))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    mockEnv.YOUTUBE_API_KEY = KEY;
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }));
    expect(await statsForVideo(vid(1))).toBeNull();
  });
});
