/**
 * Unit Tests: users' own sounds (`f-my-sounds` s1), `/api/v1/sounds` and `/api/v1/sounds/:id`.
 *
 * Real routes, real `withAuth`, the real `lib/app/sounds/store.ts`, the real Model D definition and its real library
 * sounds as the seed writes them (`tests/helpers/synth-detail.ts`). The user sounds table is a small stateful fake that
 * honours the filters the store relies on, so a query that forgot the owner would reach another user's row here too.
 * Pins:
 *
 * - every route needs a session;
 * - a sound is stored under the caller, on the synth's current definition version, and read back with its panel;
 * - another user's sound is a 404 on read, change and delete, and is left as it was; their list is not the caller's;
 * - a panel that does not fit the synth is refused with every problem named, and nothing is stored;
 * - copying a library sound records its credit, and with no panel the copy is the library sound as it ends;
 * - a sound saved on an older definition version is listed and kept, but has no panel to play, and says why.
 *
 * What a unit test cannot prove, because it has no database, is in `npm run smoke:sounds`: the hand-written cascade
 * that erases a user's sounds through `eraseUser`, and the export that carries them.
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

import { GET as list, POST as create } from '@/app/api/v1/sounds/route';
import { GET as read, PATCH as change, DELETE as remove } from '@/app/api/v1/sounds/[id]/route';
import { getSynthDef } from '@/lib/app/synths/defs';
import { presetState } from '@/lib/app/synths/lib/patch';
import type { Control } from '@/lib/app/synths/contract';
import { createMockAuthSession } from '@/tests/helpers/auth';
import { synthRows } from '@/tests/helpers/synth-detail';

type Row = Record<string, unknown>;

const modelD = getSynthDef('model-d')!;
const librarySounds = synthRows('model-d').stored.sounds;
const firstSound = librarySounds[0];

/** A continuous control on Model D, to set legally and illegally. */
const cont = modelD.controls.find(
  (c): c is Extract<Control, { kind: 'cont' }> => c.kind === 'cont'
)!;
/** A cable Model D's engine models: a signal-carrying output to a destination input. */
const outJack = modelD.jacks.find((j) => j.dir === 'out' && j.signal)!;
const inJack = modelD.jacks.find((j) => j.dir === 'in' && j.dest)!;

const panel = { values: { [cont.id]: cont.min }, cables: [[outJack.id, inJack.id]] };

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
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: Row & Row[];
    error?: { code: string; message: string; details?: { errors?: { path: string }[] } };
  };
}

/** The user sounds table in memory: what the store calls, each filter honoured field by field. */
function userSoundTable() {
  const rows: Row[] = [];
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  let n = 0;
  return {
    rows,
    client: {
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) =>
        rows
          .filter((r) => matches(r, where))
          .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
          .map((r) => ({ ...r }))
      ),
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const at = new Date(Date.UTC(2026, 9, 15, 0, ++n));
        const row = { id: `snd${n}`, notes: null, createdAt: at, updatedAt: at, ...data };
        rows.push(row);
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit)
          Object.assign(r, data, { updatedAt: new Date(Date.UTC(2026, 9, 16, 0, ++n)) });
        return { count: hit.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit) rows.splice(rows.indexOf(r), 1);
        return { count: hit.length };
      }),
    },
  };
}

let table: ReturnType<typeof userSoundTable>;

beforeEach(() => {
  vi.clearAllMocks();
  table = userSoundTable();
  mockPrisma.userSound = table.client;
  mockPrisma.synth = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === 'model-d' ? { listed: true } : null
    ),
  };
  mockPrisma.synthSound = {
    findUnique: vi.fn(
      async ({ where }: { where: { synthId_slug: { synthId: string; slug: string } } }) =>
        librarySounds.find(
          (s) => s.synthId === where.synthId_slug.synthId && s.slug === where.synthId_slug.slug
        ) ?? null
    ),
  };
  signIn('user-1');
});

async function save(body: unknown) {
  return create(request('POST', '/api/v1/sounds', body));
}

