/**
 * How the synth picker lists synths for a visitor who has not changed it (`f-synth-picker` t-329): the site's settings,
 * which an admin sets, and whether a visitor may change them.
 *
 * GET /api/v1/synths/picker-settings — `SitePickerSettings`. Public: no session needed, as the picker is. The section
 * rate limit applies (`proxy.ts`), and the read is one row. A visitor's own changes are theirs, on
 * `GET /api/v1/me/settings` (`picker`). See `lib/app/picker/` and `.context/app/synth-picker.md`.
 */
import { NextRequest } from 'next/server';
import { checkConditional, computeETag } from '@/lib/api/etag';
import { handleAPIError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { getSitePickerSettings } from '@/lib/app/picker/site-settings';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const settings = await getSitePickerSettings();
    const etag = computeETag(settings);
    const notModified = checkConditional(request, etag);
    if (notModified) return notModified;
    return successResponse(settings, undefined, { headers: { ETag: etag } });
  } catch (error) {
    return handleAPIError(error);
  }
}
