/**
 * Write the databank's seed data into its tables (plan §9, `fp4`).
 *
 * Called by the seed unit `prisma/seeds/app-knowyoursynth/002-bank.ts`, which reads the data files and passes them
 * in, after the catalogue's unit has written the synths and sounds the databank points at. The catalogue seed's rules
 * (`lib/app/catalogue/seed.ts`), each tested:
 *
 * - **Checked before anything is written.** Every reference must resolve: the prototype's `checkBank`, ported. One
 *   problem anywhere and the seed throws with the whole list, having written nothing.
 * - **Idempotent.** A row whose columns match is not written, and nor are joins that match, so a re-run touches
 *   nothing and `updatedAt` stays put.
 * - **Operator-owned once edited.** A maker, instrument, artist or song with `editedAt` set is the admin's, and the
 *   seed never writes it or its joins again.
 * - **Never deletes a row.** A row the data no longer has stays, so an empty or partial source cannot empty a table.
 *
 * A join belongs to the row that lists it: an instrument's people and synths, an artist's other instruments, a
 * group's members, a song's artists and parts. While that row is the seed's, the seed brings its joins in line by
 * replacing them, in one transaction per row. A part is matched on its song and position, and its id is made from
 * both (`partId`), so the seed can write a song's parts and their joins as flat rows.
 */
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { sameValue } from '@/lib/app/catalogue/seed';
import { membersOf } from '@/lib/app/bank/joins';
import type { Bank } from '@/lib/app/bank/data';

