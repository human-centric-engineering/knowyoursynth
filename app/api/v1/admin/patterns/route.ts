/**
 * The moderation queue for shared patterns, for admins (`f-step-sequencer` t-83).
 *
 * GET /api/v1/admin/patterns?view=reported — patterns with open reports, the longest-waiting first, each with its open
 *     reports and its owner's username. `view=unlisted`: patterns an admin unlisted, the most recent first. **Never who
 *     filed a report.**
 *
 * See `lib/app/patterns/moderation.ts`.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import {
  listPatternModerationQueue,
  PATTERN_MODERATION_ADMIN,
} from '@/lib/app/patterns/moderation';
import { MODERATION_VIEWS } from '@/lib/app/sounds/report-data';

const QuerySchema = z.object({ view: z.enum(MODERATION_VIEWS).default('reported') });

export const GET = withAdminAuth(async (request) => {
  const { view } = validateQueryParams(new URL(request.url).searchParams, QuerySchema);
  return successResponse(await listPatternModerationQueue(view));
}, PATTERN_MODERATION_ADMIN);
