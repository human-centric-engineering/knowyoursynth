/**
 * Unit Tests: GET /api/v1/admin/synths and PATCH /api/v1/admin/synths/[id]/design (f-panel-designs t-27)
 *
 * Real `withAdminAuth` and the real `lib/app/catalogue/designs.ts`, over a mocked Prisma whose `$transaction` runs the
 * callback against the same mock. Pins: admin only; every synth listed, unlisted ones included; `faithful` refused
 * without an approval; the approval kept when a synth goes back to neutral; one audit entry per real change and none
 * for a no-op; `editedAt` never written.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

const mockPrisma = vi.hoisted(() => {
  const db = {
    synth: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    orgMembership: { findUnique: vi.fn() },
    aiApiKey: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
  return db;
});
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

const mockLogAdminAction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/orchestration/audit/admin-audit-logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orchestration/audit/admin-audit-logger')>()),
  logAdminAction: mockLogAdminAction,
}));

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import { GET } from '@/app/api/v1/admin/synths/route';
import { PATCH } from '@/app/api/v1/admin/synths/[id]/design/route';
import { createMockAuthSession } from '@/tests/helpers/auth';

function session(role: 'USER' | 'ADMIN') {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID },
    user: { ...base.user, role },
  };
}

type Row = {
  id: string;
  name: string;
  maker: string;
  listed: boolean;
  order: number;
  design: 'NEUTRAL' | 'FAITHFUL';
  designApprovedBy: string | null;
  designApprovedAt: Date | null;
  designApprovalNote: string | null;
};
const synthRow = (over: Partial<Row> = {}): Row => ({
  id: 'model-d',
  name: 'Model D',
  maker: 'Behringer',
  listed: true,
  order: 1,
  design: 'NEUTRAL',
  designApprovedBy: null,
  designApprovedAt: null,
  designApprovalNote: null,
  ...over,
});
const APPROVED = {
  designApprovedBy: 'A. Person, Behringer',
  designApprovedAt: new Date('2026-09-01T00:00:00.000Z'),
  designApprovalNote: 'Email of 1 Sep',
};

/** The stored row: `update` applies its data to it, as the database would. */
let stored: Row;

const get = () =>
  GET(new Request('http://localhost/api/v1/admin/synths') as unknown as NextRequest, {
    params: Promise.resolve({}),
  });
const patch = (body: unknown, id = 'model-d') =>
  PATCH(
    new Request(`http://localhost/api/v1/admin/synths/${id}/design`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as NextRequest,
    { params: Promise.resolve({ id }) }
  );

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string; details?: Record<string, unknown> };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.TENANCY_MODE = 'single';
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
  mockPrisma.aiApiKey.findFirst.mockResolvedValue(null);
  mockPrisma.orgMembership.findUnique.mockResolvedValue({
    role: 'OWNER',
    org: { status: 'ACTIVE' },
  });
  mockGetSession.mockResolvedValue(session('ADMIN'));
  stored = synthRow();
  mockPrisma.synth.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
    args.where.id === stored.id ? { ...stored } : null
  );
  mockPrisma.synth.update.mockImplementation(async (args: { data: Partial<Row> }) => {
    stored = { ...stored, ...args.data };
    return { ...stored };
  });
});

