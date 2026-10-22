/**
 * Users' own patterns (`f-step-sequencer` t-81): "My patterns", a library of the sequencer's patterns kept under the
 * user's account and not tied to a synth (owner ruling, 2026-10-21).
 *
 * **Owner-scoped.** Every read and write is keyed on the caller's user id as well as the pattern's, so another user's
 * pattern is indistinguishable from one that does not exist: a 404, never a 403 (`.context/auth/authorization.md`).
 * That holds for a sound pointing at one too: `ownPattern` refuses another user's pattern exactly as an unknown one.
 *
 * **Validated on write and on read** with the sequencer's `PatternSchema`. A pattern saved as a shape version the app
 * has moved on from waits for the mapping D1 requires; until one ships (none has) it is listed and kept but has no
 * steps to open, with the reason.
 *
 * Deleting a pattern leaves the sounds that played it by default with none: the pointer is `ON DELETE SET NULL`.
 */
import type { Prisma, UserPattern } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { getSynthDef } from '@/lib/app/synths/defs';
import { PATTERN_VERSION, PatternSchema, type Pattern } from '@/lib/app/sequencer/pattern';
import type {
  CreateUserPattern,
  UpdateUserPattern,
  UserPatternDetail,
  UserPatternSummary,
} from '@/lib/app/patterns/data';

const notFound = (): never => {
  throw new NotFoundError('Pattern not found');
};

/** A copy typed as JSON for a Prisma `Json` column. */
const toJson = (value: Pattern): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** The stored pattern as the sequencer can read it now, or why not. */
function patternOf(
  row: UserPattern,
  log: boolean
): Pick<UserPatternDetail, 'pattern' | 'problems'> {
  if (row.version !== PATTERN_VERSION)
    return {
      pattern: null,
      problems: [
        `Saved as pattern version ${row.version}, and the sequencer reads version ${PATTERN_VERSION}, with no mapping between them`,
      ],
    };
  const parsed = PatternSchema.safeParse(row.pattern);
  if (parsed.success) return { pattern: parsed.data, problems: [] };
  // Logged when its owner opens it, not on every list, so one bad row is not an error on each page load.
  if (log)
    logger.error('user patterns: stored pattern fails validation', {
      patternId: row.id,
      issues: parsed.error.issues.slice(0, 5).map((i) => i.message),
    });
  return { pattern: null, problems: parsed.error.issues.slice(0, 5).map((i) => i.message) };
}

function toDetail(row: UserPattern, log: boolean): UserPatternDetail {
  const { pattern, problems } = patternOf(row, log);
  return {
    id: row.id,
    name: row.name,
    synthId: row.synthId,
    steps: pattern ? pattern.parts[0].steps.length : 0,
    parts: pattern ? pattern.parts.length : 0,
    pattern,
    problems,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(detail: UserPatternDetail): UserPatternSummary {
  const { pattern: _pattern, problems: _problems, ...summary } = detail;
  return summary;
}

/** The caller's patterns, most recently changed first. */
export async function listUserPatterns(userId: string): Promise<UserPatternSummary[]> {
  const rows = await prisma.userPattern.findMany({
    where: { userId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  return rows.map((row) => toSummary(toDetail(row, false)));
}

/** One of the caller's patterns, or a 404 when they have none with that id. */
export async function getUserPattern(userId: string, id: string): Promise<UserPatternDetail> {
  const row = await prisma.userPattern.findFirst({ where: { id, userId } });
  return row ? toDetail(row, true) : notFound();
}

/** Save a new pattern. The synth it was made on has to be one the app knows, though the pattern plays on any. */
export async function createUserPattern(
  userId: string,
  input: CreateUserPattern
): Promise<UserPatternDetail> {
  if (input.synthId !== undefined && !getSynthDef(input.synthId))
    throw new ValidationError(`${input.synthId} is not a synth the app knows`, {
      errors: [{ path: 'synthId', message: `No synth has the id ${input.synthId}` }],
    });
  const row = await prisma.userPattern.create({
    data: {
      userId,
      name: input.name,
      pattern: toJson(input.pattern),
      version: input.pattern.version,
      synthId: input.synthId ?? null,
    },
  });
  return toDetail(row, true);
}

/** Rename one of the caller's patterns, or save new steps over it. */
export async function updateUserPattern(
  userId: string,
  id: string,
  input: UpdateUserPattern
): Promise<UserPatternDetail> {
  const data: Prisma.UserPatternUpdateManyMutationInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.pattern !== undefined) {
    data.pattern = toJson(input.pattern);
    data.version = input.pattern.version;
  }
  const { count } = await prisma.userPattern.updateMany({ where: { id, userId }, data });
  if (count === 0) notFound();
  return getUserPattern(userId, id);
}

/** Delete one of the caller's patterns, or a 404. Their sounds that played it by default play none. */
export async function deleteUserPattern(userId: string, id: string): Promise<void> {
  const { count } = await prisma.userPattern.deleteMany({ where: { id, userId } });
  if (count === 0) notFound();
}

/**
 * That `patternId` is one of the caller's own patterns, read with `db` (a transaction's client, or the default): a 400
 * on `patternId` otherwise, the same for another user's pattern as for one that does not exist.
 */
export async function assertOwnPattern(
  db: Pick<Prisma.TransactionClient, 'userPattern'>,
  userId: string,
  patternId: string
): Promise<void> {
  const row = await db.userPattern.findFirst({
    where: { id: patternId, userId },
    select: { id: true },
  });
  if (!row)
    throw new ValidationError('That pattern is not one of yours', {
      errors: [{ path: 'patternId', message: 'No pattern of yours has that id' }],
    });
}
