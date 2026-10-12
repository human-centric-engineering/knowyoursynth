/**
 * Replace a synth's history section (`f-catalogue-admin`).
 *
 * PUT /api/v1/admin/synths/:id/lineage — `{ title, intro, timeline, relatives, users?, note? }`, the shape of the
 *     seed's lineage file less its `synth`. Creates the lineage if the synth has none. Marks it edited, so the seed
 *     leaves it alone. Audited.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { LineageEditSchema, setLineage, SynthIdSchema } from '@/lib/app/catalogue/edit';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: SynthIdSchema });

export const PUT = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const body = await validateRequestBody(request, LineageEditSchema);

    const { before, after } = await setLineage(id, body);
    const changed = auditCatalogue(request, session.user.id, {
      action: before ? 'synth_lineage.update' : 'synth_lineage.create',
      entityType: 'synth_lineage',
      entityId: id,
      entityName: after.title,
      before,
      after,
    });

    log.info('Lineage changed by admin', { synthId: id, changed, actorUserId: session.user.id });
    return successResponse(after);
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