/** The data's references do not resolve. Nothing was written. */
export class BankDataError extends Error {
  constructor(readonly problems: string[]) {
    super(`The databank seed data has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.name = 'BankDataError';
  }
}

/** What one run did to a table's rows. */
export interface BankSeedCounts {
  created: number;
  updated: number;
  unchanged: number;
  /** Rows an admin has edited, left alone with their joins. */
  edited: number;
}

/** What one run did, per table, and how many rows had their joins rewritten. */
export type BankSeedReport = Record<
  'makers' | 'instruments' | 'artists' | 'songs',
  BankSeedCounts
> & {
  /** Rows whose joins differed from the data and were replaced. */
  joinsRewritten: number;
};

/** Every app synth the databank may name, with the slugs of its library sounds. */
export type SynthSounds = Map<string, Set<string>>;

interface MakerRow {
  id: string;
  name: string;
  born: string | null;
  died: string | null;
  country: string;
  companies: string[];
  summary: string;
  story: string;
  innovations: string[];
}

interface InstrumentRow {
  id: string;
  name: string;
  maker: string;
  year: string;
  kind: string;
  text: string;
  recreationOfId: string | null;
}

interface ArtistRow {
  id: string;
  name: string;
  kind: string;
  country: string;
  active: string;
  eras: string[];
  genres: string[];
  roles: string[];
  summary: string;
  story: string;
  innovations: string[];
}

interface SongRow {
  id: string;
  title: string;
  kind: string;
  year: string | null;
  album: string | null;
  credit: string | null;
}

interface PartRow {
  id: string;
  songId: string;
  order: number;
  on: string;
  text: string;
  playerId: string | null;
}

interface PartInstrumentRow {
  partId: string;
  instrumentId: string;
  order: number;
}

interface PartSynthRow {
  partId: string;
  synthId: string;
  listed: boolean;
  sound: string | null;
  note: string | null;
}

/** The joins one row owns, as the flat rows that hold them. */
interface Owned<J> {
  ownerId: string;
  joins: J;
}

/** The rows the data describes. */
export interface BankRows {
  makers: MakerRow[];
  /** In write order: an original before any instrument that recreates it. */
  instruments: InstrumentRow[];
  artists: ArtistRow[];
  songs: SongRow[];
  instrumentJoins: Owned<{
    people: { instrumentId: string; makerId: string; order: number }[];
    synths: { instrumentId: string; synthId: string }[];
  }>[];
  artistJoins: Owned<{
    instruments: { artistId: string; instrumentId: string; order: number }[];
    members: { groupId: string; memberId: string; order: number }[];
  }>[];
  songJoins: Owned<{
    artists: { songId: string; artistId: string; order: number }[];
    parts: PartRow[];
    partInstruments: PartInstrumentRow[];
    partSynths: PartSynthRow[];
  }>[];
}

/** A part's id: its song and its position, so the seed can match and write it without reading ids back. */
export const partId = (songId: string, order: number): string => `${songId}#${order}`;

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

/**
 * Turn the data into rows, checking every reference: the prototype's `checkBank`, plus the recreation link this
 * port adds. `synths` is every app synth the data may name, with its sounds' slugs. Pure. Throws
 * {@link BankDataError} listing every problem.
 */
export function planBank(bank: Bank, synths: SynthSounds): BankRows {
  const errs: string[] = [];
  const makers = new Set(bank.makers.map((m) => m.id));
  const instruments = new Set(bank.instruments.map((i) => i.id));
  const artists = new Set(bank.artists.map((a) => a.id));

  // Artists and makers share one namespace, as they did in the prototype: both are people a page is about.
  const seen = new Set<string>();
  for (const [kind, rows] of [
    ['artist', bank.artists],
    ['maker', bank.makers],
    ['instrument', bank.instruments],
    ['song', bank.songs],
  ] as const) {
    for (const r of rows) {
      const key = `${kind === 'artist' || kind === 'maker' ? 'person' : kind}:${r.id}`;
      if (seen.has(key)) errs.push(`duplicate ${kind} id ${r.id}`);
      seen.add(key);
    }
  }

  for (const i of bank.instruments) {
    for (const p of i.people || [])
      if (!makers.has(p)) errs.push(`instrument ${i.id}: unknown maker ${p}`);
    for (const a of i.app || [])
      if (!synths.has(a)) errs.push(`instrument ${i.id}: unknown app synth ${a}`);
    if (i.recreationOf && !instruments.has(i.recreationOf))
      errs.push(`instrument ${i.id}: recreates unknown instrument ${i.recreationOf}`);
  }
  // A recreation chain must end at an original, or no write order puts every target first.
  const recreates = new Map(bank.instruments.map((i) => [i.id, i.recreationOf]));
  for (const i of bank.instruments) {
    const chain = new Set([i.id]);
    for (let at = recreates.get(i.id); at; at = recreates.get(at)) {
      if (chain.has(at)) {
        errs.push(`instrument ${i.id}: its recreation links go round in a circle`);
        break;
      }
      chain.add(at);
    }
  }

  for (const a of bank.artists) {
    for (const k of ['members', 'memberOf'] as const)
      for (const m of a[k] || [])
        if (!artists.has(m)) errs.push(`artist ${a.id}: unknown ${k} ${m}`);
    for (const i of a.instruments || [])
      if (!instruments.has(i)) errs.push(`artist ${a.id}: unknown instrument ${i}`);
  }

  for (const s of bank.songs) {
    for (const a of s.artists) if (!artists.has(a)) errs.push(`song ${s.id}: unknown artist ${a}`);
    for (const p of s.parts) {
      for (const i of p.instruments)
        if (!instruments.has(i)) errs.push(`song ${s.id}: unknown instrument ${i}`);
      if (p.player && !artists.has(p.player)) errs.push(`song ${s.id}: unknown player ${p.player}`);
      for (const x of p.synths || [])
        if (!synths.has(x)) errs.push(`song ${s.id}: unknown synth ${x}`);
      for (const [x, id] of Object.entries(p.sounds || {})) {
        const ids = synths.get(x);
        if (!ids) errs.push(`song ${s.id}: sound for unknown synth ${x}`);
        else if (!ids.has(id)) errs.push(`song ${s.id}: ${x} has no sound ${id}`);
      }
      for (const x of Object.keys(p.notes || {}))
        if (!synths.has(x)) errs.push(`song ${s.id}: note for unknown synth ${x}`);
    }
  }

  if (errs.length) throw new BankDataError(errs);

  // An original before anything that recreates it, so each row's target exists when it is written.
  const depth = (id: string): number => {
    let n = 0;
    for (let at = recreates.get(id); at; at = recreates.get(at)) n++;
    return n;
  };
  const ordered = [...bank.instruments].sort((a, b) => depth(a.id) - depth(b.id));

  return {
    makers: bank.makers.map((m) => ({
      id: m.id,
      name: m.name,
      born: orNull(m.born),
      died: orNull(m.died),
      country: m.country,
      companies: m.companies,
      summary: m.summary,
      story: m.story,
      innovations: m.innovations,
    })),
    instruments: ordered.map((i) => ({
      id: i.id,
      name: i.name,
      maker: i.maker,
      year: i.year,
      kind: i.kind,
      text: i.text,
      recreationOfId: orNull(i.recreationOf),
    })),
    artists: bank.artists.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      country: a.country,
      active: a.active,
      eras: a.eras,
      genres: a.genres,
      roles: a.roles,
      summary: a.summary,
      story: a.story,
      innovations: a.innovations,
    })),
    songs: bank.songs.map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      year: orNull(s.year),
      album: orNull(s.album),
      credit: orNull(s.credit),
    })),
    instrumentJoins: ordered.map((i) => ({
      ownerId: i.id,
      joins: {
        people: (i.people || []).map((makerId, order) => ({ instrumentId: i.id, makerId, order })),
        synths: (i.app || []).map((synthId) => ({ instrumentId: i.id, synthId })),
      },
    })),
    artistJoins: bank.artists.map((a) => ({
      ownerId: a.id,
      joins: {
        instruments: (a.instruments || []).map((instrumentId, order) => ({
          artistId: a.id,
          instrumentId,
          order,
        })),
        members: membersOf(bank, a.id).map((memberId, order) => ({
          groupId: a.id,
          memberId,
          order,
        })),
      },
    })),
    songJoins: bank.songs.map((s) => {
      const parts = s.parts.map((p, order) => ({
        id: partId(s.id, order),
        songId: s.id,
        order,
        on: p.on,
        text: p.text,
        playerId: orNull(p.player),
      }));
      return {
        ownerId: s.id,
        joins: {
          artists: s.artists.map((artistId, order) => ({ songId: s.id, artistId, order })),
          parts,
          partInstruments: s.parts.flatMap((p, order) =>
            p.instruments.map((instrumentId, i) => ({
              partId: partId(s.id, order),
              instrumentId,
              order: i,
            }))
          ),
          partSynths: s.parts.flatMap((p, order) => {
            // One row per synth the part says anything about: listed under it, a sound for it, a note for it.
            const ids = [
              ...new Set([
                ...(p.synths || []),
                ...Object.keys(p.sounds || {}),
                ...Object.keys(p.notes || {}),
              ]),
            ];
            return ids.map((synthId) => ({
              partId: partId(s.id, order),
              synthId,
              listed: Boolean(p.synths?.includes(synthId)),
              sound: orNull(p.sounds?.[synthId]),
              note: orNull(p.notes?.[synthId]),
            }));
          }),
        },
      };
    }),
  };
}