describe('a session is required', () => {
  it('refuses every route without one, and touches nothing', async () => {
    mockGetSession.mockResolvedValue(null);
    const responses = [
      await list(request('GET', '/api/v1/sounds')),
      await save({ synthId: 'model-d', name: 'x', panel }),
      await read(request('GET', '/api/v1/sounds/snd1'), ctx('snd1')),
      await change(request('PATCH', '/api/v1/sounds/snd1', { name: 'y' }), ctx('snd1')),
      await remove(request('DELETE', '/api/v1/sounds/snd1'), ctx('snd1')),
    ];
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    expect(table.client.create).not.toHaveBeenCalled();
    expect(table.client.findMany).not.toHaveBeenCalled();
  });
});

describe('saving and reading back', () => {
  it('stores the panel under the caller, on the current definition version, and reads it back', async () => {
    const res = await save({ synthId: 'model-d', name: 'Night bass', notes: 'darker', panel });
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data).toMatchObject({
      synthId: 'model-d',
      name: 'Night bass',
      notes: 'darker',
      definitionVersion: modelD.version,
      source: null,
      playable: true,
      panel,
      problems: [],
    });
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({ userId: 'user-1', definitionVersion: modelD.version });

    const got = await json(
      await read(request('GET', `/api/v1/sounds/${String(data!.id)}`), ctx(String(data!.id)))
    );
    expect(got.data).toMatchObject({ id: data!.id, name: 'Night bass', panel });
  });

  it("lists only the caller's sounds, newest change first, without panels, and narrows by synth", async () => {
    await save({ synthId: 'model-d', name: 'First', panel });
    await save({ synthId: 'model-d', name: 'Second', panel });
    signIn('user-2');
    await save({ synthId: 'model-d', name: 'Theirs', panel });
    signIn('user-1');

    const { data } = await json(await list(request('GET', '/api/v1/sounds')));
    expect(data!.map((s) => s.name)).toEqual(['Second', 'First']);
    expect(data![0]).not.toHaveProperty('panel');
    expect(data![0]).toMatchObject({ playable: true });

    const none = await json(await list(request('GET', '/api/v1/sounds?synthId=neutron')));
    expect(none.data).toEqual([]);
    const some = await json(await list(request('GET', '/api/v1/sounds?synthId=model-d')));
    expect(some.data).toHaveLength(2);
  });

  it('refuses a synth that is not in the catalogue', async () => {
    const res = await save({ synthId: 'neutron', name: 'x', panel });
    expect(res.status).toBe(400);
    expect((await json(res)).error?.details?.errors?.[0].path).toBe('synthId');
    expect(table.rows).toHaveLength(0);
  });
});

