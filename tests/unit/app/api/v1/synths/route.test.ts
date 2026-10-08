/**
 * GET /api/v1/synths — the public catalogue.
 *
 * Runs the real read layer (`lib/app/catalogue/read.ts`) over a mocked database whose row is the one the seed would
 * write for Model D, so the response shape is the one a client really gets.
 * getRouteLogger is mocked globally in tests/setup.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/v1/synths/route';
import { listSynths } from '@/lib/app/catalogue/read';
import { planCatalogue } from '@/lib/app/catalogue/seed';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import {
  assertErrorResponse,
  assertSuccessResponse,
  createMockRequest,
  parseJsonResponse,
} from '@/tests/helpers/api';

vi.mock('@/lib/db/client', () => ({
  prisma: { synth: { findMany: vi.fn() } },
}));

const { prisma } = await import('@/lib/db/client');
const { synths, sounds } = planCatalogue(loadCatalogueData());
const row = (({ id, name, maker, year, heritage, summary }) => ({
  id,
  name,
  maker,
  year,
  heritage,
  summary,
  _count: { sounds: sounds.length },
}))(synths[0]);
const url = 'http://localhost:3000/api/v1/synths';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.synth.findMany).mockResolvedValue([row] as never);
});

describe('GET /api/v1/synths', () => {
  it('lists the catalogue in the standard envelope, without a session', async () => {
    const response = await GET(createMockRequest({ url }));
    const body = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    assertSuccessResponse(body);
    expect(body).toEqual({
      success: true,
      data: [
        {
          id: 'model-d',
          name: 'Model D',
          maker: 'Behringer',
          year: 2018,
          heritage: 'Modelled on the 1970 Minimoog Model D',
          summary: row.summary,
          definitionVersion: 1,
          soundCount: 99,
        },
      ],
    });
    expect(response.headers.get('ETag')).toMatch(/^W\/".+"$/);
  });

  it('serves exactly what the read layer returns, which is what the synth pages render', async () => {
    const direct = await listSynths();
    const body = await parseJsonResponse(await GET(createMockRequest({ url })));
    expect(direct).toHaveLength(1);
    expect(body).toEqual({ success: true, data: JSON.parse(JSON.stringify(direct)) });
  });

  it('answers 304 with no body when the client already has this list', async () => {
    const first = await GET(createMockRequest({ url }));
    const etag = first.headers.get('ETag') ?? '';

    const again = await GET(createMockRequest({ url, headers: { 'If-None-Match': etag } }));

    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
  });

  it('is an empty list when nothing is listed', async () => {
    vi.mocked(prisma.synth.findMany).mockResolvedValue([]);
    const body = await parseJsonResponse(await GET(createMockRequest({ url })));
    expect(body).toEqual({ success: true, data: [] });
  });

  it('turns a database failure into the standard error envelope', async () => {
    vi.mocked(prisma.synth.findMany).mockRejectedValue(new Error('connection lost'));
    const response = await GET(createMockRequest({ url }));
    expect(response.status).toBe(500);
    assertErrorResponse(await parseJsonResponse(response), 'INTERNAL_ERROR');
  });
});
