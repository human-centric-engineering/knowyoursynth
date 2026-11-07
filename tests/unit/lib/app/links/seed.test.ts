/**
 * The links seed's rules (`lib/app/links/seed.ts`, t-199): what the data check refuses, what a stored link is saved as,
 * and what a run writes. The committed data and the loader are `seed-data.test.ts`'s.
 */
import { describe, it, expect, vi } from 'vitest';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import {
  checkLinkData,
  exportLinkData,
  LinkDataError,
  LinkSeedFileSchema,
  seedLinks,
  toSeedLink,
  type LinkSeedData,
  type StoredLink,
} from '@/lib/app/links/seed';

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YT2 = 'https://www.youtube.com/watch?v=FCqoMIKfv04';
const BANDCAMP = 'https://artist.bandcamp.com/album/some-record';
const VIMEO = 'https://vimeo.com/123456';

const link = (url: string, extra: Record<string, unknown> = {}) =>
  LinkSeedFileSchema.parse([{ url, kind: 'demo', title: 'A video', ...extra }])[0];

const data = (...entries: [string, string, ReturnType<typeof link>[]][]): LinkSeedData =>
  entries.map(([kind, id, links]) => ({
    owner: { kind: kind as LinkSeedData[number]['owner']['kind'], id },
    links,
  }));

describe('SeedLinkSchema', () => {
  it('fills the defaults a file leaves out', () => {
    expect(link(YT)).toEqual({
      url: YT,
      kind: 'demo',
      title: 'A video',
      ours: false,
      order: 0,
      rating: null,
    });
  });

  it.each([
    ['an unknown key', { views: 10 }],
    ['an empty title', { title: '  ' }],
    ['a title over 200 characters', { title: 'x'.repeat(201) }],
    ['a kind that is not one', { kind: 'trailer' }],
    ['a rating over 5', { rating: 6 }],
    ['a negative order', { order: -1 }],
  ])('refuses %s', (_, extra) => {
    expect(() => link(YT, extra)).toThrow();
  });
});

