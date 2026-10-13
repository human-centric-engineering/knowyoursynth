/**
 * Unit Tests: POST /api/v1/admin/synths/:id/content, the catalogue content upload (f-catalogue-admin t-33).
 *
 * The real route, real `withAdminAuth` and the real `lib/app/catalogue/upload.ts`, over the stateful fake of the
 * catalogue tables seeded from Model D's real data. Storage and the upload limiter are stubbed. Pins:
 *
 * - admin only;
 * - a valid file is stored privately, written, reported and audited with a reference to the stored file;
 * - a refused file (any problem, or a synth with no definition) is neither stored nor written nor audited;
 * - the upload sub-cap refuses before the body is read;
 * - with no storage the upload is refused and nothing is written;
 * - a write that fails removes the stored file.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

const mockPrisma = vi.hoisted(() => ({}));
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

const mockStorage = vi.hoisted(() => ({
  name: 'local',
  upload: vi.fn(async (body: Buffer, opts: { key: string }) => ({
    key: opts.key,
    url: `http://storage/${opts.key}`,
    size: body.length,
  })),
  delete: vi.fn(async (key: string) => ({ success: true, key })),
}));
const mockGetStorageClient = vi.hoisted(() => vi.fn<() => typeof mockStorage | null>());
vi.mock('@/lib/storage/client', () => ({ getStorageClient: mockGetStorageClient }));

const mockLimiterCheck = vi.hoisted(() => vi.fn());
vi.mock('@/lib/security/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security/rate-limit')>()),
  uploadLimiter: { check: mockLimiterCheck },
}));

import { POST } from '@/app/api/v1/admin/synths/[id]/content/route';
import { createMockAuthSession } from '@/tests/helpers/auth';
import {
  catalogueTables,
  seedRecordTable,
  type CatalogueTables,
} from '@/tests/helpers/catalogue-db';
import { seedCatalogue } from '@/lib/app/catalogue/seed';
import type { CatalogueSeedData, SynthContent } from '@/lib/app/catalogue/data';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

function session(role: 'USER' | 'ADMIN') {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID },
    user: { ...base.user, role },
  };
}

const real = loadCatalogueData();
const isModelD = (f: { synth: string }) => f.synth === 'model-d';
const modelDSounds = real.sounds.find(isModelD)!;

function sample(): CatalogueSeedData {
  const data = structuredClone(real);
  data.listing.synths = [{ id: 'model-d', order: 0, listed: true }];
  data.sounds = [{ ...modelDSounds, sounds: modelDSounds.sounds.slice(0, 2) }];
  data.lineage = [];
  data.notes = [];
  return data;
}

/** Model D's first `n` sounds as an upload. */
const content = (n: number): SynthContent => ({
  synth: 'model-d',
  version: modelDSounds.version,
  sounds: structuredClone(modelDSounds.sounds.slice(0, n)) as SynthContent['sounds'],
});

let db: CatalogueTables;
const writes = () =>
  Object.values(db).reduce(
    (n, t) =>
      n + t.create.mock.calls.length + t.update.mock.calls.length + t.updateMany.mock.calls.length,
    0
  );

