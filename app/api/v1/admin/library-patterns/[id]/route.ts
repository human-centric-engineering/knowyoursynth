/**
 * One library pattern, as the admin sees it and changes it (`f-pattern-library` t-122).
 *
 * GET /api/v1/admin/library-patterns/:id — the pattern, when an admin last edited it, and every sound that lists it.
 * PATCH /api/v1/admin/library-patterns/:id — any of its fields but its key. Merged into the stored pattern and checked
 *     whole before anything is written. Marks it edited, so the seed leaves it alone, and rewrites the riff of every
 *     sound it is the default of, marking those edited too. Audited: the pattern, and each sound whose riff changed.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import {
  editLibraryPattern,
  getAdminLibraryPattern,
  LibraryPatternEditSchema,
} from '@/lib/app/patterns/library-edit';
import { LibraryPatternIdSchema } from '@/lib/app/patterns/library-read';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: LibraryPatternIdSchema });

export const GET = withAdminAuth<{ id: string }>(async (_request, _session, { params }) => {
  const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
  const pattern = await getAdminLibraryPattern(id);
  if (!pattern) throw new NotFoundError('Pattern not found');
  return successResponse(pattern);
}, CATALOGUE_READ);

export const PATCH = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const body = await validateRequestBody(request, LibraryPatternEditSchema);

    const { change, sounds } = await editLibraryPattern(id, body);
    if (change)
      auditCatalogue(request, session.user.id, {
        action: 'library_pattern.update',
        entityType: 'library_pattern',
        entityId: id,
        entityName: change.name,
        before: change.before,
        after: change.after,
      });
    for (const s of sounds)
      auditCatalogue(request, session.user.id, {
        action: 'synth_sound.update',
        entityType: 'synth_sound',
        entityId: `${s.synthId}/${s.slug}`,
        entityName: s.name,
        before: { phrase: s.before },
        after: { phrase: s.after },
      });

    log.info('Library pattern changed by admin', {
      patternId: id,
      changed: change !== null,
      soundsRewritten: sounds.length,
      actorUserId: session.user.id,
    });
    return successResponse(await getAdminLibraryPattern(id));
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
