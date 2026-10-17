/**
 * Moderate one shared sound, for admins (`f-sharing` h4).
 *
 * POST /api/v1/admin/sounds/:id — `{ action }`, one of:
 *      `unlist` takes it out of every public read and stops its owner sharing it again; its open reports are actioned;
 *      `restore` puts an unlisted sound back as its owner left it;
 *      `dismiss` closes its open reports and changes nothing else.
 *      Nothing to change (already unlisted, not unlisted, no open reports) is a 409. Audited as `user_sound.<action>`.
 *
 * See `lib/app/sounds/moderation.ts`.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { computeChanges, logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { getClientIP } from '@/lib/security/ip';
import { moderateSound, SOUND_MODERATION_ADMIN } from '@/lib/app/sounds/moderation';
import { ModerationActionSchema } from '@/lib/app/sounds/report-data';
import { UserSoundIdSchema } from '@/lib/app/sounds/data';

const ParamsSchema = z.object({ id: UserSoundIdSchema });

export const POST = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
  const { action } = await validateRequestBody(request, ModerationActionSchema);

  const result = await moderateSound(session.user.id, id, action);
  logAdminAction({
    userId: session.user.id,
    action: `user_sound.${action}`,
    entityType: 'user_sound',
    entityId: id,
    entityName: result.name,
    changes: computeChanges(
      { ...result.before, reportsClosed: 0 },
      { ...result.after, reportsClosed: result.reportsClosed }
    ),
    clientIp: getClientIP(request),
  });

  log.info('Shared sound moderated', {
    soundId: id,
    action,
    reportsClosed: result.reportsClosed,
    actorUserId: session.user.id,
  });
  return successResponse({ id, unlisted: result.after.unlistedAt !== null });
}, SOUND_MODERATION_ADMIN);
