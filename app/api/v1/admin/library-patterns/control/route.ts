/**
 * Admin control of library patterns (`f-pattern-library` t-156, `pattern-library.md`, Admin control).
 *
 * POST /api/v1/admin/library-patterns/control — `{ ids, rightsRisk?, status?, reason, acknowledge? }`: set the rights
 *     risk or status of one pattern or many, with one reason for all of them. A blocked pattern is always disabled.
 *     A sound whose default is disabled plays its next enabled pattern, its riff rewritten; a change that would leave
 *     a sound with none is refused (`acknowledge` in the error's paths) until it is sent again with `acknowledge`.
 *     Audited: each pattern that changed, and each sound whose riff changed.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { PatternControlSchema, setLibraryPatternControl } from '@/lib/app/patterns/library-edit';
import { forgetSuggestLibrary } from '@/lib/app/patterns/suggest-read';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

export const POST = withAdminAuth(
  async (request, session) => {
    const log = await getRouteLogger(request);
    const body = await validateRequestBody(request, PatternControlSchema);

    const { changes, sounds, leftWithout } = await setLibraryPatternControl(body);
    // Suggestions keep the public library for a minute; a pattern just disabled or blocked leaves it now, in this
    // process at least. Another instance's copy lasts out its minute.
    if (changes.length) forgetSuggestLibrary();
    for (const c of changes)
      auditCatalogue(request, session.user.id, {
        action: 'library_pattern.control',
        entityType: 'library_pattern',
        entityId: c.id,
        entityName: c.name,
        before: c.before,
        after: c.after,
      });
    for (const s of sounds)
      auditCatalogue(request, session.user.id, {
        action: 'synth_sound.update',
        entityType: 'synth_sound',
        entityId: `${s.synthId}/${s.slug}`,
        entityName: s.name,
        before: { phrase: s.before },
        after: { phrase: s.after },
      });

    log.info('Library pattern control set by admin', {
      patterns: body.ids.length,
      changed: changes.length,
      soundsRewritten: sounds.length,
      soundsLeftWithout: leftWithout.length,
      actorUserId: session.user.id,
    });
    return successResponse({
      changed: changes.map((c) => c.id),
      soundsRewritten: sounds.map((s) => `${s.synthId}/${s.slug}`),
      leftWithout,
    });
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
