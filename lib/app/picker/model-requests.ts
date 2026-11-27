/**
 * Asking for a synth to be modelled (`f-synth-picker` t-330): a signed-in user asks for a databank instrument nobody
 * has modelled to be made playable, from its page in the synth picker's place, and admins see how many asked for each.
 * Server only.
 *
 * - **One request per user and instrument.** Asking again is a no-op, not a second vote; withdrawing removes it.
 * - **Owner-scoped by construction.** A user's own requests are keyed on their id; nothing here reads another user's,
 *   and the counts admins and the page see name nobody.
 * - **Only an instrument the databank has.** One it does not is a 404 (`NotFoundError`); the row is a real relation,
 *   removed with the instrument.
 *
 * See `.context/app/synth-picker.md`.
 */
import { NotFoundError } from '@/lib/api/errors';
import { prisma } from '@/lib/db/client';
import { hasPrismaCode } from '@/lib/app/synths/lib/prisma-errors';
import type { InstrumentRef } from '@/lib/app/bank/read';

/** Whether this user has asked for an instrument, and how many have in all. */
export interface ModelRequestState {
  instrumentId: string;
  asked: boolean;
  count: number;
}

/** One instrument's requests, as admins see them: how many asked, and when the last did. Names no one. */
export interface ModelRequestTally {
  /** As the databank has it; `kind` is the table's text. */
  instrument: Pick<InstrumentRef, 'id' | 'name' | 'maker' | 'year'> & { kind: string };
  count: number;
  lastAskedAt: string;
}

const unknownInstrument = (id: string) =>
  new NotFoundError(`The databank has no instrument "${id}"`);

async function countFor(instrumentId: string): Promise<number> {
  return prisma.modelRequest.count({ where: { instrumentId } });
}

/** The instruments this user has asked to be modelled, oldest request first. */
export async function listMyModelRequests(userId: string): Promise<string[]> {
  const rows = await prisma.modelRequest.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { instrumentId: 'asc' }],
    select: { instrumentId: true },
  });
  return rows.map((r) => r.instrumentId);
}

/** This user's request for one instrument, and how many have asked for it. */
export async function getModelRequest(
  userId: string,
  instrumentId: string
): Promise<ModelRequestState> {
  const [mine, count] = await Promise.all([
    prisma.modelRequest.findUnique({
      where: { userId_instrumentId: { userId, instrumentId } },
      select: { userId: true },
    }),
    countFor(instrumentId),
  ]);
  return { instrumentId, asked: mine !== null, count };
}

/** Ask for an instrument to be modelled. Asking again changes nothing. */
export async function askToModel(userId: string, instrumentId: string): Promise<ModelRequestState> {
  try {
    await prisma.modelRequest.upsert({
      where: { userId_instrumentId: { userId, instrumentId } },
      create: { userId, instrumentId },
      update: {},
    });
  } catch (err) {
    if (hasPrismaCode(err, 'P2003')) throw unknownInstrument(instrumentId);
    // Two asks at once (two tabs): the other made the row, which is what this one wanted.
    if (!hasPrismaCode(err, 'P2002')) throw err;
  }
  return { instrumentId, asked: true, count: await countFor(instrumentId) };
}

/** Withdraw a request. Withdrawing one never made changes nothing. */
export async function withdrawModelRequest(
  userId: string,
  instrumentId: string
): Promise<ModelRequestState> {
  await prisma.modelRequest.deleteMany({ where: { userId, instrumentId } });
  return { instrumentId, asked: false, count: await countFor(instrumentId) };
}

/** Every instrument anyone has asked for, the most asked first, then the most recently asked. */
export async function tallyModelRequests(): Promise<ModelRequestTally[]> {
  const groups = await prisma.modelRequest.groupBy({
    by: ['instrumentId'],
    _count: { _all: true },
    _max: { createdAt: true },
  });
  if (!groups.length) return [];
  const instruments = await prisma.bankInstrument.findMany({
    where: { id: { in: groups.map((g) => g.instrumentId) } },
    select: { id: true, name: true, maker: true, year: true, kind: true },
  });
  const byId = new Map(instruments.map((i) => [i.id, i]));
  return groups
    .flatMap((g) => {
      const instrument = byId.get(g.instrumentId);
      const last = g._max.createdAt;
      return instrument && last
        ? [{ instrument, count: g._count._all, lastAskedAt: last.toISOString() }]
        : [];
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.lastAskedAt.localeCompare(a.lastAskedAt) ||
        a.instrument.name.localeCompare(b.instrument.name)
    );
}
