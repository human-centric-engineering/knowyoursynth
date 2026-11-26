/**
 * What the family admin pages load (`f-synth-families` t-323): the families, one family (`'missing'` for a 404 or an id no family could have), and
 * the synths and instruments the form offers, each `null` when it could not be loaded.
 *
 * @see app/admin/synths/catalogue/families/load.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));

vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  getAdminFamilies,
  getAdminFamily,
  getFamilyFormOptions,
} from '@/app/admin/synths/catalogue/families/load';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';

const response = (status: number) => ({ ok: status === 200, status }) as Response;
const fetchMock = vi.mocked(serverFetch);
const parseMock = vi.mocked(parseApiResponse);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAdminFamilies', () => {
  it('returns the list the endpoint sends', async () => {
    const list = [{ id: 'tb-303' }];
    fetchMock.mockResolvedValue(response(200));
    parseMock.mockResolvedValue({ success: true, data: list } as never);

    await expect(getAdminFamilies()).resolves.toBe(list);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/synths/families');
  });

  it('returns null for a refused status, or a fetch that throws, logging the throw', async () => {
    fetchMock.mockResolvedValueOnce(response(500));
    await expect(getAdminFamilies()).resolves.toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('down'));
    await expect(getAdminFamilies()).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe('getAdminFamily', () => {
  it('asks for the id, and returns the family', async () => {
    const family = { id: 'tb-303' };
    fetchMock.mockResolvedValue(response(200));
    parseMock.mockResolvedValue({ success: true, data: family } as never);

    await expect(getAdminFamily('tb-303')).resolves.toBe(family);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/synths/families/tb-303');
  });

  it("says 'missing' for an id no family could have, without asking", async () => {
    await expect(getAdminFamily('TB-303')).resolves.toBe('missing');
    await expect(getAdminFamily('a b')).resolves.toBe('missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says 'missing' for a 404, and null for a body that is not a success", async () => {
    fetchMock.mockResolvedValueOnce(response(404));
    await expect(getAdminFamily('nope')).resolves.toBe('missing');

    fetchMock.mockResolvedValueOnce(response(200));
    parseMock.mockResolvedValueOnce({
      success: false,
      error: { code: 'X', message: 'x' },
    } as never);
    await expect(getAdminFamily('tb-303')).resolves.toBeNull();
  });
});

describe('getFamilyFormOptions', () => {
  it('names each synth by maker and name, and keeps each instrument’s detail', async () => {
    fetchMock.mockResolvedValue(response(200));
    parseMock
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'td-3', maker: 'Behringer', name: 'TD-3' }],
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'behringer-td-3', name: 'TD-3', detail: 'Behringer · 2019', editedAt: null }],
      } as never);

    await expect(getFamilyFormOptions()).resolves.toEqual({
      synths: [{ id: 'td-3', name: 'Behringer TD-3' }],
      instruments: [{ id: 'behringer-td-3', name: 'TD-3', detail: 'Behringer · 2019' }],
    });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/v1/admin/synths',
      '/api/v1/admin/bank/instruments',
    ]);
  });

  it('returns null when either list could not be loaded', async () => {
    fetchMock.mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(500));
    parseMock.mockResolvedValueOnce({ success: true, data: [] } as never);

    await expect(getFamilyFormOptions()).resolves.toBeNull();
  });
});
