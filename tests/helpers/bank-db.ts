/**
 * The databank's tables as the seed writes them, in memory, behind the four `findMany` calls the read layer makes
 * (`lib/app/bank/read.ts`).
 *
 * The rows are the seed's own plan (`planBank`) of the committed seed data, so a read test runs over the real
 * databank. Each `findMany` returns every relation the read layer includes, ordered as it asks, and applies the two
 * filters `getHeardOn` uses. That is a model of Prisma, not Prisma: `npm run smoke:bank` runs the same reads against
 * the dev database.
 */
import { vi } from 'vitest';
import { planBank, type BankRows, type SynthSounds } from '@/lib/app/bank/seed';
import type { Bank } from '@/lib/app/bank/data';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

const stamps = { editedAt: null, createdAt: new Date(0), updatedAt: new Date(0) };
const byOrder = <T extends { order: number }>(rows: T[]) =>
  [...rows].sort((a, b) => a.order - b.order);
const bySynth = <T extends { synthId: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.synthId < b.synthId ? -1 : 1));
const byId = <T extends { id: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));

/** Every synth in the catalogue's seed data, with its sounds, as the databank seed checks against. */
export function catalogueSynthSounds(): SynthSounds {
  const data = loadCatalogueData();
  return new Map(
    data.listing.synths.map((s) => [
      s.id,
      new Set((data.sounds.find((f) => f.synth === s.id)?.sounds ?? []).map((x) => String(x.id))),
    ])
  );
}

export interface BankDbFake {
  bankMaker: { findMany: ReturnType<typeof vi.fn> };
  bankInstrument: { findMany: ReturnType<typeof vi.fn> };
  bankArtist: { findMany: ReturnType<typeof vi.fn> };
  bankSong: { findMany: ReturnType<typeof vi.fn> };
}

interface InstrumentWhere {
  synths?: { some: { synthId: string } };
}
interface SongWhere {
  parts?: {
    some: {
      OR: [
        { instruments: { some: { instrumentId: { in: string[] } } } },
        { synths: { some: { synthId: string; listed: boolean } } },
      ];
    };
  };
}

/** The four read models, filled from `bank` (the committed seed data by default). */
export function bankDb(bank: Bank = loadBankData()): BankDbFake & { rows: BankRows } {
  const rows = planBank(bank, catalogueSynthSounds());
  const joinsOf = <J>(owned: { ownerId: string; joins: J }[], id: string): J => {
    const found = owned.find((o) => o.ownerId === id);
    if (!found) throw new Error(`fixture: no joins for ${id}`);
    return found.joins;
  };
  const artistName = new Map(rows.artists.map((a) => [a.id, a.name]));

  const instrument = (r: BankRows['instruments'][number]) => {
    const j = joinsOf(rows.instrumentJoins, r.id);
    return {
      ...r,
      ...stamps,
      people: byOrder(j.people).map(({ makerId }) => ({ makerId })),
      synths: bySynth(j.synths).map(({ synthId }) => ({ synthId })),
    };
  };
  const artist = (r: BankRows['artists'][number]) => {
    const j = joinsOf(rows.artistJoins, r.id);
    const groups = rows.artistJoins
      .flatMap((o) => o.joins.members)
      .filter((m) => m.memberId === r.id)
      .sort((a, b) => (a.groupId < b.groupId ? -1 : 1));
    return {
      ...r,
      ...stamps,
      instruments: byOrder(j.instruments).map(({ instrumentId }) => ({ instrumentId })),
      members: byOrder(j.members).map(({ memberId }) => ({ memberId })),
      groups: groups.map(({ groupId }) => ({ groupId })),
    };
  };
  const song = (r: BankRows['songs'][number]) => {
    const j = joinsOf(rows.songJoins, r.id);
    return {
      ...r,
      ...stamps,
      artists: byOrder(j.artists).map(({ artistId }) => ({
        artistId,
        artist: { name: artistName.get(artistId) ?? artistId },
      })),
      parts: byOrder(j.parts).map((p) => ({
        ...p,
        instruments: byOrder(j.partInstruments.filter((i) => i.partId === p.id)).map(
          ({ instrumentId }) => ({ instrumentId })
        ),
        synths: bySynth(j.partSynths.filter((s) => s.partId === p.id)),
      })),
    };
  };

  return {
    rows,
    bankMaker: {
      findMany: vi.fn(async () => byId(rows.makers).map((m) => ({ ...m, ...stamps }))),
    },
    bankInstrument: {
      findMany: vi.fn(async (args?: { where?: InstrumentWhere }) => {
        const synthId = args?.where?.synths?.some.synthId;
        return byId(rows.instruments)
          .map(instrument)
          .filter((i) => synthId === undefined || i.synths.some((s) => s.synthId === synthId));
      }),
    },
    bankArtist: {
      findMany: vi.fn(async () => byId(rows.artists).map(artist)),
    },
    bankSong: {
      findMany: vi.fn(async (args?: { where?: SongWhere }) => {
        const or = args?.where?.parts?.some.OR;
        const all = byId(rows.songs).map(song);
        if (!or) return all;
        const covers = new Set(or[0].instruments.some.instrumentId.in);
        const { synthId, listed } = or[1].synths.some;
        return all.filter((s) =>
          s.parts.some(
            (p) =>
              p.instruments.some((i) => covers.has(i.instrumentId)) ||
              p.synths.some((x) => x.synthId === synthId && x.listed === listed)
          )
        );
      }),
    },
  };
}
