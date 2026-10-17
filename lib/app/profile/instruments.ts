import type { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  LIST_NAMES,
  MAX_PER_LIST,
  type AddInstrumentInput,
  type OwnedEntry,
  type OwnedKind,
  type OwnedLists,
  type ReorderInstrumentsInput,
} from '@/lib/app/profile/instruments-data';
import { prisma } from '@/lib/db/client';

/**
 * The synths a user owns and the ones they want (`f-profiles` r2), each a databank instrument.
 *
 * **Owner-scoped.** Every read and write is keyed on the caller's user id, so another user's entry is a 404, the same
 * as one that does not exist.
 *
 * **One list or the other.** The row is keyed on the user and the instrument, so a synth cannot be on both lists:
 * adding one already on the other list is refused (409) with the words to show, and moving it is an update. Adding one
 * already on the same list returns the entry it has.
 *
 * **Only what the databank has.** An unknown instrument is a 400, storing nothing. One the databank removes takes its
 * entries with it (`Cascade`).
 */

const ENTRY_SELECT = {
  instrumentId: true,
  kind: true,
  createdAt: true,
  instrument: { select: { name: true, maker: true, year: true } },
} as const satisfies Prisma.OwnedInstrumentSelect;

type EntryRow = Prisma.OwnedInstrumentGetPayload<{ select: typeof ENTRY_SELECT }>;

const toEntry = (row: EntryRow): OwnedEntry => ({
  instrumentId: row.instrumentId,
  kind: row.kind,
  name: row.instrument.name,
  maker: row.instrument.maker,
  year: row.instrument.year,
  addedAt: row.createdAt.toISOString(),
});

/** A list's order: its positions, then when each was added, so the order is total even if two places tie. */
const LIST_ORDER = [
  { position: 'asc' },
  { createdAt: 'asc' },
  { instrumentId: 'asc' },
] as const satisfies Prisma.OwnedInstrumentOrderByWithRelationInput[];

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const hasCode = (err: unknown, code: string): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === code;

type Tx = Prisma.TransactionClient;

/**
 * Hold the user's row until the transaction ends, so two writes to their lists cannot interleave: two adds at once
 * would both pass the cap, and a move landing inside a reorder would have the reorder place a row on the other list.
 */
async function lockLists(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
}

const unknownInstrument = (instrumentId: string) =>
  new ValidationError(`The databank has no instrument ${instrumentId}`, {
    errors: [{ path: 'instrumentId', message: `No instrument ${instrumentId} in the databank` }],
  });

/** Both of the caller's lists, each in their order. */
export async function listInstruments(userId: string): Promise<OwnedLists> {
  const rows = await prisma.ownedInstrument.findMany({
    where: { userId },
    orderBy: LIST_ORDER,
    select: ENTRY_SELECT,
  });
  const entries = rows.map(toEntry);
  return {
    owned: entries.filter((e) => e.kind === 'owned'),
    wishlist: entries.filter((e) => e.kind === 'wishlist'),
  };
}

/** The position at the end of one of the caller's lists, or a 409 when it is full. */
async function endOf(tx: Tx, userId: string, kind: OwnedKind): Promise<number> {
  const { _count, _max } = await tx.ownedInstrument.aggregate({
    where: { userId, kind },
    _count: { _all: true },
    _max: { position: true },
  });
  if (_count._all >= MAX_PER_LIST)
    throw new ConflictError(
      `You can list up to ${MAX_PER_LIST} ${LIST_NAMES[kind]}. Remove one to add another.`,
      { reason: 'full', kind }
    );
  return (_max.position ?? -1) + 1;
}

/** What adding to `kind` means for an entry already there: it is this one, or it is on the other list. */
function alreadyListed(existing: EntryRow, kind: OwnedKind): OwnedEntry {
  if (existing.kind === kind) return toEntry(existing);
  throw new ConflictError(
    `${existing.instrument.name} is already on ${LIST_NAMES[existing.kind]}. Move it instead.`,
    { reason: 'on-other-list', kind: existing.kind }
  );
}

