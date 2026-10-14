/**
 * Admin edits to the databank (D2, `f-databank` t-36): create, edit and remove makers, instruments, artists and songs,
 * a song with its parts.
 *
 * The rules, each tested:
 *
 * - **A row is edited whole**, in the files' shapes (`lib/app/bank/data.ts`), so the admin reads and writes what the
 *   public API serves. A row's joins go with it: an instrument's people and synths, an artist's instruments and (for a
 *   group) members, a song's artists and parts. An artist's groups are the groups' to list, so they are shown, not set.
 * - **Checked as the seed checks.** The change is put into the databank as it stands and `checkBank` run over it. Any
 *   problem the change would add refuses it, naming each one, and nothing is written. A problem already there is not
 *   the change's, so it does not block it.
 * - **A removal names what still points at the row** (the problems taking it out would add) and is refused until
 *   they are gone. Nothing cascades but the row's own joins.
 * - **An edit is the admin's.** Every save sets `editedAt`, and the seed never writes that row or its joins again. A
 *   removal is recorded in `BankRemoval`, so the seed does not re-create the row; saving the id again clears it.
 * - **A save that changes nothing writes nothing**, so it does not take a row from the seed.
 *
 * The check reads the whole databank, as the public pages do. A change made between the check and the write is caught
 * by the tables' foreign keys and reported as a conflict.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  BankArtistSchema,
  BankInstrumentSchema,
  BankMakerSchema,
  BankSongSchema,
  type Bank,
  type BankArtist,
  type BankInstrument,
  type BankMaker,
  type BankSong,
} from '@/lib/app/bank/data';
import { BANK_KINDS, loadBank, type BankKind } from '@/lib/app/bank/read';
import { checkBank, rowsOf, type SynthSounds } from '@/lib/app/bank/seed';
import { sameValue } from '@/lib/app/catalogue/seed';

type Tx = Prisma.TransactionClient;

export const BankKindSchema = z.enum(BANK_KINDS);

/** A row as an admin writes it, in the files' shapes. An artist's `memberOf` is left out: membership is the group's row. */
export type BankRow = BankMaker | BankInstrument | Omit<BankArtist, 'memberOf'> | BankSong;

/** A row without its id: the body of an edit, whose id is the URL's. */
export type BankFields =
  | Omit<BankMaker, 'id'>
  | Omit<BankInstrument, 'id'>
  | Omit<BankArtist, 'id' | 'memberOf'>
  | Omit<BankSong, 'id'>;

const CREATE_SCHEMAS: Record<BankKind, z.ZodType<BankRow>> = {
  makers: BankMakerSchema,
  instruments: BankInstrumentSchema,
  artists: BankArtistSchema.omit({ memberOf: true }),
  songs: BankSongSchema,
};

const UPDATE_SCHEMAS: Record<BankKind, z.ZodType<BankFields>> = {
  makers: BankMakerSchema.omit({ id: true }),
  instruments: BankInstrumentSchema.omit({ id: true }),
  artists: BankArtistSchema.omit({ id: true, memberOf: true }),
  songs: BankSongSchema.omit({ id: true }),
};

/** The body of a create: the row with its id. */
export const bankCreateSchema = (kind: BankKind): z.ZodType<BankRow> => CREATE_SCHEMAS[kind];

/** The body of an edit: the row without its id, which is in the URL and cannot change. */
export const bankUpdateSchema = (kind: BankKind): z.ZodType<BankFields> => UPDATE_SCHEMAS[kind];

/** One row as the admin list shows it. */
export interface AdminBankRow {
  id: string;
  name: string;
  /** A line under the name: a maker's country, an instrument's company and year, a work's kind and year. */
  detail: string;
  /** When an admin last saved it, `null` while it is the seed's. */
  editedAt: string | null;
}

/** One row for the edit form. */
export interface AdminBankDetail {
  kind: BankKind;
  row: BankRow;
  editedAt: string | null;
  /** An artist's groups: shown, not edited here (each group lists its members). */
  memberOf?: string[];
}

