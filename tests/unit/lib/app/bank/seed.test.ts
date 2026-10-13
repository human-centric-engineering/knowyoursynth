/**
 * The databank seed's rules (`fp4`): every reference checked before a write, idempotent, an edited row and its joins
 * left alone, safe on an empty source. Run on the committed seed data, against a small stateful fake of the tables
 * that can create, update and delete as the seed asks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { BankDataError, partId, planBank, seedBank } from '@/lib/app/bank/seed';
import type { Bank } from '@/lib/app/bank/data';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { catalogueSynthSounds } from '@/tests/helpers/bank-db';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const matches = (row: Row, where: Where = {}): boolean =>
  Object.entries(where).every(([k, v]) =>
    v !== null && typeof v === 'object' && 'in' in v && Array.isArray(v.in)
      ? v.in.includes(row[k])
      : row[k] === v
  );

/** One table: `findMany` on equality and `in` filters, and the writes the seed makes. */
function table(name: string, writes: string[]) {
  const rows: Row[] = [];
  return {
    rows,
    findMany: vi.fn(async (args?: { where?: Where }) =>
      rows.filter((r) => matches(r, args?.where)).map((r) => ({ ...r }))
    ),
    create: vi.fn(async ({ data }: { data: Row }) => {
      rows.push({ ...data, editedAt: null });
      writes.push(`${name}.create`);
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`${name}: no row ${where.id}`);
      Object.assign(row, data);
      writes.push(`${name}.update`);
    }),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      rows.push(...data.map((d) => ({ ...d })));
      if (data.length) writes.push(`${name}.createMany`);
    }),
    deleteMany: vi.fn(async ({ where }: { where: Where }) => {
      const before = rows.length;
      const kept = rows.filter((r) => !matches(r, where));
      rows.splice(0, rows.length, ...kept);
      if (kept.length !== before) writes.push(`${name}.deleteMany`);
    }),
  };
}

