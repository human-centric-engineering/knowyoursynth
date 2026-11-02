/**
 * The pattern library as the admin sees it (`f-pattern-library` t-122).
 *
 * GET /api/v1/admin/library-patterns?role=&synth=&artist=&fidelity=&q=&page=&limit= — every library pattern, hidden
 *     synths' included, by name: the public view, when an admin last edited it, and every sound that lists it. `synth`
 *     keeps those on a sound of that synth, `artist` those inspired by that databank artist or a work they are credited
 *     on (t-126), and `q` matches a name or an Inspired by.
 * POST /api/v1/admin/library-patterns — a new pattern, on no sound yet. Checked whole (`library-edit.ts`); marked as
 *     an admin's, so the seed never writes it. Audited.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { paginatedResponse, successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import {
  AdminLibraryQuerySchema,
  createLibraryPattern,
  LibraryPatternCreateSchema,
  listAdminLibraryPatterns,
} from '@/lib/app/patterns/library-edit';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

export const GET = withAdminAuth(async (request) => {
  const query = validateQueryParams(request.nextUrl.searchParams, AdminLibraryQuerySchema);
  const { patterns, total } = await listAdminLibraryPatterns(query);
  return paginatedResponse(patterns, { page: query.page, limit: query.limit, total });
}, CATALOGUE_READ);

export const POST = withAdminAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const body = await validateRequestBody(request, LibraryPatternCreateSchema);

    const pattern = await createLibraryPattern(body, session.user.id);
    auditCatalogue(request, session.user.id, {
      action: 'library_pattern.create',
      entityType: 'library_pattern',
      entityId: pattern.id,
      entityName: pattern.name,
      before: null,
      after: { ...body },
    });

    log.info('Library pattern added by admin', {
      patternId: pattern.id,
      actorUserId: session.user.id,
    });
    return successResponse(pattern, undefined, { status: 201 });
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