const joinLine = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Every row of one kind, by name. */
export async function listAdminBank(kind: BankKind): Promise<AdminBankRow[]> {
  const rows: AdminBankRow[] = await {
    makers: async () =>
      (
        await prisma.bankMaker.findMany({
          select: { id: true, name: true, country: true, editedAt: true },
        })
      ).map((r) => ({ id: r.id, name: r.name, detail: r.country, editedAt: iso(r.editedAt) })),
    instruments: async () =>
      (
        await prisma.bankInstrument.findMany({
          select: { id: true, name: true, maker: true, year: true, editedAt: true },
        })
      ).map((r) => ({
        id: r.id,
        name: r.name,
        detail: joinLine(r.maker, r.year),
        editedAt: iso(r.editedAt),
      })),
    artists: async () =>
      (
        await prisma.bankArtist.findMany({
          select: { id: true, name: true, kind: true, editedAt: true },
        })
      ).map((r) => ({ id: r.id, name: r.name, detail: r.kind, editedAt: iso(r.editedAt) })),
    songs: async () =>
      (
        await prisma.bankSong.findMany({
          select: { id: true, title: true, kind: true, year: true, editedAt: true },
        })
      ).map((r) => ({
        id: r.id,
        name: r.title,
        detail: joinLine(r.kind, r.year),
        editedAt: iso(r.editedAt),
      })),
  }[kind]();
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** When the stored row was last edited, or `undefined` when there is no such row. */
async function storedEditedAt(db: Tx | typeof prisma, kind: BankKind, id: string) {
  const where = { where: { id }, select: { editedAt: true } };
  const row = await {
    makers: () => db.bankMaker.findUnique(where),
    instruments: () => db.bankInstrument.findUnique(where),
    artists: () => db.bankArtist.findUnique(where),
    songs: () => db.bankSong.findUnique(where),
  }[kind]();
  return row ? row.editedAt : undefined;
}

/**
 * The databank as the check reads it. Membership is held once, as the group's rows, which the loaded groups carry as
 * `members`; the members' `memberOf` is the same rows seen from the other side, so it is dropped. Otherwise taking a
 * member off a group would leave it listed through the member.
 */
async function currentBank(): Promise<Bank> {
  const bank = await loadBank();
  return { ...bank, artists: bank.artists.map(({ memberOf: _m, ...a }) => a) };
}

/** Every app synth with its sounds' slugs, as the seed checks against. */
async function synthSounds(): Promise<SynthSounds> {
  const synths = await prisma.synth.findMany({
    select: { id: true, sounds: { select: { slug: true } } },
  });
  return new Map(synths.map((s) => [s.id, new Set(s.sounds.map((x) => x.slug))]));
}

/** The problems `next` has that `bank` did not. */
function added(bank: Bank, next: Bank, synths: SynthSounds): string[] {
  const before = new Set(checkBank(bank, synths));
  return checkBank(next, synths).filter((p) => !before.has(p));
}

const rowsIn = (bank: Bank, kind: BankKind): BankRow[] => bank[kind];

const findIn = (bank: Bank, kind: BankKind, id: string): BankRow | undefined =>
  rowsIn(bank, kind).find((r) => r.id === id);

/** `bank` with the row of `kind` and `id` replaced by `row`, or taken out. */
const withRow = (bank: Bank, kind: BankKind, id: string, row: BankRow | null): Bank => {
  const others = rowsIn(bank, kind).filter((r) => r.id !== id);
  return { ...bank, [kind]: row ? [...others, row] : others };
};

/** The rows and joins one row writes, worked out as the seed works them out. */
const planOne = (kind: BankKind, row: BankRow) =>
  rowsOf({ makers: [], instruments: [], artists: [], songs: [], [kind]: [row] });

/**
 * A key failing at write time: something the row points at went between the check and the write (P2003), the id was
 * taken (P2002), or the row being updated was removed (P2025).
 */
function conflictOnRace(err: unknown): never {
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err.code === 'P2003' || err.code === 'P2002' || err.code === 'P2025')
  )
    throw new ConflictError(
      'The databank changed while this was being saved. Reload the page and try again.'
    );
  throw err;
}

/**
 * An id the row lists twice, where its join can hold it once (each join's key is its owner and the id). Refused with
 * the reference problems, rather than reaching the write as a key clash.
 */
