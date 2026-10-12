/**
 * The catalogue as the admin sees it (`f-panel-designs`, `f-catalogue-admin`).
 *
 * GET /api/v1/admin/synths — every synth in the catalogue, listed or not, in catalogue order: its design and the
 *     maker's approval behind it, its descriptive columns, when an admin last edited it, and how many sounds and notes
 *     it has. See `lib/app/catalogue/edit.ts`.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { listAdminSynths } from '@/lib/app/catalogue/edit';
import { CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

export const GET = withAdminAuth(async () => {
  return successResponse(await listAdminSynths());
}, CATALOGUE_READ);
