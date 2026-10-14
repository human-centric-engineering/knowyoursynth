/**
 * The databank's thirteen tables in memory, as a stateful fake that can be read, written and reseeded (`f-databank`
 * t-36).
 *
 * Starts as the seed leaves the committed data (`planBank`), or empty. Answers the calls the read layer
 * (`lib/app/bank/read.ts`), the admin writes (`lib/app/bank/admin.ts`) and the seed (`lib/app/bank/seed.ts`) make:
 * `findMany` with the read layer's includes and equality / `in` filters, `findUnique`, `create`, `update`, `upsert`,
 * `delete`, `createMany`, `deleteMany`, and `$transaction` in both forms. A row's own joins cascade on delete, as the
 * schema says. That is a model of Prisma, not Prisma: `npm run smoke:bank` runs against the dev database.
 */
import { vi } from 'vitest';
import { planBank, type BankRows } from '@/lib/app/bank/seed';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { catalogueSynthSounds } from '@/tests/helpers/bank-db';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const matches = (row: Row, where: Where = {}): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (v !== null && typeof v === 'object' && 'in' in v && Array.isArray(v.in))
      return v.in.includes(row[k]);
    if (k === 'kind_id' && v !== null && typeof v === 'object') return matches(row, v as Where);
    return row[k] === v;
  });

const byOrder = (a: Row, b: Row) => Number(a.order) - Number(b.order);
const bySynth = (a: Row, b: Row) => String(a.synthId).localeCompare(String(b.synthId));
const byId = (a: Row, b: Row) => String(a.id).localeCompare(String(b.id));
const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.map((k) => [k, row[k]]));

export interface BankStore {
  tables: Record<string, Row[]>;
  /** Every write, as `<table>.<method>`, in order. */
  writes: string[];
  client: Record<string, unknown>;
}

