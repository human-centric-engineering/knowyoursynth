/**
 * Unit Tests: what the closed videos section says (`summarisePublicLinks`, `f-videos-and-links` t-182), and a library
 * patch's links with its inspiration's (t-183).
 *
 * Over the stateful fake (`tests/helpers/links-store.ts`). Pins: the count is the list's (one per URL across a synth's
 * instruments); the kinds are the ones present, in `LINK_KINDS` order; a hidden synth has none. A patch inherits the
 * song and artist of its default pattern (the first enabled riff on its list), and nothing from a genre; its own come
 * first and win a URL both have. The synth page's per-sound and per-record counts match the lists. The route's own
 * tests are `tests/unit/app/api/v1/links/route.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted((): Record<string, unknown> => ({}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

import {
  listPublicLinks,
  summarisePublicLinks,
  summariseSongLinks,
  summariseSoundLinks,
} from '@/lib/app/links/read';
import { linksStore, type LinksStore } from '@/tests/helpers/links-store';

let store: LinksStore;

const AUTOBAHN = { id: 'kraftwerk-autobahn', title: 'Autobahn' };
const SNOWFLAKES = { id: 'tomita-snowflakes', title: 'Snowflakes Are Dancing' };
const KRAFTWERK = { id: 'kraftwerk', name: 'Kraftwerk' };
const SEEDED = () => 0.5;

beforeEach(() => {
  store = linksStore({
    instruments: [
      { id: 'moog-minimoog', name: 'Minimoog' },
      { id: 'moog-minimoog-reissue', name: 'Minimoog reissue' },
      { id: 'arp-odyssey', name: 'Odyssey' },
    ],
    synths: [
      { id: 'model-d', listed: true, instrumentIds: ['moog-minimoog', 'moog-minimoog-reissue'] },
      { id: 'hidden-synth', listed: false, instrumentIds: ['arp-odyssey'] },
    ],
    songs: [
      { id: 'kraftwerk-autobahn', title: 'Autobahn' },
      { id: 'tomita-snowflakes', title: 'Snowflakes Are Dancing' },
    ],
    artists: [{ id: 'kraftwerk', name: 'Kraftwerk' }],
    sounds: [
      {
        id: 'snd-song',
        synthId: 'model-d',
        slug: 'autobahn-lead',
        name: 'Autobahn lead',
        patterns: [{ song: AUTOBAHN, artist: KRAFTWERK }],
      },
      {
        id: 'snd-genre',
        synthId: 'model-d',
        slug: 'disco-bass',
        name: 'Disco bass',
        // A genre: inspired by nothing in the databank.
        patterns: [{}],
      },
      {
        id: 'snd-next',
        synthId: 'model-d',
        slug: 'snow-pad',
        name: 'Snow pad',
        patterns: [
          { status: 'disabled', song: AUTOBAHN },
          { riff: false, artist: KRAFTWERK },
          { song: SNOWFLAKES },
        ],
      },
      {
        id: 'snd-hidden',
        synthId: 'hidden-synth',
        slug: 'lead',
        name: 'Lead',
        patterns: [{ song: AUTOBAHN }],
      },
    ],
  });
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, store.client);
});

describe('summarisePublicLinks', () => {
  it("counts a synth's links as its list has them, one per URL, with the kinds in order", async () => {
    store.insert({ instrumentId: 'moog-minimoog', url: 'https://example.com/a', kind: 'lesson' });
    store.insert({ instrumentId: 'moog-minimoog', url: 'https://example.com/b', kind: 'demo' });
    // The same URL on the synth's other instrument is one link, not two.
    store.insert({
      instrumentId: 'moog-minimoog-reissue',
      url: 'https://example.com/a',
      kind: 'lesson',
    });
    store.insert({
      instrumentId: 'moog-minimoog-reissue',
      url: 'https://example.com/c',
      kind: 'review',
    });
    // Another synth's.
    store.insert({ instrumentId: 'arp-odyssey', url: 'https://example.com/d', kind: 'original' });

    const summary = await summarisePublicLinks({ target: 'synth', id: 'model-d' });

    expect(summary).toEqual({ count: 3, kinds: ['demo', 'review', 'lesson'] });
    expect(summary.count).toBe(
      (await listPublicLinks({ target: 'synth', id: 'model-d' }, () => 0.5)).length
    );
  });

  it("counts one instrument's own", async () => {
    store.insert({ instrumentId: 'arp-odyssey', url: 'https://example.com/d', kind: 'original' });
    store.insert({ instrumentId: 'moog-minimoog', url: 'https://example.com/a', kind: 'demo' });

    expect(await summarisePublicLinks({ target: 'instrument', id: 'arp-odyssey' })).toEqual({
      count: 1,
      kinds: ['original'],
    });
  });

  it('has none for a hidden synth, though its instrument has links', async () => {
    store.insert({ instrumentId: 'arp-odyssey', url: 'https://example.com/d', kind: 'demo' });

    expect(await summarisePublicLinks({ target: 'synth', id: 'hidden-synth' })).toEqual({
      count: 0,
      kinds: [],
    });
  });

  it('has none, of no kind, for a synth without links', async () => {
    expect(await summarisePublicLinks({ target: 'synth', id: 'model-d' })).toEqual({
      count: 0,
      kinds: [],
    });
  });
});

describe("a library patch: its own links, then its inspiration's", () => {
  const inspiration = () => {
    store.insert({
      songId: 'kraftwerk-autobahn',
      url: 'https://example.com/original',
      kind: 'original',
      title: 'Original',
      views: 5e7,
    });
    store.insert({
      artistId: 'kraftwerk',
      url: 'https://example.com/live',
      kind: 'performance',
      title: 'Live',
    });
  };

  it("lists a patch with a song-linked default pattern: its own first, then the song's and artist's, marked", async () => {
    inspiration();
    store.insert({
      soundId: 'snd-song',
      url: 'https://example.com/walk',
      kind: 'lesson',
      title: 'Walk-through',
    });

    const list = await listPublicLinks({ target: 'sound', id: 'model-d/autobahn-lead' }, SEEDED);

    expect(list.map((l) => [l.title, l.via])).toEqual([
      ['Walk-through', null],
      ['Original', { kind: 'song', id: 'kraftwerk-autobahn', name: 'Autobahn' }],
      ['Live', { kind: 'artist', id: 'kraftwerk', name: 'Kraftwerk' }],
    ]);
  });

  it('inherits even with no links of its own', async () => {
    inspiration();
    const list = await listPublicLinks({ target: 'sound', id: 'model-d/autobahn-lead' }, SEEDED);
    expect(list.map((l) => l.via?.kind)).toEqual(['song', 'artist']);
  });

  it('keeps our videos of the song ahead of our videos of the artist, each in its order', async () => {
    store.insert({
      artistId: 'kraftwerk',
      url: 'https://example.com/a0',
      title: 'artist ours',
      ours: true,
      order: 0,
    });
    store.insert({
      songId: 'kraftwerk-autobahn',
      url: 'https://example.com/s1',
      title: 'song ours 1',
      ours: true,
      order: 1,
    });
    store.insert({
      songId: 'kraftwerk-autobahn',
      url: 'https://example.com/s0',
      title: 'song ours 0',
      ours: true,
      order: 0,
    });

    const list = await listPublicLinks({ target: 'sound', id: 'model-d/autobahn-lead' }, SEEDED);

    expect(list.map((l) => l.title)).toEqual(['song ours 0', 'song ours 1', 'artist ours']);
  });

  it('shows a URL it shares with its inspiration once, as its own', async () => {
    inspiration();
    store.insert({
      soundId: 'snd-song',
      url: 'https://example.com/original',
      kind: 'original',
      title: 'Ours too',
    });

    const list = await listPublicLinks({ target: 'sound', id: 'model-d/autobahn-lead' }, SEEDED);

    expect(list.map((l) => [l.title, l.via?.kind ?? null])).toEqual([
      ['Ours too', null],
      ['Live', 'artist'],
    ]);
  });

  it('gives a genre-only patch only its own, though the databank has links', async () => {
    inspiration();
    store.insert({ soundId: 'snd-genre', url: 'https://example.com/disco', title: 'Disco demo' });

    const list = await listPublicLinks({ target: 'sound', id: 'model-d/disco-bass' }, SEEDED);

    expect(store.links).toHaveLength(3);
    expect(list.map((l) => [l.title, l.via])).toEqual([['Disco demo', null]]);
  });

  it('inherits from the pattern its riff plays: past a disabled head and one that cannot be a riff', async () => {
    inspiration();
    store.insert({
      songId: 'tomita-snowflakes',
      url: 'https://example.com/snow',
      kind: 'original',
      title: 'Snowflakes',
    });

    const list = await listPublicLinks({ target: 'sound', id: 'model-d/snow-pad' }, SEEDED);

    expect(list.map((l) => [l.title, l.via?.id])).toEqual([['Snowflakes', 'tomita-snowflakes']]);
  });

  it('serves none for a patch on a hidden synth, though its song has links', async () => {
    inspiration();
    expect(await listPublicLinks({ target: 'sound', id: 'hidden-synth/lead' }, SEEDED)).toEqual([]);
    expect(await summarisePublicLinks({ target: 'sound', id: 'hidden-synth/lead' })).toEqual({
      count: 0,
      kinds: [],
    });
  });

  it('counts a patch as its list has it', async () => {
    inspiration();
    store.insert({
      soundId: 'snd-song',
      url: 'https://example.com/walk',
      kind: 'lesson',
      title: 'Walk-through',
    });
    store.insert({
      soundId: 'snd-song',
      url: 'https://example.com/original',
      kind: 'original',
      title: 'Dup',
    });

    const summary = await summarisePublicLinks({ target: 'sound', id: 'model-d/autobahn-lead' });

    expect(summary).toEqual({ count: 3, kinds: ['performance', 'lesson', 'original'] });
    expect(summary.count).toBe(
      (await listPublicLinks({ target: 'sound', id: 'model-d/autobahn-lead' }, SEEDED)).length
    );
  });
});

describe('summariseSoundLinks', () => {
  it('counts every patch on a synth as its own list would, by slug, leaving out those with none', async () => {
    store.insert({
      songId: 'kraftwerk-autobahn',
      url: 'https://example.com/original',
      kind: 'original',
    });
    store.insert({ artistId: 'kraftwerk', url: 'https://example.com/live', kind: 'performance' });
    store.insert({ soundId: 'snd-song', url: 'https://example.com/original', kind: 'original' });
    store.insert({ soundId: 'snd-genre', url: 'https://example.com/disco', kind: 'demo' });
    store.insert({
      songId: 'tomita-snowflakes',
      url: 'https://example.com/snow',
      kind: 'original',
    });

    const counts = await summariseSoundLinks('model-d');

    expect(counts).toEqual({
      'autobahn-lead': { count: 2, kinds: ['performance', 'original'] },
      'disco-bass': { count: 1, kinds: ['demo'] },
      'snow-pad': { count: 1, kinds: ['original'] },
    });
    for (const [slug, summary] of Object.entries(counts))
      expect(summary).toEqual(
        await summarisePublicLinks({ target: 'sound', id: `model-d/${slug}` })
      );
  });

  it('has none for a hidden synth, and nothing for a synth whose patches have none', async () => {
    store.insert({
      songId: 'kraftwerk-autobahn',
      url: 'https://example.com/original',
      kind: 'original',
    });
    expect(await summariseSoundLinks('hidden-synth')).toEqual({});
    store.links.length = 0;
    expect(await summariseSoundLinks('model-d')).toEqual({});
  });
});

describe('summariseSongLinks', () => {
  it("counts each record's own, one per URL, leaving out records with none", async () => {
    store.insert({ songId: 'kraftwerk-autobahn', url: 'https://example.com/a', kind: 'original' });
    store.insert({ songId: 'kraftwerk-autobahn', url: 'https://example.com/b', kind: 'lesson' });
    // A patch's or an artist's are not the record's.
    store.insert({ soundId: 'snd-song', url: 'https://example.com/c', kind: 'demo' });
    store.insert({ artistId: 'kraftwerk', url: 'https://example.com/d', kind: 'performance' });

    const counts = await summariseSongLinks(['kraftwerk-autobahn', 'tomita-snowflakes']);

    expect([...counts]).toEqual([
      ['kraftwerk-autobahn', { count: 2, kinds: ['lesson', 'original'] }],
    ]);
  });

  it('reads nothing for an empty list', async () => {
    const findMany = vi.spyOn(store.client.externalLink, 'findMany');
    expect((await summariseSongLinks([])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
