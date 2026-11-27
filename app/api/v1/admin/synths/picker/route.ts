/**
 * The site's synth picker settings, for admins (`f-synth-picker` t-329).
 *
 * GET /api/v1/admin/synths/picker — `SitePickerSettings`: the saved row's, or the defaults when none is saved.
 * PUT /api/v1/admin/synths/picker — the whole `SitePickerSettings`, checked with `SitePickerSettingsSchema`. Every
 *     visitor who has not changed theirs follows it at once; with `visitorsMayChange` off, every visitor does. Audited
 *     with the settings before and after.
 *
 * Shared product configuration (GLOBAL_CONFIG_MODELS), so the write declares `writesSharedSettings`. See
 * `lib/app/picker/site-settings.ts` and `.context/app/synth-picker.md`.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';
import { SitePickerSettingsSchema } from '@/lib/app/picker/settings';
import { getSitePickerSettings, setSitePickerSettings } from '@/lib/app/picker/site-settings';

export const GET = withAdminAuth(
  async () => successResponse(await getSitePickerSettings()),
  CATALOGUE_READ
);

export const PUT = withAdminAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const next = await validateRequestBody(request, SitePickerSettingsSchema);

    const { before, after } = await setSitePickerSettings(next);
    const changed = auditCatalogue(request, session.user.id, {
      action: 'synth_picker.update',
      entityType: 'synth_picker',
      entityId: 'site',
      entityName: 'Synth picker',
      before,
      after,
    });

    log.info('Synth picker settings saved by admin', { changed, actorUserId: session.user.id });
    return successResponse(after);
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
