/**
 * Unit Tests: a signed-in user's settings and last panels (`f-my-sounds` s3), `/api/v1/me/settings` and
 * `/api/v1/me/panels/:synthId`.
 *
 * Real routes, real `withAuth`, the real `lib/app/sounds/preferences.ts` and the real Model D definition. Both tables
 * are small stateful fakes keyed the way the schema keys them, so a query that forgot the owner would reach another
 * user's row here too. Pins:
 *
 * - every route needs a session;
 * - settings start as nulls, a change touches only what it names, and each user has their own;
 * - a last panel is kept under the caller on the synth's current definition version, replaced by the next, and read
 *   back fitted to the synth as it is now; another user's is not the caller's;
 * - a panel that does not fit the synth, a synth that is not listed, and a malformed body are refused, storing nothing.
 *
 * What a unit test cannot prove, because it has no database, is in `npm run smoke:sounds`: the hand-written cascades
 * that erase both through `eraseUser`, and the export that carries them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

const mockPrisma = vi.hoisted((): Record<string, unknown> => ({}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import { GET as readSettings, PATCH as changeSettings } from '@/app/api/v1/me/settings/route';
import { GET as readPanel, PUT as keepPanel } from '@/app/api/v1/me/panels/[synthId]/route';
import { getSynthDef } from '@/lib/app/synths/defs';
import { FX_DEFAULT } from '@/lib/app/synths/audio/fx';
import type { Control } from '@/lib/app/synths/contract';
import { createMockAuthSession } from '@/tests/helpers/auth';

type Row = Record<string, unknown>;

const modelD = getSynthDef('model-d')!;
const cont = modelD.controls.find(
  (c): c is Extract<Control, { kind: 'cont' }> => c.kind === 'cont'
)!;
const outJack = modelD.jacks.find((j) => j.dir === 'out' && j.signal)!;
const inJack = modelD.jacks.find((j) => j.dir === 'in' && j.dest)!;

const panel = { values: { [cont.id]: cont.min }, cables: [[outJack.id, inJack.id]] };
const last = { presetId: 'stacked-night-bass', step: 2, soundId: 'cmmine1', panel };

function session(id: string) {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID, userId: id },
    user: { ...base.user, id, role: 'USER' },
  };
}
const signIn = (id: string) => mockGetSession.mockResolvedValue(session(id));

function request(method: string, url: string, body?: unknown) {
  const req = new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest;
}
const ctx = (synthId: string) => ({ params: Promise.resolve({ synthId }) });

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: Row | null;
    error?: { code: string; details?: { errors?: { path: string }[] } };
  };
}

/** A table in memory keyed by `key(where)`, with the `findUnique` and `upsert` the store calls. */
function keyedTable(key: (where: Row) => string) {
  const rows = new Map<string, Row>();
  return {
    rows,
    client: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const row = rows.get(key(where));
        return row ? { ...row } : null;
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const k = key(where);
        const row = { ...(rows.get(k) ?? create), ...update, updatedAt: new Date() };
        rows.set(k, row);
        return { ...row };
      }),
    },
  };
}

let settings: ReturnType<typeof keyedTable>;
let panels: ReturnType<typeof keyedTable>;

beforeEach(() => {
  vi.clearAllMocks();
  settings = keyedTable((w) => String(w.userId));
  panels = keyedTable((w) => {
    const k = w.userId_synthId as { userId: string; synthId: string };
    return `${k.userId}/${k.synthId}`;
  });
  mockPrisma.userPreference = settings.client;
  mockPrisma.synthPreference = panels.client;
  mockPrisma.synth = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === 'model-d' ? { listed: true } : where.id === 'minimoog' ? { listed: false } : null
    ),
  };
  signIn('user-1');
});

describe('a session is required', () => {
  it('refuses every route without one, and touches nothing', async () => {
    mockGetSession.mockResolvedValue(null);
    const responses = [
      await readSettings(request('GET', '/api/v1/me/settings')),
      await changeSettings(request('PATCH', '/api/v1/me/settings', { tips: false })),
      await readPanel(request('GET', '/api/v1/me/panels/model-d'), ctx('model-d')),
      await keepPanel(request('PUT', '/api/v1/me/panels/model-d', last), ctx('model-d')),
    ];
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(settings.client.findUnique).not.toHaveBeenCalled();
    expect(settings.client.upsert).not.toHaveBeenCalled();
    expect(panels.client.findUnique).not.toHaveBeenCalled();
    expect(panels.client.upsert).not.toHaveBeenCalled();
  });
});

