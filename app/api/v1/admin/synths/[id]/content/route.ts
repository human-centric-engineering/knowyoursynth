/**
 * Upload one synth's content as JSON (`f-catalogue-admin`, t-33).
 *
 * POST /api/v1/admin/synths/:id/content — the body is one content object (`SynthContentSchema`, the shape the data
 *     page's template gives), sent as `application/json`, at most `MAX_CONTENT_BYTES`. Checked whole, the way the seed
 *     checks, before anything is written; any problem refuses the file and names every one. An accepted file is kept
 *     in storage, its rows are written under the seed's rules, and the upload is audited with a reference to the file.
 *     Returns `{ report, file }`: what was created, updated, left unchanged and skipped as edited, per table. See
 *     `lib/app/catalogue/upload.ts`.
 *
 * Rate limiting: the admin section cap from `proxy.ts`, and an upload sub-cap (`uploadLimiter`) per admin, because
 * each upload stores a file and may write a whole library.
 */
import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { APIError, ErrorCodes } from '@/lib/api/errors';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { createRateLimitResponse, uploadLimiter } from '@/lib/security/rate-limit';
import { getClientIP } from '@/lib/security/ip';
import { getStorageClient } from '@/lib/storage/client';
import { SynthIdSchema } from '@/lib/app/catalogue/edit';
import { CATALOGUE_READ } from '@/lib/app/catalogue/admin-route';
import {
  checkSynthContent,
  readJsonBody,
  uploadStorageKey,
  writeSynthContent,
} from '@/lib/app/catalogue/upload';

const ParamsSchema = z.object({ id: SynthIdSchema });

export const POST = withAdminAuth<{ id: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id } = validateQueryParams(new URLSearchParams(await params), ParamsSchema);

    // Keyed on the admin, and apart from other uploads' buckets: the limiter counts per key.
    const limit = uploadLimiter.check(`catalogue-content:${session.user.id}`);
    if (!limit.success) {
      log.warn('Catalogue upload rate limit exceeded', {
        synthId: id,
        actorUserId: session.user.id,
      });
      return createRateLimitResponse(limit);
    }

    const text = await readJsonBody(request);
    let checked;
    try {
      checked = checkSynthContent(id, text);
    } catch (err) {
      log.warn('Catalogue upload refused', { synthId: id, actorUserId: session.user.id });
      throw err;
    }

    const storage = getStorageClient();
    if (!storage)
      throw new APIError(
        'File storage is not configured, so the upload cannot be kept',
        ErrorCodes.STORAGE_NOT_CONFIGURED,
        503
      );
    const file = await storage.upload(Buffer.from(text, 'utf8'), {
      key: uploadStorageKey(id),
      contentType: 'application/json',
      metadata: { synthId: id, uploadedBy: session.user.id },
      public: false,
    });

    let report;
    try {
      report = await writeSynthContent(id, checked.rows);
    } catch (err) {
      // Nothing was written, so the file records nothing: do not keep it.
      await storage.delete(file.key);
      throw err;
    }

    logAdminAction({
      userId: session.user.id,
      action: 'synth.content_upload',
      entityType: 'synth',
      entityId: id,
      entityName: checked.def.name,
      metadata: { file: { path: file.key, size: file.size }, report },
      clientIp: getClientIP(request),
    });

    log.info('Catalogue content uploaded by admin', {
      synthId: id,
      file: file.key,
      report,
      actorUserId: session.user.id,
    });
    return successResponse({ report, file: { path: file.key, size: file.size } });
  },
  { ...CATALOGUE_READ, writesSharedSettings: true }
);