function repeated(plan: ReturnType<typeof rowsOf>): string[] {
  const twice = (owner: string, what: string, ids: string[]) =>
    ids
      .filter((x, i) => ids.indexOf(x) !== i)
      .filter((x, i, all) => all.indexOf(x) === i)
      .map((x) => `${owner}: ${what} ${x} is listed twice`);
  return [
    ...plan.instrumentJoins.flatMap(({ ownerId, joins }) => [
      ...twice(
        `instrument ${ownerId}`,
        'maker',
        joins.people.map((p) => p.makerId)
      ),
      ...twice(
        `instrument ${ownerId}`,
        'app synth',
        joins.synths.map((x) => x.synthId)
      ),
    ]),
    ...plan.artistJoins.flatMap(({ ownerId, joins }) => [
      ...twice(
        `artist ${ownerId}`,
        'instrument',
        joins.instruments.map((i) => i.instrumentId)
      ),
      ...twice(
        `artist ${ownerId}`,
        'member',
        joins.members.map((m) => m.memberId)
      ),
    ]),
    ...plan.songJoins.flatMap(({ ownerId, joins }) => [
      ...twice(
        `song ${ownerId}`,
        'artist',
        joins.artists.map((a) => a.artistId)
      ),
      ...joins.parts.flatMap((p) =>
        twice(
          `song ${ownerId} part ${p.order + 1}`,
          'instrument',
          joins.partInstruments.filter((i) => i.partId === p.id).map((i) => i.instrumentId)
        )
      ),
    ]),
  ];
}

/** One row for the edit form, or `null`. */
export async function getAdminBankRow(kind: BankKind, id: string): Promise<AdminBankDetail | null> {
  const [bank, editedAt] = await Promise.all([loadBank(), storedEditedAt(prisma, kind, id)]);
  const row = findIn(bank, kind, id);
  if (!row || editedAt === undefined) return null;
  const artist = kind === 'artists' ? bank.artists.find((a) => a.id === id) : undefined;
  if (artist) {
    const { memberOf, ...rest } = artist;
    return { kind, row: rest, editedAt: iso(editedAt), memberOf: memberOf ?? [] };
  }
  return { kind, row, editedAt: iso(editedAt) };
}

/** A save the reference check refused, in the shape `validateRequestBody` refuses. */
function refuse(message: string, problems: string[]): never {
  throw new ValidationError(message, {
    errors: problems.map((p) => ({ path: '', message: p })),
  });
}

export interface BankSaveResult {
  before: BankRow | null;
  after: BankRow;
  /** False when the save changed nothing, so nothing was written. */
  changed: boolean;
}

/**
 * Create a row (`create`) or replace one (`update`), checked against the rest of the databank. Throws
 * {@link ValidationError} naming every reference it would break, {@link ConflictError} on a create whose id is taken,
 * {@link NotFoundError} on an update of a missing row.
 */
export async function saveBankRow(
  kind: BankKind,
  id: string,
  input: BankFields,
  mode: 'create' | 'update'
): Promise<BankSaveResult> {
  // `/admin/synths/bank/<kind>/new` is the form for a new row, so no row can be reached at that id.
  if (mode === 'create' && id === 'new')
    refuse('The id new is kept for the admin pages', ['choose another id']);
  const exists = (await storedEditedAt(prisma, kind, id)) !== undefined;
  if (mode === 'create' && exists)
    throw new ConflictError(`There is already a ${kind.slice(0, -1)} with the id ${id}`);
  if (mode === 'update' && !exists) throw new NotFoundError('Databank row not found');

  const [bank, synths] = await Promise.all([currentBank(), synthSounds()]);
  // Validated as the kind's shape by the route; the id is the URL's.
  const row: BankRow = { ...input, id };
  const stored = findIn(bank, kind, id) ?? null;
  const problems = [
    ...repeated(planOne(kind, row)),
    ...added(bank, withRow(bank, kind, id, row), synths),
  ];
  if (problems.length)
    refuse(
      `The ${kind.slice(0, -1)} would break ${problems.length === 1 ? 'a reference' : `${problems.length} references`} in the databank`,
      problems
    );

  const plan = planOne(kind, row);
  if (stored && sameValue(planOne(kind, stored), plan))
    return { before: stored, after: row, changed: false };

  const editedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await writePlanned(tx, kind, id, plan, editedAt, mode);
      await tx.bankRemoval.deleteMany({ where: { kind, id } });
    });
  } catch (err) {
    conflictOnRace(err);
  }
  return { before: stored, after: row, changed: true };
}

