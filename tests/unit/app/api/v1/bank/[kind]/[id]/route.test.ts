/**
 * GET /api/v1/bank/:kind/:id — one row with what the databank joins to it.
 *
 * Runs the real read layer (`lib/app/bank/read.ts`) over the seed's own rows (`tests/helpers/bank-db.ts`).
 * getRouteLogger is mocked globally in tests/setup.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/v1/bank/[kind]/[id]/route';
import { getBankDetail } from '@/lib/app/bank/read';
import { bankDb } from '@/tests/helpers/bank-db';
import { assertErrorResponse, createMockRequest, parseJsonResponse } from '@/tests/helpers/api';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    bankMaker: { findMany: vi.fn() },
    bankInstrument: { findMany: vi.fn() },
    bankArtist: { findMany: vi.fn() },
    bankSong: { findMany: vi.fn() },
  },
}));

const { prisma } = await import('@/lib/db/client');

const call = (kind: string, id: string, headers?: Record<string, string>) =>
  GET(createMockRequest({ url: `http://localhost:3000/api/v1/bank/${kind}/${id}`, headers }), {
    params: Promise.resolve({ kind, id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  const db = bankDb();
  for (const model of ['bankMaker', 'bankInstrument', 'bankArtist', 'bankSong'] as const)
    vi.mocked(prisma[model].findMany).mockImplementation(db[model].findMany as never);
});

describe('GET /api/v1/bank/:kind/:id', () => {
  it.each([
    ['artists', 'aphex-twin'],
    ['makers', 'robert-moog'],
    ['instruments', 'moog-minimoog'],
    ['songs', 'wendy-carlos-switched-on-bach'],
  ])('serves %s/%s exactly as the read layer joins it', async (kind, id) => {
    const response = await call(kind, id);
    expect(response.status).toBe(200);
    const direct = await getBankDetail(kind as never, id);
    expect(direct).not.toBeNull();
    expect(await parseJsonResponse(response)).toEqual({
      success: true,
      data: JSON.parse(JSON.stringify(direct)),
    });
    expect(response.headers.get('ETag')).toMatch(/^W\/".+"$/);
  });

  it('is a 404 for an id the databank does not have', async () => {
    const response = await call('songs', 'no-such-song');
    expect(response.status).toBe(404);
    assertErrorResponse(await parseJsonResponse(response), 'NOT_FOUND', 'Not found');
  });

  it('is a 404 without a database read for a kind or id no row could have', async () => {
    for (const [kind, id] of [
      ['users', 'x'],
      ['songs', '../etc'],
      ['songs', 'Upper'],
      ['songs', 'a'.repeat(129)],
    ]) {
      const response = await call(kind, id);
      expect(response.status).toBe(404);
    }
    expect(prisma.bankSong.findMany).not.toHaveBeenCalled();
  });

  it('answers 304 when the client already has the row', async () => {
    const etag = (await call('makers', 'robert-moog')).headers.get('ETag') ?? '';
    expect((await call('makers', 'robert-moog', { 'If-None-Match': etag })).status).toBe(304);
  });

  it('turns a database failure into the standard error envelope', async () => {
    vi.mocked(prisma.bankArtist.findMany).mockRejectedValue(new Error('connection lost'));
    const response = await call('artists', 'aphex-twin');
    expect(response.status).toBe(500);
    assertErrorResponse(await parseJsonResponse(response), 'INTERNAL_ERROR');
  });
});
