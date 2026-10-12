/**
 * Add an "Unusual on…" note to a synth (`f-catalogue-admin`).
 *
 * POST /api/v1/admin/synths/:id/notes — `{ target, text }`. The target must be one of the synth's controls, jacks or
 *     areas, and a synth has one note per target (409 if it exists: edit that one). Audited.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import {
  createUnusualNote,
  SynthIdSchema,
  UnusualNoteCreateSchema,
} from '@/lib/app/catalogue/edit';
import { auditCatalogue, CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: SynthIdSchema });

export const POST = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
    const body = await validateRequestBody(request, UnusualNoteCreateSchema);

    const note = await createUnusualNote(id, body);
    auditCatalogue(request, session.user.id, {
      action: 'synth_note.create',
      entityType: 'synth_note',
      entityId: note.id,
      entityName: `${id}: unusual on ${body.target}`,
      before: null,
      after: { ...note },
    });

    log.info('Note added by admin', { synthId: id, noteId: note.id, actorUserId: session.user.id });
    return successResponse(note, undefined, { status: 201 });
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
