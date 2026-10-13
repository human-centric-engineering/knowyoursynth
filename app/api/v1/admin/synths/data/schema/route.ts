/**
 * The template's schema (`f-catalogue-admin`, t-32).
 *
 * GET /api/v1/admin/synths/data/schema — the JSON Schema of one synth's content object (`SynthContentSchema`), for an
 *     editor to check a content file against as it is written. See `lib/app/catalogue/template.ts`.
 */
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { synthContentJsonSchema } from '@/lib/app/catalogue/template';
import { CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';

export const GET = withAdminAuth(() => successResponse(synthContentJsonSchema()), CATALOGUE_READ);