describe('settings', () => {
  it('are all null before the account has any', async () => {
    const res = await readSettings(request('GET', '/api/v1/me/settings'));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({
      tips: null,
      dim: null,
      heat: null,
      harm: null,
      fx: null,
    });
  });

  it('change only what a request names, and read back as changed', async () => {
    await changeSettings(request('PATCH', '/api/v1/me/settings', { tips: false, dim: true }));
    const fx = { ...FX_DEFAULT, on: true, delay: { ...FX_DEFAULT.delay, mix: 0.6 } };
    const res = await changeSettings(request('PATCH', '/api/v1/me/settings', { fx }));
    expect(res.status).toBe(200);
    const expected = { tips: false, dim: true, heat: null, harm: null, fx };
    expect((await json(res)).data).toEqual(expected);
    expect((await json(await readSettings(request('GET', '/api/v1/me/settings')))).data).toEqual(
      expected
    );
    expect([...settings.rows.keys()]).toEqual(['user-1']);
  });

  it('are each user’s own', async () => {
    await changeSettings(request('PATCH', '/api/v1/me/settings', { harm: true }));
    signIn('user-2');
    expect(
      (await json(await readSettings(request('GET', '/api/v1/me/settings')))).data
    ).toMatchObject({ harm: null });
    expect(settings.client.findUnique).toHaveBeenLastCalledWith({ where: { userId: 'user-2' } });
  });

  it('refuse an empty change, an unknown key and an out-of-range rack, storing nothing', async () => {
    const bad = [
      {},
      { tips: 'yes' },
      { scope: true },
      { fx: { ...FX_DEFAULT, reverb: { ...FX_DEFAULT.reverb, mix: 2 } } },
      { fx: { on: true } },
    ];
    for (const body of bad) {
      const res = await changeSettings(request('PATCH', '/api/v1/me/settings', body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(settings.client.upsert).not.toHaveBeenCalled();
  });

  it('read a stored rack field by field, so a bad stored value falls back to its default', async () => {
    settings.rows.set('user-1', {
      userId: 'user-1',
      tips: true,
      dim: null,
      heat: null,
      harm: null,
      fx: { on: 'yes', drive: { amount: 9 } },
    });
    const { data } = await json(await readSettings(request('GET', '/api/v1/me/settings')));
    expect(data).toMatchObject({
      tips: true,
      fx: { ...FX_DEFAULT, drive: { ...FX_DEFAULT.drive, amount: 1 } },
    });
  });
});

describe('the last panel', () => {
  it('is null on a synth the caller has not played', async () => {
    const res = await readPanel(request('GET', '/api/v1/me/panels/model-d'), ctx('model-d'));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toBeNull();
  });

  it('is kept under the caller on the current definition version, and read back fitted to the synth', async () => {
    const res = await keepPanel(request('PUT', '/api/v1/me/panels/model-d', last), ctx('model-d'));
    expect(res.status).toBe(200);
    expect(panels.rows.get('user-1/model-d')).toMatchObject({
      userId: 'user-1',
      synthId: 'model-d',
      definitionVersion: modelD.version,
      presetId: 'stacked-night-bass',
      step: 2,
      soundId: 'cmmine1',
      values: panel.values,
      cables: panel.cables,
    });

    const { data } = await json(
      await readPanel(request('GET', '/api/v1/me/panels/model-d'), ctx('model-d'))
    );
    // Every control the panel did not name takes its init, as the page's own copy does.
    expect(data).toMatchObject({
      synthId: 'model-d',
      presetId: 'stacked-night-bass',
      step: 2,
      soundId: 'cmmine1',
      values: { ...modelD.init, [cont.id]: cont.min },
      cables: panel.cables,
    });
  });

  it('is replaced by the next one, not added to', async () => {
    await keepPanel(request('PUT', '/api/v1/me/panels/model-d', last), ctx('model-d'));
    const next = { presetId: null, step: null, soundId: null, panel: { values: {}, cables: [] } };
    await keepPanel(request('PUT', '/api/v1/me/panels/model-d', next), ctx('model-d'));
    expect(panels.rows.size).toBe(1);
    expect(panels.rows.get('user-1/model-d')).toMatchObject({ presetId: null, cables: [] });
  });

  it('is the caller’s own: another user reads none', async () => {
    await keepPanel(request('PUT', '/api/v1/me/panels/model-d', last), ctx('model-d'));
    signIn('user-2');
    const { data } = await json(
      await readPanel(request('GET', '/api/v1/me/panels/model-d'), ctx('model-d'))
    );
    expect(data).toBeNull();
  });

  it('fits a stored panel to the synth: a value out of range is clamped, what the synth no longer has is dropped', async () => {
    panels.rows.set('user-1/model-d', {
      userId: 'user-1',
      synthId: 'model-d',
      definitionVersion: modelD.version - 1,
      presetId: null,
      step: null,
      soundId: null,
      values: { [cont.id]: cont.max + 1000, 'gone.knob': 3 },
      cables: [['nowhere', inJack.id]],
      updatedAt: new Date(),
    });
    const { data } = await json(
      await readPanel(request('GET', '/api/v1/me/panels/model-d'), ctx('model-d'))
    );
    expect(data?.values).toEqual({ ...modelD.init, [cont.id]: cont.max });
    expect(data?.cables).toEqual([]);
  });

  it('refuses a panel that does not fit, naming the problem, and stores nothing', async () => {
    const res = await keepPanel(
      request('PUT', '/api/v1/me/panels/model-d', {
        ...last,
        panel: { values: { [cont.id]: cont.max + 1000 }, cables: [] },
      }),
      ctx('model-d')
    );
    expect(res.status).toBe(400);
    const { error } = await json(res);
    expect(error?.details?.errors?.map((e) => e.path)).toContain(`panel.values.${cont.id}`);
    expect(panels.client.upsert).not.toHaveBeenCalled();
  });

  it('refuses an unlisted synth, an unknown one, a bad id and a malformed body, storing nothing', async () => {
    const statuses = [
      (await keepPanel(request('PUT', '/api/v1/me/panels/minimoog', last), ctx('minimoog'))).status,
      (await keepPanel(request('PUT', '/api/v1/me/panels/nope', last), ctx('nope'))).status,
      (await keepPanel(request('PUT', '/api/v1/me/panels/Bad%20Id', last), ctx('Bad Id'))).status,
      (await readPanel(request('GET', '/api/v1/me/panels/Bad%20Id'), ctx('Bad Id'))).status,
      (
        await keepPanel(
          request('PUT', '/api/v1/me/panels/model-d', { ...last, step: -1 }),
          ctx('model-d')
        )
      ).status,
      (
        await keepPanel(
          request('PUT', '/api/v1/me/panels/model-d', { ...last, soundId: 'NOT A SOUND' }),
          ctx('model-d')
        )
      ).status,
    ];
    expect(statuses).toEqual([400, 400, 400, 400, 400, 400]);
    expect(panels.client.upsert).not.toHaveBeenCalled();
  });
});
