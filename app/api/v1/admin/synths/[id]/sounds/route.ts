/**
 * Add a sound to a synth's library (`f-catalogue-admin`).
 *
 * POST /api/v1/admin/synths/:id/sounds — a whole sound (`Preset`: id, name, ref, artist, tags, level, blurb, how,
 *     phrase, steps, context, tweaks). Checked against the synth's definition by `validatePreset`; a refusal names
 *     each control or jack at fault. Made on the definition's current version, added at the end of the library, and
 *     marked edited so a seed file with the same id later leaves it alone. Audited.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { createSound, SoundCreateSchema, SynthIdSchema } from '@/lib/app/catalogue/edit';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: SynthIdSchema });

export const POST = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const body = await validateRequestBody(request, SoundCreateSchema);

    const sound = await createSound(id, body);
    auditCatalogue(request, session.user.id, {
      action: 'synth_sound.create',
      entityType: 'synth_sound',
      entityId: `${id}/${sound.id}`,
      entityName: sound.name,
      before: null,
      after: sound,
    });

    log.info('Sound added by admin', {
      synthId: id,
      sound: sound.id,
      actorUserId: session.user.id,
    });
    return successResponse(sound, undefined, { status: 201 });
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
