/**
 * Unit Tests: the public videos and links read (`f-videos-and-links` t-179).
 *
 * Real route and `lib/app/links/read.ts` over the stateful fake (`tests/helpers/links-store.ts`). Pins: signed-out
 * read; exactly one target; a synth's list is its instruments' links together, one per URL, our copy kept; a hidden
 * synth and its sounds have none; ours first; embeds built from the id; never cached.
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

import { GET } from '@/app/api/v1/links/route';
import { linksStore, type LinksStore } from '@/tests/helpers/links-store';

const VIDEO = 'dQw4w9WgXcQ';
let store: LinksStore;

const get = (query: string) => GET(new NextRequest(`http://localhost/api/v1/links${query}`));
async function links(query: string) {
  const res = await get(query);
  const body = JSON.parse(await res.text()) as {
    success: boolean;
    data?: Record<string, unknown>[];
  };
  return { res, list: body.data ?? [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  store = linksStore({
    instruments: [
      { id: 'moog-minimoog', name: 'Minimoog' },
      { id: 'moog-minimoog-reissue', name: 'Minimoog reissue' },
      { id: 'arp-odyssey', name: 'Odyssey' },
    ],
    songs: [{ id: 'kraftwerk-autobahn', title: 'Autobahn' }],
    synths: [
      { id: 'model-d', listed: true, instrumentIds: ['moog-minimoog', 'moog-minimoog-reissue'] },
      { id: 'hidden-synth', listed: false, instrumentIds: ['arp-odyssey'] },
    ],
    sounds: [
      { id: 'snd1', synthId: 'model-d', slug: 'bass', name: 'Bass' },
      { id: 'snd2', synthId: 'hidden-synth', slug: 'lead', name: 'Lead' },
    ],
  });
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, store.client);
});

describe('GET /api/v1/links', () => {
  it('serves an instrument’s links signed out, ours first, with embeds built from the id, never cached', async () => {
    store.insert({
      instrumentId: 'moog-minimoog',
      url: 'https://example.com/review',
      provider: 'other',
      title: 'Review',
      views: 1e6,
    });
    store.insert({
      instrumentId: 'moog-minimoog',
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      providerId: VIDEO,
      title: 'Our lesson',
      ours: true,
    });
    const { res, list } = await links('?instrument=moog-minimoog');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(list.map((l) => l.title)).toEqual(['Our lesson', 'Review']);
    expect(list[0]).toEqual({
      id: expect.any(String),
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      provider: 'youtube',
      kind: 'demo',
      title: 'Our lesson',
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO}/hqdefault.jpg`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${VIDEO}`,
      ours: true,
      views: null,
    });
    expect(list[1]).toMatchObject({ embedUrl: null, thumbnailUrl: null });
  });

  it('serves a synth’s links as its instruments’ together, one per URL, keeping our copy', async () => {
    const shared = 'https://example.com/shared';
    store.insert({
      instrumentId: 'moog-minimoog',
      url: shared,
      provider: 'other',
      title: 'Theirs',
    });
    store.insert({
      instrumentId: 'moog-minimoog-reissue',
      url: shared,
      provider: 'other',
      title: 'Ours',
      ours: true,
    });
    store.insert({
      instrumentId: 'moog-minimoog-reissue',
      url: 'https://example.com/b',
      provider: 'other',
      title: 'B',
    });
    store.insert({
      instrumentId: 'arp-odyssey',
      url: 'https://example.com/c',
      provider: 'other',
      title: 'Not this synth',
    });
    const { list } = await links('?synth=model-d');
    expect(list.map((l) => l.title)).toEqual(['Ours', 'B']);
  });

  it('serves a library patch’s own links, a song’s and an artist’s', async () => {
    store.insert({
      soundId: 'snd1',
      url: 'https://example.com/s',
      provider: 'other',
      title: 'Patch demo',
    });
    store.insert({
      songId: 'kraftwerk-autobahn',
      url: 'https://example.com/o',
      provider: 'other',
      title: 'Original',
      kind: 'original',
    });
    expect((await links('?sound=model-d/bass')).list.map((l) => l.title)).toEqual(['Patch demo']);
    expect((await links('?song=kraftwerk-autobahn')).list.map((l) => l.title)).toEqual([
      'Original',
    ]);
    expect((await links('?artist=nobody')).list).toEqual([]);
  });

  it('serves nothing for a hidden synth or a sound on one, though the rows are there', async () => {
    store.insert({
      instrumentId: 'arp-odyssey',
      url: 'https://example.com/c',
      provider: 'other',
      title: 'C',
    });
    store.insert({ soundId: 'snd2', url: 'https://example.com/d', provider: 'other', title: 'D' });
    expect(store.links).toHaveLength(2);
    expect((await links('?synth=hidden-synth')).list).toEqual([]);
    expect((await links('?sound=hidden-synth/lead')).list).toEqual([]);
    expect((await links('?synth=no-such-synth')).list).toEqual([]);
    // The databank itself is public, hidden synth or not.
    expect((await links('?instrument=arp-odyssey')).list.map((l) => l.title)).toEqual(['C']);
  });

  it('refuses no target, two targets, and an id not of its kind', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?instrument=moog-minimoog&song=kraftwerk-autobahn')).status).toBe(400);
    expect((await get('?sound=model-d')).status).toBe(400);
    expect((await get('?synth=Model D')).status).toBe(400);
  });
});
