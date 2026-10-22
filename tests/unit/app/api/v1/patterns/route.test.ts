/**
 * Unit Tests: users' own patterns (`f-step-sequencer` t-81), `/api/v1/patterns`, `/api/v1/patterns/:id`, and a sound's
 * default pattern through `PATCH /api/v1/sounds/:id`.
 *
 * Real routes, real `withAuth`, the real `lib/app/patterns/store.ts` and `lib/app/sounds/store.ts`, the real Model D
 * definition and the sequencer's real `PatternSchema`. The two tables are small stateful fakes that honour the filters
 * the stores rely on, so a query that forgot the owner would reach another user's row here too. The patterns fake
 * models the `ON DELETE SET NULL` on `user_sound.patternId`. Pins:
 *
 * - every route needs a session;
 * - a pattern is stored under the caller and read back as it was sent; the list is the caller's, without steps;
 * - another user's pattern is a 404 on read, change and delete, and is left as it was;
 * - a pattern the sequencer could not read, a blank name and an unknown synth are refused, and nothing is stored;
 * - a stored pattern of another shape version is listed and kept, with no steps, and says why;
 * - a sound's default pattern is set and cleared through the sounds API, refused when it is another user's or none,
 *   and nulled when the pattern is deleted.
 *
 * What a unit test cannot prove, because it has no database, is in `npm run smoke:patterns`: the hand-written cascade
 * that erases a user's patterns through `eraseUser`, the real `SET NULL`, and the export that carries them.
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

import { GET as list, POST as create } from '@/app/api/v1/patterns/route';
import { GET as read, PATCH as change, DELETE as remove } from '@/app/api/v1/patterns/[id]/route';
import { POST as createSound } from '@/app/api/v1/sounds/route';
import { GET as readSound, PATCH as changeSound } from '@/app/api/v1/sounds/[id]/route';
import { getSynthDef } from '@/lib/app/synths/defs';
import { importPhrase } from '@/lib/app/sequencer/import';
import { newPattern } from '@/lib/app/sequencer/pattern';
import type { Control } from '@/lib/app/synths/contract';
import { createMockAuthSession } from '@/tests/helpers/auth';

type Row = Record<string, unknown>;

const modelD = getSynthDef('model-d')!;
const cont = modelD.controls.find(
  (c): c is Extract<Control, { kind: 'cont' }> => c.kind === 'cont'
)!;
const panel = { values: { [cont.id]: cont.min }, cables: [] };

/** A riff with a chord, a nudge and a velocity, as a pattern: what the sequencer saves. */
const riff = importPhrase({
  bpm: 96,
  loop: true,
  steps: [
    [0, 36, 1, 0.5],
    [1, 48, 0.5],
    [1, 52, 0.5],
    [2.67, 43, 1],
  ],
});

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

/** A table in memory: what the stores call, each filter honoured field by field. */
function fakeTable(
  prefix: string,
  defaults: Row = {},
  onDelete: (ids: unknown[]) => void = () => undefined
) {
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
        const at = new Date(Date.UTC(2026, 9, 22, 0, ++n));
        const row = { id: `${prefix}${n}`, createdAt: at, updatedAt: at, ...defaults, ...data };
        rows.push(row);
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit)
          Object.assign(r, data, { updatedAt: new Date(Date.UTC(2026, 9, 23, 0, ++n)) });
        return { count: hit.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit) rows.splice(rows.indexOf(r), 1);
        onDelete(hit.map((r) => r.id));
        return { count: hit.length };
      }),
    },
  };
}

let patterns: ReturnType<typeof fakeTable>;
let sounds: ReturnType<typeof fakeTable>;

