/**
 * Reporting a shared pattern (`f-step-sequencer` t-83). Server-side only. A sound's report (`lib/app/sounds/reports.ts`)
 * for a pattern, with the same rules for the same reasons:
 *
 * - **One open report per person per pattern:** a second from them updates the first, checked and written under a
 *   lock on the pattern's row, so two sent together are one.
 * - Refused: a pattern nobody else can open (the public read's 404, saying nothing about which), and your own
 *   (`OWN_PATTERN`, 400).
 * - **Capped per user** by the same limiter as sound reports, under a key of its own (`patternReportLimitKey`).
 *
 * The reporter is never shown to anyone but themselves (their export). See `moderation.ts` for the queue.
 */
import { prisma } from '@/lib/db/client';
import { APIError, NotFoundError } from '@/lib/api/errors';
import { SharedSlugSchema } from '@/lib/app/sounds/data';
import type { ReportPattern } from '@/lib/app/patterns/report-data';

export { reportLimiter as patternReportLimiter } from '@/lib/app/sounds/reports';

/** The limiter's key for a user. */
export const patternReportLimitKey = (userId: string): string => `pattern-report:${userId}`;

const isOpenToOthers = (p: { visibility: string; unlistedAt: Date | null } | null) =>
  p !== null && p.visibility !== 'private' && p.unlistedAt === null;

/** Report the shared pattern at `slug`, or update the caller's open report on it. */
export async function reportPattern(
  userId: string,
  slug: string,
  input: ReportPattern
): Promise<{ id: string; created: boolean }> {
  if (!SharedSlugSchema.safeParse(slug).success) throw new NotFoundError('Pattern not found');
  const pattern = await prisma.userPattern.findUnique({
    where: { slug },
    select: { id: true, userId: true, visibility: true, unlistedAt: true },
  });
  if (!pattern || !isOpenToOthers(pattern)) throw new NotFoundError('Pattern not found');
  if (pattern.userId === userId)
    throw new APIError("You can't report your own pattern.", 'OWN_PATTERN', 400);

  const note = input.note || null;
  return prisma.$transaction(async (tx) => {
    // Orders reports on this one pattern, so the open-report check below and the create cannot interleave.
    await tx.$queryRaw`SELECT id FROM user_pattern WHERE id = ${pattern.id} FOR UPDATE`;
    // Read again under the lock: an unlist or a stop-sharing that landed since the read above refuses this too.
    const locked = await tx.userPattern.findUnique({
      where: { id: pattern.id },
      select: { visibility: true, unlistedAt: true },
    });
    if (!isOpenToOthers(locked)) throw new NotFoundError('Pattern not found');
    const open = await tx.patternReport.findFirst({
      where: { patternId: pattern.id, reporterId: userId, status: 'open' },
      select: { id: true },
    });
    if (open) {
      await tx.patternReport.update({
        where: { id: open.id },
        data: { reason: input.reason, note },
      });
      return { id: open.id, created: false };
    }
    const row = await tx.patternReport.create({
      data: { patternId: pattern.id, reporterId: userId, reason: input.reason, note },
      select: { id: true },
    });
    return { id: row.id, created: true };
  });
}
