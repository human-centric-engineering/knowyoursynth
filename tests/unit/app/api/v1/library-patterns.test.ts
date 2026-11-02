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
 * - a pattern an admin edited survives a reseed;
 * - the admin page's reads (t-126): the list filtered by synth, artist and fidelity, a sound's patterns in order, and
 *   the synths, artists and works a pattern's Inspired by chooses from.
 * - admin control (t-156): who made each pattern, its rights risk and status set one or many at a time with a reason,
 *   a disabled pattern gone from every public read and its sounds handed to their next enabled pattern, a blocked
 *   pattern always disabled, comments and the audit history, and the list filtered by origin, rights risk and status.
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
import {
  GET as getAdminSoundPatterns,
  PUT as putSoundPatterns,
} from '@/app/api/v1/admin/synths/[id]/sounds/[slug]/patterns/route';
import { GET as getChoices } from '@/app/api/v1/admin/library-patterns/choices/route';
import { POST as postControl } from '@/app/api/v1/admin/library-patterns/control/route';
import {
  GET as getComments,
  POST as postComment,
} from '@/app/api/v1/admin/library-patterns/[id]/comments/route';
import { GET as getHistory } from '@/app/api/v1/admin/library-patterns/[id]/history/route';
import { listAllPublicPatterns } from '@/lib/app/patterns/library-read';
import { PATCH as patchSound } from '@/app/api/v1/admin/synths/[id]/sounds/[slug]/route';
import { createMockAuthSession } from '@/tests/helpers/auth';
import {
  catalogueTables,
  seedRecordTable,
  table,
  type CatalogueTables,
} from '@/tests/helpers/catalogue-db';
import { seedCatalogue } from '@/lib/app/catalogue/seed';
import {
  phraseOf,
  RIFF_MADE_BY,
  riffKey,
  syncRiffPatterns,
  type LibraryDb,
} from '@/lib/app/patterns/library';
import { PatternSchema } from '@/lib/app/sequencer/pattern';
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

