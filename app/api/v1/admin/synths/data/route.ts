/**
 * The catalogue against the seed (`f-catalogue-admin`, t-32).
 *
 * GET /api/v1/admin/synths/data — every catalogue row grouped by synth, each marked as matching what the seed last
 *     planned for it, differing from it, edited by an admin (and whether that edit still matches), or on one side
 *     only. Computed from the seed's record, never the seed files (D13). See `lib/app/catalogue/reconcile.ts`.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getCatalogueReconciliation } from '@/lib/app/catalogue/reconcile';
import { CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

export const GET = withAdminAuth(async () => {
  return successResponse(await getCatalogueReconciliation());
}, CATALOGUE_READ);