beforeEach(() => {
  vi.clearAllMocks();
  // the columns the database defaults
  sounds = fakeTable('snd', { notes: null, patternId: null });
  // `user_sound.patternId` is ON DELETE SET NULL
  patterns = fakeTable('pat', {}, (ids) => {
    for (const s of sounds.rows) if (ids.includes(s.patternId)) s.patternId = null;
  });
  mockPrisma.userPattern = patterns.client;
  mockPrisma.userSound = sounds.client;
  mockPrisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma));
  mockPrisma.$queryRaw = vi.fn();
  mockPrisma.$executeRaw = vi.fn(async () => 0);
  mockPrisma.synth = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === 'model-d' ? { listed: true } : null
    ),
  };
  signIn('user-1');
});

const save = (body: unknown) => create(request('POST', '/api/v1/patterns', body));

async function saved(name: string, pattern: unknown = riff) {
  const { data } = await json(await save({ name, pattern, synthId: 'model-d' }));
  return String(data!.id);
}

async function aSound() {
  const res = await createSound(
    request('POST', '/api/v1/sounds', { synthId: 'model-d', name: 'Bass', panel })
  );
  return String((await json(res)).data!.id);
}

const setDefault = (soundId: string, patternId: string | null) =>
  changeSound(request('PATCH', `/api/v1/sounds/${soundId}`, { patternId }), ctx(soundId));

describe('a session is required', () => {
  it('refuses every route without one, and touches nothing', async () => {
    mockGetSession.mockResolvedValue(null);
    const responses = [
      await list(request('GET', '/api/v1/patterns')),
      await save({ name: 'x', pattern: riff }),
      await read(request('GET', '/api/v1/patterns/pat1'), ctx('pat1')),
      await change(request('PATCH', '/api/v1/patterns/pat1', { name: 'y' }), ctx('pat1')),
      await remove(request('DELETE', '/api/v1/patterns/pat1'), ctx('pat1')),
    ];
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    expect(patterns.client.create).not.toHaveBeenCalled();
    expect(patterns.client.findMany).not.toHaveBeenCalled();
  });
});

describe('saving and reading back', () => {
  it('stores the pattern under the caller and reads it back exactly as it was sent', async () => {
    const res = await save({ name: '  Acid line ', pattern: riff, synthId: 'model-d' });
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data).toMatchObject({
      name: 'Acid line',
      synthId: 'model-d',
      steps: riff.parts[0].steps.length,
      parts: 1,
      pattern: riff,
      problems: [],
    });
    expect(patterns.rows[0]).toMatchObject({ userId: 'user-1', version: 1, synthId: 'model-d' });

    const got = await json(
      await read(request('GET', `/api/v1/patterns/${String(data!.id)}`), ctx(String(data!.id)))
    );
    expect(got.data!.pattern).toEqual(riff);
  });

  it("lists only the caller's patterns, newest change first, without steps", async () => {
    await saved('First');
    await saved('Second');
    signIn('user-2');
    await saved('Theirs');
    signIn('user-1');

    const { data } = await json(await list(request('GET', '/api/v1/patterns')));
    expect(data!.map((p) => p.name)).toEqual(['Second', 'First']);
    expect(data![0]).not.toHaveProperty('pattern');
    expect(data![0]).toMatchObject({ steps: riff.parts[0].steps.length, parts: 1 });
  });

  it('saves without a synth: a pattern is not tied to one', async () => {
    const { data } = await json(await save({ name: 'Anywhere', pattern: newPattern(8) }));
    expect(data).toMatchObject({ synthId: null, steps: 8 });
  });

  it('renames it, and saves new steps over it', async () => {
    const id = await saved('Acid line');
    const longer = newPattern(32);
    const res = await change(
      request('PATCH', `/api/v1/patterns/${id}`, { name: 'Acid line 2', pattern: longer }),
      ctx(id)
    );
    expect(res.status).toBe(200);
    expect((await json(res)).data).toMatchObject({
      name: 'Acid line 2',
      steps: 32,
      pattern: longer,
    });
  });

  it('deletes it', async () => {
    const id = await saved('Gone');
    const res = await remove(request('DELETE', `/api/v1/patterns/${id}`), ctx(id));
    expect(res.status).toBe(200);
    expect(patterns.rows).toHaveLength(0);
    expect((await read(request('GET', `/api/v1/patterns/${id}`), ctx(id))).status).toBe(404);
  });
});

