/**
 * Read the databank for the public API (`GET /api/v1/bank/[kind]`, `GET /api/v1/bank/[kind]/[id]`) and for a synth's
 * "Heard on" list, which the catalogue serves inside its lineage (`getSynthDetail`).
 *
 * The tables are the only source (D13). Rows are handed to the joins in the files' shapes (`lib/app/bank/data.ts`),
 * so `lib/app/bank/joins.ts` reads one form whatever it came from.
 *
 * "Heard on" is on every synth page, so it reads only the songs it lists. The databank pages read the whole bank once
 * per request and join in memory, as the prototype did: a few hundred rows, a handful of queries. When the compiled
 * list (b4) or the record count makes that slow, move the join that is slow into its own query, as here.
 */
import type { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import type { HeardEntry } from '@/lib/app/synths/contract';
import {
  BankArtistSchema,
  BankInstrumentSchema,
  BankSongSchema,
  type Bank,
  type BankArtist,
  type BankInstrument,
  type BankMaker,
  type BankSong,
} from '@/lib/app/bank/data';
import {
  artistsOn,
  byYear,
  creditOf,
  erasOf,
  groupsOf,
  heardFor,
  instrumentsBy,
  instrumentsOf,
  membersOf,
  songsBy,
  songsOn,
  yearOf,
} from '@/lib/app/bank/joins';

/** What the databank lists. */
export const BANK_KINDS = ['artists', 'makers', 'instruments', 'songs'] as const;
export type BankKind = (typeof BANK_KINDS)[number];

/** A link to an artist or maker. */
export interface PersonRef {
  id: string;
  name: string;
}

/** An instrument as a list shows it. */
export interface InstrumentRef {
  id: string;
  name: string;
  maker: string;
  year: string;
  kind: BankInstrument['kind'];
  recreationOf?: string;
}

/** A work, with its artists printed as the credit reads. */
export type SongView = BankSong & { who: string };

export interface ArtistListItem {
  id: string;
  name: string;
  kind: BankArtist['kind'];
  country: string;
  active: string;
  roles: string[];
  /** Their `eras`, or the decades of their records. */
  eras: string[];
  summary: string;
}

export interface MakerListItem {
  id: string;
  name: string;
  born?: string;
  died?: string;
  country: string;
  summary: string;
}

export type SongListItem = Pick<BankSong, 'id' | 'title' | 'kind' | 'year'> & { who: string };

export interface BankLists {
  artists: ArtistListItem[];
  makers: MakerListItem[];
  instruments: InstrumentRef[];
  songs: SongListItem[];
}

export interface ArtistDetail {
  artist: BankArtist;
  eras: string[];
  members: PersonRef[];
  groups: PersonRef[];
  /** Works they are credited on or play a part on, by year. */
  songs: SongView[];
  /** From their records, then their own list. */
  instruments: InstrumentRef[];
}

export interface MakerDetail {
  maker: BankMaker;
  /** What they had a hand in, by year. */
  instruments: InstrumentRef[];
}

export interface InstrumentDetail {
  instrument: BankInstrument;
  people: PersonRef[];
  /** App synths that model it. */
  synths: string[];
  recreationOf: InstrumentRef | null;
  recreations: InstrumentRef[];
  songs: SongView[];
  artists: PersonRef[];
}

export interface SongDetail {
  song: SongView;
  artists: PersonRef[];
  /** Players named on its parts. */
  players: PersonRef[];
  /** Every instrument its parts name. */
  instruments: InstrumentRef[];
}

export interface BankDetails {
  artists: ArtistDetail;
  makers: MakerDetail;
  instruments: InstrumentDetail;
  songs: SongDetail;
}

const songInclude = {
  artists: { orderBy: { order: 'asc' }, select: { artistId: true } },
  parts: {
    orderBy: { order: 'asc' },
    include: {
      instruments: { orderBy: { order: 'asc' }, select: { instrumentId: true } },
      synths: { orderBy: { synthId: 'asc' } },
    },
  },
} satisfies Prisma.BankSongInclude;

type SongRow = Prisma.BankSongGetPayload<{ include: typeof songInclude }>;

const instrumentInclude = {
  people: { orderBy: { order: 'asc' }, select: { makerId: true } },
  synths: { orderBy: { synthId: 'asc' }, select: { synthId: true } },
} satisfies Prisma.BankInstrumentInclude;

type InstrumentRow = Prisma.BankInstrumentGetPayload<{ include: typeof instrumentInclude }>;

const artistInclude = {
  instruments: { orderBy: { order: 'asc' }, select: { instrumentId: true } },
  members: { orderBy: { order: 'asc' }, select: { memberId: true } },
  groups: { orderBy: { groupId: 'asc' }, select: { groupId: true } },
} satisfies Prisma.BankArtistInclude;

type ArtistRow = Prisma.BankArtistGetPayload<{ include: typeof artistInclude }>;

/** Drop the keys a file leaves out rather than writing as null or empty. */
const present = <T extends object>(o: T): T =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)
    )
  ) as T;

