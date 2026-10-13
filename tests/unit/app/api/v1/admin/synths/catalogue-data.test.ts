/**
 * Unit Tests: the catalogue Data page's API (f-catalogue-admin t-32).
 *
 * Real routes, real `withAdminAuth`, the real seed, the real admin edit routes and the real comparison, over the
 * stateful fake in `tests/helpers/catalogue-db.ts`. The fake starts as the seed leaves it, from Model D's real data
 * plus TB-303 with no content, so every status here is reached the way it is reached in use: by seeding, by an admin's
 * edit through the API, or by the seed running again on changed data. Pins:
 *
 * - every route is admin only;
 * - a fresh seed matches everywhere; an edit is `edited` with the seed's value beside the stored one, and an edit
 *   back to the seed's value is `edited-matches`; placement never counts; an admin's new sound is `not-in-seed`;
 * - when the data changes under an edited row, the comparison shows the seed's new value, not the one edited over;
 * - the template is the synth's content in the content schema, round-trips through the seed's schemas and its
 *   planning, and validates against the JSON Schema the schema route serves.
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
vi.mock('@/lib/orchestration/audit/admin-audit-logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orchestration/audit/admin-audit-logger')>()),
  logAdminAction: vi.fn(),
}));
const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import { GET as getData } from '@/app/api/v1/admin/synths/data/route';
import { GET as getSchema } from '@/app/api/v1/admin/synths/data/schema/route';
import { GET as getTemplate } from '@/app/api/v1/admin/synths/data/[id]/template/route';
import { PATCH as patchSynth } from '@/app/api/v1/admin/synths/[id]/route';
import { PUT as putOrder } from '@/app/api/v1/admin/synths/order/route';
import { POST as postSound } from '@/app/api/v1/admin/synths/[id]/sounds/route';
import { PATCH as patchSound } from '@/app/api/v1/admin/synths/[id]/sounds/[slug]/route';
import { createMockAuthSession } from '@/tests/helpers/auth';
import {
  catalogueTables,
  seedRecordTable,
  type CatalogueTables,
} from '@/tests/helpers/catalogue-db';
import { planCatalogue, planSynthContent, seedCatalogue } from '@/lib/app/catalogue/seed';
import {
  LineageFileSchema,
  NotesFileSchema,
  SoundsFileSchema,
  SynthContentSchema,
  toSeedFiles,
  type CatalogueSeedData,
} from '@/lib/app/catalogue/data';
import type { CatalogueReconciliation, ReconciledGroup } from '@/lib/app/catalogue/reconcile';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

type Row = Record<string, unknown>;

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

let db: CatalogueTables;
let records: ReturnType<typeof seedRecordTable>;
const seed = (data = sample()) => seedCatalogue(mockPrisma as unknown as TenancyClient, data);

function request(method: string, path: string, body?: unknown) {
  return new Request(`http://localhost/api/v1/admin/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest;
}
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });
async function data<T>(res: Response): Promise<T> {
  const body = JSON.parse(await res.text()) as { success: boolean; data: T };
  expect(body.success).toBe(true);
  return body.data;
}

async function reconciliation(): Promise<CatalogueReconciliation> {
  const res = await getData(request('GET', 'synths/data'));
  expect(res.status).toBe(200);
  return data<CatalogueReconciliation>(res);
}
const group = (r: CatalogueReconciliation, synthId: string | null): ReconciledGroup => {
  const g = r.groups.find((x) => x.synthId === synthId);
  if (!g) throw new Error(`no group for ${String(synthId)}`);
  return g;
};
const rowOf = (r: CatalogueReconciliation, key: string) =>
  r.groups.flatMap((g) => g.rows).find((x) => x.key === key);

const firstSlug = String(real.sounds.find((f) => f.synth === 'model-d')?.sounds[0].id);
const firstSoundRow = () => db.synthSound.rows.find((r) => r.slug === firstSlug) as Row;

beforeEach(async () => {
  vi.clearAllMocks();
  db = catalogueTables();
  records = seedRecordTable();
  Object.assign(mockPrisma, db, {
    catalogueSeedRecord: records,
    orgMembership: {
      findUnique: vi.fn(async () => ({ role: 'OWNER', org: { status: 'ACTIVE' } })),
    },
    aiApiKey: { findFirst: vi.fn(async () => null), update: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    $queryRaw: vi.fn(async () => []),
  });
  await seed();
  mockGetSession.mockResolvedValue(session('ADMIN'));
});

describe('admin only', () => {
  it('refuses a signed-in user who is not an admin on every data route', async () => {
    mockGetSession.mockResolvedValue(session('USER'));

    const responses = [
      await getData(request('GET', 'synths/data')),
      await getSchema(request('GET', 'synths/data/schema')),
      await getTemplate(request('GET', 'synths/data/model-d/template'), ctx({ id: 'model-d' })),
    ];

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403]);
  });
});

describe('GET /api/v1/admin/synths/data', () => {
  it('matches everywhere after a seed, grouped by synth in catalogue order, then the shared limits', async () => {
    const r = await reconciliation();

    expect(r.recorded).toBe(true);
    expect(r.groups.map((g) => [g.synthId, g.name])).toEqual([
      ['model-d', 'Model D'],
      ['tb-303', 'TB-303'],
      [null, 'Every panel'],
    ]);
    // Model D: details, history, 3 sounds and 41 notes of its own. TB-303 has only its details.
    expect(group(r, 'model-d').counts).toMatchObject({ matches: 46, edited: 0, differs: 0 });
    expect(
      group(r, 'model-d')
        .rows.map((x) => x.table)
        .slice(0, 5)
    ).toEqual(['SYNTH', 'LINEAGE', 'SOUND', 'SOUND', 'SOUND']);
    expect(group(r, 'tb-303').rows).toHaveLength(1);
    expect(group(r, null).counts.matches).toBe(5);
    expect(r.groups.flatMap((g) => g.rows).every((x) => x.status === 'matches')).toBe(true);
  });

  it('says nothing is recorded before the seed has recorded anything', async () => {
    records.rows.clear();

    const r = await reconciliation();

    expect(r.recorded).toBe(false);
    expect(r.lastRecordedAt).toBeNull();
  });

  it('shows an edit with the seed’s value beside the stored one, and an edit back as matching', async () => {
    const seedBlurb = firstSoundRow().blurb;
    await patchSound(
      request('PATCH', `synths/model-d/sounds/${firstSlug}`, { blurb: 'The admin’s blurb.' }),
      ctx({ id: 'model-d', slug: firstSlug })
    );

    const edited = rowOf(await reconciliation(), `model-d/${firstSlug}`);
    expect(edited).toMatchObject({ table: 'SOUND', status: 'edited' });
    expect(edited?.editedAt).toEqual(expect.any(String));
    expect(edited?.differences).toEqual([
      { field: 'blurb', seed: seedBlurb, current: 'The admin’s blurb.' },
    ]);

    await patchSound(
      request('PATCH', `synths/model-d/sounds/${firstSlug}`, { blurb: seedBlurb }),
      ctx({ id: 'model-d', slug: firstSlug })
    );

    expect(rowOf(await reconciliation(), `model-d/${firstSlug}`)).toMatchObject({
      status: 'edited-matches',
      differences: [],
    });
  });

  it('never counts placement: a hidden, reordered synth still matches', async () => {
    await patchSynth(request('PATCH', 'synths/model-d', { listed: false }), ctx({ id: 'model-d' }));
    await putOrder(request('PUT', 'synths/order', { ids: ['tb-303', 'model-d'] }));
    expect(db.synth.rows.find((x) => x.id === 'model-d')).toMatchObject({
      listed: false,
      order: 1,
    });

    const r = await reconciliation();

    expect(rowOf(r, 'model-d')?.status).toBe('matches');
    expect(r.groups.map((g) => g.synthId)).toEqual(['tb-303', 'model-d', null]);
  });

  it('marks a sound an admin added as not in the seed', async () => {
    const sound = { ...firstSoundRow() };
    const res = await postSound(
      request('POST', 'synths/model-d/sounds', {
        ...Object.fromEntries(
          ['name', 'ref', 'artist', 'tags', 'level', 'blurb', 'how']
            .concat(['phrase', 'steps', 'context', 'tweaks'])
            .map((k) => [k, sound[k]])
        ),
        id: 'admin-sound',
        name: 'Admin sound',
      }),
      ctx({ id: 'model-d' })
    );
    expect(res.status).toBe(201);

    expect(rowOf(await reconciliation(), 'model-d/admin-sound')).toMatchObject({
      label: 'Sound: Admin sound',
      status: 'not-in-seed',
    });
  });

  it('compares an edited row with what the data says now, after the seed runs on changed data', async () => {
    await patchSound(
      request('PATCH', `synths/model-d/sounds/${firstSlug}`, { blurb: 'The admin’s blurb.' }),
      ctx({ id: 'model-d', slug: firstSlug })
    );
    const changed = sample();
    changed.sounds[0].sounds[0].blurb = 'A newer seed blurb.';
    await seed(changed);

    const row = rowOf(await reconciliation(), `model-d/${firstSlug}`);

    expect(firstSoundRow().blurb).toBe('The admin’s blurb.');
    expect(row?.status).toBe('edited');
    expect(row?.differences).toEqual([
      { field: 'blurb', seed: 'A newer seed blurb.', current: 'The admin’s blurb.' },
    ]);
  });

  it('marks an unedited row that does not hold the seed’s values, and a planned row the table lacks', async () => {
    // What a seed run that failed part way leaves.
    firstSoundRow().how = 'Not what the seed wrote.';
    const lineage = db.synthLineage.rows.splice(0, 1);
    expect(lineage).toHaveLength(1);

    const r = await reconciliation();

    expect(rowOf(r, `model-d/${firstSlug}`)).toMatchObject({
      status: 'differs',
      differences: [expect.objectContaining({ field: 'how', current: 'Not what the seed wrote.' })],
    });
    expect(rowOf(r, 'model-d')?.status).toBe('matches');
    expect(group(r, 'model-d').rows.find((x) => x.table === 'LINEAGE')).toMatchObject({
      status: 'not-in-tables',
      label: 'History',
    });
  });
});

describe('the template', () => {
  async function template(id: string) {
    const res = await getTemplate(request('GET', `synths/data/${id}/template`), ctx({ id }));
    expect(res.status).toBe(200);
    return data<{ content: unknown; problems: unknown[] }>(res);
  }

  it('is the synth’s content, which round-trips through the seed’s schemas and its planning', async () => {
    const { content, problems } = await template('model-d');
    expect(problems).toEqual([]);

    const parsed = SynthContentSchema.parse(content);
    expect(parsed).toEqual(content);
    expect(parsed).toMatchObject({ synth: 'model-d', version: modelD.version });
    expect(parsed.sounds).toHaveLength(3);
    const files = toSeedFiles(parsed);
    expect(SoundsFileSchema.parse(files.sounds)).toEqual(files.sounds);
    expect(LineageFileSchema.parse(files.lineage)).toEqual(files.lineage);
    expect(NotesFileSchema.parse(files.notes)).toEqual(files.notes);

    // Planned again, it gives exactly the rows the seed planned for Model D from the real data.
    const { synths: _, ...fromData } = planCatalogue(sample());
    const again = planSynthContent(modelD, files);
    expect(again.problems).toEqual([]);
    expect(again.rows).toEqual({
      sounds: fromData.sounds,
      lineage: fromData.lineage,
      notes: fromData.notes.filter((n) => n.synthId === 'model-d'),
    });
  });

  it('carries an admin’s edit, since it comes from the tables', async () => {
    await patchSound(
      request('PATCH', `synths/model-d/sounds/${firstSlug}`, { blurb: 'The admin’s blurb.' }),
      ctx({ id: 'model-d', slug: firstSlug })
    );

    const parsed = SynthContentSchema.parse((await template('model-d')).content);

    expect(parsed.sounds[0]).toMatchObject({ id: firstSlug, blurb: 'The admin’s blurb.' });
  });

  it('is the empty skeleton for a synth with no content yet', async () => {
    const tb303 = getSynthDef('tb-303');

    expect(await template('tb-303')).toEqual({
      content: { synth: 'tb-303', version: tb303?.version, sounds: [] },
      problems: [],
    });
  });

  it('reports a sound stored on another definition version', async () => {
    firstSoundRow().definitionVersion = modelD.version + 1;

    const { problems } = await template('model-d');

    expect(problems).toEqual([
      {
        path: 'sounds.0',
        message: `${firstSlug} was made on definition version ${modelD.version + 1}, not ${modelD.version}`,
      },
    ]);
  });

  it('is 404 for a synth that does not exist, and 400 for an id that cannot be one', async () => {
    const missing = await getTemplate(
      request('GET', 'synths/data/no-such-synth/template'),
      ctx({ id: 'no-such-synth' })
    );
    const bad = await getTemplate(
      request('GET', 'synths/data/Not%20An%20Id/template'),
      ctx({ id: 'Not An Id' })
    );

    expect([missing.status, bad.status]).toEqual([404, 400]);
  });

  it('has a JSON Schema generated from the content schema, describing every field of a sound', async () => {
    const schema = await data<{
      title: string;
      type: string;
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { items?: { required?: string[] } }>;
    }>(await getSchema(request('GET', 'synths/data/schema')));

    expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(Object.keys(schema.properties)).toEqual(Object.keys(SynthContentSchema.shape));
    expect(schema.required).toEqual(['synth', 'version', 'sounds']);
    // A sound is the validator's own `PresetSchema`, so the schema carries its required fields, not a bare object.
    expect(schema.properties.sounds.items?.required).toEqual(
      expect.arrayContaining(['id', 'name', 'ref', 'artist', 'tags', 'level', 'phrase', 'steps'])
    );
  });
});
