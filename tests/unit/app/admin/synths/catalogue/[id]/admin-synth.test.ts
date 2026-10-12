/**
 * One synth for the catalogue editor's pages (`f-catalogue-admin` t-31): `'missing'` for a 404, `null` for anything
 * else that is not a success.
 *
 * @see app/admin/synths/catalogue/[id]/admin-synth.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));

vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { getAdminSynthDetail } from '@/app/admin/synths/catalogue/[id]/admin-synth';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';

const response = (status: number) => ({ ok: status === 200, status }) as Response;

describe('getAdminSynthDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the detail the endpoint sends, asking for the id encoded', async () => {
    const detail = { synth: { id: 'a b' } };
    vi.mocked(serverFetch).mockResolvedValue(response(200));
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: detail } as never);

    await expect(getAdminSynthDetail('a b')).resolves.toBe(detail);
    expect(serverFetch).toHaveBeenCalledWith('/api/v1/admin/synths/a%20b');
  });

  it("says 'missing' for a 404, without reading the body", async () => {
    vi.mocked(serverFetch).mockResolvedValue(response(404));

    await expect(getAdminSynthDetail('nope')).resolves.toBe('missing');
    expect(parseApiResponse).not.toHaveBeenCalled();
  });

  it('returns null for any other refused status', async () => {
    vi.mocked(serverFetch).mockResolvedValue(response(500));

    await expect(getAdminSynthDetail('model-d')).resolves.toBeNull();
    expect(parseApiResponse).not.toHaveBeenCalled();
  });

  it('returns null when the body is not a success', async () => {
    vi.mocked(serverFetch).mockResolvedValue(response(200));
    vi.mocked(parseApiResponse).mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    } as never);

    await expect(getAdminSynthDetail('model-d')).resolves.toBeNull();
  });

  it('returns null, and logs with the id, when the fetch throws', async () => {
    vi.mocked(serverFetch).mockRejectedValue(new Error('network'));

    await expect(getAdminSynthDetail('model-d')).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'catalogue editor: synth fetch failed',
      expect.any(Error),
      { id: 'model-d' }
    );
  });
});
