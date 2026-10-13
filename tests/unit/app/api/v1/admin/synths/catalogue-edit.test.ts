/**
 * Unit Tests: the catalogue editor's admin API (f-catalogue-admin t-30).
 *
 * Real routes, real `withAdminAuth`, the real `lib/app/catalogue/edit.ts` and the real seed, over a small stateful
 * fake of the four catalogue tables. The fake starts as the seed leaves it, from Model D's real data, so a sound
 * edited here is a sound the public page plays. Pins:
 *
 * - every route is admin only;
 * - a sound or lesson that does not fit the synth is refused, naming the control or jack, and nothing is written;
 * - an unusual note on something the synth does not have is refused;
 * - every content write sets `editedAt` and is audited with what changed; reordering and hiding are audited but do
 *   not set `editedAt`; an edit that changes nothing writes and audits nothing;
 * - re-running the seed afterwards leaves the admin's rows, order and hiding alone.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

type Row = Record<string, unknown>;

const mockPrisma = vi.hoisted(() => ({}));
const mockQueryRaw = vi.hoisted(() => vi.fn(async () => []));
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

import { GET as getList } from '@/app/api/v1/admin/synths/route';
import { PUT as putOrder } from '@/app/api/v1/admin/synths/order/route';
import { GET as getSynth, PATCH as patchSynth } from '@/app/api/v1/admin/synths/[id]/route';
import { POST as postSound } from '@/app/api/v1/admin/synths/[id]/sounds/route';
import { PUT as putSoundOrder } from '@/app/api/v1/admin/synths/[id]/sounds/order/route';
import { PATCH as patchSound } from '@/app/api/v1/admin/synths/[id]/sounds/[slug]/route';
import { PUT as putLineage } from '@/app/api/v1/admin/synths/[id]/lineage/route';
import { POST as postNote } from '@/app/api/v1/admin/synths/[id]/notes/route';
import { PATCH as patchNote } from '@/app/api/v1/admin/synth-notes/[noteId]/route';
import { createMockAuthSession } from '@/tests/helpers/auth';
import {
  catalogueTables,
  seedRecordTable,
  sortRows,
  type CatalogueTables,
} from '@/tests/helpers/catalogue-db';
import { seedCatalogue } from '@/lib/app/catalogue/seed';
import type { CatalogueSeedData } from '@/lib/app/catalogue/data';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { getSynthDef } from '@/lib/app/synths/defs';
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

/** Model D with its first three sounds, its lineage and notes, plus TB-303 listed after it with no content. */
function sample(): CatalogueSeedData {
  const data = structuredClone(real);
  const isModelD = (f: { synth: string }) => f.synth === 'model-d';
  data.listing.synths = [
    { id: 'model-d', order: 0, listed: true },
    { id: 'tb-303', order: 1, listed: true },
  ];
  data.sounds = data.sounds.filter(isModelD).map((f) => ({ ...f, sounds: f.sounds.slice(0, 3) }));
  data.lineage = data.lineage.filter(isModelD);
  data.notes = data.notes.filter(isModelD);
  return data;
}

const modelD = (() => {
  const def = getSynthDef('model-d');
  if (!def) throw new Error('fixture: the registry has Model D');
  return def;
})();
const firstSound = () => db.synthSound.rows.find((r) => r.order === 0) as Row;

let db: CatalogueTables;

/** Writes since the last reset, over every catalogue table. */
const writes = () =>
  Object.values(db).reduce(
    (n, t) =>
      n + t.create.mock.calls.length + t.update.mock.calls.length + t.upsert.mock.calls.length,
    0
  );

