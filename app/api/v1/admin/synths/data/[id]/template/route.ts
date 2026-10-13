/**
 * One synth's content as a template (`f-catalogue-admin`, t-32).
 *
 * GET /api/v1/admin/synths/data/:id/template — `{ content, problems }`: the synth's sounds, lineage and notes from the
 *     tables, shaped as one content object (`SynthContentSchema`), and anywhere a stored row does not fit it. See
 *     `lib/app/catalogue/template.ts`.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { SynthIdSchema } from '@/lib/app/catalogue/edit';
import { getSynthContentTemplate } from '@/lib/app/catalogue/template';
import { CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

const ParamsSchema = z.object({ id: SynthIdSchema });

export const GET = withAdminAuth<{ id: string }>(async (_request, _session, { params }) => {
  const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
  const template = await getSynthContentTemplate(id);
  if (!template) throw new NotFoundError('Synth not found');
  return successResponse(template);
}, CATALOGUE_READ);
