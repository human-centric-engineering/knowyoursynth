/**
 * One synth, for the catalogue editor (`f-catalogue-admin`).
 *
 * GET /api/v1/admin/synths/:id — the synth, listed or not, with every stored sound (and what, if anything, stops the
 *     public page serving it), its lineage, its notes and the limits shared by every panel.
 * PATCH /api/v1/admin/synths/:id — `{ name?, maker?, year?, heritage?, summary?, listed? }`. A content change marks the
 *     synth edited, so the seed leaves it alone; `listed` alone does not (placement). Audited.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { editSynth, getAdminSynth, SynthEditSchema, SynthIdSchema } from '@/lib/app/catalogue/edit';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: SynthIdSchema });

export const GET = withAdminAuth<{ id: string }>(async (_request, _session, { params }) => {
  const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
  const detail = await getAdminSynth(id);
  if (!detail) throw new NotFoundError('Synth not found');
  return successResponse(detail);
}, CATALOGUE_READ);

export const PATCH = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const body = await validateRequestBody(request, SynthEditSchema);

    const { before, after } = await editSynth(id, body);
    const changed = auditCatalogue(request, session.user.id, {
      action: 'synth.update',
      entityType: 'synth',
      entityId: id,
      entityName: `${after.maker} ${after.name}`,
      before,
      after,
    });

    log.info('Synth changed by admin', { synthId: id, changed, actorUserId: session.user.id });
    return successResponse({ id, ...after });
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