describe('checkLinkData', () => {
  it('passes good data', () => {
    expect(
      checkLinkData(
        data(
          ['instrument', 'moog-minimoog', [link(YT), link(YT2)]],
          ['sound', 'model-d/stacked-night-bass', [link(YT)]],
          ['song', 'kraftwerk-autobahn', [link(BANDCAMP, { providerId: 'album=123' })]],
          [
            'artist',
            'aphex-twin',
            [link(VIMEO, { thumbnailUrl: 'https://i.vimeocdn.com/video/1-640.jpg' })],
          ]
        )
      )
    ).toEqual([]);
  });

  it.each([
    ['a URL the parser refuses', link('http://www.youtube.com/watch?v=dQw4w9WgXcQ'), /https/],
    ['a URL not in its stored form', link('https://youtu.be/dQw4w9WgXcQ'), /is stored as/],
    [
      'a provider id on a link that is not Bandcamp',
      link(YT, { providerId: 'album=1' }),
      /only a Bandcamp/,
    ],
    [
      'a Bandcamp id of the wrong shape',
      link(BANDCAMP, { providerId: 'nope' }),
      /not a Bandcamp embed id/,
    ],
    [
      'a picture on a YouTube link',
      link(YT, { thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg' }),
      /picture/,
    ],
    [
      'a picture off its provider',
      link(VIMEO, { thumbnailUrl: 'https://evil.example/x.jpg' }),
      /picture/,
    ],
  ])('reports %s', (_, bad, problem) => {
    const problems = checkLinkData(data(['instrument', 'moog-minimoog', [bad]]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^instrument:moog-minimoog: /);
    expect(problems[0]).toMatch(problem);
  });

  it('reports a URL listed twice for one owner, and not the same URL on two owners', () => {
    expect(
      checkLinkData(
        data(
          ['instrument', 'moog-minimoog', [link(YT), link(YT)]],
          ['instrument', 'arp-2600', [link(YT)]]
        )
      )
    ).toEqual([`instrument:moog-minimoog: ${YT} listed twice`]);
  });

  it('reports an owner listed twice, and an id of the wrong shape', () => {
    expect(
      checkLinkData(
        data(
          ['instrument', 'arp-2600', []],
          ['instrument', 'arp-2600', []],
          ['sound', 'no-slash', []],
          ['song', 'Has Spaces', []]
        )
      )
    ).toEqual([
      'instrument:arp-2600: listed twice',
      'sound:no-slash: not an id of that kind',
      'song:Has Spaces: not an id of that kind',
    ]);
  });
});

describe('toSeedLink', () => {
  const stored: StoredLink = {
    url: YT,
    provider: 'youtube',
    providerId: 'dQw4w9WgXcQ',
    kind: 'review',
    title: 'A review',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    ours: false,
    order: 0,
    rating: null,
  };

  it('leaves out the defaults, the YouTube id and its picture, which the URL gives back', () => {
    expect(toSeedLink(stored)).toEqual({ url: YT, kind: 'review', title: 'A review' });
  });

  it('keeps what an admin set', () => {
    expect(toSeedLink({ ...stored, ours: true, order: 2, rating: 4 })).toEqual({
      url: YT,
      kind: 'review',
      title: 'A review',
      ours: true,
      order: 2,
      rating: 4,
    });
  });

  it("keeps a Bandcamp id and another provider's picture, which the URL cannot give", () => {
    expect(
      toSeedLink({
        ...stored,
        url: BANDCAMP,
        provider: 'bandcamp',
        providerId: 'album=123',
        thumbnailUrl: 'https://f4.bcbits.com/img/a1_10.jpg',
      })
    ).toEqual({
      url: BANDCAMP,
      kind: 'review',
      title: 'A review',
      providerId: 'album=123',
      thumbnailUrl: 'https://f4.bcbits.com/img/a1_10.jpg',
    });
  });

  it('reads back as the link it was', () => {
    const row = { ...stored, ours: true, order: 1, rating: 3 };
    const back = LinkSeedFileSchema.parse([toSeedLink(row)])[0];
    expect(back).toEqual({
      url: YT,
      kind: 'review',
      title: 'A review',
      ours: true,
      order: 1,
      rating: 3,
    });
  });
});

/** A client with the five reads and the one write the seed makes. `have` is what each owner table holds. */
function fakeDb(have: {
  instruments?: string[];
  songs?: string[];
  artists?: string[];
  sounds?: string[];
}) {
  const ids = (list: string[] = []) =>
    vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(list.filter((id) => where.id.in.includes(id)).map((id) => ({ id })))
    );
  const db = {
    bankInstrument: { findMany: ids(have.instruments) },
    bankSong: { findMany: ids(have.songs) },
    bankArtist: { findMany: ids(have.artists) },
    synthSound: {
      findMany: vi.fn(({ where }: { where: { OR: { synthId: string; slug: string }[] } }) =>
        Promise.resolve(
          (have.sounds ?? [])
            .map((key) => {
              const [synthId, slug] = key.split('/');
              return { id: `row-${slug}`, synthId: synthId, slug: slug };
            })
            .filter((s) => where.OR.some((w) => w.synthId === s.synthId && w.slug === s.slug))
        )
      ),
    },
    externalLink: {
      // Postgres skips a duplicate of the unique owner + URL; here, `existing` stands for those already stored.
      existing: 0,
      createMany: vi.fn(({ data: rows }: { data: unknown[] }) =>
        Promise.resolve({ count: rows.length - db.externalLink.existing })
      ),
    },
  };
  return db;
}

const asClient = (db: ReturnType<typeof fakeDb>) => db as unknown as TenancyClient;

describe('seedLinks', () => {
  it('creates every link on the owners it finds, with what the URL says and nothing read from a provider', async () => {
    const db = fakeDb({
      instruments: ['moog-minimoog'],
      sounds: ['model-d/stacked-night-bass'],
      songs: ['kraftwerk-autobahn'],
    });
    const report = await seedLinks(
      asClient(db),
      data(
        [
          'instrument',
          'moog-minimoog',
          [link(YT, { ours: true, order: 1, rating: 5 }), link(YT2, { kind: 'lesson' })],
        ],
        ['sound', 'model-d/stacked-night-bass', [link(YT)]],
        ['song', 'kraftwerk-autobahn', [link(BANDCAMP, { providerId: 'album=123' })]]
      )
    );
    expect(report).toEqual({ created: 4, existing: 0, missingOwners: [] });
    expect(db.externalLink.createMany).toHaveBeenCalledTimes(1);
    expect(db.externalLink.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        {
          instrumentId: 'moog-minimoog',
          url: YT,
          provider: 'youtube',
          providerId: 'dQw4w9WgXcQ',
          kind: 'demo',
          title: 'A video',
          thumbnailUrl: null,
          ours: true,
          order: 1,
          rating: 5,
        },
        {
          instrumentId: 'moog-minimoog',
          url: YT2,
          provider: 'youtube',
          providerId: 'FCqoMIKfv04',
          kind: 'lesson',
          title: 'A video',
          thumbnailUrl: null,
          ours: false,
          order: 0,
          rating: null,
        },
        {
          soundId: 'row-stacked-night-bass',
          url: YT,
          provider: 'youtube',
          providerId: 'dQw4w9WgXcQ',
          kind: 'demo',
          title: 'A video',
          thumbnailUrl: null,
          ours: false,
          order: 0,
          rating: null,
        },
        {
          songId: 'kraftwerk-autobahn',
          url: BANDCAMP,
          provider: 'bandcamp',
          providerId: 'album=123',
          kind: 'demo',
          title: 'A video',
          thumbnailUrl: null,
          ours: false,
          order: 0,
          rating: null,
        },
      ],
    });
  });

  it('writes nothing over a link its owner already has, and counts it', async () => {
    const db = fakeDb({ instruments: ['moog-minimoog'] });
    db.externalLink.existing = 2;
    const report = await seedLinks(
      asClient(db),
      data(['instrument', 'moog-minimoog', [link(YT), link(YT2)]])
    );
    expect(report).toEqual({ created: 0, existing: 2, missingOwners: [] });
    // Only a create is ever asked for, never an update or a delete: the client has no other write to call.
    expect(Object.keys(db.externalLink)).toEqual(['existing', 'createMany']);
  });

  it('skips the links of an owner the database does not have, and names it', async () => {
    const db = fakeDb({ instruments: ['moog-minimoog'] });
    const report = await seedLinks(
      asClient(db),
      data(
        ['instrument', 'moog-minimoog', [link(YT)]],
        ['instrument', 'removed-synth', [link(YT2)]],
        ['artist', 'nobody', [link(YT)]],
        ['sound', 'model-d/gone', [link(YT)]]
      )
    );
    expect(report).toEqual({
      created: 1,
      existing: 0,
      missingOwners: ['instrument:removed-synth', 'artist:nobody', 'sound:model-d/gone'],
    });
  });

  it('does not ask the sound table anything when no sound has links', async () => {
    const db = fakeDb({ instruments: ['moog-minimoog'] });
    await seedLinks(asClient(db), data(['instrument', 'moog-minimoog', [link(YT)]]));
    expect(db.synthSound.findMany).not.toHaveBeenCalled();
  });

  it('writes nothing for empty data', async () => {
    const db = fakeDb({});
    expect(await seedLinks(asClient(db), [])).toEqual({
      created: 0,
      existing: 0,
      missingOwners: [],
    });
    expect(db.externalLink.createMany).not.toHaveBeenCalled();
  });

  it('throws with every problem and writes nothing when the data does not check', async () => {
    const db = fakeDb({ instruments: ['moog-minimoog'] });
    const run = seedLinks(
      asClient(db),
      data([
        'instrument',
        'moog-minimoog',
        [link(YT), link(YT), link('https://youtu.be/dQw4w9WgXcQ')],
      ])
    );
    await expect(run).rejects.toBeInstanceOf(LinkDataError);
    await expect(run).rejects.toMatchObject({
      problems: expect.arrayContaining([expect.stringMatching(/listed twice/)]),
    });
    expect(db.bankInstrument.findMany).not.toHaveBeenCalled();
    expect(db.externalLink.createMany).not.toHaveBeenCalled();
  });
});

