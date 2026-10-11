/**
 * Change one synth's panel design (D11, `f-panel-designs`).
 *
 * PATCH /api/v1/admin/synths/:id/design — `{ design: 'neutral' | 'faithful', approval?: { approvedBy, approvedAt,
 *     note? } }`. `faithful` draws the maker's marks, so it is refused unless the synth already has a recorded approval
 *     or the request brings one. Every change is written to the admin audit log with its before and after.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { NotFoundError } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams, validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { computeChanges, logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { SynthDesignInputSchema, setSynthDesign } from '@/lib/app/catalogue/designs';

const CATALOGUE_ADMIN = {
  // Ownership: no ownership decision — catalogue configuration every org shares, admin only. See RouteOwnership in lib/auth/guards.ts.
  ownership: {
    decidedBy: 'nothing',
    because:
      'The catalogue is product configuration shared by every org (GLOBAL_CONFIG_MODELS); no row belongs to a user, and the guard already limits this to admins.',
  },
} as const;

/** A synth id as the registry writes them (`model-d`, `2-xm`). */
const ParamsSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/) });

export const PATCH = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);
  const body = await validateRequestBody(request, SynthDesignInputSchema);

  const result = await setSynthDesign(id, body);
  if (!result) throw new NotFoundError('Synth not found');
  const { before, after } = result;

  const changes = computeChanges(
    { design: before.design, approval: before.approval },
    { design: after.design, approval: after.approval }
  );
  if (changes) {
    logAdminAction({
      userId: session.user.id,
      action: 'synth.design.update',
      entityType: 'synth',
      entityId: id,
      entityName: `${after.maker} ${after.name}`,
      changes,
      clientIp: getClientIP(request),
    });
  }

  log.info('Synth design changed by admin', {
    synthId: id,
    from: before.design,
    to: after.design,
    changed: changes !== null,
    actorUserId: session.user.id,
  });

  return successResponse(after);
}, CATALOGUE_ADMIN);
