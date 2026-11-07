/**
 * The links seed's rules (`lib/app/links/seed.ts`, t-199): what the data check refuses, what a stored link is saved as,
 * what an export writes, and what a run writes. The committed data and the loader are `seed-data.test.ts`'s.
 */
import { describe, it, expect, vi } from 'vitest';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import {
  checkLinkData,
  exportLinkData,
  LinkDataError,
  LinkDropError,
  LinkSeedFileSchema,
  SeedLinkSchema,
  seedLinks,
  toSeedLink,
  type LinkSeedData,
  type StoredLink,
} from '@/lib/app/links/seed';
import type { OwnerKind } from '@/lib/app/links/owner-ref';

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YT2 = 'https://www.youtube.com/watch?v=FCqoMIKfv04';
const YT3 = 'https://www.youtube.com/watch?v=EmbVaQfEWS8';
const BANDCAMP = 'https://artist.bandcamp.com/album/some-record';
const VIMEO = 'https://vimeo.com/123456';

const link = (url: string, extra: Record<string, unknown> = {}) =>
  SeedLinkSchema.parse({ url, kind: 'demo', title: 'A video', ...extra });

const data = (...entries: [OwnerKind, string, ReturnType<typeof link>[]][]): LinkSeedData =>
  entries.map(([kind, id, links]) => ({ owner: { kind, id }, links }));

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

