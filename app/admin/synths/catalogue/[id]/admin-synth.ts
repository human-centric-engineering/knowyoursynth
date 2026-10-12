/**
 * One synth for the catalogue editor's pages (`f-catalogue-admin`), from `GET /api/v1/admin/synths/[id]`, the same
 * response an API client reads. Through the API rather than the read layer, as the Designs page is: an admin's request
 * carries their session, so it is limited per admin. `'missing'` for a 404, `null` when it could not be loaded.
 */
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { AdminSynthDetail } from '@/lib/app/catalogue/edit';
import { logger } from '@/lib/logging';

export async function getAdminSynthDetail(
  id: string
): Promise<AdminSynthDetail | 'missing' | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/synths/${encodeURIComponent(id)}`);
    if (res.status === 404) return 'missing';
    if (!res.ok) return null;
    const body = await parseApiResponse<AdminSynthDetail>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('catalogue editor: synth fetch failed', err, { id });
    return null;
  }
}
