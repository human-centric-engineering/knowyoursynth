/**
 * One databank row, for admins (`f-databank` t-36).
 *
 * GET    /api/v1/admin/bank/:kind/:id — the row in the files' shape, when an admin last edited it, and for an artist
 *        the groups that list them (shown, not edited here).
 * PUT    /api/v1/admin/bank/:kind/:id — replace it whole, joins included; the id is the URL's and cannot change.
 *        Refused with every reference it would break. A save that changes nothing writes and audits nothing.
 *        Otherwise marks the row edited, so the seed leaves it alone, and is audited.
 * DELETE /api/v1/admin/bank/:kind/:id — remove it and its own joins. Refused with 409, naming what still points at
 *        it, until nothing does. Recorded so the seed does not re-create it. Audited.
 *
 * See `lib/app/bank/admin.ts` for the rules.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { BankIdSchema } from '@/lib/app/bank/data';
import {
  BankKindSchema,
  bankUpdateSchema,
  getAdminBankRow,
  removeBankRow,
  saveBankRow,
} from '@/lib/app/bank/admin';
import { auditBank, BANK_ADMIN } from '@/lib/app/bank/admin-route';

const ParamsSchema = z.object({ kind: BankKindSchema, id: BankIdSchema });

export const GET = withAdminAuth<{ kind: string; id: string }>(
  async (_request, _session, { params }) => {
    const { kind, id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const detail = await getAdminBankRow(kind, id);
    if (!detail) throw new NotFoundError('Databank row not found');
    return successResponse(detail);
  },
  BANK_ADMIN
);

export const PUT = withAdminAuth<{ kind: string; id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { kind, id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const body = await validateRequestBody(request, bankUpdateSchema(kind));

    const { before, after, changed } = await saveBankRow(kind, id, body, 'update');
    if (changed)
      auditBank(request, session.user.id, {
        action: 'update',
        kind,
        id,
        before,
        after,
      });

    log.info('Databank row saved by admin', { kind, id, changed, actorUserId: session.user.id });
    return successResponse(after);
  },
  { ...BANK_ADMIN, writesSharedSettings: true }
);

export const DELETE = withAdminAuth<{ kind: string; id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { kind, id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);

    const { before } = await removeBankRow(kind, id);
    auditBank(request, session.user.id, {
      action: 'delete',
      kind,
      id,
      before,
      after: null,
    });

    log.info('Databank row removed by admin', { kind, id, actorUserId: session.user.id });
    return successResponse({ id, removed: true });
  },
  { ...BANK_ADMIN, writesSharedSettings: true }
);
