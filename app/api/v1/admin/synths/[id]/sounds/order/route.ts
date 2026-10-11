/**
 * Put a synth's library in order (`f-catalogue-admin`).
 *
 * PUT /api/v1/admin/synths/:id/sounds/order — `{ ids: string[] }`, every sound id on the synth exactly once. Ordering
 *     is placement, not content: it does not mark a sound edited. Audited with the order before and after.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { OrderSchema, reorderSounds, SynthIdSchema } from '@/lib/app/catalogue/edit';
import { auditCatalogue, CATALOGUE_WRITE } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: SynthIdSchema });

export const PUT = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
  const { ids } = await validateRequestBody(request, OrderSchema);

  const { before, after } = await reorderSounds(id, ids);
  const changed = auditCatalogue(request, session.user.id, {
    action: 'synth_sound.reorder',
    entityType: 'synth_sound',
    entityId: id,
    entityName: `${id} library order`,
    before: { order: before },
    after: { order: after },
  });

  log.info('Sound library reordered by admin', {
    synthId: id,
    changed,
    actorUserId: session.user.id,
  });
  return successResponse({ ids: after });
}, CATALOGUE_WRITE);