/** Write one planned row and replace its joins. */
async function writePlanned(
  tx: Tx,
  kind: BankKind,
  id: string,
  plan: ReturnType<typeof rowsOf>,
  editedAt: Date,
  mode: 'create' | 'update'
): Promise<void> {
  // An update never creates: a row removed since the existence check fails (P2025) rather than coming back.
  const fields = <R extends { id: string }>(rows: R[]) => {
    const [{ id: _id, ...data }] = rows;
    return { row: { ...rows[0], editedAt }, data: { ...data, editedAt } };
  };
  switch (kind) {
    case 'makers': {
      const { row, data } = fields(plan.makers);
      await (mode === 'create'
        ? tx.bankMaker.create({ data: row })
        : tx.bankMaker.update({ where: { id }, data }));
      return;
    }
    case 'instruments': {
      const { people, synths } = plan.instrumentJoins[0].joins;
      const { row, data } = fields(plan.instruments);
      await (mode === 'create'
        ? tx.bankInstrument.create({ data: row })
        : tx.bankInstrument.update({ where: { id }, data }));
      await tx.bankInstrumentPerson.deleteMany({ where: { instrumentId: id } });
      await tx.bankInstrumentSynth.deleteMany({ where: { instrumentId: id } });
      await tx.bankInstrumentPerson.createMany({ data: people });
      await tx.bankInstrumentSynth.createMany({ data: synths });
      return;
    }
    case 'artists': {
      const { instruments, members } = plan.artistJoins[0].joins;
      const { row, data } = fields(plan.artists);
      await (mode === 'create'
        ? tx.bankArtist.create({ data: row })
        : tx.bankArtist.update({ where: { id }, data }));
      await tx.bankArtistInstrument.deleteMany({ where: { artistId: id } });
      await tx.bankArtistMember.deleteMany({ where: { groupId: id } });
      await tx.bankArtistInstrument.createMany({ data: instruments });
      await tx.bankArtistMember.createMany({ data: members });
      return;
    }
    case 'songs': {
      const { artists, parts, partInstruments, partSynths } = plan.songJoins[0].joins;
      const { row, data } = fields(plan.songs);
      await (mode === 'create'
        ? tx.bankSong.create({ data: row })
        : tx.bankSong.update({ where: { id }, data }));
      // A part's instruments and synths go with it (cascade).
      await tx.bankSongPart.deleteMany({ where: { songId: id } });
      await tx.bankSongArtist.deleteMany({ where: { songId: id } });
      await tx.bankSongArtist.createMany({ data: artists });
      await tx.bankSongPart.createMany({ data: parts });
      await tx.bankPartInstrument.createMany({ data: partInstruments });
      await tx.bankPartSynth.createMany({ data: partSynths });
      return;
    }
  }
}

/**
 * Remove a row and its own joins, and record the removal so the seed leaves it out. Refused with
 * {@link ConflictError}, naming each one, while anything else in the databank points at it.
 */
export async function removeBankRow(
  kind: BankKind,
  id: string
): Promise<{ before: BankRow | null }> {
  if ((await storedEditedAt(prisma, kind, id)) === undefined)
    throw new NotFoundError('Databank row not found');

  const [bank, synths] = await Promise.all([currentBank(), synthSounds()]);
  const problems = added(bank, withRow(bank, kind, id, null), synths);
  if (problems.length)
    throw new ConflictError(
      `The ${kind.slice(0, -1)} cannot be removed while the databank still points at it`,
      { errors: problems.map((p) => ({ path: '', message: p })) }
    );

  const where = { where: { id } };
  try {
    await prisma.$transaction(async (tx) => {
      await {
        makers: () => tx.bankMaker.delete(where),
        instruments: () => tx.bankInstrument.delete(where),
        artists: () => tx.bankArtist.delete(where),
        songs: () => tx.bankSong.delete(where),
      }[kind]();
      await tx.bankRemoval.upsert({
        where: { kind_id: { kind, id } },
        create: { kind, id },
        update: { removedAt: new Date() },
      });
    });
  } catch (err) {
    conflictOnRace(err);
  }
  return { before: findIn(bank, kind, id) ?? null };
}