/** Admins' comments, with the database's `createdAt`. */
function comments() {
  const t = table();
  const create = t.create.getMockImplementation()!;
  t.create.mockImplementation(async ({ data }: { data: Row }) =>
    create({ data: { createdAt: new Date(), ...data } })
  );
  return t;
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
    user: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, name: `Admin ${id}` }))
      ),
    },
    libraryPatternComment: comments(),
    aiAdminAuditLog: { findMany: vi.fn(async () => []) },
    // As the database's: a transaction that throws leaves every table as it was.
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      const before = Object.values(db).map((t) => structuredClone(t.rows));
      try {
        return await fn(mockPrisma);
      } catch (err) {
        Object.values(db).forEach((t, i) => t.rows.splice(0, t.rows.length, ...before[i]));
        throw err;
      }
    }),
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

    db.synth.rows[0].listed = true;
    db.synthSoundPattern.rows.length = 0;
    expect((await getPublicOne(request('GET', `library-patterns/${id}`), ctx({ id }))).status).toBe(
      404
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

describe("the admin page's reads", () => {
  const ids = (body: { data?: unknown }) => (body.data as { id: string }[]).map((p) => p.id);
  const list = async (query: string) =>
    json(await getAdminList(request('GET', `admin/library-patterns?${query}`)));

  it('filters by synth, by artist (or a work they are credited on) and by fidelity', async () => {
    db.bankArtist.rows.push({ id: 'kraftwerk', name: 'Kraftwerk' });
    db.bankSong.rows[0].artists = [{ artistId: 'kraftwerk' }];
    Object.assign(riff(0), { inspiration: 'artist', inspiredArtistId: 'kraftwerk' });
    Object.assign(riff(1), { inspiration: 'work', inspiredSongId: 'the-model' });
    riff(2).fidelity = 'reconstructed';
    // A pattern on no sound: no synth's.
    db.libraryPattern.rows.push({
      ...structuredClone(riff(2)),
      id: 'c' + 'o'.repeat(24),
      key: 'admin:loose',
    });

    const all = await list('');
    expect(ids(all)).toHaveLength(4);
    expect(new Set(ids(await list('synth=model-d')))).toEqual(
      new Set([riff(0).id, riff(1).id, riff(2).id])
    );
    expect(await list('synth=nothere')).toMatchObject({ data: [], meta: { total: 0 } });
    expect(new Set(ids(await list('artist=kraftwerk')))).toEqual(new Set([riff(0).id, riff(1).id]));
    expect(new Set(ids(await list('fidelity=reconstructed')))).toEqual(
      new Set([riff(2).id, 'c' + 'o'.repeat(24)])
    );
    expect(ids(await list('fidelity=reconstructed&synth=model-d'))).toEqual([riff(2).id]);
  });

  it('refuses a fidelity that is not one', async () => {
    const res = await getAdminList(request('GET', 'admin/library-patterns?fidelity=exact'));
    expect(res.status).toBe(400);
  });

  it("reads a sound's patterns, default first, with the sounds each is on, and is a 404 for none", async () => {
    db.synthSoundPattern.rows.push({ soundId: sound(0).id, patternId: riff(1).id, order: 1 });
    const res = await getAdminSoundPatterns(
      request('GET', `admin/synths/model-d/sounds/${slug(0)}/patterns`),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toMatchObject({ synthId: 'model-d', slug: slug(0), name: sound(0).name });
    const patterns = (body.data as { patterns: { id: string; sounds: { slug: string }[] }[] })
      .patterns;
    expect(patterns.map((p) => p.id)).toEqual([riff(0).id, riff(1).id]);
    expect(patterns[1].sounds.map((s) => s.slug).sort()).toEqual([slug(0), slug(1)].sort());

    const missing = await getAdminSoundPatterns(
      request('GET', 'admin/synths/model-d/sounds/nothere/patterns'),
      ctx({ id: 'model-d', slug: 'nothere' })
    );
    expect(missing.status).toBe(404);
  });

  it('names every synth, artist and work, each work with its parts, for the pickers', async () => {
    db.bankArtist.rows.push({ id: 'kraftwerk', name: 'Kraftwerk', story: 'not sent' });
    db.bankSong.rows[0].parts = [{ id: 'part-1', order: 0, on: 'Minimoog (the bass)', text: 'x' }];
    const res = await getChoices(request('GET', 'admin/library-patterns/choices'));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({
      synths: [{ id: 'model-d', name: db.synth.rows[0].name, maker: db.synth.rows[0].maker }],
      artists: [{ id: 'kraftwerk', name: 'Kraftwerk' }],
      songs: [
        {
          id: 'the-model',
          title: 'The Model',
          parts: [{ id: 'part-1', on: 'Minimoog (the bass)' }],
        },
      ],
    });
  });

  it('is admin only', async () => {
    mockGetSession.mockResolvedValue(session('USER'));
    const responses = [
      await getChoices(request('GET', 'admin/library-patterns/choices')),
      await getAdminSoundPatterns(
        request('GET', `admin/synths/model-d/sounds/${slug(0)}/patterns`),
        ctx({ id: 'model-d', slug: slug(0) })
      ),
    ];
    expect(responses.map((r) => r.status)).toEqual([403, 403]);
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

  it('refuses a tempo range that leaves out the bpm it is written at, and an edit to a default that ends in rests', async () => {
    const id = String(riff(0).id);
    const bpm = Number((riff(0).pattern as { bpm: number }).bpm);
    const tempo = await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, { tempo: { min: bpm + 1, max: bpm + 10 } }),
      ctx({ id })
    );
    expect(tempo.status).toBe(400);
    expect((await json(tempo)).error?.details?.errors?.[0].path).toBe('tempo');

    const rests = importPhrase({ bpm: 120, loop: true, steps: [[0, 48, 1]] });
    rests.parts[0].steps.push(
      ...structuredClone(rests.parts[0].steps).map((s) => ({ ...s, notes: [] }))
    );
    const res = await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, { pattern: rests }),
      ctx({ id })
    );
    expect(res.status).toBe(400);
    expect(writes()).toBe(0);
  });

  it('marks the sound it is the default of edited, even for a change of name alone', async () => {
    const id = String(riff(0).id);
    await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, { name: 'Renamed' }),
      ctx({ id })
    );
    expect(sound(0).editedAt).toBeInstanceOf(Date);
    expect(sound(1).editedAt).toBeNull();
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

  it('refuses a new default that ends in rests, which its riff could not play whole', async () => {
    const id = String(riff(1).id);
    const rests = importPhrase({ bpm: 120, loop: true, steps: [[0, 48, 1]] });
    rests.parts[0].steps.push(
      ...structuredClone(rests.parts[0].steps).map((s) => ({ ...s, notes: [] }))
    );
    // As a pattern on no sound's head, it may end in rests.
    db.synthSoundPattern.rows.splice(
      db.synthSoundPattern.rows.findIndex((l) => l.patternId === id),
      1
    );
    expect(
      (
        await patchPattern(
          request('PATCH', `admin/library-patterns/${id}`, { pattern: rests }),
          ctx({ id })
        )
      ).status
    ).toBe(200);
    const res = await putSoundPatterns(
      request('PUT', `admin/synths/model-d/sounds/${slug(0)}/patterns`, {
        patternIds: [id, riff(0).id],
      }),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error?.details?.errors?.[0].path).toBe('patternIds.0');
    expect(listOf(0)).toEqual([riff(0).id]);
  });

  it('refuses a new list for a sound made on an older definition', async () => {
    sound(0).definitionVersion = 0;
    const res = await putSoundPatterns(
      request('PUT', `admin/synths/model-d/sounds/${slug(0)}/patterns`, {
        patternIds: [riff(1).id, riff(0).id],
      }),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error?.details?.errors?.[0].path).toBe('definitionVersion');
    expect(writes()).toBe(0);
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
  it('refuses a new riff while the sound plays a pattern an admin chose, writing nothing', async () => {
    for (const l of db.synthSoundPattern.rows) if (l.soundId === sound(0).id) l.order = 1;
    db.synthSoundPattern.rows.push({ soundId: sound(0).id, patternId: riff(1).id, order: 0 });
    const res = await patchSound(
      request('PATCH', `admin/synths/model-d/sounds/${slug(0)}`, {
        phrase: { bpm: 100, loop: true, steps: [[0, 38, 1]] },
      }),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error?.details?.errors?.[0].path).toBe('phrase');
    expect(writes()).toBe(0);

    // Its other fields can still change.
    const named = await patchSound(
      request('PATCH', `admin/synths/model-d/sounds/${slug(0)}`, { name: 'Renamed' }),
      ctx({ id: 'model-d', slug: slug(0) })
    );
    expect(named.status).toBe(200);
  });

  it("still takes a new riff once an admin changed only its own riff pattern's name or role", async () => {
    const id = String(riff(2).id);
    await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, { role: 'held' }),
      ctx({ id })
    );
    const phrase: Phrase = {
      bpm: 100,
      loop: true,
      steps: [
        [0, 43, 1],
        [1, 47, 1],
      ],
    };
    const res = await patchSound(
      request('PATCH', `admin/synths/model-d/sounds/${slug(2)}`, { phrase }),
      ctx({ id: 'model-d', slug: slug(2) })
    );
    expect(res.status).toBe(200);
    // The new notes, with the admin's role kept.
    expect(riff(2)).toMatchObject({
      role: 'held',
      pattern: JSON.parse(JSON.stringify(importPhrase(phrase))),
    });

    // Once an admin added what a riff cannot say (here, swing), the riff no longer leads, and a new one is refused.
    const swung = { ...importPhrase(phrase), swing: 60 };
    expect(
      (
        await patchPattern(
          request('PATCH', `admin/library-patterns/${id}`, { pattern: swung }),
          ctx({ id })
        )
      ).status
    ).toBe(200);
    const refused = await patchSound(
      request('PATCH', `admin/synths/model-d/sounds/${slug(2)}`, {
        phrase: { bpm: 100, loop: true, steps: [[0, 52, 1]] },
      }),
      ctx({ id: 'model-d', slug: slug(2) })
    );
    expect(refused.status).toBe(400);
    expect(riff(2).pattern).toMatchObject({ swing: 60 });
  });

  it('leaves the riff pattern alone when an edit touches neither the riff, the name nor the credit', async () => {
    db.bankArtist.findMany.mockClear();
    const res = await patchSound(
      request('PATCH', `admin/synths/model-d/sounds/${slug(2)}`, { blurb: 'A new blurb' }),
      ctx({ id: 'model-d', slug: slug(2) })
    );
    expect(res.status).toBe(200);
    expect(db.libraryPattern.update).not.toHaveBeenCalled();
    expect(db.bankArtist.findMany).not.toHaveBeenCalled();
  });

  it('refuses an edit to a stored pattern that no longer parses unless it sends a whole pattern', async () => {
    const id = String(riff(0).id);
    riff(0).pattern = { version: 99 };
    const res = await patchPattern(
      request('PATCH', `admin/library-patterns/${id}`, { name: 'x' }),
      ctx({ id })
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error?.details?.errors?.[0].path).toBe('pattern');
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

describe('admin control (t-156)', () => {
  const control = (body: unknown) =>
    postControl(request('POST', 'admin/library-patterns/control', body));
  const publicIds = async (i: number) =>
    (
      (
        await json(
          await getSoundPatterns(
            request('GET', `synths/model-d/sounds/${slug(i)}/patterns`),
            ctx({ id: 'model-d', slug: slug(i) })
          )
        )
      ).data as { id: string }[]
    ).map((p) => p.id);
  const notesOf = (row: Row) => phraseOf(PatternSchema.parse(row.pattern)).steps;
  const problems = async (res: Response) => (await json(res)).error?.details?.errors ?? [];
  /** Sound 0 lists its own riff, then sound 1's: a second pattern to fall back on. */
  const withFallback = () =>
    db.synthSoundPattern.rows.push({ soundId: sound(0).id, patternId: riff(1).id, order: 1 });

  describe('origin', () => {
    it('records every seeded riff as AI-generated, made by an agent, rights None and enabled', () => {
      for (const i of [0, 1, 2])
        expect(riff(i)).toMatchObject({
          origin: 'ai_generated',
          madeBy: RIFF_MADE_BY,
          rightsRisk: 'none',
          rightsReason: null,
          status: 'enabled',
        });
    });

    it('records the admin who added a pattern, and when', async () => {
      const res = await postPattern(
        request('POST', 'admin/library-patterns', {
          name: 'Berlin sequence',
          pattern: importPhrase({ bpm: 120, loop: true, steps: [[0, 48, 0.25]] }),
          role: 'arp',
          inspiredBy: { kind: 'genre', label: 'Berlin school' },
          fidelity: 'in_the_style_of',
        })
      );
      const userId = session('ADMIN').user.id;
      expect(db.libraryPattern.rows.at(-1)).toMatchObject({
        origin: 'human_authored',
        madeByUserId: userId,
        madeAt: expect.any(Date),
        rightsRisk: 'none',
      });
      expect((await json(res)).data).toMatchObject({
        madeByUser: { id: userId, name: `Admin ${userId}` },
      });
    });

    it('lets an admin change the origin and who made it, audited', async () => {
      const id = String(riff(0).id);
      const res = await patchPattern(
        request('PATCH', `admin/library-patterns/${id}`, {
          origin: 'human_authored',
          madeBy: 'The owner, by hand',
        }),
        ctx({ id })
      );
      expect(res.status).toBe(200);
      expect(riff(0)).toMatchObject({ origin: 'human_authored', madeBy: 'The owner, by hand' });
      expect(audits()[0].changes).toMatchObject({
        origin: { from: 'ai_generated', to: 'human_authored' },
      });
    });
  });

  describe('rights risk', () => {
    it('follows the fidelity until an admin sets one, then keeps it', async () => {
      const id = String(riff(2).id);
      const reconstruct = {
        fidelity: 'reconstructed',
        inspiredBy: { kind: 'work', songId: 'the-model' },
        sources: [{ type: 'by_ear', citation: 'The record', checkedAt: '2026-11-01' }],
      };
      await patchPattern(
        request('PATCH', `admin/library-patterns/${id}`, reconstruct),
        ctx({ id })
      );
      expect(riff(2).rightsRisk).toBe('needs_review');

      await control({ ids: [id], rightsRisk: 'cleared', reason: 'Four bars, labelled' });
      expect(riff(2)).toMatchObject({ rightsRisk: 'cleared', rightsReason: 'Four bars, labelled' });
      await patchPattern(
        request('PATCH', `admin/library-patterns/${id}`, { fidelity: 'transcribed' }),
        ctx({ id })
      );
      expect(riff(2).rightsRisk).toBe('cleared');
    });

    it('sets several at once with one reason, each audited, and writes nothing for one already there', async () => {
      // Already set that way, for the same reason.
      riff(2).rightsRisk = 'cleared';
      riff(2).rightsReason = 'Legal review, batch 1';
      const ids = [riff(0).id, riff(1).id, riff(2).id];
      const res = await control({ ids, rightsRisk: 'cleared', reason: 'Legal review, batch 1' });
      expect(res.status).toBe(200);
      expect((await json(res)).data).toMatchObject({ changed: [riff(0).id, riff(1).id] });
      expect(audits().map((a) => [a.action, a.entityId])).toEqual([
        ['library_pattern.control', riff(0).id],
        ['library_pattern.control', riff(1).id],
      ]);
      expect(audits()[0].changes).toMatchObject({
        rightsRisk: { from: 'none', to: 'cleared' },
        rightsReason: { from: null, to: 'Legal review, batch 1' },
      });
    });

    it('disables a blocked pattern, and refuses to enable one', async () => {
      withFallback();
      const id = String(riff(0).id);
      await control({ ids: [id], rightsRisk: 'blocked', reason: 'The whole hook' });
      expect(riff(0)).toMatchObject({
        rightsRisk: 'blocked',
        status: 'disabled',
        statusReason: 'The whole hook',
      });

      const res = await control({ ids: [id], status: 'enabled', reason: 'Try again' });
      expect(res.status).toBe(400);
      expect(await problems(res)).toEqual([
        { path: 'status', message: expect.stringContaining('always disabled') },
      ]);
      expect(riff(0).status).toBe('disabled');

      // Lowered with the same request, it can be.
      await control({
        ids: [id],
        rightsRisk: 'cleared',
        status: 'enabled',
        reason: 'Cut to 4 bars',
      });
      expect(riff(0)).toMatchObject({ rightsRisk: 'cleared', status: 'enabled' });
    });
  });

  describe('status', () => {
    it('hides a disabled pattern from every public read, and keeps it in admin and the database', async () => {
      withFallback();
      const id = String(riff(1).id);
      // Enabled, it is public: sound 1's default, and second on sound 0.
      expect(await publicIds(0)).toEqual([riff(0).id, id]);
      expect((await listAllPublicPatterns()).map((p) => p.id)).toContain(id);

      const res = await control({
        ids: [id],
        status: 'disabled',
        reason: 'Too close',
        acknowledge: true,
      });
      expect(res.status).toBe(200);
      expect(await publicIds(0)).toEqual([riff(0).id]);
      expect(await publicIds(1)).toEqual([]);
      expect(
        (await getPublicOne(request('GET', `library-patterns/${id}`), ctx({ id }))).status
      ).toBe(404);
      const list = await json(await getPublicList(request('GET', 'library-patterns')));
      expect((list.data as { id: string }[]).map((p) => p.id)).not.toContain(id);
      // Suggestions rank this list.
      expect((await listAllPublicPatterns()).map((p) => p.id)).not.toContain(id);

      expect(db.libraryPattern.rows.some((p) => p.id === id)).toBe(true);
      const admin = await json(
        await getAdminList(request('GET', 'admin/library-patterns?status=disabled'))
      );
      expect(admin.data).toEqual([
        expect.objectContaining({ id, status: 'disabled', statusReason: 'Too close' }),
      ]);
    });

    it('hands a sound whose default is disabled to its next enabled pattern, and back when it is enabled', async () => {
      withFallback();
      const own = notesOf(riff(0));
      const id = String(riff(0).id);
      expect(notesOf(riff(1))).not.toEqual(own);

      const res = await control({ ids: [id], status: 'disabled', reason: 'Under review' });
      expect(res.status).toBe(200);
      expect((sound(0).phrase as Phrase).steps).toEqual(notesOf(riff(1)));
      expect(sound(0).editedAt).toBeInstanceOf(Date);
      expect(await publicIds(0)).toEqual([riff(1).id]);
      expect(audits().map((a) => [a.action, a.entityId])).toEqual([
        ['library_pattern.control', id],
        ['synth_sound.update', `model-d/${slug(0)}`],
      ]);
      // The admin still sees which pattern the sound plays.
      const admin = (
        await json(
          await getAdminOne(
            request('GET', `admin/library-patterns/${String(riff(1).id)}`),
            ctx({ id: String(riff(1).id) })
          )
        )
      ).data as { sounds: { slug: string; isDefault: boolean }[] };
      expect(admin.sounds.find((x) => x.slug === slug(0))?.isDefault).toBe(true);

      await control({ ids: [id], status: 'enabled', reason: 'Cleared' });
      expect((sound(0).phrase as Phrase).steps).toEqual(own);
      expect(await publicIds(0)).toEqual([id, riff(1).id]);
    });

    it("warns before disabling a sound's last enabled pattern, and keeps its riff once acknowledged", async () => {
      const id = String(riff(1).id);
      const phrase = structuredClone(sound(1).phrase);
      const res = await control({ ids: [id], status: 'disabled', reason: 'Gone' });
      expect(res.status).toBe(400);
      expect(await problems(res)).toEqual([
        { path: 'acknowledge', message: expect.stringContaining(String(sound(1).name)) },
      ]);
      expect(riff(1).status).toBe('enabled');
      expect(audits()).toEqual([]);

      const ok = await control({
        ids: [id],
        status: 'disabled',
        reason: 'Gone',
        acknowledge: true,
      });
      expect(ok.status).toBe(200);
      expect((await json(ok)).data).toMatchObject({
        leftWithout: [{ synthId: 'model-d', slug: slug(1), name: sound(1).name }],
      });
      expect(riff(1).status).toBe('disabled');
      expect(sound(1).phrase).toEqual(phrase);
    });

    it('refuses a reason left out, an id no pattern has, and a change of nothing, writing nothing', async () => {
      const id = String(riff(0).id);
      const none = 'c' + 'x'.repeat(24);
      for (const body of [
        { ids: [id], status: 'disabled' },
        { ids: [id], status: 'disabled', reason: '  ' },
        { ids: [id], reason: 'Nothing set' },
        { ids: [], status: 'disabled', reason: 'x' },
        { ids: [id], status: 'hidden', reason: 'x' },
      ])
        expect((await control(body)).status).toBe(400);
      const missing = await control({ ids: [id, none], status: 'disabled', reason: 'x' });
      expect(missing.status).toBe(400);
      expect(await problems(missing)).toEqual([
        { path: 'ids', message: `No library pattern has the id ${none}` },
      ]);
      expect(writes()).toBe(0);
    });
  });

  describe('a reorder past patterns the sound cannot play', () => {
    it('rewrites the riff when the default moves behind a disabled pattern and one that cannot be a riff', async () => {
      // Sound 0: its riff (disabled), X (enabled, two parts: never a riff), then sounds 1's and 2's riffs.
      const two = PatternSchema.parse(riff(2).pattern);
      two.parts.push(structuredClone(two.parts[0]));
      two.chain = [0, 1];
      const x = 'c' + 'q'.repeat(24);
      db.libraryPattern.rows.push({
        ...structuredClone(riff(2)),
        id: x,
        key: 'admin:two',
        pattern: two,
      });
      riff(0).status = 'disabled';
      db.synthSoundPattern.rows.push(
        { soundId: sound(0).id, patternId: x, order: 1 },
        { soundId: sound(0).id, patternId: riff(1).id, order: 2 },
        { soundId: sound(0).id, patternId: riff(2).id, order: 3 }
      );
      const put = (ids: unknown[]) =>
        putSoundPatterns(
          request('PUT', `admin/synths/model-d/sounds/${slug(0)}/patterns`, { patternIds: ids }),
          ctx({ id: 'model-d', slug: slug(0) })
        );
      // The first enabled pattern, X, is the same either way: only what it plays decides the riff.
      const res = await put([riff(0).id, x, riff(2).id, riff(1).id]);
      expect(res.status).toBe(200);
      expect((sound(0).phrase as Phrase).steps).toEqual(notesOf(riff(2)));
    });
  });

  describe('a rights risk set to the value it has', () => {
    it('records the reason, so the risk stops following the fidelity', async () => {
      const id = String(riff(0).id);
      const res = await control({
        ids: [id],
        rightsRisk: 'none',
        reason: 'Checked: nothing taken',
      });
      expect((await json(res)).data).toMatchObject({ changed: [id] });
      expect(riff(0)).toMatchObject({ rightsRisk: 'none', rightsReason: 'Checked: nothing taken' });
    });
  });

  describe('the list', () => {
    it('filters by origin, rights risk and status', async () => {
      Object.assign(riff(0), { origin: 'human_authored', rightsRisk: 'needs_review' });
      Object.assign(riff(1), { status: 'disabled' });
      const ids = async (q: string) =>
        (
          (await json(await getAdminList(request('GET', `admin/library-patterns?${q}`)))).data as {
            id: string;
          }[]
        ).map((p) => p.id);
      expect(await ids('origin=human_authored')).toEqual([riff(0).id]);
      expect(await ids('rights=needs_review')).toEqual([riff(0).id]);
      expect(await ids('status=disabled')).toEqual([riff(1).id]);
      expect(new Set(await ids('origin=ai_generated&status=enabled'))).toEqual(
        new Set([riff(2).id])
      );
      expect(
        (await getAdminList(request('GET', 'admin/library-patterns?rights=maybe'))).status
      ).toBe(400);
    });
  });

  describe('comments and history', () => {
    it('adds a comment as the signed-in admin, audited, and lists them oldest first', async () => {
      const id = String(riff(0).id);
      const userId = session('ADMIN').user.id;
      const res = await postComment(
        request('POST', `admin/library-patterns/${id}/comments`, { body: 'Heard it: fine.' }),
        ctx({ id })
      );
      expect(res.status).toBe(201);
      await postComment(
        request('POST', `admin/library-patterns/${id}/comments`, { body: 'Second.' }),
        ctx({ id })
      );
      const list = await json(
        await getComments(request('GET', `admin/library-patterns/${id}/comments`), ctx({ id }))
      );
      expect(list.data).toEqual([
        expect.objectContaining({
          body: 'Heard it: fine.',
          author: { id: userId, name: `Admin ${userId}` },
        }),
        expect.objectContaining({ body: 'Second.' }),
      ]);
      expect(audits().map((a) => a.action)).toEqual([
        'library_pattern.comment',
        'library_pattern.comment',
      ]);
    });

    it('refuses an empty comment, and is a 404 for a pattern that is not there', async () => {
      const id = String(riff(0).id);
      const empty = await postComment(
        request('POST', `admin/library-patterns/${id}/comments`, { body: ' ' }),
        ctx({ id })
      );
      expect(empty.status).toBe(400);
      const none = 'c' + 'x'.repeat(24);
      for (const res of [
        await postComment(
          request('POST', `admin/library-patterns/${none}/comments`, { body: 'x' }),
          ctx({ id: none })
        ),
        await getComments(
          request('GET', `admin/library-patterns/${none}/comments`),
          ctx({ id: none })
        ),
        await getHistory(
          request('GET', `admin/library-patterns/${none}/history`),
          ctx({ id: none })
        ),
      ])
        expect(res.status).toBe(404);
    });

    it("reads a pattern's audited changes, newest first, with who made them", async () => {
      const id = String(riff(0).id);
      const at = new Date('2026-11-01T10:00:00Z');
      const log = (mockPrisma as { aiAdminAuditLog: { findMany: ReturnType<typeof vi.fn> } })
        .aiAdminAuditLog.findMany;
      log.mockResolvedValueOnce([
        {
          id: 'a1',
          action: 'library_pattern.control',
          changes: { status: { from: 'enabled', to: 'disabled' } },
          createdAt: at,
          user: { name: 'Jo' },
        },
        {
          id: 'a2',
          action: 'library_pattern.update',
          changes: 'garbled',
          createdAt: at,
          user: null,
        },
      ]);
      const res = await getHistory(
        request('GET', `admin/library-patterns/${id}/history`),
        ctx({ id })
      );
      expect((await json(res)).data).toEqual([
        {
          id: 'a1',
          action: 'library_pattern.control',
          by: 'Jo',
          at: at.toISOString(),
          changes: { status: { from: 'enabled', to: 'disabled' } },
        },
        {
          id: 'a2',
          action: 'library_pattern.update',
          by: null,
          at: at.toISOString(),
          changes: null,
        },
      ]);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entityType: 'library_pattern', entityId: id } })
      );
    });
  });

  describe('who may', () => {
    it('is admin only, and needs a session', async () => {
      const id = String(riff(0).id);
      const calls = () => [
        control({ ids: [id], status: 'disabled', reason: 'x' }),
        postComment(
          request('POST', `admin/library-patterns/${id}/comments`, { body: 'x' }),
          ctx({ id })
        ),
        getComments(request('GET', `admin/library-patterns/${id}/comments`), ctx({ id })),
        getHistory(request('GET', `admin/library-patterns/${id}/history`), ctx({ id })),
      ];
      mockGetSession.mockResolvedValue(session('USER'));
      for (const res of await Promise.all(calls())) expect(res.status).toBe(403);
      mockGetSession.mockResolvedValue(null);
      for (const res of await Promise.all(calls())) expect(res.status).toBe(401);
      expect(writes()).toBe(0);
      expect(riff(0).status).toBe('enabled');
    });
  });
});
