/**
 * The signed-in user's synth page settings (`f-my-sounds` s3): hover help, the sound map's two toggles, the harmonics
 * strip and the effects rack, kept under the account.
 *
 * GET   /api/v1/me/settings — every setting; `null` for one the account has no value for yet.
 * PATCH /api/v1/me/settings — `{ tips?, dim?, heat?, harm?, fx? }`: the ones that changed. Returns them all.
 *
 * Not `/api/v1/users/me/preferences`, which is the platform's (email and notification preferences). The section rate
 * limit applies (`proxy.ts`); the page sends a change only once it has stopped changing. See
 * `lib/app/sounds/preferences.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { SettingsPatchSchema } from '@/lib/app/sounds/preference-data';
import { getSettings, updateSettings } from '@/lib/app/sounds/preferences';

const OWNERSHIP = {
  decidedBy: 'self',
  because: "It reads and writes only the row keyed on the caller's own user id.",
} as const;

export const GET = withAuth(
  async (_request, session) => successResponse(await getSettings(session.user.id)),
  { ownership: OWNERSHIP }
);

export const PATCH = withAuth(
  async (request, session) => {
    const patch = await validateRequestBody(request, SettingsPatchSchema);
    return successResponse(await updateSettings(session.user.id, patch));
  },
  { ownership: OWNERSHIP }
);