/** Group a join table's rows by their owner, for comparing with what the data plans. */
const groupBy = <T>(rows: T[], ownerOf: (row: T) => string): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const owner = ownerOf(r);
    const list = out.get(owner);
    if (list) list.push(r);
    else out.set(owner, [r]);
  }
  return out;
};

/** Join rows compared as a set: the order column, not the read order, is what places them. */
const sameRows = (a: object[], b: object[]): boolean => {
  const key = (r: object) => JSON.stringify(Object.entries(r).sort(([x], [y]) => (x < y ? -1 : 1)));
  return sameValue(a.map(key).sort(), b.map(key).sort());
};

/** The stored rows cut to the columns the data plans, so a column the plan does not write cannot make them differ. */
const pickAll = (stored: object[], planned: object[]): object[] => {
  if (!planned.length) return stored;
  const columns = Object.keys(planned[0]);
  return stored.map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => columns.includes(k)))
  );
};

/**
 * Bring each planned row in: create it when missing, update it when it differs and no admin has edited it, and
 * otherwise leave it. Returns what it did and which rows are the admin's.
 */
async function reconcile<Row extends { id: string }>(
  planned: Row[],
  stored: (Row & { editedAt: Date | null })[],
  create: (row: Row) => Promise<unknown>,
  update: (row: Row) => Promise<unknown>
): Promise<{ counts: BankSeedCounts; edited: Set<string> }> {
  const counts: BankSeedCounts = { created: 0, updated: 0, unchanged: 0, edited: 0 };
  const edited = new Set<string>();
  const byId = new Map(stored.map((r) => [r.id, r]));
  for (const row of planned) {
    const current = byId.get(row.id);
    if (!current) {
      await create(row);
      counts.created++;
    } else if (current.editedAt) {
      edited.add(row.id);
      counts.edited++;
    } else if (
      Object.entries(row).every(([k, v]) => sameValue((current as Record<string, unknown>)[k], v))
    ) {
      counts.unchanged++;
    } else {
      await update(row);
      counts.updated++;
    }
  }
  return { counts, edited };
}