describe('exportLinkData', () => {
  const row = (
    url: string,
    owner: { kind: 'instrument' | 'sound'; id: string },
    extra: Partial<StoredLink> = {}
  ) => ({
    url,
    provider: 'youtube',
    providerId: url.split('v=')[1] ?? null,
    kind: 'demo' as const,
    title: 'A video',
    thumbnailUrl: null,
    ours: false,
    order: 0,
    rating: null,
    owner,
    ...extra,
  });
  const minimoog = { kind: 'instrument' as const, id: 'moog-minimoog' };
  const sound = { kind: 'sound' as const, id: 'model-d/stacked-night-bass' };

  it('makes one file per owner, each in the order its links came in, and owners in first-seen order', () => {
    expect(
      exportLinkData([
        row(YT2, minimoog),
        row(YT, sound),
        row(YT, minimoog, { ours: true, order: 1 }),
      ])
    ).toEqual([
      {
        owner: minimoog,
        links: [
          { url: YT2, kind: 'demo', title: 'A video' },
          { url: YT, kind: 'demo', title: 'A video', ours: true, order: 1 },
        ],
      },
      { owner: sound, links: [{ url: YT, kind: 'demo', title: 'A video' }] },
    ]);
  });

  it('makes nothing from an empty table', () => {
    expect(exportLinkData([])).toEqual([]);
  });

  it('refuses a table the seed would refuse, naming every problem', () => {
    const bad = () =>
      exportLinkData([
        row(YT, minimoog),
        row(YT, minimoog),
        row(YT2, sound, { title: 'x'.repeat(201) }),
      ]);
    expect(bad).toThrow(LinkDataError);
    try {
      bad();
    } catch (error) {
      expect((error as LinkDataError).problems).toEqual([
        expect.stringMatching(/^sound:model-d\/stacked-night-bass: /),
        `instrument:moog-minimoog: ${YT} listed twice`,
      ]);
    }
  });
});