describe('LinkSeedFileSchema', () => {
  it('is an owner and its links', () => {
    expect(
      LinkSeedFileSchema.parse({
        kind: 'sound',
        id: 'model-d/x',
        links: [{ url: YT, kind: 'demo', title: 'T' }],
      })
    ).toEqual({ kind: 'sound', id: 'model-d/x', links: [link(YT, { title: 'T' })] });
  });

  it.each([
    [
      'a bare list, the shape before the owner was named in the file',
      [{ url: YT, kind: 'demo', title: 'T' }],
    ],
    ['an owner kind that is not one', { kind: 'synth', id: 'x', links: [] }],
    ['an unknown key', { kind: 'song', id: 'x', links: [], extra: 1 }],
  ])('refuses %s', (_, file) => {
    expect(LinkSeedFileSchema.safeParse(file).success).toBe(false);
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

describe('toSeedLink', () => {
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

  it('leaves out a picture its provider check no longer accepts, which the app would not show', () => {
    expect(
      toSeedLink({
        ...stored,
        url: VIMEO,
        provider: 'vimeo',
        providerId: '123456',
        thumbnailUrl: 'https://evil.example/x.jpg',
      })
    ).toEqual({ url: VIMEO, kind: 'review', title: 'A review' });
    expect(
      toSeedLink({
        ...stored,
        url: VIMEO,
        provider: 'vimeo',
        providerId: '123456',
        thumbnailUrl: 'https://i.vimeocdn.com/video/1-640.jpg',
      })
    ).toEqual({
      url: VIMEO,
      kind: 'review',
      title: 'A review',
      thumbnailUrl: 'https://i.vimeocdn.com/video/1-640.jpg',
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
    expect(
      SeedLinkSchema.parse(toSeedLink({ ...stored, ours: true, order: 1, rating: 3 }))
    ).toEqual({
      url: YT,
      kind: 'review',
      title: 'A review',
      ours: true,
      order: 1,
      rating: 3,
    });
  });
});

describe('exportLinkData', () => {
  const minimoog = { kind: 'instrument' as const, id: 'moog-minimoog' };
  const sound = { kind: 'sound' as const, id: 'model-d/stacked-night-bass' };
  const row = (
    url: string,
    owner: typeof minimoog | typeof sound,
    extra: Partial<StoredLink> = {}
  ) => ({
    ...stored,
    kind: 'demo' as const,
    title: 'A video',
    url,
    providerId: url.split('v=')[1] ?? null,
    owner,
    ...extra,
  });

  it('makes one file per owner, sorted by owner, each naming its owner, links in the order they came in', () => {
    expect(
      exportLinkData(
        [row(YT2, sound), row(YT2, minimoog), row(YT, minimoog, { ours: true, order: 1 })],
        []
      )
    ).toEqual({
      files: [
        {
          kind: 'instrument',
          id: 'moog-minimoog',
          links: [
            { url: YT2, kind: 'demo', title: 'A video' },
            { url: YT, kind: 'demo', title: 'A video', ours: true, order: 1 },
          ],
        },
        {
          kind: 'sound',
          id: 'model-d/stacked-night-bass',
          links: [{ url: YT2, kind: 'demo', title: 'A video' }],
        },
      ],
      dropped: [],
    });
  });

  it('keeps the committed order, with new links after it, however the table returns them', () => {
    // As after a reseed: every row has the same createdAt, so the table comes back by URL.
    const committed = data(['instrument', 'moog-minimoog', [link(YT3), link(YT)]]);
    const { files } = exportLinkData(
      [row(YT, minimoog), row(YT2, minimoog), row(YT3, minimoog)],
      committed
    );
    expect(files[0]?.links.map((l) => l.url)).toEqual([YT3, YT, YT2]);
  });

  it('takes what the table says about a committed link', () => {
    const committed = data(['instrument', 'moog-minimoog', [link(YT, { title: 'Old title' })]]);
    const { files } = exportLinkData([row(YT, minimoog, { title: 'New title' })], committed);
    expect(files[0]?.links).toEqual([{ url: YT, kind: 'demo', title: 'New title' }]);
  });

  it('refuses to drop a committed link the table lacks, naming each by owner', () => {
    const committed = data(
      ['instrument', 'moog-minimoog', [link(YT), link(YT2)]],
      ['sound', 'model-d/stacked-night-bass', [link(YT)]]
    );
    const run = () => exportLinkData([row(YT2, minimoog)], committed);
    expect(run).toThrow(LinkDropError);
    expect(run).toThrow(/lacks 2 committed link\(s\).*-- --prune/s);
    try {
      run();
    } catch (error) {
      expect((error as LinkDropError).dropped).toEqual([
        `instrument:moog-minimoog ${YT}`,
        `sound:model-d/stacked-night-bass ${YT}`,
      ]);
    }
  });

  it('refuses an empty table, as from the wrong database, rather than wipe the data', () => {
    expect(() => exportLinkData([], data(['instrument', 'moog-minimoog', [link(YT)]]))).toThrow(
      LinkDropError
    );
  });

  it('shows the first twenty it would drop, and says there are more', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      link(`https://www.youtube.com/watch?v=${String(i).padStart(11, 'a')}`)
    );
    try {
      exportLinkData([], data(['instrument', 'moog-minimoog', many]));
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message.split('\n- ')).toHaveLength(22);
      expect((error as Error).message.endsWith('\n- …')).toBe(true);
    }
  });

  it('drops them when told to prune, and says which', () => {
    const committed = data(['instrument', 'moog-minimoog', [link(YT), link(YT2)]]);
    expect(exportLinkData([row(YT2, minimoog)], committed, { prune: true })).toEqual({
      files: [
        {
          kind: 'instrument',
          id: 'moog-minimoog',
          links: [{ url: YT2, kind: 'demo', title: 'A video' }],
        },
      ],
      dropped: [`instrument:moog-minimoog ${YT}`],
    });
    expect(exportLinkData([], committed, { prune: true })).toEqual({
      files: [],
      dropped: [`instrument:moog-minimoog ${YT}`, `instrument:moog-minimoog ${YT2}`],
    });
  });

  it('refuses a table the seed would refuse, naming every problem', () => {
    const bad = () =>
      exportLinkData([row(YT, minimoog), row(YT2, sound, { title: 'x'.repeat(201) })], []);
    expect(bad).toThrow(LinkDataError);
    try {
      bad();
    } catch (error) {
      expect((error as LinkDataError).problems).toEqual([
        expect.stringMatching(/^sound:model-d\/stacked-night-bass: /),
      ]);
    }
  });
});

/** A client with the reads and the one write the seed makes. `have` is what each owner table holds. */
function fakeDb(have: {
  instruments?: string[];
  songs?: string[];
  artists?: string[];
  sounds?: string[];
  /** Links this database has had from the seed, as `<kind>:<id> <url>`. */
  recorded?: string[];
}) {
  /** The writes in the order they were made. */
  const writes: string[] = [];
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
              const [synthId = '', slug = ''] = key.split('/');
              return { id: `row-${slug}`, synthId, slug };
            })
            .filter((s) => where.OR.some((w) => w.synthId === s.synthId && w.slug === s.slug))
        )
      ),
    },
    externalLink: {
      // Postgres skips a duplicate of the unique owner + URL; here, `existing` stands for those already stored.
      existing: 0,
      createMany: vi.fn(({ data: rows }: { data: unknown[] }) => {
        writes.push('externalLink');
        return Promise.resolve({ count: rows.length - db.externalLink.existing });
      }),
    },
    linkSeedRecord: {
      findMany: vi.fn(({ where }: { where: { OR: { ownerKind: string; ownerId: string }[] } }) =>
        Promise.resolve(
          (have.recorded ?? [])
            .map((r) => {
              const [owner = '', url = ''] = r.split(' ');
              const at = owner.indexOf(':');
              return { ownerKind: owner.slice(0, at), ownerId: owner.slice(at + 1), url };
            })
            .filter((r) =>
              where.OR.some((w) => w.ownerKind === r.ownerKind && w.ownerId === r.ownerId)
            )
        )
      ),
      createMany: vi.fn(({ data: rows }: { data: unknown[] }) => {
        writes.push('linkSeedRecord');
        return Promise.resolve({ count: rows.length });
      }),
    },
    writes,
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
    expect(report).toEqual({ created: 4, existing: 0, alreadyApplied: 0, missingOwners: [] });
    expect(db.externalLink.createMany).toHaveBeenCalledTimes(1);
    const base = { thumbnailUrl: null, ours: false, order: 0, rating: null, title: 'A video' };
    expect(db.externalLink.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        {
          ...base,
          instrumentId: 'moog-minimoog',
          url: YT,
          provider: 'youtube',
          providerId: 'dQw4w9WgXcQ',
          kind: 'demo',
          ours: true,
          order: 1,
          rating: 5,
        },
        {
          ...base,
          instrumentId: 'moog-minimoog',
          url: YT2,
          provider: 'youtube',
          providerId: 'FCqoMIKfv04',
          kind: 'lesson',
        },
        {
          ...base,
          soundId: 'row-stacked-night-bass',
          url: YT,
          provider: 'youtube',
          providerId: 'dQw4w9WgXcQ',
          kind: 'demo',
        },
        {
          ...base,
          songId: 'kraftwerk-autobahn',
          url: BANDCAMP,
          provider: 'bandcamp',
          providerId: 'album=123',
          kind: 'demo',
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
    expect(report).toEqual({ created: 0, existing: 2, alreadyApplied: 0, missingOwners: [] });
    // Only a create is ever asked for, never an update or a delete: the client has no other write to call.
    expect(Object.keys(db.externalLink)).toEqual(['existing', 'createMany']);
    // They were there all along, so they count as applied, and a later delete sticks.
    expect(db.linkSeedRecord.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        { ownerKind: 'instrument', ownerId: 'moog-minimoog', url: YT },
        { ownerKind: 'instrument', ownerId: 'moog-minimoog', url: YT2 },
      ],
    });
  });

  describe('once per database', () => {
    it('records every link it applies, after writing the links', async () => {
      const db = fakeDb({ instruments: ['moog-minimoog'], sounds: ['model-d/stacked-night-bass'] });
      await seedLinks(
        asClient(db),
        data(
          ['instrument', 'moog-minimoog', [link(YT)]],
          ['sound', 'model-d/stacked-night-bass', [link(YT2)]]
        )
      );
      expect(db.linkSeedRecord.createMany).toHaveBeenCalledWith({
        skipDuplicates: true,
        data: [
          { ownerKind: 'instrument', ownerId: 'moog-minimoog', url: YT },
          // A sound is recorded by its natural key, not its row id, so the record outlives a re-created row.
          { ownerKind: 'sound', ownerId: 'model-d/stacked-night-bass', url: YT2 },
        ],
      });
      // Links first: a run that stops between the two records nothing it did not write.
      expect(db.writes).toEqual(['externalLink', 'linkSeedRecord']);
    });

    it('never applies a recorded link again, though its owner no longer has it', async () => {
      // As after an admin deleted YT, or changed its URL to another: the owner lacks it, and the record remains.
      const db = fakeDb({
        instruments: ['moog-minimoog'],
        recorded: [`instrument:moog-minimoog ${YT}`],
      });
      const report = await seedLinks(
        asClient(db),
        data(['instrument', 'moog-minimoog', [link(YT), link(YT2)]])
      );
      expect(report).toEqual({ created: 1, existing: 0, alreadyApplied: 1, missingOwners: [] });
      const created = db.externalLink.createMany.mock.calls[0]?.[0] as { data: { url: string }[] };
      expect(created.data.map((r) => r.url)).toEqual([YT2]);
      expect(db.linkSeedRecord.createMany).toHaveBeenCalledWith({
        skipDuplicates: true,
        data: [{ ownerKind: 'instrument', ownerId: 'moog-minimoog', url: YT2 }],
      });
    });

    it('a record is for its owner only: the same URL on another owner still applies', async () => {
      const db = fakeDb({
        instruments: ['moog-minimoog', 'arp-2600'],
        recorded: [`instrument:moog-minimoog ${YT}`],
      });
      const report = await seedLinks(
        asClient(db),
        data(['instrument', 'moog-minimoog', [link(YT)]], ['instrument', 'arp-2600', [link(YT)]])
      );
      expect(report).toEqual({ created: 1, existing: 0, alreadyApplied: 1, missingOwners: [] });
    });

    it('reads only the records of owners the data names, and none when no owner has links', async () => {
      const db = fakeDb({
        instruments: ['moog-minimoog'],
        recorded: [`instrument:arp-2600 ${YT}`],
      });
      await seedLinks(
        asClient(db),
        data(['instrument', 'moog-minimoog', [link(YT)]], ['song', 'empty', []])
      );
      expect(db.linkSeedRecord.findMany).toHaveBeenCalledWith({
        where: { OR: [{ ownerKind: 'instrument', ownerId: 'moog-minimoog' }] },
        select: { ownerKind: true, ownerId: true, url: true },
      });
      const none = fakeDb({});
      await seedLinks(asClient(none), data(['song', 'empty', []]));
      expect(none.linkSeedRecord.findMany).not.toHaveBeenCalled();
    });

    it('when everything is recorded, looks up no owner and writes nothing', async () => {
      const db = fakeDb({
        instruments: ['moog-minimoog'],
        recorded: [`instrument:moog-minimoog ${YT}`, `instrument:moog-minimoog ${YT2}`],
      });
      const report = await seedLinks(
        asClient(db),
        data(['instrument', 'moog-minimoog', [link(YT), link(YT2)]])
      );
      expect(report).toEqual({ created: 0, existing: 0, alreadyApplied: 2, missingOwners: [] });
      expect(db.bankInstrument.findMany).not.toHaveBeenCalled();
      expect(db.writes).toEqual([]);
    });

    it("gives a missing owner's links no record, so they apply once the owner exists", async () => {
      const db = fakeDb({});
      await seedLinks(asClient(db), data(['instrument', 'not-yet', [link(YT)]]));
      expect(db.linkSeedRecord.createMany).not.toHaveBeenCalled();

      const later = fakeDb({ instruments: ['not-yet'] });
      const report = await seedLinks(asClient(later), data(['instrument', 'not-yet', [link(YT)]]));
      expect(report).toEqual({ created: 1, existing: 0, alreadyApplied: 0, missingOwners: [] });
    });
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
      alreadyApplied: 0,
      missingOwners: ['instrument:removed-synth', 'artist:nobody', 'sound:model-d/gone'],
    });
  });

  it('neither looks up nor reports an owner whose file lists no links', async () => {
    const db = fakeDb({ instruments: ['moog-minimoog'] });
    const report = await seedLinks(
      asClient(db),
      data(
        ['instrument', 'moog-minimoog', [link(YT)]],
        ['instrument', 'emptied', []],
        ['song', 'nothing-here', []]
      )
    );
    expect(report).toEqual({ created: 1, existing: 0, alreadyApplied: 0, missingOwners: [] });
    expect(db.bankInstrument.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['moog-minimoog'] } },
      select: { id: true },
    });
    expect(db.bankSong.findMany).not.toHaveBeenCalled();
  });

  it('asks only the tables of the kinds the data names', async () => {
    const db = fakeDb({ instruments: ['moog-minimoog'] });
    await seedLinks(asClient(db), data(['instrument', 'moog-minimoog', [link(YT)]]));
    expect(db.bankInstrument.findMany).toHaveBeenCalledTimes(1);
    expect(db.bankSong.findMany).not.toHaveBeenCalled();
    expect(db.bankArtist.findMany).not.toHaveBeenCalled();
    expect(db.synthSound.findMany).not.toHaveBeenCalled();
  });

  it('writes nothing for empty data', async () => {
    const db = fakeDb({});
    expect(await seedLinks(asClient(db), [])).toEqual({
      created: 0,
      existing: 0,
      alreadyApplied: 0,
      missingOwners: [],
    });
    expect(db.writes).toEqual([]);
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
      // The short address is the same video, so it is both not in stored form and a third copy.
      problems: [
        `instrument:moog-minimoog: ${YT} listed twice`,
        `instrument:moog-minimoog: https://youtu.be/dQw4w9WgXcQ is stored as ${YT}`,
        'instrument:moog-minimoog: https://youtu.be/dQw4w9WgXcQ listed twice',
      ],
    });
    expect(db.bankInstrument.findMany).not.toHaveBeenCalled();
    expect(db.externalLink.createMany).not.toHaveBeenCalled();
  });
});