/** Check the data, then write it. Throws {@link BankDataError}, having written nothing, when the data is wrong. */
export async function seedBank(prisma: TenancyClient, bank: Bank): Promise<BankSeedReport> {
  const synthRows = await prisma.synth.findMany({
    select: { id: true, sounds: { select: { slug: true } } },
  });
  const rows = planBank(
    bank,
    new Map(synthRows.map((s) => [s.id, new Set(s.sounds.map((x) => x.slug))]))
  );
  let joinsRewritten = 0;

  const makers = await reconcile(
    rows.makers,
    await prisma.bankMaker.findMany({ where: { id: { in: rows.makers.map((r) => r.id) } } }),
    (data) => prisma.bankMaker.create({ data }),
    ({ id, ...data }) => prisma.bankMaker.update({ where: { id }, data })
  );
  const instruments = await reconcile(
    rows.instruments,
    await prisma.bankInstrument.findMany({
      where: { id: { in: rows.instruments.map((r) => r.id) } },
    }),
    (data) => prisma.bankInstrument.create({ data }),
    ({ id, ...data }) => prisma.bankInstrument.update({ where: { id }, data })
  );
  const artists = await reconcile(
    rows.artists,
    await prisma.bankArtist.findMany({ where: { id: { in: rows.artists.map((r) => r.id) } } }),
    (data) => prisma.bankArtist.create({ data }),
    ({ id, ...data }) => prisma.bankArtist.update({ where: { id }, data })
  );
  const songs = await reconcile(
    rows.songs,
    await prisma.bankSong.findMany({ where: { id: { in: rows.songs.map((r) => r.id) } } }),
    (data) => prisma.bankSong.create({ data }),
    ({ id, ...data }) => prisma.bankSong.update({ where: { id }, data })
  );

  // Joins after every row, since they point across tables. An admin's row keeps the joins it has.
  {
    const ids = rows.instrumentJoins.map((o) => o.ownerId);
    const people = groupBy(
      await prisma.bankInstrumentPerson.findMany({ where: { instrumentId: { in: ids } } }),
      (r) => r.instrumentId
    );
    const synths = groupBy(
      await prisma.bankInstrumentSynth.findMany({ where: { instrumentId: { in: ids } } }),
      (r) => r.instrumentId
    );
    for (const { ownerId, joins } of rows.instrumentJoins) {
      if (instruments.edited.has(ownerId)) continue;
      const storedPeople = people.get(ownerId) ?? [];
      const storedSynths = synths.get(ownerId) ?? [];
      if (
        sameRows(pickAll(storedPeople, joins.people), joins.people) &&
        sameRows(pickAll(storedSynths, joins.synths), joins.synths)
      )
        continue;
      await prisma.$transaction([
        prisma.bankInstrumentPerson.deleteMany({ where: { instrumentId: ownerId } }),
        prisma.bankInstrumentSynth.deleteMany({ where: { instrumentId: ownerId } }),
        prisma.bankInstrumentPerson.createMany({ data: joins.people }),
        prisma.bankInstrumentSynth.createMany({ data: joins.synths }),
      ]);
      joinsRewritten++;
    }
  }

  {
    const ids = rows.artistJoins.map((o) => o.ownerId);
    const owned = groupBy(
      await prisma.bankArtistInstrument.findMany({ where: { artistId: { in: ids } } }),
      (r) => r.artistId
    );
    const members = groupBy(
      await prisma.bankArtistMember.findMany({ where: { groupId: { in: ids } } }),
      (r) => r.groupId
    );
    for (const { ownerId, joins } of rows.artistJoins) {
      if (artists.edited.has(ownerId)) continue;
      const storedOwned = owned.get(ownerId) ?? [];
      const storedMembers = members.get(ownerId) ?? [];
      if (
        sameRows(pickAll(storedOwned, joins.instruments), joins.instruments) &&
        sameRows(pickAll(storedMembers, joins.members), joins.members)
      )
        continue;
      await prisma.$transaction([
        prisma.bankArtistInstrument.deleteMany({ where: { artistId: ownerId } }),
        prisma.bankArtistMember.deleteMany({ where: { groupId: ownerId } }),
        prisma.bankArtistInstrument.createMany({ data: joins.instruments }),
        prisma.bankArtistMember.createMany({ data: joins.members }),
      ]);
      joinsRewritten++;
    }
  }

  {
    const ids = rows.songJoins.map((o) => o.ownerId);
    const credited = groupBy(
      await prisma.bankSongArtist.findMany({ where: { songId: { in: ids } } }),
      (r) => r.songId
    );
    const parts = groupBy(
      await prisma.bankSongPart.findMany({ where: { songId: { in: ids } } }),
      (r) => r.songId
    );
    const partIds = [...parts.values()].flat().map((p) => p.id);
    const songOfPart = new Map([...parts.values()].flat().map((p) => [p.id, p.songId]));
    const partInstruments = groupBy(
      await prisma.bankPartInstrument.findMany({ where: { partId: { in: partIds } } }),
      (r) => songOfPart.get(r.partId) ?? ''
    );
    const partSynths = groupBy(
      await prisma.bankPartSynth.findMany({ where: { partId: { in: partIds } } }),
      (r) => songOfPart.get(r.partId) ?? ''
    );
    for (const { ownerId, joins } of rows.songJoins) {
      if (songs.edited.has(ownerId)) continue;
      const stored = {
        artists: credited.get(ownerId) ?? [],
        parts: parts.get(ownerId) ?? [],
        partInstruments: partInstruments.get(ownerId) ?? [],
        partSynths: partSynths.get(ownerId) ?? [],
      };
      if (
        sameRows(pickAll(stored.artists, joins.artists), joins.artists) &&
        sameRows(pickAll(stored.parts, joins.parts), joins.parts) &&
        sameRows(pickAll(stored.partInstruments, joins.partInstruments), joins.partInstruments) &&
        sameRows(pickAll(stored.partSynths, joins.partSynths), joins.partSynths)
      )
        continue;
      const storedPartIds = stored.parts.map((p) => p.id);
      await prisma.$transaction([
        prisma.bankPartInstrument.deleteMany({ where: { partId: { in: storedPartIds } } }),
        prisma.bankPartSynth.deleteMany({ where: { partId: { in: storedPartIds } } }),
        prisma.bankSongPart.deleteMany({ where: { songId: ownerId } }),
        prisma.bankSongArtist.deleteMany({ where: { songId: ownerId } }),
        prisma.bankSongArtist.createMany({ data: joins.artists }),
        prisma.bankSongPart.createMany({ data: joins.parts }),
        prisma.bankPartInstrument.createMany({ data: joins.partInstruments }),
        prisma.bankPartSynth.createMany({ data: joins.partSynths }),
      ]);
      joinsRewritten++;
    }
  }

  return {
    makers: makers.counts,
    instruments: instruments.counts,
    artists: artists.counts,
    songs: songs.counts,
    joinsRewritten,
  };
}
