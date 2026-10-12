/**
 * Change a catalogue note (`f-catalogue-admin`): a synth's "Unusual on…" note, its limits intro or a limit, or one of
 * the limits shared by every panel. Addressed by the note's id, because a shared limit belongs to no synth.
 *
 * PATCH /api/v1/admin/synth-notes/:noteId — `{ text?, title? }`; only a limit has a title. What the note is about does
 *     not change. Marks it edited, so the seed leaves it alone. Audited.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { editNote, NoteEditSchema } from '@/lib/app/catalogue/edit';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ noteId: z.string().regex(/^[a-z0-9]{1,64}$/) });

export const PATCH = withAdminAuth<{ noteId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { noteId } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const body = await validateRequestBody(request, NoteEditSchema);

    const { before, after, synthId } = await editNote(noteId, body);
    const changed = auditCatalogue(request, session.user.id, {
      action: 'synth_note.update',
      entityType: 'synth_note',
      entityId: noteId,
      entityName: `${synthId ?? 'every panel'}: ${after.title ?? after.target ?? after.kind.toLowerCase()}`,
      before: { ...before },
      after: { ...after },
    });

    log.info('Note changed by admin', { noteId, synthId, changed, actorUserId: session.user.id });
    return successResponse(after);
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