function request(method: string, path: string, body?: unknown) {
  return new Request(`http://localhost/api/v1/admin/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest;
}
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: unknown;
    error?: {
      code: string;
      message: string;
      details?: { errors?: { path: string; message: string }[] };
    };
  };
}
const problems = async (res: Response) => (await json(res)).error?.details?.errors ?? [];
const auditCalls = () =>
  mockLogAdminAction.mock.calls.map(
    ([e]) =>
      e as {
        action: string;
        entityType: string;
        entityId: string;
        entityName: string;
        changes: Row;
      }
  );

beforeEach(async () => {
  vi.clearAllMocks();
  mockEnv.TENANCY_MODE = 'single';
  db = catalogueTables();
  Object.assign(mockPrisma, db, {
    catalogueSeedRecord: seedRecordTable(),
    orgMembership: {
      findUnique: vi.fn(async () => ({ role: 'OWNER', org: { status: 'ACTIVE' } })),
    },
    aiApiKey: { findFirst: vi.fn(async () => null), update: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    $queryRaw: mockQueryRaw,
  });
  await seedCatalogue(mockPrisma as unknown as TenancyClient, sample());
  for (const t of Object.values(db)) {
    t.create.mockClear();
    t.update.mockClear();
    t.upsert.mockClear();
  }
  mockGetSession.mockResolvedValue(session('ADMIN'));
});

describe('admin only', () => {
  it('refuses a signed-in user who is not an admin, on reads and writes, and writes nothing', async () => {
    mockGetSession.mockResolvedValue(session('USER'));

    const responses = [
      await getList(request('GET', 'synths')),
      await getSynth(request('GET', 'synths/model-d'), ctx({ id: 'model-d' })),
      await patchSynth(
        request('PATCH', 'synths/model-d', { summary: 'x' }),
        ctx({ id: 'model-d' })
      ),
      await putOrder(request('PUT', 'synths/order', { ids: ['tb-303', 'model-d'] })),
      await patchSound(
        request('PATCH', 'synths/model-d/sounds/x', { blurb: 'x' }),
        ctx({ id: 'model-d', slug: 'x' })
      ),
    ];

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    expect(writes()).toBe(0);
  });
});

describe('GET /api/v1/admin/synths and /:id', () => {
  it('lists every synth with its content counts, hidden ones included', async () => {
    db.synth.rows.find((r) => r.id === 'tb-303')!.listed = false;

    const data = (await json(await getList(request('GET', 'synths')))).data as Row[];

    expect(data.map((s) => [s.id, s.listed, s.counts])).toEqual([
      ['model-d', true, { sounds: 3, notes: 41, lineage: true }],
      ['tb-303', false, { sounds: 0, notes: 0, lineage: false }],
    ]);
  });

  it('returns one synth with its sounds, and says what stops a stored sound being served', async () => {
    const broken = firstSound();
    (broken.steps as { set?: Row }[])[0].set = { 'no.such.control': 1 };

    const res = await getSynth(request('GET', 'synths/model-d'), ctx({ id: 'model-d' }));
    const data = (await json(res)).data as {
      sounds: { slug: string; problems: { message: string }[] }[];
      notes: unknown[];
      sharedLimits: unknown[];
      definitionVersion: number;
    };

    expect(res.status).toBe(200);
    expect(data.definitionVersion).toBe(modelD.version);
    expect(data.sounds).toHaveLength(3);
    expect(data.sounds[0].problems.map((p) => p.message).join()).toContain('no.such.control');
    expect(data.sounds[1].problems).toEqual([]);
    expect(data.notes).toHaveLength(41);
    expect(data.sharedLimits).toHaveLength(5);
  });

  it('is 404 for a synth that does not exist', async () => {
    const res = await getSynth(request('GET', 'synths/nope'), ctx({ id: 'nope' }));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/admin/synths/:id', () => {
  it('changes the summary, marks the synth edited and audits the change', async () => {
    const res = await patchSynth(
      request('PATCH', 'synths/model-d', { summary: 'A new summary.' }),
      ctx({ id: 'model-d' })
    );

    expect(res.status).toBe(200);
    const row = db.synth.rows.find((r) => r.id === 'model-d')!;
    expect(row.summary).toBe('A new summary.');
    expect(row.editedAt).toBeInstanceOf(Date);
    expect(auditCalls()).toEqual([
      expect.objectContaining({
        action: 'synth.update',
        entityType: 'synth',
        entityId: 'model-d',
        changes: { summary: { from: expect.any(String), to: 'A new summary.' } },
      }),
    ]);
  });

  it('hides a synth without marking it edited, and audits it', async () => {
    const res = await patchSynth(
      request('PATCH', 'synths/model-d', { listed: false }),
      ctx({ id: 'model-d' })
    );

    expect(res.status).toBe(200);
    const row = db.synth.rows.find((r) => r.id === 'model-d')!;
    expect(row.listed).toBe(false);
    expect(row.editedAt).toBeNull();
    expect(auditCalls()[0].changes).toEqual({ listed: { from: true, to: false } });
  });

  it('writes and audits nothing for an edit that changes nothing', async () => {
    const res = await patchSynth(
      request('PATCH', 'synths/model-d', { listed: true, name: 'Model D' }),
      ctx({ id: 'model-d' })
    );

    expect(res.status).toBe(200);
    expect(writes()).toBe(0);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('refuses an unknown field and an empty change', async () => {
    const unknown = await patchSynth(
      request('PATCH', 'synths/model-d', { id: 'other' }),
      ctx({ id: 'model-d' })
    );
    const empty = await patchSynth(request('PATCH', 'synths/model-d', {}), ctx({ id: 'model-d' }));

    expect([unknown.status, empty.status]).toEqual([400, 400]);
    expect(writes()).toBe(0);
  });
});

describe('PUT /api/v1/admin/synths/order', () => {
  it('reorders the catalogue without marking anything edited, and audits the order', async () => {
    const res = await putOrder(request('PUT', 'synths/order', { ids: ['tb-303', 'model-d'] }));

    expect(res.status).toBe(200);
    expect(db.synth.rows.map((r) => [r.id, r.order, r.editedAt])).toEqual([
      ['model-d', 1, null],
      ['tb-303', 0, null],
    ]);
    expect(auditCalls()[0]).toMatchObject({
      action: 'synth.reorder',
      changes: { order: { from: ['model-d', 'tb-303'], to: ['tb-303', 'model-d'] } },
    });
  });

  it('refuses an order that leaves a synth out, repeats one or names one that does not exist', async () => {
    for (const ids of [
      ['tb-303'],
      ['tb-303', 'tb-303', 'model-d'],
      ['tb-303', 'model-d', 'nope'],
    ]) {
      const res = await putOrder(request('PUT', 'synths/order', { ids }));
      expect(res.status).toBe(400);
      expect((await problems(res)).length).toBeGreaterThan(0);
    }
    expect(writes()).toBe(0);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/admin/synths/:id/sounds/:slug', () => {
  const patch = (slug: string, body: unknown) =>
    patchSound(
      request('PATCH', `synths/model-d/sounds/${slug}`, body),
      ctx({ id: 'model-d', slug })
    );

  it('changes a lesson step, marks the sound edited and audits the steps', async () => {
    const sound = firstSound();
    const steps = structuredClone(sound.steps) as { why: string }[];
    steps[0].why = 'Because the admin says so.';

    const res = await patch(String(sound.slug), { steps });

    expect(res.status).toBe(200);
    expect((firstSound().steps as { why: string }[])[0].why).toBe('Because the admin says so.');
    expect(firstSound().editedAt).toBeInstanceOf(Date);
    expect(Object.keys(auditCalls()[0].changes)).toEqual(['steps']);
    expect(auditCalls()[0]).toMatchObject({
      action: 'synth_sound.update',
      entityType: 'synth_sound',
      entityId: `model-d/${String(sound.slug)}`,
    });
  });

  it('refuses a step value out of its control’s range, naming the control, and writes nothing', async () => {
    const cont = modelD.controls.find((c) => c.kind === 'cont');
    if (!cont || cont.kind !== 'cont') throw new Error('fixture: Model D has a continuous control');
    const sound = firstSound();
    const steps = structuredClone(sound.steps) as { set?: Row }[];
    steps[0].set = { ...steps[0].set, [cont.id]: cont.max + 1 };

    const res = await patch(String(sound.slug), { steps });

    expect(res.status).toBe(400);
    const found = await problems(res);
    expect(found).toEqual([
      expect.objectContaining({
        path: `steps.0.set.${cont.id}`,
        message: expect.stringContaining(cont.id),
      }),
    ]);
    expect(writes()).toBe(0);
    expect(firstSound().editedAt).toBeNull();
  });

  it('refuses a cable to a jack the synth does not have, naming the jack', async () => {
    const sound = firstSound();
    const steps = structuredClone(sound.steps) as { cables?: [string, string][] }[];
    steps[0].cables = [['no-such-jack', modelD.jacks[0].id]];

    const res = await patch(String(sound.slug), { steps });

    expect(res.status).toBe(400);
    expect((await problems(res)).map((p) => p.message).join()).toContain('no-such-jack');
    expect(writes()).toBe(0);
  });

  it('refuses a change to the sound’s id', async () => {
    const res = await patch(String(firstSound().slug), { id: 'renamed' });
    expect(res.status).toBe(400);
    expect(writes()).toBe(0);
  });

  it('writes and audits nothing for an edit that changes nothing, so the sound stays the seed’s', async () => {
    const sound = firstSound();
    const res = await patch(String(sound.slug), { blurb: sound.blurb, steps: sound.steps });

    expect(res.status).toBe(200);
    expect(writes()).toBe(0);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
    expect(firstSound().editedAt).toBeNull();
  });

  it('is 404 for a sound the synth does not have', async () => {
    expect((await patch('nope', { blurb: 'x' })).status).toBe(404);
  });
});

describe('POST /api/v1/admin/synths/:id/sounds and PUT …/sounds/order', () => {
  const newSound = () => ({
    ...Object.fromEntries(
      [
        'name',
        'ref',
        'artist',
        'tags',
        'level',
        'blurb',
        'how',
        'phrase',
        'steps',
        'context',
        'tweaks',
      ].map((k): [string, unknown] => [k, firstSound()[k]])
    ),
    id: 'admin-sound',
    name: 'Admin sound',
  });
  const post = (body: unknown) =>
    postSound(request('POST', 'synths/model-d/sounds', body), ctx({ id: 'model-d' }));

  it('adds a sound at the end of the library, on the current definition version, marked edited', async () => {
    const res = await post(newSound());

    expect(res.status).toBe(201);
    const row = db.synthSound.rows.find((r) => r.slug === 'admin-sound')!;
    expect(row).toMatchObject({ order: 3, definitionVersion: modelD.version, name: 'Admin sound' });
    expect(row.editedAt).toBeInstanceOf(Date);
    expect(auditCalls()[0]).toMatchObject({
      action: 'synth_sound.create',
      entityId: 'model-d/admin-sound',
    });
  });

  it('refuses a second sound with an id the synth already has', async () => {
    const res = await post({ ...newSound(), id: firstSound().slug });
    expect(res.status).toBe(409);
    expect(db.synthSound.create).not.toHaveBeenCalled();
  });

  it('refuses a sound marked as designed by the tutor', async () => {
    const res = await post({ ...newSound(), ai: true });
    expect(res.status).toBe(400);
    expect(db.synthSound.create).not.toHaveBeenCalled();
  });

  it('reorders the library without marking any sound edited', async () => {
    const slugs = sortRows(db.synthSound.rows, [{ order: 'asc' }]).map((r) => String(r.slug));
    const reversed = [...slugs].reverse();

    const res = await putSoundOrder(
      request('PUT', 'synths/model-d/sounds/order', { ids: reversed }),
      ctx({ id: 'model-d' })
    );

    expect(res.status).toBe(200);
    expect(sortRows(db.synthSound.rows, [{ order: 'asc' }]).map((r) => r.slug)).toEqual(reversed);
    expect(db.synthSound.rows.every((r) => r.editedAt === null)).toBe(true);
    // The middle sound did not move, so only two rows were written.
    expect(db.synthSound.update).toHaveBeenCalledTimes(2);
  });

  it('holds the synth’s row while it adds or reorders, so a sound created meanwhile cannot share a place', async () => {
    const slugs = sortRows(db.synthSound.rows, [{ order: 'asc' }]).map((r) => String(r.slug));
    await putSoundOrder(
      request('PUT', 'synths/model-d/sounds/order', { ids: slugs }),
      ctx({ id: 'model-d' })
    );

    const [sql, id] = mockQueryRaw.mock.calls[0] as unknown as [string[], string];
    expect(sql.join('?')).toMatch(/FROM synth WHERE id = \? FOR UPDATE/);
    expect(id).toBe('model-d');
  });
});

describe('PUT /api/v1/admin/synths/:id/lineage', () => {
  it('replaces the lineage, marks it edited and audits it', async () => {
    const body = {
      title: 'A new title',
      intro: 'A new intro.',
      timeline: [{ year: '1970', name: 'Minimoog', text: 'It began.' }],
      relatives: [],
    };

    const res = await putLineage(
      request('PUT', 'synths/model-d/lineage', body),
      ctx({ id: 'model-d' })
    );

    expect(res.status).toBe(200);
    expect(db.synthLineage.rows[0]).toMatchObject({ title: 'A new title', users: [], note: null });
    expect(db.synthLineage.rows[0].editedAt).toBeInstanceOf(Date);
    expect(auditCalls()[0]).toMatchObject({ action: 'synth_lineage.update', entityId: 'model-d' });
  });

  it('creates a lineage for a synth that has none', async () => {
    const res = await putLineage(
      request('PUT', 'synths/tb-303/lineage', {
        title: 'TB-303',
        intro: 'A bass line.',
        timeline: [{ year: '1981', name: 'TB-303', text: 'Released.' }],
        relatives: [],
      }),
      ctx({ id: 'tb-303' })
    );

    expect(res.status).toBe(200);
    expect(auditCalls()[0]).toMatchObject({ action: 'synth_lineage.create', entityId: 'tb-303' });
  });

  it('refuses a lineage with no timeline', async () => {
    const res = await putLineage(
      request('PUT', 'synths/model-d/lineage', {
        title: 't',
        intro: 'i',
        timeline: [],
        relatives: [],
      }),
      ctx({ id: 'model-d' })
    );
    expect(res.status).toBe(400);
    expect(writes()).toBe(0);
  });
});

describe('notes', () => {
  const unusedTarget = () => {
    const used = new Set(db.synthNote.rows.map((n) => n.target));
    const target = modelD.controls.map((c) => c.id).find((id) => !used.has(id));
    if (!target) throw new Error('fixture: a Model D control with no note');
    return target;
  };
  const post = (body: unknown) =>
    postNote(request('POST', 'synths/model-d/notes', body), ctx({ id: 'model-d' }));

  it('refuses an unusual note on something the synth does not have, naming it', async () => {
    const res = await post({ target: 'no.such.thing', text: 'Odd.' });

    expect(res.status).toBe(400);
    expect(await problems(res)).toEqual([
      expect.objectContaining({
        path: 'target',
        message: expect.stringContaining('no.such.thing'),
      }),
    ]);
    expect(db.synthNote.create).not.toHaveBeenCalled();
  });

  it('adds an unusual note on a real control, marked edited and audited', async () => {
    const target = unusedTarget();

    const res = await post({ target, text: 'Odd.' });

    expect(res.status).toBe(201);
    const row = db.synthNote.rows.find((n) => n.target === target)!;
    expect(row).toMatchObject({ kind: 'UNUSUAL', key: `model-d/unusual/${target}`, text: 'Odd.' });
    expect(row.editedAt).toBeInstanceOf(Date);
    expect(auditCalls()[0]).toMatchObject({
      action: 'synth_note.create',
      entityType: 'synth_note',
    });
  });

  it('refuses a second note on a target that has one', async () => {
    const taken = db.synthNote.rows.find((n) => n.kind === 'UNUSUAL')!;
    const res = await post({ target: taken.target, text: 'Again.' });
    expect(res.status).toBe(409);
  });

  it('changes a shared limit’s title and text, marked edited and audited', async () => {
    const shared = db.synthNote.rows.find((n) => n.synthId === null)!;
    const noteId = String(shared.id);

    const res = await patchNote(
      request('PATCH', `synth-notes/${noteId}`, { title: 'New title', text: 'New text.' }),
      ctx({ noteId })
    );

    expect(res.status).toBe(200);
    expect(shared).toMatchObject({ title: 'New title', text: 'New text.' });
    expect(shared.editedAt).toBeInstanceOf(Date);
    expect(Object.keys(auditCalls()[0].changes).sort()).toEqual(['text', 'title']);
  });

  it('names a synth’s note in the audit by its target, or by its kind when it has none', async () => {
    const unusual = db.synthNote.rows.find((n) => n.kind === 'UNUSUAL')!;
    const intro = db.synthNote.rows.find((n) => n.kind === 'LIMIT_INTRO')!;

    for (const note of [unusual, intro]) {
      const noteId = String(note.id);
      const res = await patchNote(
        request('PATCH', `synth-notes/${noteId}`, { text: 'Changed.' }),
        ctx({ noteId })
      );
      expect(res.status).toBe(200);
    }

    expect(auditCalls().map((c) => c.entityName)).toEqual([
      `model-d: ${String(unusual.target)}`,
      'model-d: limit_intro',
    ]);
  });

  it('writes and audits nothing when a note edit changes nothing', async () => {
    const note = db.synthNote.rows.find((n) => n.kind === 'UNUSUAL')!;
    const noteId = String(note.id);

    const res = await patchNote(
      request('PATCH', `synth-notes/${noteId}`, { text: note.text }),
      ctx({ noteId })
    );

    expect(res.status).toBe(200);
    expect(writes()).toBe(0);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
    expect(note.editedAt).toBeNull();
  });

  it('refuses a title on a note that is not a limit', async () => {
    const unusual = db.synthNote.rows.find((n) => n.kind === 'UNUSUAL')!;
    const noteId = String(unusual.id);

    const res = await patchNote(
      request('PATCH', `synth-notes/${noteId}`, { title: 'Nope' }),
      ctx({ noteId })
    );

    expect(res.status).toBe(400);
    expect(writes()).toBe(0);
  });
});

describe('the seed afterwards', () => {
  it('leaves the admin’s edits, order and hiding alone, and still updates what nobody edited', async () => {
    const edited = firstSound();
    const slug = String(edited.slug);
    const steps = structuredClone(edited.steps) as { why: string }[];
    steps[0].why = 'The admin’s lesson.';
    await patchSound(
      request('PATCH', `synths/model-d/sounds/${slug}`, { steps }),
      ctx({ id: 'model-d', slug })
    );
    await putOrder(request('PUT', 'synths/order', { ids: ['tb-303', 'model-d'] }));
    await patchSynth(request('PATCH', 'synths/tb-303', { listed: false }), ctx({ id: 'tb-303' }));

    // The seed data changes the edited sound and an unedited one.
    const data = sample();
    const sounds = data.sounds[0].sounds;
    sounds[0].blurb = 'The seed’s new blurb.';
    sounds[1].blurb = 'Another new blurb.';
    const report = await seedCatalogue(mockPrisma as unknown as TenancyClient, data);

    expect(report.sounds).toMatchObject({ edited: 1, updated: 1 });
    expect((firstSound().steps as { why: string }[])[0].why).toBe('The admin’s lesson.');
    expect(firstSound().blurb).not.toBe('The seed’s new blurb.');
    expect(db.synthSound.rows.find((r) => r.order === 1)?.blurb).toBe('Another new blurb.');
    expect(db.synth.rows.map((r) => [r.id, r.order, r.listed])).toEqual([
      ['model-d', 1, true],
      ['tb-303', 0, false],
    ]);
  });

  it('adds a new seed sound after the admin’s order, not at its place in the file', async () => {
    const slugs = sortRows(db.synthSound.rows, [{ order: 'asc' }]).map((r) => String(r.slug));
    await putSoundOrder(
      request('PUT', 'synths/model-d/sounds/order', { ids: [...slugs].reverse() }),
      ctx({ id: 'model-d' })
    );

    // The file gains a sound at index 1, a place the admin's order has given to another sound.
    const data = sample();
    const file = data.sounds[0];
    const added = real.sounds.find((f) => f.synth === 'model-d')!.sounds[3];
    file.sounds.splice(1, 0, added);
    await seedCatalogue(mockPrisma as unknown as TenancyClient, data);

    const order = sortRows(db.synthSound.rows, [{ order: 'asc' }]).map((r) => r.order);
    expect(new Set(order).size).toBe(order.length);
    expect(db.synthSound.rows.find((r) => r.slug === added.id)?.order).toBe(3);
  });
});
