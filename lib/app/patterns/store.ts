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
 *
 * **Shared** (t-83, `sharing.ts`): a PATCH may move it between private and a link share, and a copy may be made from
 * anyone's shared pattern. Every change runs under the owner's lock, so it is checked as the row it lands on: a
 * published pattern's new name gets the word check, and its new steps the unchanged-copy check.
 */
import type { Prisma, UserPattern } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { getSynthDef } from '@/lib/app/synths/defs';
import { PATTERN_VERSION, PatternSchema, type Pattern } from '@/lib/app/sequencer/pattern';
import type {
  CreateUserPattern,
  SharedPatternSource,
  UpdateUserPattern,
  UserPatternDetail,
  UserPatternSummary,
} from '@/lib/app/patterns/data';
import {
  assertPatternChanged,
  assertPatternNotUnlisted,
  assertPublishableName,
  lockOwnersPatterns,
  patternVisibilityData,
  readablePattern,
  sharedCopySource,
  sharedPatternSourcesOf,
} from '@/lib/app/patterns/sharing';
import { withFreshSlug } from '@/lib/app/sounds/sharing';

const notFound = (): never => {
  throw new NotFoundError('Pattern not found');
};

/** A copy typed as JSON for a Prisma `Json` column. */
const toJson = (value: Pattern): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** The stored pattern as the sequencer can read it now, or why not. */
export function patternOf(
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

function toDetail(
  row: UserPattern,
  log: boolean,
  credits: Map<string, SharedPatternSource>
): UserPatternDetail {
  const { pattern, problems } = patternOf(row, log);
  return {
    id: row.id,
    name: row.name,
    synthId: row.synthId,
    steps: pattern ? pattern.parts[0].steps.length : 0,
    parts: pattern ? pattern.parts.length : 0,
    visibility: row.visibility,
    slug: row.slug,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    unlisted: row.unlistedAt !== null,
    basedOn: row.sourceUserPatternId ? (credits.get(row.sourceUserPatternId) ?? null) : null,
    pattern,
    problems,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** One row as its owner reads it, with its credit. */
async function detailOf(row: UserPattern): Promise<UserPatternDetail> {
  return toDetail(row, true, await sharedPatternSourcesOf([row.sourceUserPatternId]));
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
  // every credit in two queries, however long the list
  const credits = await sharedPatternSourcesOf(rows.map((r) => r.sourceUserPatternId));
  return rows.map((row) => toSummary(toDetail(row, false, credits)));
}

/** One of the caller's patterns, or a 404 when they have none with that id. */
export async function getUserPattern(userId: string, id: string): Promise<UserPatternDetail> {
  const row = await prisma.userPattern.findFirst({ where: { id, userId } });
  return row ? detailOf(row) : notFound();
}

/**
 * Save a new pattern. The synth it was made on has to be one the app knows, though the pattern plays on any.
 *
 * With `source.shared`, a copy of someone's shared pattern (t-83): the name and steps not sent are the source's, and
 * it records the source, so the copy credits it while it stays published. A copy of the caller's own records none. A
 * source the sequencer can no longer read needs the steps sent.
 */
export async function createUserPattern(
  userId: string,
  input: CreateUserPattern
): Promise<UserPatternDetail> {
  if (input.synthId !== undefined && !getSynthDef(input.synthId))
    throw new ValidationError(`${input.synthId} is not a synth the app knows`, {
      errors: [{ path: 'synthId', message: `No synth has the id ${input.synthId}` }],
    });
  const source = input.source ? await sharedCopySource(input.source.shared) : null;
  const pattern = input.pattern ?? (source ? readablePattern(source) : null);
  if (!pattern)
    throw new ValidationError('A pattern is needed', {
      errors: [
        {
          path: 'pattern',
          message: source
            ? 'The shared pattern cannot be read as it is now: send the steps to save'
            : 'A pattern is needed',
        },
      ],
    });
  const name = input.name ?? source?.name;
  if (name === undefined)
    throw new ValidationError('Name the pattern', {
      errors: [{ path: 'name', message: 'Name the pattern' }],
    });
  const row = await prisma.userPattern.create({
    data: {
      userId,
      name,
      pattern: toJson(pattern),
      version: pattern.version,
      // a copy keeps the synth its source was made on while the app still knows it
      synthId:
        input.synthId ?? (source?.synthId && getSynthDef(source.synthId) ? source.synthId : null),
      sourceUserPatternId: source && source.userId !== userId ? source.id : null,
    },
  });
  return detailOf(row);
}

/**
 * Rename one of the caller's patterns, save new steps over it, or move it between private and a link share. Under the
 * owner's lock, read first, so the checks run against the row the write lands on:
 *
 * - a link share of a pattern moderators unlisted is refused (`UNLISTED`); making it private never is;
 * - a published pattern's new name gets the word check, and its new steps the unchanged-copy check. An edit that also
 *   takes it off Explore (`visibility` in the same PATCH) runs neither.
 */
export async function updateUserPattern(
  userId: string,
  id: string,
  input: UpdateUserPattern
): Promise<UserPatternDetail> {
  await withFreshSlug(() =>
    prisma.$transaction(async (tx) => {
      await lockOwnersPatterns(tx, userId);
      const row = await tx.userPattern.findFirst({ where: { id, userId } });
      if (!row) return notFound();
      const data: Prisma.UserPatternUpdateManyMutationInput = {};
      if (input.visibility !== undefined) {
        if (input.visibility === 'link') assertPatternNotUnlisted(row);
        Object.assign(data, patternVisibilityData(row, input.visibility));
      }
      const staysPublished = row.visibility === 'published' && input.visibility === undefined;
      if (input.name !== undefined) {
        if (staysPublished && input.name !== row.name) assertPublishableName(input.name);
        data.name = input.name;
      }
      if (input.pattern !== undefined) {
        if (staysPublished) await assertPatternChanged(input.pattern, row.sourceUserPatternId, tx);
        data.pattern = toJson(input.pattern);
        data.version = input.pattern.version;
      }
      const { count } = await tx.userPattern.updateMany({ where: { id, userId }, data });
      if (count === 0) notFound();
    })
  );
  return getUserPattern(userId, id);
}

/** Delete one of the caller's patterns, or a 404. Their sounds that played it by default play none. */
export async function deleteUserPattern(userId: string, id: string): Promise<void> {
  const { count } = await prisma.userPattern.deleteMany({ where: { id, userId } });
  if (count === 0) notFound();
}

/**
 * That `patternId` is one of the caller's own patterns, read in the caller's transaction: a 400 on `patternId`
 * otherwise, the same for another user's pattern as for one that does not exist. The row is locked first (`FOR KEY
 * SHARE`), so a delete arriving meanwhile waits for the transaction rather than leaving the FK to refuse it as a 500.
 */
export async function assertOwnPattern(
  tx: Pick<Prisma.TransactionClient, 'userPattern' | '$queryRaw'>,
  userId: string,
  patternId: string
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM user_pattern WHERE id = ${patternId} AND "userId" = ${userId} FOR KEY SHARE`;
  const row = await tx.userPattern.findFirst({
    where: { id: patternId, userId },
    select: { id: true },
  });
  if (!row)
    throw new ValidationError('That pattern is not one of yours', {
      errors: [{ path: 'patternId', message: 'No pattern of yours has that id' }],
    });
}
