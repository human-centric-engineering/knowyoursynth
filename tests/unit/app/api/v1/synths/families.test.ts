/**
 * GET /api/v1/synths/families — the synth families (`f-synth-families`).
 *
 * Runs the real read layer (`lib/app/families/read.ts`) over a mocked database, so the response shape is the one a
 * client really gets. getRouteLogger is mocked globally in tests/setup.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/v1/synths/families/route';
import { listFamilies } from '@/lib/app/families/read';
import {
  assertErrorResponse,
  assertSuccessResponse,
  createMockRequest,
  parseJsonResponse,
} from '@/tests/helpers/api';

vi.mock('@/lib/db/client', () => ({
  prisma: { synthFamily: { findMany: vi.fn() } },
}));

const { prisma } = await import('@/lib/db/client');
const url = 'http://localhost:3000/api/v1/synths/families';
const member = (slug: string, synthId: string | null) => ({
  slug,
  label: slug,
  synthId,
  differences: `What ${slug} changed.`,
  instrument: { id: `i-${slug}`, name: slug, maker: 'Roland', year: '1981' },
  synth: synthId ? { listed: true } : null,
});
const row = {
  id: 'tb-303',
  name: 'TB-303',
  defaultMember: 'td-3',
  members: [member('td-3', 'td-3'), member('tb-303', 'tb-303'), member('tb-03', null)],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.synthFamily.findMany).mockResolvedValue([row] as never);
});

describe('GET /api/v1/synths/families', () => {
  it('lists the families in the standard envelope, without a session, with an ETag', async () => {
    const response = await GET(createMockRequest({ url }));
    const body = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    assertSuccessResponse(body);
    expect(body).toEqual({
      success: true,
      data: [
        {
          id: 'tb-303',
          name: 'TB-303',
          defaultMember: 'td-3',
          members: row.members.map(({ synth: _synth, ...m }) => m),
        },
      ],
    });
    expect(response.headers.get('ETag')).toMatch(/^W\/".+"$/);
  });

  it('serves exactly what the read layer returns', async () => {
    const direct = await listFamilies();
    const body = await parseJsonResponse(await GET(createMockRequest({ url })));
    expect(direct).toHaveLength(1);
    expect(body).toEqual({ success: true, data: JSON.parse(JSON.stringify(direct)) });
  });

  it('answers 304 to a request that already has the current list', async () => {
    const first = await GET(createMockRequest({ url }));
    const etag = first.headers.get('ETag') ?? '';

    const again = await GET(createMockRequest({ url, headers: { 'If-None-Match': etag } }));

    expect(again.status).toBe(304);
  });

  it('returns the standard error envelope when the read fails', async () => {
    vi.mocked(prisma.synthFamily.findMany).mockRejectedValue(new Error('db down'));

    const response = await GET(createMockRequest({ url }));
    const body = await parseJsonResponse(response);

    expect(response.status).toBe(500);
    assertErrorResponse(body);
  });
});