describe('GET /api/v1/admin/synths', () => {
  it('lists every synth, unlisted and unplayable ones included, with its design and approval', async () => {
    mockPrisma.synth.findMany.mockResolvedValue([
      synthRow({ design: 'FAITHFUL', ...APPROVED }),
      synthRow({ id: 'no-such-synth', name: 'Gone', listed: false, order: 2 }),
    ]);

    const res = await get();

    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual([
      {
        id: 'model-d',
        name: 'Model D',
        maker: 'Behringer',
        listed: true,
        order: 1,
        playable: true,
        design: 'faithful',
        approval: {
          approvedBy: 'A. Person, Behringer',
          approvedAt: '2026-09-01',
          note: 'Email of 1 Sep',
        },
      },
      {
        id: 'no-such-synth',
        name: 'Gone',
        maker: 'Behringer',
        listed: false,
        order: 2,
        playable: false,
        design: 'neutral',
        approval: null,
      },
    ]);
    // No `listed` filter: the admin sees the whole catalogue.
    expect(mockPrisma.synth.findMany.mock.calls[0][0]).not.toHaveProperty('where');
  });

  it('is admin only', async () => {
    mockGetSession.mockResolvedValue(session('USER'));
    expect((await get()).status).toBe(403);
    mockGetSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(mockPrisma.synth.findMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/admin/synths/[id]/design', () => {
  it('refuses faithful when the synth has no approval and none is given, and writes nothing', async () => {
    const res = await patch({ design: 'faithful' });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
    expect(body.error?.details).toHaveProperty('approval');
    expect(mockPrisma.synth.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('switches to faithful with an approval, audits it, and leaves editedAt alone', async () => {
    const res = await patch({
      design: 'faithful',
      approval: {
        approvedBy: 'A. Person, Behringer',
        approvedAt: '2026-09-01',
        note: 'Email of 1 Sep',
      },
    });

    expect(res.status).toBe(200);
    expect((await json(res)).data).toMatchObject({
      design: 'faithful',
      approval: {
        approvedBy: 'A. Person, Behringer',
        approvedAt: '2026-09-01',
        note: 'Email of 1 Sep',
      },
    });
    const data = mockPrisma.synth.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ design: 'FAITHFUL', designApprovedBy: 'A. Person, Behringer' });
    expect(data).not.toHaveProperty('editedAt');
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'synth.design.update',
        entityType: 'synth',
        entityId: 'model-d',
        entityName: 'Behringer Model D',
        changes: {
          design: { from: 'neutral', to: 'faithful' },
          approval: {
            from: null,
            to: {
              approvedBy: 'A. Person, Behringer',
              approvedAt: '2026-09-01',
              note: 'Email of 1 Sep',
            },
          },
        },
      })
    );
  });

  it('switches to faithful on an approval already recorded', async () => {
    stored = synthRow(APPROVED);
    const res = await patch({ design: 'faithful' });
    expect(res.status).toBe(200);
    expect(stored.design).toBe('FAITHFUL');
  });

  it('keeps the approval when the synth goes back to neutral', async () => {
    stored = synthRow({ design: 'FAITHFUL', ...APPROVED });
    const res = await patch({ design: 'neutral' });

    expect(res.status).toBe(200);
    expect((await json(res)).data).toMatchObject({
      design: 'neutral',
      approval: { approvedBy: 'A. Person, Behringer' },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { design: { from: 'faithful', to: 'neutral' } } })
    );
  });

  it('writes no audit entry when nothing changed', async () => {
    const res = await patch({ design: 'neutral' });
    expect(res.status).toBe(200);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown synth', async () => {
    const res = await patch({ design: 'neutral' }, 'no-such-synth');
    expect(res.status).toBe(404);
    expect(mockPrisma.synth.update).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown design', { design: 'shiny' }],
    [
      'an empty approver',
      { design: 'faithful', approval: { approvedBy: ' ', approvedAt: '2026-09-01' } },
    ],
    [
      'a date that is not a day',
      { design: 'faithful', approval: { approvedBy: 'A', approvedAt: 'soon' } },
    ],
    [
      'a future date',
      { design: 'faithful', approval: { approvedBy: 'A', approvedAt: '2999-01-01' } },
    ],
    ['an unknown field', { design: 'neutral', editedAt: '2026-01-01' }],
  ])('refuses %s', async (_label, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(mockPrisma.synth.update).not.toHaveBeenCalled();
  });

  it('refuses an id that cannot be a synth', async () => {
    const res = await patch({ design: 'neutral' }, 'Model_D');
    expect(res.status).toBe(400);
    expect(mockPrisma.synth.findUnique).not.toHaveBeenCalled();
  });

  it('is admin only', async () => {
    mockGetSession.mockResolvedValue(session('USER'));
    expect((await patch({ design: 'neutral' })).status).toBe(403);
    mockGetSession.mockResolvedValue(null);
    expect((await patch({ design: 'neutral' })).status).toBe(401);
    expect(mockPrisma.synth.update).not.toHaveBeenCalled();
  });
});
