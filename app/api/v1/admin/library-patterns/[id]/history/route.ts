/**
 * A library pattern's audit history (`f-pattern-library` t-156, `pattern-library.md`, The provenance panel).
 *
 * GET /api/v1/admin/library-patterns/:id/history — the last 100 audited changes to it, newest first: what changed,
 *     who changed it and when.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { getLibraryPatternHistory } from '@/lib/app/patterns/library-edit';
import { LibraryPatternIdSchema } from '@/lib/app/patterns/library-read';
import { CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: LibraryPatternIdSchema });

export const GET = withAdminAuth<{ id: string }>(async (_request, _session, { params }) => {
  const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
  const history = await getLibraryPatternHistory(id);
  if (!history) throw new NotFoundError('Pattern not found');
  return successResponse(history);
}, CATALOGUE_READ);
