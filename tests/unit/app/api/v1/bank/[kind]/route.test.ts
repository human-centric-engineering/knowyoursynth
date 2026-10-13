/**
 * GET /api/v1/bank/:kind — every artist, maker, instrument or song.
 *
 * Runs the real read layer (`lib/app/bank/read.ts`) over the seed's own rows (`tests/helpers/bank-db.ts`).
 * getRouteLogger is mocked globally in tests/setup.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { GET } from '@/app/api/v1/bank/[kind]/route';
import { listBank } from '@/lib/app/bank/read';
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

const call = (kind: string, headers?: Record<string, string>) =>
  GET(createMockRequest({ url: `http://localhost:3000/api/v1/bank/${kind}`, headers }), {
    params: Promise.resolve({ kind }),
  });

const ListBody = z.object({
  success: z.literal(true),
  data: z.array(z.looseObject({ id: z.string() })),
});

beforeEach(() => {
  vi.clearAllMocks();
  const db = bankDb();
  for (const model of ['bankMaker', 'bankInstrument', 'bankArtist', 'bankSong'] as const)
    vi.mocked(prisma[model].findMany).mockImplementation(db[model].findMany as never);
});

describe('GET /api/v1/bank/:kind', () => {
  it.each([
    ['artists', 184],
    ['makers', 50],
    ['instruments', 86],
    ['songs', 248],
  ])('lists every one of the %s (%i), as the read layer does', async (kind, count) => {
    const response = await call(kind);
    expect(response.status).toBe(200);
    const body = ListBody.parse(await parseJsonResponse(response));
    expect(body.data).toHaveLength(count);
    expect(body.data).toEqual(JSON.parse(JSON.stringify(await listBank(kind as never))));
    expect(response.headers.get('ETag')).toMatch(/^W\/".+"$/);
  });

  it('is a 404 without a database read for a kind the databank does not have', async () => {
    for (const kind of ['users', 'Artists', '']) {
      const response = await call(kind);
      expect(response.status).toBe(404);
      assertErrorResponse(await parseJsonResponse(response), 'NOT_FOUND');
    }
    expect(prisma.bankArtist.findMany).not.toHaveBeenCalled();
  });

  it('answers 304 when the client already has the list', async () => {
    const etag = (await call('makers')).headers.get('ETag') ?? '';
    const again = await call('makers', { 'If-None-Match': etag });
    expect(again.status).toBe(304);
  });

  it('turns a database failure into the standard error envelope', async () => {
    vi.mocked(prisma.bankSong.findMany).mockRejectedValue(new Error('connection lost'));
    const response = await call('songs');
    expect(response.status).toBe(500);
    assertErrorResponse(await parseJsonResponse(response), 'INTERNAL_ERROR');
  });
});
