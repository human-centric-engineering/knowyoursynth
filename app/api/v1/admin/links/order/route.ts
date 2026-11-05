/**
 * The order of an owner's own videos, for admins (`f-videos-and-links` t-179).
 *
 * PUT /api/v1/admin/links/order — `{ owner: { kind, id }, ids }`: every one of the owner's links marked ours, once, in
 *     the order to show them. Anything else is refused and nothing moves. A reorder that moves nothing is not audited.
 *
 * See `lib/app/links/admin.ts` for the rules.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { LinkReorderSchema, reorderOurLinks } from '@/lib/app/links/admin';
import { auditReorder, LINKS_ADMIN } from '@/lib/app/links/admin-route';

export const PUT = withAdminAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const { owner, ids } = await validateRequestBody(request, LinkReorderSchema);
    const { before, after, changed } = await reorderOurLinks(owner, ids);
    if (changed) auditReorder(request, session.user.id, { owner, before, after });
    log.info('Own videos reordered by admin', {
      owner: `${owner.kind}:${owner.id}`,
      changed,
      actorUserId: session.user.id,
    });
    return successResponse({ ids: after });
  },
  { ...LINKS_ADMIN, writesSharedSettings: true }
);
