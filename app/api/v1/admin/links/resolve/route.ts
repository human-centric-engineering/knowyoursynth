/**
 * What a link's provider says about it, for the admin form (`f-videos-and-links` t-180).
 *
 * POST /api/v1/admin/links/resolve — `{ url }` → `{ url, provider, title, thumbnailUrl, embedUrl }`: the URL as it
 *      would be stored, and its title and picture as its provider gives them (each null when it gives none). Writes
 *      nothing. A URL the parser refuses is a 400 with its reason. A POST, not a GET, so the URL stays out of logs.
 *
 * Only the four oEmbed endpoints and an artist's own Bandcamp page are ever read; a plain link is not. See
 * `lib/app/links/details.ts` for the rules, `.context/app/links.md` for the design.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { LinkResolveSchema, suggestLinkDetails } from '@/lib/app/links/admin';
import { LINKS_ADMIN } from '@/lib/app/links/admin-route';

export const POST = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const { url } = await validateRequestBody(request, LinkResolveSchema);
  const suggestion = await suggestLinkDetails(url);
  log.info('Link details read for admin', {
    provider: suggestion.provider,
    found: suggestion.title !== null,
    actorUserId: session.user.id,
  });
  return successResponse(suggestion);
}, LINKS_ADMIN);
