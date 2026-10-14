/**
 * Synth suggestions (`f-databank` t-37): a signed-in user says a synth is missing from the databank, and an admin
 * accepts, merges or declines it.
 *
 * A decision is made once. Each one moves the row out of `PENDING` with a conditional update, so two admins deciding
 * the same suggestion cannot both win: the second gets a 409. An accept claims the row before it creates the
 * instrument, and hands it back to `PENDING` if the databank refuses the instrument, so a refused accept leaves the
 * suggestion where it was.
 */
import type { SynthSuggestion } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { createRateLimiter } from '@/lib/security/rate-limit';
import { saveBankRow, type BankSaveResult } from '@/lib/app/bank/admin';
import type {
  AdminSuggestion,
  SuggestionDecision,
  SuggestionInput,
  SuggestionStatus,
} from '@/lib/app/bank/suggestion-data';

/**
 * The per-user sub-cap on suggesting (the proxy's `/api/v1` section cap still applies first). Ten an hour is more than
 * anyone filling in what they own needs, and few enough that the admin queue cannot be flooded from one account.
 */
export const suggestionLimiter = createRateLimiter({
  interval: 60 * 60 * 1000,
  maxRequests: 10,
});

/** The limiter's key for a user. */
export const suggestionLimitKey = (userId: string): string => `bank-suggest:${userId}`;

/** Record a user's suggestion, pending an admin. */
export async function createSuggestion(
  userId: string,
  input: SuggestionInput
): Promise<SynthSuggestion> {
  return prisma.synthSuggestion.create({
    data: {
      userId,
      name: input.name,
      maker: input.maker,
      link: input.link ?? null,
      note: input.note ?? null,
    },
  });
}

/** The queue, newest first: one status, or every suggestion. The suggester is named by their account's name. */
export async function listSuggestions(status?: SuggestionStatus): Promise<AdminSuggestion[]> {
  const rows = await prisma.synthSuggestion.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  const userIds = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    maker: r.maker,
    link: r.link,
    note: r.note,
    status: r.status,
    instrumentId: r.instrumentId,
    reason: r.reason,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    suggestedBy: r.userId ? (names.get(r.userId) ?? null) : null,
  }));
}

export interface DecisionResult {
  before: SynthSuggestion;
  after: SynthSuggestion;
  /** The instrument an accept created, as the databank saved it. */
  created?: BankSaveResult;
}

/**
 * Decide a pending suggestion. Throws {@link NotFoundError} for an unknown id, {@link ConflictError} when it is no
 * longer pending, and whatever the databank's create throws when an accepted instrument would break a reference or
 * its id is taken. A merge into an instrument the databank does not hold is a {@link ValidationError}.
 */
export async function decideSuggestion(
  id: string,
  decision: SuggestionDecision
): Promise<DecisionResult> {
  const before = await prisma.synthSuggestion.findUnique({ where: { id } });
  if (!before) throw new NotFoundError('Suggestion not found');
  if (before.status !== 'PENDING') throw alreadyDecided(before);

  switch (decision.action) {
    case 'accept': {
      const { id: instrumentId, ...fields } = decision.instrument;
      const after = await claim(before, {
        status: 'ACCEPTED',
        instrumentId,
        reason: null,
      });
      let created: BankSaveResult;
      try {
        created = await saveBankRow('instruments', instrumentId, fields, 'create');
      } catch (err) {
        await prisma.synthSuggestion.update({
          where: { id },
          data: { status: 'PENDING', instrumentId: null, decidedAt: null },
        });
        throw err;
      }
      return { before, after, created };
    }
    case 'merge': {
      const exists = await prisma.bankInstrument.findUnique({
        where: { id: decision.instrumentId },
        select: { id: true },
      });
      if (!exists)
        throw new ValidationError('That instrument is not in the databank', {
          errors: [
            { path: 'instrumentId', message: `no instrument has the id ${decision.instrumentId}` },
          ],
        });
      const after = await claim(before, {
        status: 'MERGED',
        instrumentId: decision.instrumentId,
        reason: null,
      });
      return { before, after };
    }
    case 'decline': {
      const after = await claim(before, {
        status: 'DECLINED',
        instrumentId: null,
        reason: decision.reason,
      });
      return { before, after };
    }
  }
}

/** Move a suggestion out of `PENDING`, only if it is still there. */
async function claim(
  before: SynthSuggestion,
  data: { status: SuggestionStatus; instrumentId: string | null; reason: string | null }
): Promise<SynthSuggestion> {
  const decidedAt = new Date();
  const { count } = await prisma.synthSuggestion.updateMany({
    where: { id: before.id, status: 'PENDING' },
    data: { ...data, decidedAt },
  });
  if (count === 0) {
    const now = await prisma.synthSuggestion.findUnique({ where: { id: before.id } });
    if (!now) throw new NotFoundError('Suggestion not found');
    throw alreadyDecided(now);
  }
  return { ...before, ...data, decidedAt, updatedAt: decidedAt };
}

function alreadyDecided(row: SynthSuggestion): ConflictError {
  return new ConflictError(
    `This suggestion has already been decided (${row.status.toLowerCase()})`
  );
}
