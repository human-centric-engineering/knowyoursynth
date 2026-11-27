/**
 * Unit Tests: asking for a synth to be modelled, and the admins' tally (`f-synth-picker` t-330).
 *
 * Real routes and real `withAuth` / `withAdminAuth`; the request rules are `lib/app/picker/model-requests.ts`'s, tested
 * on their own, so here they are fakes. Pins:
 *
 * - every route needs a session, and the tally an admin's;
 * - each user route acts for the caller alone, on the instrument the path names;
 * - an id no instrument could have is a 404 before anything is read or written; the rules' own 404 passes through;
 * - the tally is served as the rules return it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/db/client', () => ({ prisma: { $queryRaw: vi.fn(async () => []) } }));
const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

const rules = vi.hoisted(() => ({
  listMyModelRequests: vi.fn(),
  getModelRequest: vi.fn(),
  askToModel: vi.fn(),
  withdrawModelRequest: vi.fn(),
  tallyModelRequests: vi.fn(),
}));
vi.mock('@/lib/app/picker/model-requests', () => rules);

import { GET as listMine } from '@/app/api/v1/me/model-requests/route';
import { DELETE, GET, PUT } from '@/app/api/v1/me/model-requests/[instrumentId]/route';
import { GET as tally } from '@/app/api/v1/admin/synths/model-requests/route';
import { NotFoundError } from '@/lib/api/errors';
import { createMockAuthSession } from '@/tests/helpers/auth';

function session(role: 'USER' | 'ADMIN', id = 'user-1') {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID },
    user: { ...base.user, id, role },
  };
}
const request = (method: string, url: string) =>
  new Request(`http://localhost${url}`, { method }) as unknown as NextRequest;
const ctx = (instrumentId: string) => ({ params: Promise.resolve({ instrumentId }) });
const body = async (res: Response) => JSON.parse(await res.text()) as { data?: unknown };
const STATE = { instrumentId: 'arp-odyssey', asked: true, count: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(session('USER'));
  rules.getModelRequest.mockResolvedValue(STATE);
  rules.askToModel.mockResolvedValue(STATE);
  rules.withdrawModelRequest.mockResolvedValue({ ...STATE, asked: false, count: 2 });
  rules.listMyModelRequests.mockResolvedValue(['arp-odyssey']);
  rules.tallyModelRequests.mockResolvedValue([]);
});

describe('a session is required', () => {
  it('refuses every user route signed out, doing nothing', async () => {
    mockGetSession.mockResolvedValue(null);
    const url = '/api/v1/me/model-requests/arp-odyssey';
    const statuses = [
      (await listMine(request('GET', '/api/v1/me/model-requests'))).status,
      (await GET(request('GET', url), ctx('arp-odyssey'))).status,
      (await PUT(request('PUT', url), ctx('arp-odyssey'))).status,
      (await DELETE(request('DELETE', url), ctx('arp-odyssey'))).status,
    ];
    expect(statuses).toEqual([401, 401, 401, 401]);
    expect(rules.askToModel).not.toHaveBeenCalled();
    expect(rules.withdrawModelRequest).not.toHaveBeenCalled();
  });
});

describe('the caller’s own requests', () => {
  it('lists the caller’s', async () => {
    const res = await listMine(request('GET', '/api/v1/me/model-requests'));
    expect((await body(res)).data).toEqual({ instrumentIds: ['arp-odyssey'] });
    expect(rules.listMyModelRequests).toHaveBeenCalledWith('user-1');
  });

  it('reads, asks and withdraws for the caller, on the instrument the path names', async () => {
    const url = '/api/v1/me/model-requests/arp-odyssey';
    expect((await body(await GET(request('GET', url), ctx('arp-odyssey')))).data).toEqual(STATE);
    expect(rules.getModelRequest).toHaveBeenCalledWith('user-1', 'arp-odyssey');
    expect((await body(await PUT(request('PUT', url), ctx('arp-odyssey')))).data).toEqual(STATE);
    expect(rules.askToModel).toHaveBeenCalledWith('user-1', 'arp-odyssey');
    const withdrawn = await DELETE(request('DELETE', url), ctx('arp-odyssey'));
    expect((await body(withdrawn)).data).toMatchObject({ asked: false, count: 2 });
    expect(rules.withdrawModelRequest).toHaveBeenCalledWith('user-1', 'arp-odyssey');
  });

  it('is a 404 for an id no instrument could have, before anything is read or written', async () => {
    const res = await PUT(
      request('PUT', '/api/v1/me/model-requests/Not%20An%20Id'),
      ctx('Not An Id')
    );
    expect(res.status).toBe(404);
    expect(rules.askToModel).not.toHaveBeenCalled();
    expect((await GET(request('GET', '/x'), ctx('UPPER'))).status).toBe(404);
    expect((await DELETE(request('DELETE', '/x'), ctx('a b'))).status).toBe(404);
  });

  it('passes the rules’ 404 through for an instrument the databank does not have', async () => {
    rules.askToModel.mockRejectedValue(new NotFoundError('The databank has no instrument "x"'));
    const res = await PUT(request('PUT', '/api/v1/me/model-requests/no-such'), ctx('no-such'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/admin/synths/model-requests', () => {
  it('is for admins only', async () => {
    expect((await tally(request('GET', '/api/v1/admin/synths/model-requests'))).status).toBe(403);
    expect(rules.tallyModelRequests).not.toHaveBeenCalled();
  });

  it('serves the tally as the rules return it', async () => {
    mockGetSession.mockResolvedValue(session('ADMIN'));
    const rows = [
      {
        instrument: {
          id: 'arp-odyssey',
          name: 'ARP Odyssey',
          maker: 'ARP',
          year: '1972',
          kind: 'mono',
        },
        count: 3,
        lastAskedAt: '2026-11-27T00:00:00.000Z',
      },
    ];
    rules.tallyModelRequests.mockResolvedValue(rows);
    const res = await tally(request('GET', '/api/v1/admin/synths/model-requests'));
    expect(res.status).toBe(200);
    expect((await body(res)).data).toEqual(rows);
  });
});
