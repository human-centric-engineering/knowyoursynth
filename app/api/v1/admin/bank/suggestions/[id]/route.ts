/**
 * Decide one synth suggestion, for admins (`f-databank` t-37).
 *
 * POST /api/v1/admin/bank/suggestions/:id — one of:
 *      `{ action: 'accept', instrument }` creates the instrument (the databank's create path: checked, marked edited,
 *      audited as `bank_instrument.create`) and records it;
 *      `{ action: 'merge', instrumentId }` records that it is already in the databank;
 *      `{ action: 'decline', reason }` keeps the reason.
 *      Only a pending suggestion can be decided: otherwise 409. Audited as `synth_suggestion.<action>`.
 *
 * See `lib/app/bank/suggestions.ts`.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { computeChanges, logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { getClientIP } from '@/lib/security/ip';
import { auditBank, SUGGESTION_ADMIN } from '@/lib/app/bank/admin-route';
import { SuggestionDecisionSchema } from '@/lib/app/bank/suggestion-data';
import { decideSuggestion } from '@/lib/app/bank/suggestions';

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/** The fields a decision changes, for the audit diff. */
const decided = (row: { status: string; instrumentId: string | null; reason: string | null }) => ({
  status: row.status,
  instrumentId: row.instrumentId,
  reason: row.reason,
});

export const POST = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const decision = await validateRequestBody(request, SuggestionDecisionSchema);

    const { before, after, created } = await decideSuggestion(id, decision);
    if (created)
      auditBank(request, session.user.id, {
        action: 'create',
        kind: 'instruments',
        id: created.after.id,
        before: null,
        after: created.after,
      });
    logAdminAction({
      userId: session.user.id,
      action: `synth_suggestion.${decision.action}`,
      entityType: 'synth_suggestion',
      entityId: id,
      entityName: before.name,
      changes: computeChanges(decided(before), decided(after)),
      clientIp: getClientIP(request),
    });

    log.info('Synth suggestion decided', {
      suggestionId: id,
      action: decision.action,
      instrumentId: after.instrumentId,
      actorUserId: session.user.id,
    });
    return successResponse({
      id: after.id,
      status: after.status,
      instrumentId: after.instrumentId,
      reason: after.reason,
    });
  },
  { ...SUGGESTION_ADMIN, writesSharedSettings: true }
);
