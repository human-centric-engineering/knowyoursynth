/**
 * GET /api/v1/bank/search — the databank by name and text (`f-tutor-knowledge` t-57).
 *
 * Runs the real search (`lib/app/bank/search.ts`) and read layer over the seed's own rows (`tests/helpers/bank-db.ts`).
 * getRouteLogger is mocked globally in tests/setup.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { GET } from '@/app/api/v1/bank/search/route';
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

const call = (query: string) =>
  GET(createMockRequest({ url: `http://localhost:3000/api/v1/bank/search?${query}` }));

const Hit = z.object({
  kind: z.enum(['artists', 'makers', 'instruments', 'songs']),
  id: z.string(),
  name: z.string(),
  href: z.string(),
  about: z.string(),
  excerpt: z.string(),
  related: z.array(z.object({ kind: z.string(), id: z.string(), name: z.string() })),
  score: z.number(),
});
const Body = z.object({ success: z.literal(true), data: z.array(Hit) });

beforeEach(() => {
  vi.clearAllMocks();
  const db = bankDb();
  for (const model of ['bankMaker', 'bankInstrument', 'bankArtist', 'bankSong'] as const)
    vi.mocked(prisma[model].findMany).mockImplementation(db[model].findMany as never);
});

describe('GET /api/v1/bank/search', () => {
  it('ranks the databank against the query, each result with its page', async () => {
    const response = await call('q=Vangelis');
    expect(response.status).toBe(200);
    const { data } = Body.parse(await parseJsonResponse(response));
    expect(data[0]).toMatchObject({
      kind: 'artists',
      id: 'vangelis',
      href: '/bank/artists/vangelis',
    });
    expect(data.length).toBeLessThanOrEqual(10);
  });

  it('narrows to a kind and honours the limit', async () => {
    const { data } = Body.parse(
      await parseJsonResponse(await call('q=Roland&kind=instruments&limit=4'))
    );
    expect(data).toHaveLength(4);
    expect(data.every((h) => h.kind === 'instruments')).toBe(true);
  });

  it('answers an empty list for a query with no match', async () => {
    const { data } = Body.parse(await parseJsonResponse(await call('q=xqzvy')));
    expect(data).toEqual([]);
  });

  it.each([
    ['no query', ''],
    ['an empty query', 'q='],
    ['a blank query', 'q=%20%20'],
    ['an over-long query', `q=${'a'.repeat(201)}`],
    ['a kind the databank does not have', 'q=Moog&kind=users'],
    ['a limit over the maximum', 'q=Moog&limit=21'],
    ['a limit that is not a number', 'q=Moog&limit=lots'],
  ])('is a 400 for %s, before reading the databank', async (_label, query) => {
    const response = await call(query);
    expect(response.status).toBe(400);
    assertErrorResponse(await parseJsonResponse(response), 'VALIDATION_ERROR');
    expect(prisma.bankArtist.findMany).not.toHaveBeenCalled();
  });

  it('turns a database failure into the standard error envelope', async () => {
    vi.mocked(prisma.bankSong.findMany).mockRejectedValue(new Error('connection lost'));
    const response = await call('q=Moog');
    expect(response.status).toBe(500);
    assertErrorResponse(await parseJsonResponse(response), 'INTERNAL_ERROR');
  });
});
