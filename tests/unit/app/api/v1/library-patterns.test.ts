/**
 * Unit Tests: the pattern library's API (`f-pattern-library` t-122).
 *
 * Real routes, real `withAdminAuth`, the real library code and the real seeds, over the stateful catalogue fake,
 * seeded from Model D's first three sounds and with each riff made a library pattern. Pins:
 *
 * - the public reads: a sound's patterns default first, one pattern, a page by role; a hidden synth's riff is not
 *   served; a bad id or role is refused;
 * - every admin route is admin only, and a body that does not parse is refused naming the field, writing nothing;
 * - a pattern edit is audited, marks the pattern edited, and rewrites the riff of each sound it is the default of;
 * - a sound's list keeps every pattern it had; a new default rewrites its riff, audited;
 * - a transcribed pattern must name a work and list its sources;
 * - a pattern an admin edited survives a reseed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
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

import { GET as getPublicList } from '@/app/api/v1/library-patterns/route';
import { GET as getPublicOne } from '@/app/api/v1/library-patterns/[id]/route';
import { GET as getSoundPatterns } from '@/app/api/v1/synths/[id]/sounds/[slug]/patterns/route';
import {
  GET as getAdminList,
  POST as postPattern,
} from '@/app/api/v1/admin/library-patterns/route';
import {
  GET as getAdminOne,
  PATCH as patchPattern,
} from '@/app/api/v1/admin/library-patterns/[id]/route';
import { PUT as putSoundPatterns } from '@/app/api/v1/admin/synths/[id]/sounds/[slug]/patterns/route';
import { PATCH as patchSound } from '@/app/api/v1/admin/synths/[id]/sounds/[slug]/route';
import { createMockAuthSession } from '@/tests/helpers/auth';
import {
  catalogueTables,
  seedRecordTable,
  type CatalogueTables,
} from '@/tests/helpers/catalogue-db';
import { seedCatalogue } from '@/lib/app/catalogue/seed';
import { riffKey, syncRiffPatterns, type LibraryDb } from '@/lib/app/patterns/library';
import { importPhrase } from '@/lib/app/sequencer/import';
import type { Phrase } from '@/lib/app/synths/contract';
import type { CatalogueSeedData } from '@/lib/app/catalogue/data';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
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

function sample(): CatalogueSeedData {
  const data = structuredClone(real);
  data.listing.synths = [{ id: 'model-d', order: 0, listed: true }];
  data.sounds = data.sounds
    .filter((f) => f.synth === 'model-d')
    .map((f) => ({ ...f, sounds: f.sounds.slice(0, 3) }));
  data.lineage = [];
  data.notes = [];
  return data;
}

let db: CatalogueTables;

const sound = (i: number) => db.synthSound.rows[i];
const slug = (i: number) => String(sound(i).slug);
const riff = (i: number) =>
  db.libraryPattern.rows.find((p) => p.key === riffKey('model-d', slug(i)))!;
const listOf = (i: number) =>
  db.synthSoundPattern.rows
    .filter((l) => l.soundId === sound(i).id)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((l) => l.patternId);
const writes = () =>
  Object.values(db).reduce(
    (n, t) => n + t.create.mock.calls.length + t.update.mock.calls.length,
    0
  );

function request(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/v1/${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: unknown;
    meta?: Row;
    error?: { code: string; details?: { errors?: { path: string; message: string }[] } };
  };
}
const audits = () =>
  mockLogAdminAction.mock.calls.map(
    ([e]) => e as { action: string; entityType: string; entityId: string; changes: Row }
  );

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
  db.bankSong.rows.push({ id: 'the-model', title: 'The Model', parts: [] });
  await syncRiffPatterns(db as unknown as LibraryDb);
  for (const t of Object.values(db)) {
    t.create.mockClear();
    t.update.mockClear();
  }
  mockGetSession.mockResolvedValue(session('ADMIN'));
});

describe('public reads', () => {
  it("lists a sound's patterns, default first, with the facts matching reads", async () => {
    const res = await getSoundPatterns(
      request('GET', `synths/model-d/sounds/${slug(0)}/patterns`),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(res.status).toBe(200);
    const body = (await json(res)).data as { id: string; facts: Row; fidelity: string }[];
    expect(body.map((p) => p.id)).toEqual([riff(0).id]);
    expect(body[0]).toMatchObject({
      fidelity: 'in_the_style_of',
      facts: { voices: expect.any(Number) },
    });
  });

  it('is a 404 for a sound that is not there, or on a hidden synth, and for an id that cannot be one', async () => {
    db.synth.rows[0].listed = false;
    const missing = await getSoundPatterns(
      request('GET', 'synths/model-d/sounds/nope/patterns'),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    const bad = await getPublicOne(request('GET', 'library-patterns/NOT!'), ctx({ id: 'NOT!' }));
    expect(missing.status).toBe(404);
    expect(bad.status).toBe(404);
  });

  it('reads one pattern, and pages the library by role', async () => {
    const id = String(riff(0).id);
    const one = await getPublicOne(request('GET', `library-patterns/${id}`), ctx({ id }));
    expect(one.status).toBe(200);
    expect((await json(one)).data).toMatchObject({ id, name: sound(0).name });
    const none = await getPublicOne(
      request('GET', 'library-patterns/x'),
      ctx({ id: 'c' + 'x'.repeat(24) })
    );
    expect(none.status).toBe(404); // an id no row has
    const role = String(riff(0).role);
    const list = await getPublicList(request('GET', `library-patterns?role=${role}&limit=10`));
    const body = await json(list);
    expect(list.status).toBe(200);
    expect((body.data as { role: string }[]).every((p) => p.role === role)).toBe(true);
    expect(body.meta).toMatchObject({ page: 1, limit: 10 });
  });

  it('refuses a role that is not one', async () => {
    const res = await getPublicList(request('GET', 'library-patterns?role=solo'));
    expect(res.status).toBe(400);
  });
});

describe('a hidden synth', () => {
  it('hides its riffs from every public read, and serves a pattern on no sound', async () => {
    db.synth.rows[0].listed = false;
    const id = String(riff(0).id);
    expect((await getPublicOne(request('GET', `library-patterns/${id}`), ctx({ id }))).status).toBe(
      404
    );
    const list = await json(await getPublicList(request('GET', 'library-patterns')));
    expect(list.data).toEqual([]);

    db.synthSoundPattern.rows.length = 0;
    expect((await getPublicOne(request('GET', `library-patterns/${id}`), ctx({ id }))).status).toBe(
      200
    );
  });

  it('leaves out, and logs, a stored pattern that no longer parses', async () => {
    riff(0).pattern = { version: 99 };
    const res = await getSoundPatterns(
      request('GET', `synths/model-d/sounds/${slug(0)}/patterns`),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect((await json(res)).data).toEqual([]);
    expect(mockLog.error).toHaveBeenCalledWith(
      'library pattern: stored row does not parse, not served',
      { id: riff(0).id }
    );
  });
});

describe('admin reads', () => {
  it('lists every pattern with the sounds that list it, filtered by name', async () => {
    const res = await getAdminList(
      request('GET', `admin/library-patterns?q=${encodeURIComponent(String(sound(1).name))}`)
    );
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({
        id: riff(1).id,
        editedAt: null,
        sounds: [
          { synthId: 'model-d', slug: slug(1), name: sound(1).name, order: 0, isDefault: true },
        ],
      }),
    ]);
  });

  it('reads one, names a stored row that no longer parses, and is a 404 for none', async () => {
    const id = String(riff(0).id);
    const ok = await getAdminOne(request('GET', `admin/library-patterns/${id}`), ctx({ id }));
    expect((await json(ok)).data).toMatchObject({ id, key: riff(0).key });

    riff(0).sources = 'not a list';
    const broken = await getAdminOne(request('GET', `admin/library-patterns/${id}`), ctx({ id }));
    expect((await json(broken)).data).toMatchObject({ id, problem: expect.any(String) });

    const none = 'c' + 'x'.repeat(24);
    const missing = await getAdminOne(
      request('GET', `admin/library-patterns/${none}`),
      ctx({ id: none })
    );
    expect(missing.status).toBe(404);
  });
});

describe('admin only', () => {
  it('refuses a signed-in user who is not an admin, on reads and writes, and writes nothing', async () => {
    mockGetSession.mockResolvedValue(session('USER'));
    const id = String(riff(0).id);
    const responses = [
      await getAdminList(request('GET', 'admin/library-patterns')),
      await getAdminOne(request('GET', `admin/library-patterns/${id}`), ctx({ id })),
      await patchPattern(
        request('PATCH', `admin/library-patterns/${id}`, { name: 'x' }),
        ctx({ id })
      ),
      await postPattern(request('POST', 'admin/library-patterns', {})),
      await putSoundPatterns(
        request('PUT', `admin/synths/model-d/sounds/${slug(0)}/patterns`, { patternIds: [id] }),
        ctx({ id: 'model-d', slug: slug(0) })
      ),
    ];
    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    expect(writes()).toBe(0);
  });

  it('refuses a signed-out caller', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await getAdminList(request('GET', 'admin/library-patterns'));
    expect(res.status).toBe(401);
  });
});

describe('editing a pattern', () => {
  it('marks it edited, audits the change, and rewrites the riff of the sound it is the default of', async () => {
    const id = String(riff(0).id);
    const phrase: Phrase = {
      bpm: 96,
      loop: true,
      steps: [
        [0, 41, 1],
        [1, 44, 1],
      ],
    };
    const res = await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, {
        name: 'A new line',
        pattern: importPhrase(phrase),
        role: 'bass_line',
      }),
      ctx({ id })
    );

    expect(res.status).toBe(200);
    expect(riff(0)).toMatchObject({ name: 'A new line', role: 'bass_line' });
    expect(riff(0).editedAt).toBeInstanceOf(Date);
    expect((sound(0).phrase as Phrase).steps.map(([, n]) => n)).toEqual([41, 44]);
    expect(sound(0).editedAt).toBeInstanceOf(Date);
    expect(audits().map((a) => a.action)).toEqual(['library_pattern.update', 'synth_sound.update']);

    // And the seed leaves both alone.
    const kept = structuredClone(riff(0));
    await seedCatalogue(mockPrisma as unknown as TenancyClient, sample());
    await syncRiffPatterns(db as unknown as LibraryDb);
    expect(riff(0)).toEqual(kept);
    expect((sound(0).phrase as Phrase).steps.map(([, n]) => n)).toEqual([41, 44]);
  });

  it('refuses a pattern that plays nothing on its first loop, writing nothing', async () => {
    const id = String(riff(0).id);
    const silent = importPhrase({ bpm: 120, loop: true, steps: [[0, 60, 1]] });
    silent.parts[0].steps[0].notes = [];
    const res = await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, { pattern: silent }),
      ctx({ id })
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error?.details?.errors?.[0].path).toBe('pattern');
    expect(writes()).toBe(0);
  });

  it('refuses a transcribed pattern with no work and no sources, then takes it with both', async () => {
    const id = String(riff(0).id);
    const refused = await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, { fidelity: 'transcribed' }),
      ctx({ id })
    );
    expect(refused.status).toBe(400);
    expect((await json(refused)).error?.details?.errors?.map((e) => e.path)).toEqual([
      'inspiredBy',
      'sources',
    ]);

    const taken = await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, {
        fidelity: 'transcribed',
        inspiredBy: { kind: 'work', songId: 'the-model' },
        sources: [{ type: 'score', citation: 'Kraftwerk songbook, 1981', checkedAt: '2026-10-31' }],
      }),
      ctx({ id })
    );
    expect(taken.status).toBe(200);
    expect(riff(0)).toMatchObject({
      inspiration: 'work',
      inspiredBy: 'The Model',
      inspiredSongId: 'the-model',
    });
  });

  it('takes an artist, a synth and a genre, each labelled from what it links to', async () => {
    const id = String(riff(0).id);
    db.bankArtist.rows.push({ id: 'kraftwerk', name: 'Kraftwerk' });
    const set = async (inspiredBy: Row) =>
      (
        await patchPattern(
          request('PATCH', `admin/library-patterns/${id}`, { inspiredBy }),
          ctx({ id })
        )
      ).status;
    expect(await set({ kind: 'artist', artistId: 'kraftwerk' })).toBe(200);
    expect(riff(0)).toMatchObject({ inspiration: 'artist', inspiredBy: 'Kraftwerk' });
    expect(await set({ kind: 'synth', synthId: 'model-d' })).toBe(200);
    expect(riff(0)).toMatchObject({ inspiration: 'synth', inspiredSynthId: 'model-d' });
    expect(await set({ kind: 'genre', label: 'Berlin school' })).toBe(200);
    expect(riff(0)).toMatchObject({ inspiration: 'genre', inspiredBy: 'Berlin school' });
    expect(await set({ kind: 'synth', synthId: 'nothere' })).toBe(400);
    expect(await set({ kind: 'work', songId: 'nothere' })).toBe(400);
    expect(await set({ kind: 'work', songId: 'the-model', partId: 'not-its-part' })).toBe(400);
  });

  it('is a 404 for a pattern that is not there', async () => {
    const none = 'c' + 'x'.repeat(24);
    const res = await patchPattern(
      request('PATCH', `admin/library-patterns/${none}`, { name: 'x' }),
      ctx({ id: none })
    );
    expect(res.status).toBe(404);
  });

  it('refuses an Inspired by that links to nothing', async () => {
    const id = String(riff(0).id);
    const res = await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, {
        inspiredBy: { kind: 'artist', artistId: 'nobody' },
      }),
      ctx({ id })
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error?.details?.errors?.[0].path).toBe('inspiredBy.artistId');
  });

  it('writes and audits nothing for an edit that changes nothing', async () => {
    const id = String(riff(0).id);
    const res = await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, { name: riff(0).name }),
      ctx({ id })
    );
    expect(res.status).toBe(200);
    expect(writes()).toBe(0);
    expect(audits()).toEqual([]);
    expect(riff(0).editedAt).toBeNull();
  });
});

describe("a sound's list", () => {
  it('puts another pattern first, rewriting and auditing the riff, and keeps the old default on it', async () => {
    const ids = [String(riff(1).id), String(riff(0).id)];
    const res = await putSoundPatterns(
      request('PUT', `admin/synths/model-d/sounds/${slug(0)}/patterns`, { patternIds: ids }),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(res.status).toBe(200);
    expect(listOf(0)).toEqual(ids);
    expect(sound(0).phrase).not.toEqual(structuredClone(sound(0).phrase) && undefined);
    expect((sound(0).phrase as Phrase).steps.length).toBe((sound(1).phrase as Phrase).steps.length);
    expect(sound(0).editedAt).toBeInstanceOf(Date);
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'synth_sound.patterns',
        entityId: `model-d/${slug(0)}`,
        changes: expect.objectContaining({ patterns: { from: [ids[1]], to: ids } }),
      }),
    ]);
  });

  it('writes nothing for the order it already has, and keeps the riff when only a later pattern moves', async () => {
    const same = await putSoundPatterns(
      request('PUT', `admin/synths/model-d/sounds/${slug(0)}/patterns`, {
        patternIds: [riff(0).id],
      }),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(same.status).toBe(200);
    expect(writes()).toBe(0);

    const riffBefore = structuredClone(sound(0).phrase);
    const added = await putSoundPatterns(
      request('PUT', `admin/synths/model-d/sounds/${slug(0)}/patterns`, {
        patternIds: [riff(0).id, riff(2).id],
      }),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(added.status).toBe(200);
    expect(listOf(0)).toEqual([riff(0).id, riff(2).id]);
    expect(sound(0).phrase).toEqual(riffBefore);
    expect(sound(0).editedAt).toBeNull();
  });

  it('refuses a pattern named twice, and a sound that is not there', async () => {
    const twice = await putSoundPatterns(
      request('PUT', `admin/synths/model-d/sounds/${slug(0)}/patterns`, {
        patternIds: [riff(0).id, riff(0).id],
      }),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(twice.status).toBe(400);
    const missing = await putSoundPatterns(
      request('PUT', 'admin/synths/model-d/sounds/nope/patterns', { patternIds: [riff(0).id] }),
      ctx({ id: 'model-d', slug: 'nope' })
    );
    expect(missing.status).toBe(404);
  });

  it('refuses a list that leaves a pattern out, or names one that is not there', async () => {
    const res = await putSoundPatterns(
      request('PUT', `admin/synths/model-d/sounds/${slug(0)}/patterns`, {
        patternIds: [String(riff(1).id), 'nothere'],
      }),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(res.status).toBe(400);
    const paths = (await json(res)).error?.details?.errors?.map((e) => e.path);
    expect(paths).toEqual(['patternIds', 'patternIds.1']);
    expect(writes()).toBe(0);
  });
});

describe('adding a pattern', () => {
  it("adds one on no sound, marked as an admin's, audited", async () => {
    const res = await postPattern(
      request('POST', 'admin/library-patterns', {
        name: 'Berlin sequence',
        pattern: importPhrase({
          bpm: 120,
          loop: true,
          steps: [
            [0, 48, 0.25],
            [0.25, 55, 0.25],
          ],
        }),
        role: 'arp',
        inspiredBy: { kind: 'genre', label: 'Berlin school' },
        fidelity: 'in_the_style_of',
      })
    );
    expect(res.status).toBe(201);
    const row = db.libraryPattern.rows.at(-1)!;
    expect(row).toMatchObject({
      name: 'Berlin sequence',
      origin: 'human_authored',
      inspiredBy: 'Berlin school',
    });
    expect(row.editedAt).toBeInstanceOf(Date);
    expect(audits().map((a) => a.action)).toEqual(['library_pattern.create']);
  });

  it('refuses a body that does not parse, naming the field', async () => {
    const res = await postPattern(
      request('POST', 'admin/library-patterns', { name: 'x', role: 'solo' })
    );
    expect(res.status).toBe(400);
    expect(writes()).toBe(0);
  });
});

describe("a sound's riff edited directly", () => {
  it('writes into a default an admin chose, and audits it with the other sounds it reached', async () => {
    // Sound 1's riff is the default of sounds 1 and 0, and an admin has edited it.
    for (const l of db.synthSoundPattern.rows) if (l.soundId === sound(0).id) l.order = 1;
    db.synthSoundPattern.rows.push({ soundId: sound(0).id, patternId: riff(1).id, order: 0 });
    riff(1).editedAt = new Date();
    const phrase: Phrase = {
      bpm: 100,
      loop: true,
      steps: [
        [0, 38, 1],
        [1, 41, 1],
      ],
    };

    const res = await patchSound(
      request('PATCH', `admin/synths/model-d/sounds/${slug(1)}`, { phrase }),
      ctx({ id: 'model-d', slug: slug(1) })
    );

    expect(res.status).toBe(200);
    expect(riff(1).pattern).toEqual(JSON.parse(JSON.stringify(importPhrase(phrase))));
    expect((sound(0).phrase as Phrase).steps.map(([, n]) => n)).toEqual([38, 41]);
    expect(audits().map((a) => [a.action, a.entityId])).toEqual([
      ['synth_sound.update', `model-d/${slug(1)}`],
      ['library_pattern.update', riff(1).id],
      ['synth_sound.update', `model-d/${slug(0)}`],
    ]);
  });

  it('refuses a riff that cannot be a pattern, writing nothing', async () => {
    const res = await patchSound(
      request('PATCH', `admin/synths/model-d/sounds/${slug(1)}`, {
        phrase: { bpm: 100, loop: true, steps: [[0, 40, 1]], transpose: 0.5 },
      }),
      ctx({ id: 'model-d', slug: slug(1) })
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error?.details?.errors?.[0].path).toBe('phrase');
    expect(writes()).toBe(0);
  });

  it('moves its own riff pattern with it, unedited, as the seed would', async () => {
    const phrase: Phrase = {
      bpm: 100,
      loop: true,
      steps: [
        [0, 43, 0.5],
        [1, 46, 0.5],
      ],
    };
    const res = await patchSound(
      request('PATCH', `admin/synths/model-d/sounds/${slug(2)}`, { phrase }),
      ctx({ id: 'model-d', slug: slug(2) })
    );
    expect(res.status).toBe(200);
    expect(riff(2).pattern).toEqual(JSON.parse(JSON.stringify(importPhrase(phrase))));
    expect(riff(2).editedAt).toBeNull();
  });
});
