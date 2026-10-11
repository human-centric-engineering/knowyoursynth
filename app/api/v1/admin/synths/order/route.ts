/**
 * Put the catalogue in order (`f-catalogue-admin`).
 *
 * PUT /api/v1/admin/synths/order — `{ ids: string[] }`, every synth exactly once, first shown first. Hidden synths are
 *     in the order too. Ordering is placement, not content: it does not mark a synth edited, so the seed keeps
 *     updating its descriptive columns. Audited with the order before and after.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { OrderSchema, reorderSynths } from '@/lib/app/catalogue/edit';
import { auditCatalogue, CATALOGUE_WRITE } from '@/lib/app/catalogue/admin-route';

export const PUT = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const { ids } = await validateRequestBody(request, OrderSchema);

  const { before, after } = await reorderSynths(ids);
  const changed = auditCatalogue(request, session.user.id, {
    action: 'synth.reorder',
    entityType: 'synth',
    entityId: 'catalogue',
    entityName: 'Catalogue order',
    before: { order: before },
    after: { order: after },
  });

  log.info('Catalogue reordered by admin', { changed, actorUserId: session.user.id });
  return successResponse({ ids: after });
}, CATALOGUE_WRITE);
