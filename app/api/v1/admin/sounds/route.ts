/**
 * The moderation queue for shared sounds, for admins (`f-sharing` h4).
 *
 * GET /api/v1/admin/sounds?view=reported — sounds with open reports, the longest-waiting first, each with its open
 *     reports and its owner's username. `view=unlisted`: sounds an admin unlisted, the most recent first. **Never who
 *     filed a report.**
 *
 * See `lib/app/sounds/moderation.ts`.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { listModerationQueue, SOUND_MODERATION_ADMIN } from '@/lib/app/sounds/moderation';
import { MODERATION_VIEWS } from '@/lib/app/sounds/report-data';

const QuerySchema = z.object({ view: z.enum(MODERATION_VIEWS).default('reported') });

export const GET = withAdminAuth(async (request) => {
  const { view } = validateQueryParams(new URL(request.url).searchParams, QuerySchema);
  return successResponse(await listModerationQueue(view));
}, SOUND_MODERATION_ADMIN);
