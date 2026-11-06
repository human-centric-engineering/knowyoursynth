/**
 * Decide one link suggestion, for admins (`f-link-suggestions` t-185).
 *
 * POST /api/v1/admin/links/suggestions/:id — one of:
 *      `{ action: 'accept', kind?, title? }` makes the link (the links admin's create path: parsed, read from its
 *      provider, audited as `external_link.create`) and records it; `kind` and `title` replace what the user gave;
 *      `{ action: 'decline', reason }` keeps the reason.
 *      Only a pending suggestion can be decided: otherwise 409. Accepting one whose target has been removed is a 404.
 *      Audited as `link_suggestion.<action>`.
 *
 * See `lib/app/links/suggestions.ts`.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { computeChanges, logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { getClientIP } from '@/lib/security/ip';
import {
  auditLink,
  LINK_SUGGESTION_ADMIN,
  LINK_SUGGESTION_ENTITY,
} from '@/lib/app/links/admin-route';
import { LinkSuggestionDecisionSchema } from '@/lib/app/links/suggestion-data';
import { decideLinkSuggestion } from '@/lib/app/links/suggestions';

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/** The fields a decision changes, for the audit diff. */
const decided = (row: { status: string; linkId: string | null; reason: string | null }) => ({
  status: row.status,
  linkId: row.linkId,
  reason: row.reason,
});

export const POST = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const decision = await validateRequestBody(request, LinkSuggestionDecisionSchema);

    const { before, after, created } = await decideLinkSuggestion(id, decision);
    if (created)
      auditLink(request, session.user.id, { action: 'create', before: null, after: created });
    logAdminAction({
      userId: session.user.id,
      action: `${LINK_SUGGESTION_ENTITY}.${decision.action}`,
      entityType: LINK_SUGGESTION_ENTITY,
      entityId: id,
      entityName: before.title ?? before.url,
      changes: computeChanges(decided(before), decided(after)),
      clientIp: getClientIP(request),
    });

    log.info('Link suggestion decided', {
      suggestionId: id,
      action: decision.action,
      linkId: after.linkId,
      actorUserId: session.user.id,
    });
    return successResponse({
      id: after.id,
      status: after.status,
      linkId: after.linkId,
      reason: after.reason,
    });
  },
  { ...LINK_SUGGESTION_ADMIN, writesSharedSettings: true }
);
