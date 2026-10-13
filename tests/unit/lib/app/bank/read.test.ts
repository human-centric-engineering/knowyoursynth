/**
 * The databank's read layer over the seed's own rows (`tests/helpers/bank-db.ts`): the tables read back as the seed
 * data, every synth's "Heard on" matches the prototype's, and the lists and details join what the prototype joined.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HeardEntry } from '@/lib/app/synths/contract';
import { getHeardOn, listBank, getBankDetail, loadBank } from '@/lib/app/bank/read';
import { groupsOf, membersOf, yearOf } from '@/lib/app/bank/joins';
import type { Bank } from '@/lib/app/bank/data';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { bankDb, type BankDbFake } from '@/tests/helpers/bank-db';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    bankMaker: { findMany: vi.fn() },
    bankInstrument: { findMany: vi.fn() },
    bankArtist: { findMany: vi.fn() },
    bankSong: { findMany: vi.fn() },
  },
}));

const { prisma } = await import('@/lib/db/client');
const golden = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/bank/heard-on.json'), 'utf8')
) as Record<string, HeardEntry[]>;
const data = loadBankData();

function useDb(db: BankDbFake): void {
  for (const model of ['bankMaker', 'bankInstrument', 'bankArtist', 'bankSong'] as const)
    vi.mocked(prisma[model].findMany).mockImplementation(db[model].findMany as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  useDb(bankDb());
});

/** Sorted by id, with memberships read from either side, so two banks compare by content. */
function normalise(bank: Bank): Bank {
  const byId = <T extends { id: string }>(rows: T[]) =>
    [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    makers: byId(bank.makers),
    instruments: byId(bank.instruments).map((i) => ({
      ...i,
      ...(i.app ? { app: [...i.app].sort() } : {}),
    })),
    artists: byId(bank.artists).map((a) => {
      const { members: _m, memberOf: _o, ...rest } = a;
      return {
        ...rest,
        members: membersOf(bank, a.id).sort(),
        memberOf: groupsOf(bank, a.id).sort(),
      };
    }),
    songs: byId(bank.songs).map((s) => ({
      ...s,
      parts: s.parts.map((p) => ({ ...p, ...(p.synths ? { synths: [...p.synths].sort() } : {}) })),
    })),
  };
}

describe('loadBank', () => {
  it('reads the seeded rows back as the seed data', async () => {
    const stored = await loadBank();
    expect(stored.songs).toHaveLength(248);
    expect(normalise(stored)).toEqual(normalise(data));
  });
});

describe('getHeardOn', () => {
  it.each(Object.keys(golden))('%s: equals the prototype', async (id) => {
    const heard = await getHeardOn(id);
    expect(heard.length).toBeGreaterThan(0);
    expect(heard).toEqual(golden[id]);
  });

  it('asks only for the songs the synth lists', async () => {
    await getHeardOn('cat');
    const [args] = vi.mocked(prisma.bankSong.findMany).mock.calls[0] as [{ where: unknown }];
    expect(args.where).toEqual({
      parts: {
        some: {
          OR: [
            { instruments: { some: { instrumentId: { in: ['octave-cat'] } } } },
            { synths: { some: { synthId: 'cat', listed: true } } },
          ],
        },
      },
    });
  });

  it('is empty for a synth the databank does not name', async () => {
    expect(await getHeardOn('no-such-synth')).toEqual([]);
  });
});

