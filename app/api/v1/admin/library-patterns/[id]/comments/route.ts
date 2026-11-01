/**
 * Admins' comments on a library pattern (`f-pattern-library` t-156), shown only in admin.
 *
 * GET /api/v1/admin/library-patterns/:id/comments — the comments, oldest first, each with its author and date.
 * POST /api/v1/admin/library-patterns/:id/comments — `{ body }`: add one as the signed-in admin. Audited.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import {
  addLibraryPatternComment,
  listLibraryPatternComments,
  PatternCommentSchema,
} from '@/lib/app/patterns/library-edit';
import { LibraryPatternIdSchema } from '@/lib/app/patterns/library-read';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: LibraryPatternIdSchema });

export const GET = withAdminAuth<{ id: string }>(async (_request, _session, { params }) => {
  const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
  const comments = await listLibraryPatternComments(id);
  if (!comments) throw new NotFoundError('Pattern not found');
  return successResponse(comments);
}, CATALOGUE_READ);

export const POST = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const { body } = await validateRequestBody(request, PatternCommentSchema);

    const { comment, name } = await addLibraryPatternComment(id, session.user.id, body);
    auditCatalogue(request, session.user.id, {
      action: 'library_pattern.comment',
      entityType: 'library_pattern',
      entityId: id,
      entityName: name,
      before: null,
      after: { comment: body },
    });

    log.info('Library pattern comment added by admin', {
      patternId: id,
      commentId: comment.id,
      actorUserId: session.user.id,
    });
    return successResponse(comment, undefined, { status: 201 });
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
