/**
 * Change a library sound or its lesson (`f-catalogue-admin`).
 *
 * PATCH /api/v1/admin/synths/:id/sounds/:slug — any of the sound's fields but its id. The change is merged into the
 *     stored sound and the whole is checked against the synth's definition by `validatePreset` before anything is
 *     written; a refusal names each control or jack at fault. Marks the sound edited, so the seed leaves it alone.
 *     A new riff is refused while the sound plays a library pattern an admin chose; otherwise its riff pattern follows
 *     (`followSoundRiff`). Audited with what changed: the sound, and any other sound whose riff followed.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import {
  editSound,
  SoundEditSchema,
  SoundSlugSchema,
  SynthIdSchema,
} from '@/lib/app/catalogue/edit';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: SynthIdSchema, slug: SoundSlugSchema });

export const PATCH = withAdminAuth<{ id: string; slug: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id, slug } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const body = await validateRequestBody(request, SoundEditSchema);

    const { before, after, library } = await editSound(id, slug, body);
    const changed = auditCatalogue(request, session.user.id, {
      action: 'synth_sound.update',
      entityType: 'synth_sound',
      entityId: `${id}/${slug}`,
      entityName: after.name,
      before,
      after,
    });

    for (const s of library)
      auditCatalogue(request, session.user.id, {
        action: 'synth_sound.update',
        entityType: 'synth_sound',
        entityId: `${s.synthId}/${s.slug}`,
        entityName: s.name,
        before: { phrase: s.before },
        after: { phrase: s.after },
      });

    log.info('Sound changed by admin', {
      synthId: id,
      sound: slug,
      changed,
      actorUserId: session.user.id,
    });
    return successResponse(after);
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
