/**
 * Videos and links, for admins (`f-videos-and-links` t-179).
 *
 * GET  /api/v1/admin/links?owner=&instrument=|sound=|song=|artist=&provider=&ours=&page=&limit= — every link, newest
 *      edit first, with what it is about. `owner` is a kind (`instrument`, `sound`, `song`, `artist`); at most one owner
 *      filter beside it; a sound is `<synth>/<patch>`. Paginated (limit ≤ 100).
 * POST /api/v1/admin/links — add one: `{ owner: { kind, id }, url, kind, title, ours?, rating? }`. The URL is parsed
 *      for its provider; a URL already linked to that owner is a 409. Audited.
 *
 * See `lib/app/links/admin.ts` for the rules, `.context/app/links.md` for the design.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { paginatedResponse, successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import {
  AdminLinkQuerySchema,
  createLink,
  LinkCreateSchema,
  listAdminLinks,
} from '@/lib/app/links/admin';
import { auditLink, LINKS_ADMIN } from '@/lib/app/links/admin-route';

export const GET = withAdminAuth(async (request) => {
  const query = validateQueryParams(request.nextUrl.searchParams, AdminLinkQuerySchema);
  const { links, page, limit, total } = await listAdminLinks(query);
  return paginatedResponse(links, { page, limit, total });
}, LINKS_ADMIN);

export const POST = withAdminAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const body = await validateRequestBody(request, LinkCreateSchema);
    const link = await createLink(body);
    auditLink(request, session.user.id, { action: 'create', before: null, after: link });
    log.info('Link added by admin', {
      linkId: link.id,
      owner: `${link.owner.kind}:${link.owner.id}`,
      provider: link.provider,
      actorUserId: session.user.id,
    });
    return successResponse(link, undefined, { status: 201 });
  },
  { ...LINKS_ADMIN, writesSharedSettings: true }
);
