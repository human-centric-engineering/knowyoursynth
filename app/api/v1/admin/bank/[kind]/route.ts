/**
 * The databank, for admins (`f-databank` t-36).
 *
 * GET  /api/v1/admin/bank/:kind — every maker, instrument, artist or song (`makers`, `instruments`, `artists`,
 *      `songs`): id, name, a detail line and when an admin last edited it. Sorted by name.
 * POST /api/v1/admin/bank/:kind — create one, the row in the files' shape with its id (`lib/app/bank/data.ts`; an
 *      artist without `memberOf`). Refused with every reference it would break, or 409 when the id is taken. Marks the
 *      row edited, so the seed leaves it alone. Audited.
 *
 * See `lib/app/bank/admin.ts` for the rules.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { BankKindSchema, bankCreateSchema, listAdminBank, saveBankRow } from '@/lib/app/bank/admin';
import { auditBank, BANK_ADMIN } from '@/lib/app/bank/admin-route';

const ParamsSchema = z.object({ kind: BankKindSchema });

export const GET = withAdminAuth<{ kind: string }>(async (_request, _session, { params }) => {
  const { kind } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
  return successResponse(await listAdminBank(kind));
}, BANK_ADMIN);

export const POST = withAdminAuth<{ kind: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { kind } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const { id, ...body } = await validateRequestBody(request, bankCreateSchema(kind));

    const { after } = await saveBankRow(kind, id, body, 'create');
    auditBank(request, session.user.id, {
      action: 'create',
      kind,
      id,
      before: null,
      after,
    });

    log.info('Databank row created by admin', { kind, id, actorUserId: session.user.id });
    return successResponse(after, undefined, { status: 201 });
  },
  { ...BANK_ADMIN, writesSharedSettings: true }
);