describe('a panel that does not fit the synth is refused', () => {
  it('names every problem, by path, and stores nothing', async () => {
    const res = await save({
      synthId: 'model-d',
      name: 'Broken',
      panel: {
        values: { [cont.id]: cont.max + 1, 'no-such-control': 1 },
        cables: [[inJack.id, outJack.id]],
      },
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
    expect(body.error?.details?.errors?.map((e) => e.path).sort()).toEqual([
      'panel.cables.0',
      `panel.values.${cont.id}`,
      'panel.values.no-such-control',
    ]);
    expect(table.rows).toHaveLength(0);
  });

  it('is refused on a change too, leaving the stored panel as it was', async () => {
    const { data } = await json(await save({ synthId: 'model-d', name: 'Good', panel }));
    const res = await change(
      request('PATCH', `/api/v1/sounds/${String(data!.id)}`, {
        panel: { values: { [cont.id]: 'loud' }, cables: [] },
      }),
      ctx(String(data!.id))
    );
    expect(res.status).toBe(400);
    expect(table.rows[0]).toMatchObject({ values: panel.values, cables: panel.cables });
  });

  it('is refused on a synth that has been unlisted since, the same as a new sound', async () => {
    const { data } = await json(await save({ synthId: 'model-d', name: 'Good', panel }));
    mockPrisma.synth = { findUnique: vi.fn(async () => ({ listed: false })) };
    const next = { values: { [cont.id]: cont.max }, cables: [] };
    const res = await change(
      request('PATCH', `/api/v1/sounds/${String(data!.id)}`, { panel: next }),
      ctx(String(data!.id))
    );
    expect(res.status).toBe(400);
    expect(table.client.updateMany).not.toHaveBeenCalled();
    expect(table.rows[0]).toMatchObject({ values: panel.values, cables: panel.cables });
  });
});

describe("another user's sound is a 404", () => {
  let theirs: string;
  beforeEach(async () => {
    signIn('user-2');
    theirs = String(
      (await json(await save({ synthId: 'model-d', name: 'Theirs', panel }))).data!.id
    );
    signIn('user-1');
  });

  it('on read, change and delete, and is left as it was', async () => {
    const responses = [
      await read(request('GET', `/api/v1/sounds/${theirs}`), ctx(theirs)),
      await change(request('PATCH', `/api/v1/sounds/${theirs}`, { name: 'Mine now' }), ctx(theirs)),
      await remove(request('DELETE', `/api/v1/sounds/${theirs}`), ctx(theirs)),
    ];
    expect(responses.map((r) => r.status)).toEqual([404, 404, 404]);
    for (const r of responses) expect((await json(r)).error?.code).toBe('NOT_FOUND');
    expect(table.rows).toEqual([
      expect.objectContaining({ id: theirs, userId: 'user-2', name: 'Theirs' }),
    ]);
  });

  it('reads the same as an id nobody has, and an id that cannot be one', async () => {
    const missing = await read(request('GET', '/api/v1/sounds/nobodys'), ctx('nobodys'));
    const malformed = await read(request('GET', '/api/v1/sounds/NOT_AN_ID!'), ctx('NOT_AN_ID!'));
    const malformedChange = await change(
      request('PATCH', '/api/v1/sounds/NOT_AN_ID!', { name: 'x' }),
      ctx('NOT_AN_ID!')
    );
    const malformedDelete = await remove(
      request('DELETE', '/api/v1/sounds/NOT_AN_ID!'),
      ctx('NOT_AN_ID!')
    );
    expect([
      missing.status,
      malformed.status,
      malformedChange.status,
      malformedDelete.status,
    ]).toEqual([404, 404, 404, 404]);
    expect(table.client.updateMany).not.toHaveBeenCalled();
    expect(table.client.deleteMany).not.toHaveBeenCalled();
  });
});

describe('changing and deleting', () => {
  it('renames, clears the notes and saves a new panel on the current version', async () => {
    const { data } = await json(await save({ synthId: 'model-d', name: 'Old', notes: 'n', panel }));
    const id = String(data!.id);
    table.rows[0].definitionVersion = 0;
    const next = { values: { [cont.id]: cont.max }, cables: [] };
    const res = await change(
      request('PATCH', `/api/v1/sounds/${id}`, { name: 'New', notes: null, panel: next }),
      ctx(id)
    );
    expect(res.status).toBe(200);
    expect((await json(res)).data).toMatchObject({
      name: 'New',
      notes: null,
      panel: next,
      definitionVersion: modelD.version,
    });
  });

  it('refuses a change that changes nothing', async () => {
    const { data } = await json(await save({ synthId: 'model-d', name: 'Old', panel }));
    const res = await change(
      request('PATCH', `/api/v1/sounds/${String(data!.id)}`, {}),
      ctx(String(data!.id))
    );
    expect(res.status).toBe(400);
  });

  it("deletes the caller's sound, and a second delete is a 404", async () => {
    const { data } = await json(await save({ synthId: 'model-d', name: 'Gone', panel }));
    const id = String(data!.id);
    expect((await remove(request('DELETE', `/api/v1/sounds/${id}`), ctx(id))).status).toBe(200);
    expect(table.rows).toHaveLength(0);
    expect((await remove(request('DELETE', `/api/v1/sounds/${id}`), ctx(id))).status).toBe(404);
  });
});

describe('copying a library sound', () => {
  it('records the credit, and with no panel copies the library sound as it ends', async () => {
    const res = await save({ synthId: 'model-d', source: { slug: firstSound.slug } });
    expect(res.status).toBe(201);
    const { data } = await json(res);

    const steps = (firstSound.steps as { set?: Row; cables?: [string, string][] }[]).length;
    expect(steps).toBeGreaterThan(0);
    const ends = presetState(modelD, {
      steps: firstSound.steps as never,
      phrase: firstSound.phrase as never,
    });
    expect(data).toMatchObject({
      name: firstSound.name,
      source: {
        soundId: firstSound.id,
        slug: firstSound.slug,
        name: firstSound.name,
        ref: firstSound.ref,
      },
      panel: { values: ends.values, cables: ends.cables.map((c) => [c.from, c.to]) },
    });
    // Not the init patch: the library sound's steps changed something.
    expect(ends.values).not.toEqual(modelD.init);
    expect(table.rows[0]).toMatchObject({
      sourceSoundId: firstSound.id,
      sourceSlug: firstSound.slug,
      sourceName: firstSound.name,
      sourceRef: firstSound.ref,
    });
  });

  it('keeps a panel it is sent, and its own name, with the credit', async () => {
    const { data } = await json(
      await save({ synthId: 'model-d', name: 'My take', source: { slug: firstSound.slug }, panel })
    );
    expect(data).toMatchObject({ name: 'My take', panel, source: { slug: firstSound.slug } });
  });

  it('keeps the credit once the library sound is gone', async () => {
    const { data } = await json(
      await save({ synthId: 'model-d', source: { slug: firstSound.slug } })
    );
    table.rows[0].sourceSoundId = null; // what ON DELETE SET NULL leaves
    const got = await json(
      await read(request('GET', `/api/v1/sounds/${String(data!.id)}`), ctx(String(data!.id)))
    );
    expect(got.data?.source).toEqual({
      soundId: null,
      slug: firstSound.slug,
      name: firstSound.name,
      ref: firstSound.ref,
    });
  });

  it('refuses a library sound the synth does not have', async () => {
    const res = await save({ synthId: 'model-d', source: { slug: 'no-such-sound' } });
    expect(res.status).toBe(400);
    expect((await json(res)).error?.details?.errors?.[0].path).toBe('source.slug');
    expect(table.rows).toHaveLength(0);
  });

  it('needs a panel or a source, and a name or a source', async () => {
    expect((await save({ synthId: 'model-d', name: 'x' })).status).toBe(400);
    expect((await save({ synthId: 'model-d', panel })).status).toBe(400);
    expect(table.rows).toHaveLength(0);
  });
});

describe('a sound saved on an older definition version', () => {
  it('is listed and kept, but has no panel to play, and says why', async () => {
    const { data } = await json(await save({ synthId: 'model-d', name: 'Old one', panel }));
    const id = String(data!.id);
    table.rows[0].definitionVersion = modelD.version - 1;

    const got = await json(await read(request('GET', `/api/v1/sounds/${id}`), ctx(id)));
    expect(got.data).toMatchObject({ playable: false, panel: null });
    expect(got.data?.problems).toEqual([expect.stringContaining('no mapping')]);

    const listed = await json(await list(request('GET', '/api/v1/sounds')));
    expect(listed.data).toEqual([expect.objectContaining({ id, playable: false })]);
  });

  it('is not served when its stored panel no longer fits, and that is logged', async () => {
    const { data } = await json(await save({ synthId: 'model-d', name: 'Bent', panel }));
    const id = String(data!.id);
    table.rows[0].values = { 'no-such-control': 1 };
    const got = await json(await read(request('GET', `/api/v1/sounds/${id}`), ctx(id)));
    expect(got.data).toMatchObject({ playable: false, panel: null });
    expect(mockLog.error).toHaveBeenCalledWith(
      'user sounds: stored panel fails validation',
      expect.objectContaining({ soundId: id })
    );
  });

  it('is listed as not playable without logging an error on every list', async () => {
    const { data } = await json(await save({ synthId: 'model-d', name: 'Bent', panel }));
    const id = String(data!.id);
    table.rows[0].values = { 'no-such-control': 1 };
    const listed = await json(await list(request('GET', '/api/v1/sounds')));
    expect(listed.data).toEqual([expect.objectContaining({ id, playable: false })]);
    expect(mockLog.error).not.toHaveBeenCalled();
  });
});