const post = (body: unknown, id = 'model-d') =>
  POST(
    new Request(`http://localhost/api/v1/admin/synths/${id}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as NextRequest,
    { params: Promise.resolve({ id }) }
  );

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: { report: Record<string, Record<string, number>>; file: { path: string; size: number } };
    error?: {
      code: string;
      message: string;
      details?: { errors?: { path: string; message: string }[] };
    };
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  db = catalogueTables();
  Object.assign(mockPrisma, db, {
    catalogueSeedRecord: seedRecordTable(),
    orgMembership: {
      findUnique: vi.fn(async () => ({ role: 'OWNER', org: { status: 'ACTIVE' } })),
    },
    aiApiKey: { findFirst: vi.fn(async () => null), update: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    $queryRaw: vi.fn(async () => []),
  });
  await seedCatalogue(mockPrisma as unknown as TenancyClient, sample());
  for (const t of Object.values(db)) {
    t.create.mockClear();
    t.update.mockClear();
    t.updateMany.mockClear();
  }
  mockGetSession.mockResolvedValue(session('ADMIN'));
  mockGetStorageClient.mockReturnValue(mockStorage);
  mockLimiterCheck.mockReturnValue({ success: true, limit: 10, remaining: 9, reset: 0 });
});

describe('POST /api/v1/admin/synths/:id/content', () => {
  it('refuses a user who is not an admin, and stores and writes nothing', async () => {
    mockGetSession.mockResolvedValue(session('USER'));

    const res = await post(content(3));

    expect(res.status).toBe(403);
    expect(mockStorage.upload).not.toHaveBeenCalled();
    expect(writes()).toBe(0);
  });

  it('stores a valid file privately, writes it, reports what it did and audits it with the file', async () => {
    const body = content(3);

    const res = await post(body);
    const { data } = await json(res);

    expect(res.status).toBe(200);
    expect(data?.report.sounds).toEqual({ created: 1, updated: 0, unchanged: 2, edited: 0 });
    expect(db.synthSound.rows).toHaveLength(3);

    const [stored, opts] = mockStorage.upload.mock.calls[0];
    expect(JSON.parse(stored.toString('utf8'))).toEqual(body);
    expect(opts).toMatchObject({ contentType: 'application/json', public: false });
    expect(opts.key).toMatch(/^catalogue-uploads\/model-d\//);
    expect(data?.file).toEqual({ path: opts.key, size: stored.length });

    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
    expect(mockLogAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'synth.content_upload',
      entityType: 'synth',
      entityId: 'model-d',
      metadata: { file: { path: opts.key, size: stored.length }, report: data?.report },
    });
  });

  it('writes nothing on a re-upload, and still keeps and audits the file', async () => {
    await post(content(3));
    for (const t of Object.values(db)) {
      t.create.mockClear();
      t.update.mockClear();
    }

    const { data } = await json(await post(content(3)));

    expect(writes()).toBe(0);
    expect(data?.report.sounds).toEqual({ created: 0, updated: 0, unchanged: 3, edited: 0 });
    expect(mockStorage.upload).toHaveBeenCalledTimes(2);
    expect(mockLogAdminAction).toHaveBeenCalledTimes(2);
  });

  it('refuses a file with an invalid sound whole: names the problem, stores, writes and audits nothing', async () => {
    const body = content(3);
    body.sounds[2].tweaks = [{ ...body.sounds[2].tweaks[0], id: 'not-a-control' }];

    const res = await post(body);
    const { error } = await json(res);

    expect(res.status).toBe(400);
    expect(error?.details?.errors?.map((e) => e.message).join()).toContain('not-a-control');
    expect(mockStorage.upload).not.toHaveBeenCalled();
    expect(writes()).toBe(0);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('refuses a synth with no definition, saying adding one is developer work', async () => {
    const res = await post({ ...content(1), synth: 'moog-one' }, 'moog-one');
    const { error } = await json(res);

    expect(res.status).toBe(400);
    expect(error?.details?.errors?.[0].message).toContain('adding a synth is developer work');
    expect(mockStorage.upload).not.toHaveBeenCalled();
    expect(writes()).toBe(0);
  });

  it('refuses past the upload sub-cap before reading the body', async () => {
    mockLimiterCheck.mockReturnValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const res = await post(content(3));

    expect(res.status).toBe(429);
    expect(mockLimiterCheck).toHaveBeenCalledWith(expect.stringMatching(/^catalogue-content:/));
    expect(mockStorage.upload).not.toHaveBeenCalled();
    expect(writes()).toBe(0);
  });

  it('refuses when storage is not configured, writing nothing', async () => {
    mockGetStorageClient.mockReturnValue(null);

    const res = await post(content(3));

    expect(res.status).toBe(503);
    expect(writes()).toBe(0);
  });

  it('reports the write’s own failure when removing its file fails too', async () => {
    db.synth.rows.splice(0);
    mockStorage.delete.mockRejectedValueOnce(new Error('storage down'));

    const res = await post(content(3));

    expect(res.status).toBe(404);
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining('could not remove'),
      expect.objectContaining({ error: 'storage down' })
    );
  });

  it('removes the stored file when the write fails', async () => {
    db.synth.rows.splice(0);

    const res = await post(content(3));

    expect(res.status).toBe(404);
    const key = mockStorage.upload.mock.calls[0][1].key;
    expect(mockStorage.delete).toHaveBeenCalledWith(key);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});
