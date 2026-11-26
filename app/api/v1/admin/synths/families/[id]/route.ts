/**
 * One synth family, for admins (`f-synth-families` t-323).
 *
 * GET    /api/v1/admin/synths/families/:id — the stored family, served or not.
 * PUT    /api/v1/admin/synths/families/:id — replace it whole: `{ name, defaultMember, members }`, its members in toggle
 *        order. A member left out is removed. Refused with every problem it would have (`checkFamilies`). Marks the
 *        family and every member it keeps edited, so the seed leaves them alone. Audited when anything changed,
 *        claiming a seed family from the seed included.
 * DELETE /api/v1/admin/synths/families/:id — remove it and its members. Audited. The seed creates it again while its
 *        data still has it.
 *
 * See `lib/app/families/edit.ts` for the rules.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { NotFoundError } from '@/lib/api/errors';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import {
  deleteFamily,
  familyContent,
  FamilyEditSchema,
  FamilyIdSchema,
  getAdminFamily,
  saveFamily,
} from '@/lib/app/families/edit';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: FamilyIdSchema });

export const GET = withAdminAuth<{ id: string }>(async (_request, _session, { params }) => {
  const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
  const family = await getAdminFamily(id);
  if (!family) throw new NotFoundError('Family not found');
  return successResponse(family);
}, CATALOGUE_READ);

export const PUT = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const body = await validateRequestBody(request, FamilyEditSchema);

    const { before, after } = await saveFamily(id, body, 'update');
    const changed = auditCatalogue(request, session.user.id, {
      action: 'synth_family.update',
      entityType: 'synth_family',
      entityId: id,
      entityName: after.name,
      // Whether the seed still writes it, so a save that only claims a seed family is audited too.
      before: before && { ...familyContent(before), seedWrites: before.editedAt === null },
      after: { ...familyContent(after), seedWrites: after.editedAt === null },
    });

    log.info('Synth family changed by admin', {
      familyId: id,
      changed,
      actorUserId: session.user.id,
    });
    return successResponse(after);
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);

export const DELETE = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);

    const before = await deleteFamily(id);
    auditCatalogue(request, session.user.id, {
      action: 'synth_family.delete',
      entityType: 'synth_family',
      entityId: id,
      entityName: before.name,
      before: { ...familyContent(before) },
      after: {},
    });

    log.info('Synth family deleted by admin', { familyId: id, actorUserId: session.user.id });
    return successResponse({ id, deleted: true });
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
