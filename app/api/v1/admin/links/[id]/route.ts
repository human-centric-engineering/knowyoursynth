/**
 * One video or link, for admins (`f-videos-and-links` t-179).
 *
 * GET    /api/v1/admin/links/:id — the link, with what it is about.
 * PATCH  /api/v1/admin/links/:id — change any of `url`, `kind`, `title`, `ours`, `rating`. Its owner never changes. A
 *        new URL drops what was read from the old one. A save that changes nothing writes and audits nothing.
 * DELETE /api/v1/admin/links/:id — remove it. Audited.
 *
 * See `lib/app/links/admin.ts` for the rules.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validatePathParam, validateRequestBody } from '@/lib/api/validation';
import { cuidSchema } from '@/lib/validations/common';
import { getRouteLogger } from '@/lib/api/context';
import { deleteLink, getAdminLink, LinkUpdateSchema, updateLink } from '@/lib/app/links/admin';
import { auditLink, LINKS_ADMIN } from '@/lib/app/links/admin-route';

export const GET = withAdminAuth<{ id: string }>(async (_request, _session, { params }) => {
  const id = validatePathParam((await params).id, cuidSchema);
  const link = await getAdminLink(id);
  if (!link) throw new NotFoundError('Link not found');
  return successResponse(link);
}, LINKS_ADMIN);

export const PATCH = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const id = validatePathParam((await params).id, cuidSchema);
    const body = await validateRequestBody(request, LinkUpdateSchema);
    const { before, after, changed } = await updateLink(id, body);
    if (changed) auditLink(request, session.user.id, { action: 'update', before, after });
    log.info('Link saved by admin', { linkId: id, changed, actorUserId: session.user.id });
    return successResponse(after);
  },
  { ...LINKS_ADMIN, writesSharedSettings: true }
);

export const DELETE = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const id = validatePathParam((await params).id, cuidSchema);
    const before = await deleteLink(id);
    auditLink(request, session.user.id, { action: 'delete', before, after: null });
    log.info('Link removed by admin', { linkId: id, actorUserId: session.user.id });
    return successResponse({ id });
  },
  { ...LINKS_ADMIN, writesSharedSettings: true }
);