/** The store, filled with the committed data as the seed writes it unless `empty`. */
export function bankStore(options: { empty?: boolean } = {}): BankStore {
  const writes: string[] = [];
  const tables: Record<string, Row[]> = {
    bankMaker: [],
    bankInstrument: [],
    bankInstrumentPerson: [],
    bankInstrumentSynth: [],
    bankArtist: [],
    bankArtistMember: [],
    bankArtistInstrument: [],
    bankSong: [],
    bankSongArtist: [],
    bankSongPart: [],
    bankPartInstrument: [],
    bankPartSynth: [],
    bankRemoval: [],
  };
  const stamp = () => ({ editedAt: null, createdAt: new Date(0), updatedAt: new Date(0) });

  if (!options.empty) {
    const rows: BankRows = planBank(loadBankData(), catalogueSynthSounds());
    tables.bankMaker = rows.makers.map((r) => ({ ...r, ...stamp() }));
    tables.bankInstrument = rows.instruments.map((r) => ({ ...r, ...stamp() }));
    tables.bankArtist = rows.artists.map((r) => ({ ...r, ...stamp() }));
    tables.bankSong = rows.songs.map((r) => ({ ...r, ...stamp() }));
    for (const { joins } of rows.instrumentJoins) {
      tables.bankInstrumentPerson.push(...joins.people);
      tables.bankInstrumentSynth.push(...joins.synths);
    }
    for (const { joins } of rows.artistJoins) {
      tables.bankArtistInstrument.push(...joins.instruments);
      tables.bankArtistMember.push(...joins.members);
    }
    for (const { joins } of rows.songJoins) {
      tables.bankSongArtist.push(...joins.artists);
      tables.bankSongPart.push(...joins.parts.map((r) => ({ ...r })));
      tables.bankPartInstrument.push(...joins.partInstruments.map((r) => ({ ...r })));
      tables.bankPartSynth.push(...joins.partSynths.map((r) => ({ ...r })));
    }
  }

  /** What deleting a row of `name` also deletes: its own joins (onDelete: Cascade). */
  const cascades: Record<string, [string, string][]> = {
    bankInstrument: [
      ['bankInstrumentPerson', 'instrumentId'],
      ['bankInstrumentSynth', 'instrumentId'],
    ],
    bankArtist: [
      ['bankArtistMember', 'groupId'],
      ['bankArtistInstrument', 'artistId'],
    ],
    bankSong: [
      ['bankSongArtist', 'songId'],
      ['bankSongPart', 'songId'],
    ],
    bankSongPart: [
      ['bankPartInstrument', 'partId'],
      ['bankPartSynth', 'partId'],
    ],
  };
  const removeWhere = (name: string, where: Where): number => {
    const gone = tables[name].filter((r) => matches(r, where));
    tables[name] = tables[name].filter((r) => !matches(r, where));
    for (const row of gone)
      for (const [child, key] of cascades[name] ?? []) removeWhere(child, { [key]: row.id });
    return gone.length;
  };

  /** A row with the relations the read layer includes. */
  const included = (name: string, row: Row, include: Row | undefined): Row => {
    if (!include) return { ...row };
    const out: Row = { ...row };
    const t = tables;
    if (name === 'bankInstrument') {
      if (include.people)
        out.people = t.bankInstrumentPerson
          .filter((p) => p.instrumentId === row.id)
          .sort(byOrder)
          .map((p) => pick(p, ['makerId']));
      if (include.synths)
        out.synths = t.bankInstrumentSynth
          .filter((p) => p.instrumentId === row.id)
          .sort(bySynth)
          .map((p) => pick(p, ['synthId']));
    }
    if (name === 'bankArtist') {
      out.instruments = t.bankArtistInstrument
        .filter((p) => p.artistId === row.id)
        .sort(byOrder)
        .map((p) => pick(p, ['instrumentId']));
      out.members = t.bankArtistMember
        .filter((p) => p.groupId === row.id)
        .sort(byOrder)
        .map((p) => pick(p, ['memberId']));
      out.groups = t.bankArtistMember
        .filter((p) => p.memberId === row.id)
        .sort((a, b) => String(a.groupId).localeCompare(String(b.groupId)))
        .map((p) => pick(p, ['groupId']));
    }
    if (name === 'bankSong') {
      out.artists = t.bankSongArtist
        .filter((p) => p.songId === row.id)
        .sort(byOrder)
        .map((p) => ({
          artistId: p.artistId,
          artist: { name: t.bankArtist.find((a) => a.id === p.artistId)?.name ?? p.artistId },
        }));
      out.parts = t.bankSongPart
        .filter((p) => p.songId === row.id)
        .sort(byOrder)
        .map((p) => ({
          ...p,
          instruments: t.bankPartInstrument
            .filter((i) => i.partId === p.id)
            .sort(byOrder)
            .map((i) => pick(i, ['instrumentId'])),
          synths: t.bankPartSynth.filter((s) => s.partId === p.id).sort(bySynth),
        }));
    }
    return out;
  };

  const model = (name: string) => ({
    findMany: vi.fn(async (args?: { where?: Where; include?: Row }) =>
      tables[name]
        .filter((r) => matches(r, args?.where))
        .sort(byId)
        .map((r) => included(name, r, args?.include))
    ),
    findUnique: vi.fn(async ({ where }: { where: Where }) => {
      const row = tables[name].find((r) => matches(r, where));
      return row ? { ...row } : null;
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      tables[name].push({ ...stamp(), ...data });
      writes.push(`${name}.create`);
    }),
    update: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const row = tables[name].find((r) => matches(r, where));
      // As Prisma reports an update of a row that is not there.
      if (!row)
        throw Object.assign(new Error(`${name}: no row ${JSON.stringify(where)}`), {
          code: 'P2025',
        });
      Object.assign(row, data);
      writes.push(`${name}.update`);
    }),
    upsert: vi.fn(async ({ where, create, update }: { where: Where; create: Row; update: Row }) => {
      const row = tables[name].find((r) => matches(r, where));
      if (row) Object.assign(row, update);
      else tables[name].push({ ...stamp(), ...create });
      writes.push(`${name}.upsert`);
    }),
    delete: vi.fn(async ({ where }: { where: Where }) => {
      if (!removeWhere(name, where)) throw new Error(`${name}: no row ${JSON.stringify(where)}`);
      writes.push(`${name}.delete`);
    }),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      tables[name].push(...data.map((d) => ({ ...d })));
      if (data.length) writes.push(`${name}.createMany`);
    }),
    deleteMany: vi.fn(async ({ where }: { where: Where }) => {
      if (removeWhere(name, where)) writes.push(`${name}.deleteMany`);
    }),
  });

  const sounds = catalogueSynthSounds();
  const client: Record<string, unknown> = {
    ...Object.fromEntries(Object.keys(tables).map((name) => [name, model(name)])),
    synth: {
      findMany: vi.fn(async () =>
        [...sounds].map(([id, slugs]) => ({ id, sounds: [...slugs].map((slug) => ({ slug })) }))
      ),
    },
  };
  client.$transaction = vi.fn(async (ops: unknown) =>
    typeof ops === 'function'
      ? (ops as (tx: unknown) => Promise<unknown>)(client)
      : Promise.all(ops as Promise<unknown>[])
  );
  return { tables, writes, client };
}
