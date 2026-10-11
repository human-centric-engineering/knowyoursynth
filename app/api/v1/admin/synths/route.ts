/**
 * Every synth's panel design, for the admin Designs page (D11, `f-panel-designs`).
 *
 * GET /api/v1/admin/synths — every synth in the catalogue, listed or not, with its design and the maker's approval
 *     behind it. See `lib/app/catalogue/designs.ts`.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { listSynthDesigns } from '@/lib/app/catalogue/designs';

const CATALOGUE_ADMIN = {
  // Ownership: no ownership decision — catalogue configuration every org shares, admin only. See RouteOwnership in lib/auth/guards.ts.
  ownership: {
    decidedBy: 'nothing',
    because:
      'The catalogue is product configuration shared by every org (GLOBAL_CONFIG_MODELS); no row belongs to a user, and the guard already limits this to admins.',
  },
} as const;

export const GET = withAdminAuth(async () => {
  return successResponse(await listSynthDesigns());
}, CATALOGUE_ADMIN);