/** Put an instrument at the end of one of the caller's lists. `created` is false when it was already on it. */
export async function addInstrument(
  userId: string,
  { instrumentId, kind }: AddInstrumentInput
): Promise<{ entry: OwnedEntry; created: boolean }> {
  const key = { userId_instrumentId: { userId, instrumentId } };
  const existing = await prisma.ownedInstrument.findUnique({ where: key, select: ENTRY_SELECT });
  if (existing) return { entry: alreadyListed(existing, kind), created: false };

  const instrument = await prisma.bankInstrument.findUnique({
    where: { id: instrumentId },
    select: { id: true },
  });
  if (!instrument) throw unknownInstrument(instrumentId);

  try {
    const row = await prisma.$transaction(async (tx) => {
      await lockLists(tx, userId);
      const position = await endOf(tx, userId, kind);
      return tx.ownedInstrument.create({
        data: { userId, instrumentId, kind, position },
        select: ENTRY_SELECT,
      });
    });
    return { entry: toEntry(row), created: true };
  } catch (err) {
    // Removed from the databank between the read and the write.
    if (hasCode(err, 'P2003')) throw unknownInstrument(instrumentId);
    // Listed by another request between the read and the write: answer as if it had come first.
    if (!hasCode(err, 'P2002')) throw err;
    const row = await prisma.ownedInstrument.findUnique({ where: key, select: ENTRY_SELECT });
    if (!row) throw err;
    return { entry: alreadyListed(row, kind), created: false };
  }
}

/** Move one of the caller's instruments to the end of a list. Already on it, it stays where it is. */
export async function moveInstrument(
  userId: string,
  instrumentId: string,
  kind: OwnedKind
): Promise<OwnedEntry> {
  const key = { userId_instrumentId: { userId, instrumentId } };
  const existing = await prisma.ownedInstrument.findUnique({ where: key, select: ENTRY_SELECT });
  if (!existing) throw new NotFoundError('Not on your lists');
  if (existing.kind === kind) return toEntry(existing);
  const count = await prisma.$transaction(async (tx) => {
    await lockLists(tx, userId);
    const position = await endOf(tx, userId, kind);
    // Keyed on the owner as well as the instrument; removed meanwhile, it is a 404 rather than a write.
    const moved = await tx.ownedInstrument.updateMany({
      where: { userId, instrumentId },
      data: { kind, position },
    });
    return moved.count;
  });
  if (count === 0) throw new NotFoundError('Not on your lists');
  return { ...toEntry(existing), kind };
}

/** Take an instrument off the caller's lists, or a 404 when it is on neither. */
export async function removeInstrument(userId: string, instrumentId: string): Promise<void> {
  const { count } = await prisma.ownedInstrument.deleteMany({ where: { userId, instrumentId } });
  if (count === 0) throw new NotFoundError('Not on your lists');
}

/**
 * Put one of the caller's lists in a new order. `instrumentIds` must be exactly that list, every instrument once: a
 * list that has changed since the caller read it (an add or a move in another tab) is a 409, and the remedy is to read
 * the lists again, which the settings section does.
 */
export async function reorderInstruments(
  userId: string,
  { kind, instrumentIds }: ReorderInstrumentsInput
): Promise<OwnedLists> {
  const stale = () =>
    new ConflictError(`${capitalised(LIST_NAMES[kind])} changed since you opened it. Reload it.`, {
      reason: 'stale',
      kind,
    });
  await prisma.$transaction(
    async (tx) => {
      await lockLists(tx, userId);
      const rows = await tx.ownedInstrument.findMany({
        where: { userId, kind },
        select: { instrumentId: true, position: true },
      });
      const current = new Map(rows.map((r) => [r.instrumentId, r.position]));
      if (rows.length !== instrumentIds.length || instrumentIds.some((id) => !current.has(id)))
        throw stale();
      for (const [position, instrumentId] of instrumentIds.entries()) {
        if (current.get(instrumentId) === position) continue;
        // Keyed on the list too, so a row that is no longer on it is never given a place in it.
        const { count } = await tx.ownedInstrument.updateMany({
          where: { userId, instrumentId, kind },
          data: { position },
        });
        if (count === 0) throw stale();
      }
    },
    // The first reorder after removes rewrites every place, up to MAX_PER_LIST statements one after another.
    { timeout: 15_000 }
  );
  return listInstruments(userId);
}
