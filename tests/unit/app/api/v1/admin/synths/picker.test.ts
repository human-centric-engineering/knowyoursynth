/**
 * Unit Tests: the synth picker's site settings, for admins and for every visitor (`f-synth-picker` t-329).
 *
 * Real routes, real `withAdminAuth` and the real `lib/app/picker/site-settings.ts`, over a fake of the one row. Pins:
 *
 * - the admin routes are admin only, and a refused request writes and audits nothing;
 * - GET is the defaults until an admin saves, and the saved settings after;
 * - PUT takes only whole, valid settings, writes the one row and audits the change, and audits nothing when nothing
 *   changed;
 * - the public read needs no session, serves the same settings, and answers a repeat with a 304.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

const table = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));
const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(async () => []),
  $transaction: vi.fn(),
  synthPickerSettings: {
    // As Prisma does, only the columns selected.
    findUnique: vi.fn(async ({ select }: { select: Record<string, boolean> }) => {
      const row = table.row;
      return row ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : null;
    }),
    upsert: vi.fn(
      async ({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        table.row = table.row ? { ...table.row, ...update } : { ...create };
        return table.row;
      }
    ),
  },
}));
mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
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

import { GET as adminGet, PUT as adminPut } from '@/app/api/v1/admin/synths/picker/route';
import { GET as publicGet } from '@/app/api/v1/synths/picker-settings/route';
import { FACTORY_PICKER, type SitePickerSettings } from '@/lib/app/picker/settings';
import { createMockAuthSession } from '@/tests/helpers/auth';

const SAVED: SitePickerSettings = {
  group: 'lineage',
  order: 'old',
  kinds: ['modular', 'module'],
  thumbs: false,
  visitorsMayChange: false,
  offerAll: false,
};

function session(role: 'USER' | 'ADMIN') {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID },
    user: { ...base.user, role },
  };
}

function request(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest;
}
const ADMIN_URL = '/api/v1/admin/synths/picker';
const PUBLIC_URL = '/api/v1/synths/picker-settings';

async function json(res: Response) {
  return JSON.parse(await res.text()) as { success: boolean; data?: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  table.row = null;
  mockGetSession.mockResolvedValue(session('ADMIN'));
});

describe('admin only', () => {
  it('refuses a signed-in user who is not an admin, on the read and the write, and writes nothing', async () => {
    mockGetSession.mockResolvedValue(session('USER'));
    const responses = [
      await adminGet(request('GET', ADMIN_URL)),
      await adminPut(request('PUT', ADMIN_URL, SAVED)),
    ];
    expect(responses.map((r) => r.status)).toEqual([403, 403]);
    expect(mockPrisma.synthPickerSettings.upsert).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('refuses a request with no session', async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await adminPut(request('PUT', ADMIN_URL, SAVED))).status).toBe(401);
    expect(mockPrisma.synthPickerSettings.upsert).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/synths/picker', () => {
  it('is the defaults until an admin saves, then the saved settings', async () => {
    expect((await json(await adminGet(request('GET', ADMIN_URL)))).data).toEqual(FACTORY_PICKER);
    table.row = { id: 'site', ...SAVED, updatedAt: new Date() };
    expect((await json(await adminGet(request('GET', ADMIN_URL)))).data).toEqual(SAVED);
  });
});

describe('PUT /api/v1/admin/synths/picker', () => {
  it('writes the one row, answers with it, and audits what changed', async () => {
    const res = await adminPut(request('PUT', ADMIN_URL, SAVED));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual(SAVED);
    expect(table.row).toMatchObject({ id: 'site', ...SAVED });
    expect(mockLogAdminAction).toHaveBeenCalledOnce();
    expect(mockLogAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'synth_picker.update',
      entityType: 'synth_picker',
      entityId: 'site',
      changes: expect.objectContaining({
        group: { from: 'maker', to: 'lineage' },
        visitorsMayChange: { from: true, to: false },
      }),
    });
  });

  it('audits nothing for a save that changes nothing', async () => {
    await adminPut(request('PUT', ADMIN_URL, FACTORY_PICKER));
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('refuses settings that are partial, unknown or carry another key, writing nothing', async () => {
    const { offerAll: _offerAll, ...partial } = SAVED;
    for (const body of [
      partial,
      { ...SAVED, group: 'year' },
      { ...SAVED, kinds: ['mono', 'mono'] },
      { ...SAVED, id: 'other' },
    ]) {
      const res = await adminPut(request('PUT', ADMIN_URL, body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(mockPrisma.synthPickerSettings.upsert).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/synths/picker-settings', () => {
  it('serves the site settings with no session, and a 304 to a client that has them', async () => {
    mockGetSession.mockResolvedValue(null);
    table.row = { id: 'site', ...SAVED, updatedAt: new Date() };
    const res = await publicGet(request('GET', PUBLIC_URL));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual(SAVED);
    const etag = res.headers.get('ETag');
    expect(etag).toMatch(/^W\/".+"$/);

    const again = await publicGet(
      request('GET', PUBLIC_URL, undefined, { 'If-None-Match': etag! })
    );
    expect(again.status).toBe(304);
  });

  it('serves the defaults until an admin saves', async () => {
    expect((await json(await publicGet(request('GET', PUBLIC_URL)))).data).toEqual(FACTORY_PICKER);
  });
});