describe('listBank', () => {
  it('sorts artists by name and files each under its eras', async () => {
    const artists = await listBank('artists');
    expect(artists).toHaveLength(184);
    expect(artists.map((a) => a.name)).toEqual(
      [...artists.map((a) => a.name)].sort((a, b) => a.localeCompare(b))
    );
    expect(artists.find((a) => a.id === 'aphex-twin')).toMatchObject({
      name: 'Aphex Twin',
      eras: ['1990s', '2000s', '2010s'],
    });
  });

  it('sorts songs by year, undated last, and prints their credit', async () => {
    const songs = await listBank('songs');
    expect(songs).toHaveLength(248);
    const years = songs.map((s) => yearOf(s.year));
    expect(years).toEqual([...years].sort((x, y) => x - y));
    expect(songs.find((s) => s.id === 'wendy-carlos-switched-on-bach')).toEqual({
      id: 'wendy-carlos-switched-on-bach',
      title: 'Switched-On Bach',
      kind: 'album',
      year: '1968',
      who: 'Wendy Carlos',
    });
  });

  it('sorts instruments by year, and makers by birth', async () => {
    const instruments = await listBank('instruments');
    expect(instruments).toHaveLength(86);
    const built = instruments.map((i) => yearOf(i.year));
    expect(built).toEqual([...built].sort((x, y) => x - y));
    const makers = await listBank('makers');
    expect(makers).toHaveLength(50);
    const born = makers.map((m) => yearOf(m.born));
    expect(born).toEqual([...born].sort((x, y) => x - y));
  });
});

describe('getBankDetail', () => {
  it('joins an artist to their records and instruments, with their own list last', async () => {
    const detail = await getBankDetail('artists', 'aphex-twin');
    expect(detail?.artist.name).toBe('Aphex Twin');
    expect(detail?.songs.length).toBeGreaterThan(0);
    expect(detail?.instruments.map((i) => i.id)).toContain('roland-tb-303');
  });

  it('reads a membership recorded only on the member', async () => {
    // roxy-music → brian-eno is recorded on Eno alone (memberOf); the table holds it once, under the group.
    const roxy = await getBankDetail('artists', 'roxy-music');
    expect(roxy?.members.map((m) => m.id)).toContain('brian-eno');
    const eno = await getBankDetail('artists', 'brian-eno');
    expect(eno?.groups.map((g) => g.id)).toContain('roxy-music');
  });

  it('joins an instrument to its people, synths, records and artists', async () => {
    const detail = await getBankDetail('instruments', 'moog-minimoog');
    expect(detail).toMatchObject({
      people: [{ id: 'robert-moog' }, { id: 'bill-hemsath' }, { id: 'jim-scott' }],
      synths: ['model-d'],
      recreationOf: null,
      recreations: [],
    });
    expect(detail?.songs.length).toBeGreaterThan(0);
    expect(detail?.artists.length).toBeGreaterThan(0);
  });

  it('joins a recreation to its original and back', async () => {
    const recreated: Bank = {
      ...data,
      instruments: [
        ...data.instruments,
        {
          id: 'behringer-model-d',
          name: 'Model D',
          maker: 'Behringer',
          year: '2017',
          kind: 'mono',
          recreationOf: 'moog-minimoog',
          text: 'A recreation.',
        },
      ],
    };
    useDb(bankDb(recreated));
    expect((await getBankDetail('instruments', 'behringer-model-d'))?.recreationOf).toMatchObject({
      id: 'moog-minimoog',
    });
    expect((await getBankDetail('instruments', 'moog-minimoog'))?.recreations).toEqual([
      {
        id: 'behringer-model-d',
        name: 'Model D',
        maker: 'Behringer',
        year: '2017',
        kind: 'mono',
        recreationOf: 'moog-minimoog',
      },
    ]);
  });

  it('joins a maker to what they made, and a song to its artists and instruments', async () => {
    const moog = await getBankDetail('makers', 'robert-moog');
    expect(moog?.instruments.map((i) => i.id)).toEqual(
      expect.arrayContaining(['moog-modular', 'moog-minimoog'])
    );
    const song = await getBankDetail('songs', 'wendy-carlos-switched-on-bach');
    expect(song).toMatchObject({
      song: { who: 'Wendy Carlos' },
      artists: [{ id: 'wendy-carlos' }],
      instruments: [{ id: 'moog-modular' }],
    });
  });

  it('is null for an id it does not have', async () => {
    expect(await getBankDetail('songs', 'no-such-song')).toBeNull();
  });
});
