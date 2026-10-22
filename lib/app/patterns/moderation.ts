/**
 * Moderating shared patterns (`f-step-sequencer` t-83): the admin queue, and unlisting, restoring and dismissing.
 * Server-side only. A shared sound's moderation (`lib/app/sounds/moderation.ts`) for a pattern:
 *
 * - **Unlist** sets `UserPattern.unlistedAt`. Every public read filters on it (`public.ts`, the credit in
 *   `sharedPatternSourcesOf`, the copy source), so the pattern leaves its page, Explore, its owner's profile and the
 *   sitemap on the next request, and its owner cannot share or publish it again. Its visibility is kept, so a restore
 *   brings it back as its owner left it. Its open reports are actioned.
 * - **Restore** clears `unlistedAt`. **Dismiss** closes the open reports and moves nothing else.
 *
 * Each is a conditional write, so two admins acting on one pattern cannot both win: the second is a 409.
 *
 * **The queue never names a reporter.** It reads reports' reasons, notes, statuses and dates, never `reporterId`.
 */
import type { SoundReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { usernamesOf } from '@/lib/app/sounds/sharing';
import type { ModerationAction, ModerationView } from '@/lib/app/sounds/report-data';
import type { ModerationResult } from '@/lib/app/sounds/moderation';
import type { QueuePattern } from '@/lib/app/patterns/report-data';

/** What the moderation routes pass their admin guard. A user's pattern and its reports are on `SYSTEM_MODELS`. */
export const PATTERN_MODERATION_ADMIN = {
  // Ownership: no ownership decision — the admin queue of every user's shared patterns. See RouteOwnership in lib/auth/guards.ts.
  ownership: {
    decidedBy: 'nothing',
    because:
      "The moderation queue is every user's reported patterns by design, for admins to act on; the guard already limits this to admins.",
  },
} as const;

/** The queue: patterns with open reports, the longest-waiting first; or unlisted ones, the most recently unlisted first. */
export async function listPatternModerationQueue(view: ModerationView): Promise<QueuePattern[]> {
  let ids: string[];
  if (view === 'reported') {
    const open = await prisma.patternReport.findMany({
      where: { status: 'open', pattern: { unlistedAt: null } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { patternId: true },
    });
    ids = [...new Set(open.map((r) => r.patternId))];
  } else {
    const rows = await prisma.userPattern.findMany({
      where: { unlistedAt: { not: null } },
      orderBy: [{ unlistedAt: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });
    ids = rows.map((r) => r.id);
  }
  if (ids.length === 0) return [];

  const statuses: SoundReportStatus[] = view === 'reported' ? ['open'] : ['open', 'actioned'];
  const patterns = await prisma.userPattern.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      userId: true,
      synthId: true,
      name: true,
      visibility: true,
      slug: true,
      unlistedAt: true,
      reports: {
        where: { status: { in: statuses } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        // never reporterId or resolvedById
        select: { reason: true, note: true, status: true, createdAt: true },
      },
    },
  });
  const synthIds = [...new Set(patterns.flatMap((p) => (p.synthId ? [p.synthId] : [])))];
  const [owners, synths] = await Promise.all([
    usernamesOf(patterns.map((p) => p.userId)),
    prisma.synth.findMany({ where: { id: { in: synthIds } }, select: { id: true, name: true } }),
  ]);
  const synthNames = new Map(synths.map((s) => [s.id, s.name]));
  const byId = new Map(patterns.map((p) => [p.id, p]));

  return ids.flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];
    return [
      {
        id: p.id,
        name: p.name,
        synthId: p.synthId,
        synthName: p.synthId ? (synthNames.get(p.synthId) ?? p.synthId) : null,
        visibility: p.visibility,
        slug: p.slug,
        owner: owners.get(p.userId)?.username ?? null,
        unlistedAt: p.unlistedAt?.toISOString() ?? null,
        reports: p.reports.map((r) => ({
          reason: r.reason,
          note: r.note,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      },
    ];
  });
}

/** Unlist, restore or dismiss one pattern, as the admin `adminId`. */
export async function moderatePattern(
  adminId: string,
  patternId: string,
  action: ModerationAction,
  now = new Date()
): Promise<ModerationResult> {
  return prisma.$transaction(async (tx) => {
    const pattern = await tx.userPattern.findUnique({
      where: { id: patternId },
      select: { name: true, unlistedAt: true },
    });
    if (!pattern) throw new NotFoundError('Pattern not found');
    const before = { unlistedAt: pattern.unlistedAt?.toISOString() ?? null };
    const resolved = { resolvedById: adminId, resolvedAt: now };

    if (action === 'dismiss') {
      const { count } = await tx.patternReport.updateMany({
        where: { patternId, status: 'open' },
        data: { status: 'dismissed', ...resolved },
      });
      if (count === 0) throw new ConflictError('This pattern has no open reports');
      return { name: pattern.name, before, after: before, reportsClosed: count };
    }

    // conditional on the state read above, so a second admin acting at once finds nothing to change
    const unlisting = action === 'unlist';
    const { count } = await tx.userPattern.updateMany({
      where: { id: patternId, unlistedAt: unlisting ? null : { not: null } },
      data: { unlistedAt: unlisting ? now : null },
    });
    if (count === 0)
      throw new ConflictError(
        unlisting ? 'This pattern is already unlisted' : 'This pattern is not unlisted'
      );

    let reportsClosed = 0;
    if (unlisting)
      ({ count: reportsClosed } = await tx.patternReport.updateMany({
        where: { patternId, status: 'open' },
        data: { status: 'actioned', ...resolved },
      }));
    return {
      name: pattern.name,
      before,
      after: { unlistedAt: unlisting ? now.toISOString() : null },
      reportsClosed,
    };
  });
}