const nonEmpty = (o: Record<string, string>): Record<string, string> | undefined =>
  Object.keys(o).length ? o : undefined;

/** A song row, its joins and parts, in the file's shape. */
export function songFromRow(row: SongRow): BankSong {
  return BankSongSchema.parse(
    present({
      id: row.id,
      title: row.title,
      kind: row.kind,
      year: row.year,
      album: row.album,
      artists: row.artists.map((a) => a.artistId),
      credit: row.credit,
      parts: row.parts.map((p) =>
        present({
          instruments: p.instruments.map((i) => i.instrumentId),
          on: p.on,
          player: p.playerId,
          synths: p.synths.filter((s) => s.listed).map((s) => s.synthId),
          sounds: nonEmpty(
            Object.fromEntries(p.synths.flatMap((s) => (s.sound ? [[s.synthId, s.sound]] : [])))
          ),
          text: p.text,
          notes: nonEmpty(
            Object.fromEntries(p.synths.flatMap((s) => (s.note ? [[s.synthId, s.note]] : [])))
          ),
        })
      ),
    })
  );
}

export function instrumentFromRow(row: InstrumentRow): BankInstrument {
  return BankInstrumentSchema.parse(
    present({
      id: row.id,
      name: row.name,
      maker: row.maker,
      year: row.year,
      kind: row.kind,
      people: row.people.map((p) => p.makerId),
      app: row.synths.map((s) => s.synthId),
      recreationOf: row.recreationOfId,
      text: row.text,
      source: row.source,
    })
  );
}

export function artistFromRow(row: ArtistRow): BankArtist {
  const {
    instruments,
    members,
    groups,
    editedAt: _e,
    createdAt: _c,
    updatedAt: _u,
    ...columns
  } = row;
  return BankArtistSchema.parse({
    ...columns,
    // Lists the file leaves out when empty; the column arrays above it always carries.
    ...present({
      members: members.map((m) => m.memberId),
      memberOf: groups.map((g) => g.groupId),
      instruments: instruments.map((i) => i.instrumentId),
    }),
  });
}

function makerFromRow(row: Prisma.BankMakerGetPayload<object>): BankMaker {
  const { editedAt: _e, createdAt: _c, updatedAt: _u, born, died, ...columns } = row;
  return { ...columns, ...(born ? { born } : {}), ...(died ? { died } : {}) };
}

/**
 * Rows in the files' shapes, leaving out any that no longer fit them. The seed's checks never see an admin's edit, so
 * one row an edit left malformed is logged and skipped rather than failing every synth page and databank request.
 */
function readable<R extends { id: string }, T>(
  rows: R[],
  fromRow: (row: R) => T,
  model: string
): T[] {
  return rows.flatMap((row) => {
    try {
      return [fromRow(row)];
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      logger.error('bank: stored row does not fit its shape, left out', error, {
        model,
        id: row.id,
      });
      return [];
    }
  });
}

/** A synth's "Heard on" list, and the databank artists its records credit, each with the page an "About" link opens. */
export interface HeardOn {
  heard: HeardEntry[];
  /** By name. */
  artists: PersonRef[];
}

/** One synth's "Heard on" list, read from the songs it lists. */
export async function getHeardOn(synthId: string): Promise<HeardOn> {
  const covering = await prisma.bankInstrument.findMany({
    where: { synths: { some: { synthId } } },
    include: instrumentInclude,
  });
  const covers = covering.map((i) => i.id);
  const songs = await prisma.bankSong.findMany({
    where: {
      parts: {
        some: {
          OR: [
            { instruments: { some: { instrumentId: { in: covers } } } },
            { synths: { some: { synthId, listed: true } } },
          ],
        },
      },
    },
    include: {
      ...songInclude,
      artists: {
        ...songInclude.artists,
        select: { artistId: true, artist: { select: { name: true } } },
      },
    },
  });
  const artists = new Map(
    songs.flatMap((s) => s.artists.map((a) => [a.artistId, a.artist.name] as const))
  );
  const people = [...artists]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    heard: heardFor(
      {
        instruments: readable(covering, instrumentFromRow, 'BankInstrument'),
        artists: people,
        songs: readable(songs, songFromRow, 'BankSong'),
      },
      synthId
    ),
    artists: people,
  };
}

/** The whole databank, in the files' shapes. */
export async function loadBank(): Promise<Bank> {
  const [makers, instruments, artists, songs] = await Promise.all([
    prisma.bankMaker.findMany({ orderBy: { id: 'asc' } }),
    prisma.bankInstrument.findMany({ orderBy: { id: 'asc' }, include: instrumentInclude }),
    prisma.bankArtist.findMany({ orderBy: { id: 'asc' }, include: artistInclude }),
    prisma.bankSong.findMany({ orderBy: { id: 'asc' }, include: songInclude }),
  ]);
  return {
    makers: makers.map(makerFromRow),
    instruments: readable(instruments, instrumentFromRow, 'BankInstrument'),
    artists: readable(artists, artistFromRow, 'BankArtist'),
    songs: readable(songs, songFromRow, 'BankSong'),
  };
}