function fakeDb() {
  const writes: string[] = [];
  const sounds = catalogueSynthSounds();
  const tables = {
    bankMaker: table('maker', writes),
    bankInstrument: table('instrument', writes),
    bankInstrumentPerson: table('instrumentPerson', writes),
    bankInstrumentSynth: table('instrumentSynth', writes),
    bankArtist: table('artist', writes),
    bankArtistMember: table('artistMember', writes),
    bankArtistInstrument: table('artistInstrument', writes),
    bankSong: table('song', writes),
    bankSongArtist: table('songArtist', writes),
    bankSongPart: table('songPart', writes),
    bankPartInstrument: table('partInstrument', writes),
    bankPartSynth: table('partSynth', writes),
  };
  const client = {
    ...tables,
    synth: {
      findMany: vi.fn(async () =>
        [...sounds].map(([id, slugs]) => ({ id, sounds: [...slugs].map((slug) => ({ slug })) }))
      ),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { client, tables, writes, prisma: client as unknown as TenancyClient };
}

let data: Bank;
beforeEach(() => {
  data = structuredClone(loadBankData());
});

describe('planBank', () => {
  it('plans the committed data without a problem', () => {
    const rows = planBank(data, catalogueSynthSounds());
    expect(rows.makers).toHaveLength(50);
    expect(rows.instruments).toHaveLength(86);
    expect(rows.artists).toHaveLength(184);
    expect(rows.songs).toHaveLength(248);
  });

  it("writes a part's per-synth listing, sound and note as one row per synth", () => {
    const rows = planBank(data, catalogueSynthSounds());
    const bach = rows.songJoins.find((s) => s.ownerId === 'wendy-carlos-switched-on-bach');
    // synths: ['model-d'], sounds: { model-d: …, system-15: … }: System 15 has a sound but is not listed by hand.
    expect(bach?.joins.partSynths).toEqual([
      {
        partId: partId('wendy-carlos-switched-on-bach', 0),
        synthId: 'model-d',
        listed: true,
        sound: 'baroque-line-voice',
        note: null,
      },
      {
        partId: partId('wendy-carlos-switched-on-bach', 0),
        synthId: 'system-15',
        listed: false,
        sound: 's15-brass',
        note: null,
      },
    ]);
  });

  it('writes each membership once, under the group, whichever side recorded it', () => {
    const rows = planBank(data, catalogueSynthSounds());
    const members = rows.artistJoins.flatMap((a) => a.joins.members);
    const pairs = members.map((m) => `${m.groupId}>${m.memberId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    // Recorded only on the member (memberOf), and only on the group (members).
    expect(pairs).toEqual(expect.arrayContaining(['roxy-music>brian-eno', 'ultravox>john-foxx']));
  });

  it('refuses every broken reference at once, as checkBank did', () => {
    data.instruments[0].people = ['nobody'];
    data.instruments[1].app = ['no-synth'];
    data.artists[0].memberOf = ['no-band'];
    data.songs[0].artists = ['no-artist'];
    data.songs[0].parts[0].instruments = ['no-instrument'];
    data.songs[0].parts[0].sounds = { 'model-d': 'no-such-sound' };
    data.songs[1].parts[0].player = 'no-player';
    data.makers.push({ ...data.makers[0] });
    let error: unknown;
    try {
      planBank(data, catalogueSynthSounds());
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BankDataError);
    expect((error as BankDataError).problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown maker nobody'),
        expect.stringContaining('unknown app synth no-synth'),
        expect.stringContaining('unknown memberOf no-band'),
        expect.stringContaining('unknown artist no-artist'),
        expect.stringContaining('unknown instrument no-instrument'),
        expect.stringContaining('model-d has no sound no-such-sound'),
        expect.stringContaining('unknown player no-player'),
        `duplicate maker id ${data.makers[0].id}`,
      ])
    );
  });

  it('refuses a recreation of an unknown instrument, and a circle of them', () => {
    data.instruments[0].recreationOf = 'nothing';
    expect(() => planBank(data, catalogueSynthSounds())).toThrow(
      /recreates unknown instrument nothing/
    );
    data.instruments[0].recreationOf = data.instruments[1].id;
    data.instruments[1].recreationOf = data.instruments[0].id;
    expect(() => planBank(data, catalogueSynthSounds())).toThrow(/go round in a circle/);
  });

  it('writes an original before the instrument that recreates it', () => {
    const copy = { ...data.instruments[0], id: 'aaa-copy', recreationOf: data.instruments[85].id };
    data.instruments.unshift(copy);
    const ids = planBank(data, catalogueSynthSounds()).instruments.map((i) => i.id);
    expect(ids.indexOf(data.instruments[86].id)).toBeLessThan(ids.indexOf('aaa-copy'));
  });
});

describe('seedBank', () => {
  it('writes every row and join on the first run', async () => {
    const db = fakeDb();
    const report = await seedBank(db.prisma, data);
    expect(report.songs.created).toBe(248);
    expect(db.tables.bankSong.rows).toHaveLength(248);
    expect(db.tables.bankSongPart.rows).toHaveLength(262);
    expect(db.tables.bankArtistMember.rows.length).toBeGreaterThan(0);
  });

  it('writes nothing on a second run', async () => {
    const db = fakeDb();
    await seedBank(db.prisma, data);
    db.writes.length = 0;
    const report = await seedBank(db.prisma, data);
    expect(db.writes).toEqual([]);
    expect(report.joinsRewritten).toBe(0);
    expect(report.artists).toEqual({ created: 0, updated: 0, unchanged: 184, edited: 0 });
  });

  it("brings a changed row and its changed joins in, and only that row's", async () => {
    const db = fakeDb();
    await seedBank(db.prisma, data);
    db.writes.length = 0;
    const bach = data.songs.find((s) => s.id === 'wendy-carlos-switched-on-bach');
    if (!bach) throw new Error('fixture');
    bach.title = 'Switched-On Bach (reissue)';
    bach.parts[0].text = 'New text.';
    const report = await seedBank(db.prisma, data);
    expect(report.songs).toMatchObject({ updated: 1, unchanged: 247 });
    expect(report.joinsRewritten).toBe(1);
    expect(db.tables.bankSongPart.rows.find((p) => p.id === partId(bach.id, 0))?.text).toBe(
      'New text.'
    );
    expect(db.tables.bankSongPart.rows).toHaveLength(262);
  });

  it("leaves an admin's row and its joins alone", async () => {
    const db = fakeDb();
    await seedBank(db.prisma, data);
    const stored = db.tables.bankSong.rows.find((r) => r.id === 'wendy-carlos-switched-on-bach');
    if (!stored) throw new Error('fixture');
    stored.editedAt = new Date();
    stored.title = "The admin's title";
    db.writes.length = 0;
    const bach = data.songs.find((s) => s.id === 'wendy-carlos-switched-on-bach');
    if (!bach) throw new Error('fixture');
    bach.title = 'The seed would write this';
    bach.parts[0].text = 'And this.';
    const report = await seedBank(db.prisma, data);
    expect(report.songs.edited).toBe(1);
    expect(db.writes).toEqual([]);
    expect(stored.title).toBe("The admin's title");
  });

  it('deletes nothing and writes nothing when the source is empty', async () => {
    const db = fakeDb();
    await seedBank(db.prisma, data);
    db.writes.length = 0;
    await seedBank(db.prisma, { makers: [], instruments: [], artists: [], songs: [] });
    expect(db.writes).toEqual([]);
    expect(db.tables.bankSong.rows).toHaveLength(248);
  });

  it('writes nothing when the data has a broken reference', async () => {
    const db = fakeDb();
    data.songs[0].artists = ['no-artist'];
    await expect(seedBank(db.prisma, data)).rejects.toBeInstanceOf(BankDataError);
    expect(db.writes).toEqual([]);
  });
});
