/**
 * Reporting a shared sound (`f-sharing` h4). Server-side only.
 *
 * A signed-in user reports someone else's link or published sound, by its public address. **One open report per person
 * per sound:** a second one from them updates the first, so a pile-on from one account is one report in the queue. The
 * check and the write run under a lock on the sound's row, so two sent together cannot both create one.
 *
 * Refused: a sound nobody else can open (private, unlisted, unknown, malformed), which is the public read's 404 and says
 * nothing about which; and your own (`OWN_SOUND`, 400). Capped per user on top of the proxy's section cap
 * (`reportLimiter`), as `suggestionLimiter` caps suggestions.
 *
 * The reporter is never shown to anyone but themselves (their export). See `lib/app/sounds/moderation.ts` for the queue.
 */
import { prisma } from '@/lib/db/client';
import { APIError, NotFoundError } from '@/lib/api/errors';
import { createRateLimiter } from '@/lib/security/rate-limit';
import { SharedSlugSchema } from '@/lib/app/sounds/data';
import type { ReportSound } from '@/lib/app/sounds/report-data';

/**
 * The per-user sub-cap on reporting: 20 a day. More than anyone flagging what they come across needs, and few enough
 * that one account cannot bury the queue.
 */
export const reportLimiter = createRateLimiter({
  interval: 24 * 60 * 60 * 1000,
  maxRequests: 20,
});

/** The limiter's key for a user. */
export const reportLimitKey = (userId: string): string => `sound-report:${userId}`;

/** Report the shared sound at `slug`, or update the caller's open report on it. */
export async function reportSound(
  userId: string,
  slug: string,
  input: ReportSound
): Promise<{ id: string; created: boolean }> {
  if (!SharedSlugSchema.safeParse(slug).success) throw new NotFoundError('Patch not found');
  const sound = await prisma.userSound.findUnique({
    where: { slug },
    select: { id: true, userId: true, visibility: true, unlistedAt: true },
  });
  if (!sound || sound.visibility === 'private' || sound.unlistedAt)
    throw new NotFoundError('Patch not found');
  if (sound.userId === userId)
    throw new APIError("You can't report your own patch.", 'OWN_SOUND', 400);

  const note = input.note || null;
  return prisma.$transaction(async (tx) => {
    // Orders reports on this one sound, so the open-report check below and the create cannot interleave.
    await tx.$queryRaw`SELECT id FROM user_sound WHERE id = ${sound.id} FOR UPDATE`;
    // Read again under the lock: an unlist or a stop-sharing that landed since the read above refuses this too.
    const locked = await tx.userSound.findUnique({
      where: { id: sound.id },
      select: { visibility: true, unlistedAt: true },
    });
    if (!locked || locked.visibility === 'private' || locked.unlistedAt)
      throw new NotFoundError('Patch not found');
    const open = await tx.soundReport.findFirst({
      where: { soundId: sound.id, reporterId: userId, status: 'open' },
      select: { id: true },
    });
    if (open) {
      await tx.soundReport.update({
        where: { id: open.id },
        data: { reason: input.reason, note },
      });
      return { id: open.id, created: false };
    }
    const row = await tx.soundReport.create({
      data: { soundId: sound.id, reporterId: userId, reason: input.reason, note },
      select: { id: true },
    });
    return { id: row.id, created: true };
  });
}
