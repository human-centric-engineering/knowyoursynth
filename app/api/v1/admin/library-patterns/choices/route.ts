/**
 * What the pattern library's admin page chooses from (`f-pattern-library` t-126).
 *
 * GET /api/v1/admin/library-patterns/choices — every synth, databank artist and work (each with its parts), by name:
 *     what a pattern's Inspired by links to, and what the list filters on. One read, so the page makes no per-row calls.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { listLibraryPatternChoices } from '@/lib/app/patterns/library-edit';
import { CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

export const GET = withAdminAuth(
  async () => successResponse(await listLibraryPatternChoices()),
  CATALOGUE_READ
);
