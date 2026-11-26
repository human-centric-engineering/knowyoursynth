/**
 * The synth families, for admins (`f-synth-families` t-323).
 *
 * GET  /api/v1/admin/synths/families — every stored family, served or not, by name: the seed file's shape
 *      (`FamilyFileSchema`) and when an admin last saved it.
 * POST /api/v1/admin/synths/families — create one: `{ id, name, defaultMember, members }`, its members in toggle
 *      order. Refused with every problem it would have (`checkFamilies`), or 409 when the id is taken. Marks it edited,
 *      so the seed leaves it alone. Audited.
 *
 * See `lib/app/families/edit.ts` for the rules.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import {
  familyContent,
  FamilyCreateSchema,
  listAdminFamilies,
  saveFamily,
} from '@/lib/app/families/edit';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

export const GET = withAdminAuth(
  async () => successResponse(await listAdminFamilies()),
  CATALOGUE_READ
);

export const POST = withAdminAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const { id, ...body } = await validateRequestBody(request, FamilyCreateSchema);

    const { after } = await saveFamily(id, body, 'create');
    auditCatalogue(request, session.user.id, {
      action: 'synth_family.create',
      entityType: 'synth_family',
      entityId: id,
      entityName: after.name,
      before: null,
      after: { ...familyContent(after) },
    });

    log.info('Synth family created by admin', { familyId: id, actorUserId: session.user.id });
    return successResponse(after, undefined, { status: 201 });
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