describe("another user's pattern", () => {
  it('is a 404 on read, change and delete, and is left as it was', async () => {
    signIn('user-2');
    const theirs = await saved('Theirs');
    signIn('user-1');

    const responses = [
      await read(request('GET', `/api/v1/patterns/${theirs}`), ctx(theirs)),
      await change(
        request('PATCH', `/api/v1/patterns/${theirs}`, { name: 'Mine now' }),
        ctx(theirs)
      ),
      await remove(request('DELETE', `/api/v1/patterns/${theirs}`), ctx(theirs)),
    ];
    expect(responses.map((r) => r.status)).toEqual([404, 404, 404]);
    expect((await json(responses[0])).error?.code).toBe('NOT_FOUND');
    expect(patterns.rows).toHaveLength(1);
    expect(patterns.rows[0]).toMatchObject({ name: 'Theirs', userId: 'user-2' });
  });

  it('an id that cannot be one is a 404 on every route, not looked up', async () => {
    const bad = 'NOT_AN_ID!';
    const responses = [
      await read(request('GET', `/api/v1/patterns/${bad}`), ctx(bad)),
      await change(request('PATCH', `/api/v1/patterns/${bad}`, { name: 'x' }), ctx(bad)),
      await remove(request('DELETE', `/api/v1/patterns/${bad}`), ctx(bad)),
    ];
    expect(responses.map((r) => r.status)).toEqual([404, 404, 404]);
    expect(patterns.client.findFirst).not.toHaveBeenCalled();
    expect(patterns.client.updateMany).not.toHaveBeenCalled();
    expect(patterns.client.deleteMany).not.toHaveBeenCalled();
  });
});

describe('refusals', () => {
  const refused = async (body: unknown) => {
    const res = await save(body);
    expect(res.status).toBe(400);
    return json(res);
  };

  it('refuses a pattern the sequencer could not read, naming where', async () => {
    const tooLong = newPattern(16);
    tooLong.parts[0].steps = Array.from({ length: 129 }, () => ({ on: true, notes: [] }));
    const mismatched = {
      ...newPattern(16),
      parts: [newPattern(16).parts[0], newPattern(8).parts[0]],
      chain: [0, 1],
    };
    const badNote = newPattern(4);
    badNote.parts[0].steps[0].notes = [{ note: 200, gate: 1 }];
    for (const pattern of [
      tooLong,
      mismatched,
      badNote,
      { ...newPattern(4), version: 2 },
      { ...newPattern(4), extra: true },
      'not a pattern',
    ])
      expect((await refused({ name: 'Bad', pattern })).success).toBe(false);
    expect(patterns.client.create).not.toHaveBeenCalled();
  });

  it('refuses a blank name, a missing pattern and a synth the app does not know', async () => {
    await refused({ name: '   ', pattern: riff });
    await refused({ name: 'No steps' });
    const unknown = await refused({ name: 'x', pattern: riff, synthId: 'no-such-synth' });
    expect(unknown.error?.details?.errors?.[0]?.path).toBe('synthId');
    expect(patterns.client.create).not.toHaveBeenCalled();
  });

  it('refuses a change with nothing in it', async () => {
    const id = await saved('Same');
    const res = await change(request('PATCH', `/api/v1/patterns/${id}`, {}), ctx(id));
    expect(res.status).toBe(400);
  });
});

