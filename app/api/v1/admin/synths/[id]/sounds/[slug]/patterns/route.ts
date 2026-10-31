/**
 * A library sound's patterns, in order (`f-pattern-library` t-122).
 *
 * PUT /api/v1/admin/synths/:id/sounds/:slug/patterns — `{ patternIds }`, the default first. Every pattern the sound
 *     has must stay on it; any library pattern may be added. When the default changes, the sound's riff becomes the
 *     new default's notes and the sound is marked edited, so the seed leaves it alone. Audited.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { SoundSlugSchema, SynthIdSchema } from '@/lib/app/catalogue/edit';
import { setSoundPatterns, SoundPatternsSchema } from '@/lib/app/patterns/library-edit';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: SynthIdSchema, slug: SoundSlugSchema });

export const PUT = withAdminAuth<{ id: string; slug: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id, slug } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const { patternIds } = await validateRequestBody(request, SoundPatternsSchema);

    const result = await setSoundPatterns(id, slug, patternIds);
    const changed = auditCatalogue(request, session.user.id, {
      action: 'synth_sound.patterns',
      entityType: 'synth_sound',
      entityId: `${id}/${slug}`,
      entityName: result.name,
      before: { patterns: result.before, ...(result.sound && { phrase: result.sound.before }) },
      after: { patterns: result.after, ...(result.sound && { phrase: result.sound.after }) },
    });

    log.info('Sound patterns set by admin', {
      synthId: id,
      sound: slug,
      changed,
      riffRewritten: result.sound !== null,
      actorUserId: session.user.id,
    });
    return successResponse({ patternIds: result.after });
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
