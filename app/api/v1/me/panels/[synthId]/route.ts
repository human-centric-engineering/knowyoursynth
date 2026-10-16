/**
 * The signed-in user's last panel on one synth (`f-my-sounds` s3): the sound and lesson step it came from, their own
 * sound if one was open, and the controls and cables as they were left.
 *
 * GET /api/v1/me/panels/:synthId — the panel, fitted to the synth as it is now, or `null` when there is none.
 * PUT /api/v1/me/panels/:synthId — `{ presetId, step, soundId, panel: { values, cables } }`. The panel is checked
 *     against the synth's definition and refused (400) when anything in it is wrong.
 *
 * The section rate limit applies (`proxy.ts`): the page sends the panel only once it has been still for a while, and
 * once more on leaving. See `lib/app/sounds/preferences.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { getRouteLogger } from '@/lib/api/context';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { SynthIdSchema } from '@/lib/app/sounds/data';
import { PanelPrefInputSchema } from '@/lib/app/sounds/preference-data';
import { getPanelPref, putPanelPref } from '@/lib/app/sounds/preferences';

type Params = { synthId: string };

const OWNERSHIP = {
  decidedBy: 'self',
  because: "Every query is keyed on the caller's own user id as well as the synth's.",
} as const;

const notASynth = () => errorResponse('Not a synth id', { code: 'VALIDATION_ERROR', status: 400 });

export const GET = withAuth<Params>(
  async (_request, session, { params }) => {
    const synthId = SynthIdSchema.safeParse((await params).synthId);
    if (!synthId.success) return notASynth();
    return successResponse(await getPanelPref(session.user.id, synthId.data));
  },
  { ownership: OWNERSHIP }
);

export const PUT = withAuth<Params>(
  async (request, session, { params }) => {
    const synthId = SynthIdSchema.safeParse((await params).synthId);
    if (!synthId.success) return notASynth();
    const input = await validateRequestBody(request, PanelPrefInputSchema);
    const pref = await putPanelPref(session.user.id, synthId.data, input);
    const log = await getRouteLogger(request);
    log.debug('Last panel kept', { synthId: pref.synthId });
    return successResponse(pref);
  },
  { ownership: OWNERSHIP }
);
