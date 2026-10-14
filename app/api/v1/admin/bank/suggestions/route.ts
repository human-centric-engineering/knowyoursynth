/**
 * The synth suggestion queue, for admins (`f-databank` t-37).
 *
 * GET /api/v1/admin/bank/suggestions?status=PENDING — suggestions newest first, each with who made it (null once their
 *     account is erased). `status` narrows to one of PENDING, ACCEPTED, MERGED, DECLINED; without it, every one.
 *
 * See `lib/app/bank/suggestions.ts`.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { SUGGESTION_ADMIN } from '@/lib/app/bank/admin-route';
import { SUGGESTION_STATUSES } from '@/lib/app/bank/suggestion-data';
import { listSuggestions } from '@/lib/app/bank/suggestions';

const QuerySchema = z.object({ status: z.enum(SUGGESTION_STATUSES).optional() });

export const GET = withAdminAuth(async (request) => {
  const { status } = validateQueryParams(request.nextUrl.searchParams, QuerySchema);
  return successResponse(await listSuggestions(status));
}, SUGGESTION_ADMIN);