describe('a stored pattern the sequencer cannot read', () => {
  it('is listed and kept, with no steps, and says why', async () => {
    patterns.rows.push({
      id: 'patold',
      userId: 'user-1',
      name: 'From the future',
      pattern: { version: 2 },
      version: 2,
      synthId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { data } = await json(
      await read(request('GET', '/api/v1/patterns/patold'), ctx('patold'))
    );
    expect(data).toMatchObject({ pattern: null, steps: 0 });
    expect(String((data!.problems as string[])[0])).toMatch(/version 2/);
    const listed = await json(await list(request('GET', '/api/v1/patterns')));
    expect(listed.data!.map((p) => p.id)).toEqual(['patold']);
  });

  it('a row that fails the schema is served with its problems, and logged on its own read', async () => {
    patterns.rows.push({
      id: 'patbad',
      userId: 'user-1',
      name: 'Broken',
      pattern: { version: 1, bpm: 'fast' },
      version: 1,
      synthId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { data } = await json(
      await read(request('GET', '/api/v1/patterns/patbad'), ctx('patbad'))
    );
    expect(data!.pattern).toBeNull();
    expect((data!.problems as string[]).length).toBeGreaterThan(0);
    expect(mockLog.error).toHaveBeenCalledWith(
      'user patterns: stored pattern fails validation',
      expect.objectContaining({ patternId: 'patbad' })
    );
  });
});

describe("a sound's default pattern", () => {
  it('is set, read back with the sound, and cleared', async () => {
    const soundId = await aSound();
    const patternId = await saved('Bassline');
    const fresh = await json(
      await readSound(request('GET', `/api/v1/sounds/${soundId}`), ctx(soundId))
    );
    expect(fresh.data!.patternId).toBeNull();

    const set = await setDefault(soundId, patternId);
    expect(set.status).toBe(200);
    expect((await json(set)).data!.patternId).toBe(patternId);
    expect(sounds.rows[0].patternId).toBe(patternId);
    // The pattern's row is locked before it is checked, so a delete arriving meanwhile waits rather than reaching the FK.
    const raw = mockPrisma.$queryRaw as ReturnType<typeof vi.fn>;
    const lock = raw.mock.calls.find(([sql]) => String(sql).includes('FROM user_pattern'));
    expect((lock?.[0] as string[]).join('?')).toMatch(
      /WHERE id = \? AND "userId" = \? FOR KEY SHARE$/
    );
    expect(lock?.slice(1)).toEqual([patternId, 'user-1']);

    const cleared = await setDefault(soundId, null);
    expect((await json(cleared)).data!.patternId).toBeNull();
    expect(sounds.rows[0].patternId).toBeNull();
  });

  it("refuses another user's pattern exactly as one that does not exist, and changes nothing", async () => {
    const soundId = await aSound();
    signIn('user-2');
    const theirs = await saved('Theirs');
    signIn('user-1');

    const other = await json(await setDefault(soundId, theirs));
    const missing = await json(await setDefault(soundId, 'patnone'));
    expect(other.error?.code).toBe('VALIDATION_ERROR');
    expect(other.error).toEqual(missing.error);
    expect(other.error?.details?.errors?.[0]?.path).toBe('patternId');
    expect(sounds.rows[0].patternId).toBeNull();
  });

  it("is a 404 on another user's sound, which keeps its own", async () => {
    signIn('user-2');
    const theirSound = await aSound();
    signIn('user-1');
    const mine = await saved('Mine');
    const res = await setDefault(theirSound, mine);
    expect(res.status).toBe(404);
    expect(sounds.rows[0].patternId).toBeNull();
  });

  it('is nulled when the pattern is deleted, and the sound stays', async () => {
    const soundId = await aSound();
    const patternId = await saved('Short-lived');
    await setDefault(soundId, patternId);

    await remove(request('DELETE', `/api/v1/patterns/${patternId}`), ctx(patternId));
    const after = await json(
      await readSound(request('GET', `/api/v1/sounds/${soundId}`), ctx(soundId))
    );
    expect(after.data).toMatchObject({ id: soundId, patternId: null });
  });
});