const instrumentRef = ({
  id,
  name,
  maker,
  year,
  kind,
  recreationOf,
}: BankInstrument): InstrumentRef => ({
  id,
  name,
  maker,
  year,
  kind,
  ...(recreationOf ? { recreationOf } : {}),
});

const byInstrumentYear = (a: InstrumentRef, b: InstrumentRef) =>
  yearOf(a.year) - yearOf(b.year) || a.name.localeCompare(b.name);

const personRefs = (people: { id: string; name: string }[], ids: string[]): PersonRef[] => {
  const byId = new Map(people.map((p) => [p.id, p]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    return p ? [{ id: p.id, name: p.name }] : [];
  });
};

/** Every row of one kind, sorted as the prototype's lists were (`Bank.jsx`). */
export function listFrom<K extends BankKind>(bank: Bank, kind: K): BankLists[K] {
  const lists: { [Kind in BankKind]: () => BankLists[Kind] } = {
    artists: () =>
      [...bank.artists]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          country: a.country,
          active: a.active,
          roles: a.roles,
          eras: erasOf(bank, a),
          summary: a.summary,
        })),
    makers: () =>
      [...bank.makers]
        .sort((a, b) => yearOf(a.born) - yearOf(b.born) || a.name.localeCompare(b.name))
        .map(({ id, name, born, died, country, summary }) =>
          present({ id, name, born, died, country, summary })
        ),
    instruments: () => bank.instruments.map(instrumentRef).sort(byInstrumentYear),
    songs: () =>
      [...bank.songs]
        .sort(byYear)
        .map((s) =>
          present({ id: s.id, title: s.title, kind: s.kind, year: s.year, who: creditOf(bank, s) })
        ),
  };
  return lists[kind]();
}

/** One row with what the databank joins to it, or `null` when there is no such row. */
export function detailFrom<K extends BankKind>(
  bank: Bank,
  kind: K,
  id: string
): BankDetails[K] | null {
  const view = (s: BankSong): SongView => ({ ...s, who: creditOf(bank, s) });
  const details: { [Kind in BankKind]: () => BankDetails[Kind] | null } = {
    artists: () => {
      const artist = bank.artists.find((a) => a.id === id);
      if (!artist) return null;
      return {
        artist,
        eras: erasOf(bank, artist),
        members: personRefs(bank.artists, membersOf(bank, id)),
        groups: personRefs(bank.artists, groupsOf(bank, id)),
        songs: songsBy(bank, id).map(view),
        instruments: instrumentsOf(bank, id).map(instrumentRef),
      };
    },
    makers: () => {
      const maker = bank.makers.find((m) => m.id === id);
      if (!maker) return null;
      return { maker, instruments: instrumentsBy(bank, id).map(instrumentRef) };
    },
    instruments: () => {
      const instrument = bank.instruments.find((i) => i.id === id);
      if (!instrument) return null;
      const original = bank.instruments.find((i) => i.id === instrument.recreationOf);
      return {
        instrument,
        people: personRefs(bank.makers, instrument.people ?? []),
        synths: instrument.app ?? [],
        recreationOf: original ? instrumentRef(original) : null,
        recreations: bank.instruments
          .filter((i) => i.recreationOf === id)
          .map(instrumentRef)
          .sort(byInstrumentYear),
        songs: songsOn(bank, id).map(view),
        artists: artistsOn(bank, id)
          .map(({ id: artistId, name }) => ({ id: artistId, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
    songs: () => {
      const song = bank.songs.find((s) => s.id === id);
      if (!song) return null;
      const instruments = new Map(bank.instruments.map((i) => [i.id, i]));
      return {
        song: view(song),
        artists: personRefs(bank.artists, song.artists),
        players: personRefs(bank.artists, [
          ...new Set(song.parts.flatMap((p) => (p.player ? [p.player] : []))),
        ]),
        instruments: [...new Set(song.parts.flatMap((p) => p.instruments))].flatMap((i) => {
          const found = instruments.get(i);
          return found ? [instrumentRef(found)] : [];
        }),
      };
    },
  };
  return details[kind]();
}

/** Every row of one kind. */
export async function listBank<K extends BankKind>(kind: K): Promise<BankLists[K]> {
  return listFrom(await loadBank(), kind);
}

/** One row with its joins, or `null`. */
export async function getBankDetail<K extends BankKind>(
  kind: K,
  id: string
): Promise<BankDetails[K] | null> {
  return detailFrom(await loadBank(), kind, id);
}
