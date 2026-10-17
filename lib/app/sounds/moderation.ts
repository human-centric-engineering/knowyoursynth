/**
 * Moderating shared sounds (`f-sharing` h4): the admin queue, and unlisting, restoring and dismissing. Server-side only.
 *
 * - **Unlist** sets `UserSound.unlistedAt`. Every public read filters on it (`lib/app/sounds/public.ts`, the credit in
 *   `sharedSourcesOf`, the copy source), so the sound leaves its page, Explore, its owner's profile and the sitemap on
 *   the next request, and its owner cannot share or publish it again (`assertNotUnlisted`). Its visibility is kept, so
 *   a restore brings it back as its owner left it. Its open reports are actioned.
 * - **Restore** clears `unlistedAt`. Reports are left as they are.
 * - **Dismiss** closes the open reports and moves nothing else.
 *
 * Each is a conditional write, so two admins acting on one sound cannot both win: unlisting one already unlisted,
 * restoring one that is not, and dismissing with no open reports are each a 409, as a decided suggestion is.
 *
 * Unlike BeatBreaker's take-down, which made the pattern private and emailed its owner, this keeps the visibility so a
 * restore is exact, and the owner learns from My sounds rather than by email (planning ruling on `f-sharing`).
 *
 * **The queue never names a reporter.** It reads reports' reasons, notes, statuses and dates, never `reporterId`.
 */
import type { SoundReportStatus } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { usernamesOf } from '@/lib/app/sounds/sharing';
import type { ModerationAction, ModerationView, QueueSound } from '@/lib/app/sounds/report-data';

/**
 * What the moderation routes pass their admin guard. Not `writesSharedSettings`: a user's sound and a report about it
 * are on `SYSTEM_MODELS`, not shared settings.
 */
export const SOUND_MODERATION_ADMIN = {
  // Ownership: no ownership decision — the admin queue of every user's shared sounds. See RouteOwnership in lib/auth/guards.ts.
  ownership: {
    decidedBy: 'nothing',
    because:
      "The moderation queue is every user's reported sounds by design, for admins to act on; the guard already limits this to admins.",
  },
} as const;

/** The queue: sounds with open reports, the longest-waiting first; or unlisted sounds, the most recently unlisted first. */
export async function listModerationQueue(view: ModerationView): Promise<QueueSound[]> {
  let soundIds: string[];
  if (view === 'reported') {
    // ordered by each sound's oldest open report; a sound appears once, where its first open report puts it
    const open = await prisma.soundReport.findMany({
      where: { status: 'open', sound: { unlistedAt: null } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { soundId: true },
    });
    soundIds = [...new Set(open.map((r) => r.soundId))];
  } else {
    const rows = await prisma.userSound.findMany({
      where: { unlistedAt: { not: null } },
      orderBy: [{ unlistedAt: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });
    soundIds = rows.map((r) => r.id);
  }
  if (soundIds.length === 0) return [];

  const statuses: SoundReportStatus[] = view === 'reported' ? ['open'] : ['open', 'actioned'];
  const sounds = await prisma.userSound.findMany({
    where: { id: { in: soundIds } },
    select: {
      id: true,
      userId: true,
      synthId: true,
      name: true,
      notes: true,
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
  const [owners, synths] = await Promise.all([
    usernamesOf(sounds.map((s) => s.userId)),
    prisma.synth.findMany({
      where: { id: { in: [...new Set(sounds.map((s) => s.synthId))] } },
      select: { id: true, name: true },
    }),
  ]);
  const synthNames = new Map(synths.map((s) => [s.id, s.name]));
  const byId = new Map(sounds.map((s) => [s.id, s]));

  return soundIds.flatMap((id) => {
    const s = byId.get(id);
    if (!s) return [];
    return [
      {
        id: s.id,
        synthId: s.synthId,
        synthName: synthNames.get(s.synthId) ?? s.synthId,
        name: s.name,
        notes: s.notes,
        visibility: s.visibility,
        slug: s.slug,
        owner: owners.get(s.userId)?.username ?? null,
        unlistedAt: s.unlistedAt?.toISOString() ?? null,
        reports: s.reports.map((r) => ({
          reason: r.reason,
          note: r.note,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      },
    ];
  });
}

/** What an action changed, for the audit log. */
export interface ModerationResult {
  name: string;
  before: { unlistedAt: string | null };
  after: { unlistedAt: string | null };
  /** How many open reports it closed. */
  reportsClosed: number;
}

/** Unlist, restore or dismiss one sound, as the admin `adminId`. */
export async function moderateSound(
  adminId: string,
  soundId: string,
  action: ModerationAction,
  now = new Date()
): Promise<ModerationResult> {
  return prisma.$transaction(async (tx) => {
    const sound = await tx.userSound.findUnique({
      where: { id: soundId },
      select: { name: true, unlistedAt: true },
    });
    if (!sound) throw new NotFoundError('Sound not found');
    const before = { unlistedAt: sound.unlistedAt?.toISOString() ?? null };
    const resolved = { resolvedById: adminId, resolvedAt: now };

    if (action === 'dismiss') {
      const { count } = await tx.soundReport.updateMany({
        where: { soundId, status: 'open' },
        data: { status: 'dismissed', ...resolved },
      });
      if (count === 0) throw new ConflictError('This sound has no open reports');
      return { name: sound.name, before, after: before, reportsClosed: count };
    }

    // conditional on the state read above, so a second admin acting at once finds nothing to change
    const unlisting = action === 'unlist';
    const { count } = await tx.userSound.updateMany({
      where: { id: soundId, unlistedAt: unlisting ? null : { not: null } },
      data: { unlistedAt: unlisting ? now : null },
    });
    if (count === 0)
      throw new ConflictError(
        unlisting ? 'This sound is already unlisted' : 'This sound is not unlisted'
      );

    let reportsClosed = 0;
    if (unlisting)
      ({ count: reportsClosed } = await tx.soundReport.updateMany({
        where: { soundId, status: 'open' },
        data: { status: 'actioned', ...resolved },
      }));
    return {
      name: sound.name,
      before,
      after: { unlistedAt: unlisting ? now.toISOString() : null },
      reportsClosed,
    };
  });
}
