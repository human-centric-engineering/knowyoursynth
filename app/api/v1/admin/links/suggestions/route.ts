/**
 * The link suggestion queue, for admins (`f-link-suggestions` t-185).
 *
 * GET /api/v1/admin/links/suggestions?status=PENDING — suggestions newest first, each with what it is about (its name
 *     null once that has been removed) and who made it (null once their account is erased). `status` narrows to one
 *     of PENDING, ACCEPTED, DECLINED; without it, every one.
 *
 * See `lib/app/links/suggestions.ts`.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { LINK_SUGGESTION_ADMIN } from '@/lib/app/links/admin-route';
import { LINK_SUGGESTION_STATUSES } from '@/lib/app/links/suggestion-data';
import { listLinkSuggestions } from '@/lib/app/links/suggestions';

const QuerySchema = z.object({ status: z.enum(LINK_SUGGESTION_STATUSES).optional() });

export const GET = withAdminAuth(async (request) => {
  const { status } = validateQueryParams(new URL(request.url).searchParams, QuerySchema);
  return successResponse(await listLinkSuggestions(status));
}, LINK_SUGGESTION_ADMIN);
