/**
 * GET /api/v1/synths/:id — one synth with its sounds, lineage and notes.
 *
 * Runs the real read layer (`lib/app/catalogue/read.ts`) over a mocked database holding the rows the seed would write
 * for Model D, so the response is Model D's real content in the shape a client gets.
 * getRouteLogger is mocked globally in tests/setup.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { GET } from '@/app/api/v1/synths/[id]/route';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import { modelDRows } from '@/tests/helpers/model-d-detail';
import { synthRows } from '@/tests/helpers/synth-detail';
import { bankDb } from '@/tests/helpers/bank-db';
import {
  assertErrorResponse,
  assertSuccessResponse,
  createMockRequest,
  parseJsonResponse,
} from '@/tests/helpers/api';

// The videos section's count is the links read layer's, tested there (`tests/unit/lib/app/links/read.test.ts`).
vi.mock('@/lib/app/links/read', () => ({
  summarisePublicLinks: vi.fn(async () => ({ count: 0, kinds: [] })),
  summariseSoundLinks: vi.fn(async () => ({})),
  summariseSongLinks: vi.fn(async () => new Map()),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    synth: { findFirst: vi.fn() },
    synthNote: { findMany: vi.fn() },
    // A family sibling's library sounds (t-322).
    synthSound: { findMany: vi.fn() },
    bankInstrument: { findMany: vi.fn() },
    bankSong: { findMany: vi.fn() },
    // A synth's family (`f-synth-families`): none unless a case gives one.
    synthFamily: { findFirst: vi.fn() },
  },
}));

const { prisma } = await import('@/lib/db/client');
/** The databank's rows, for each synth's "Heard on". */
const bank = bankDb();
const data = loadCatalogueData();
const { stored, noteRows } = modelDRows();
const firstModelDSound = () => {
  const file = data.sounds.find((f) => f.synth === 'model-d');
  if (!file) throw new Error('fixture: the seed data has Model D');
  return file.sounds[0];
};

/** The envelope, loosely: the assertions below say what is in it. */
const DetailBody = z.object({
  data: z.object({
    synth: z.record(z.string(), z.unknown()),
    sounds: z.array(z.record(z.string(), z.unknown())),
    lineage: z.record(z.string(), z.unknown()).nullable(),
    notes: z.record(z.string(), z.unknown()),
  }),
});

const call = (id: string, headers?: Record<string, string>) =>
  GET(createMockRequest({ url: `http://localhost:3000/api/v1/synths/${id}`, headers }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.bankInstrument.findMany).mockImplementation(
    bank.bankInstrument.findMany as never
  );
  vi.mocked(prisma.bankSong.findMany).mockImplementation(bank.bankSong.findMany as never);
  vi.mocked(prisma.synth.findFirst).mockImplementation((async (args: { where: { id: string } }) =>
    args.where.id === 'model-d' ? stored : null) as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(noteRows as never);
});

describe('GET /api/v1/synths/:id', () => {
  it('serves Model D: its entry, all 240 sounds as the panel plays them, lineage and notes', async () => {
    const response = await call('model-d');
    const body = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    assertSuccessResponse(body);
    const { data: detail } = DetailBody.parse(body);
    expect(Object.keys(detail)).toEqual(['synth', 'sounds', 'lineage', 'notes']);
    expect(detail).toMatchObject({
      synth: { id: 'model-d', name: 'Model D', definitionVersion: 1, soundCount: 240 },
      lineage: { title: 'From the Moog modular to the Model D' },
      notes: {
        limits: {
          intro: expect.stringMatching(/^Every control/),
          items: [{ title: 'The lower VOLUME knob' }, { title: 'MIDI IN and MIDI THRU' }],
        },
      },
    });
    // A sound comes back exactly as the seed data holds it, plus the version it was made on.
    expect(detail.sounds).toHaveLength(240);
    expect(detail.sounds[0]).toEqual({ ...firstModelDSound(), version: 1 });
    expect(response.headers.get('ETag')).toMatch(/^W\/".+"$/);
  });

  it("serves the lineage with its Heard on list, the prototype's own for Model D", async () => {
    const golden = JSON.parse(
      readFileSync(resolve(process.cwd(), 'tests/fixtures/bank/heard-on.json'), 'utf8')
    ) as Record<string, unknown[]>;
    const body = DetailBody.parse(await parseJsonResponse(await call('model-d')));
    expect(golden['model-d']).toHaveLength(36);
    expect(body.data.lineage?.heard).toEqual(golden['model-d']);
  });

  it('serves exactly what the read layer returns, which is what the synth page renders', async () => {
    // The web page reads `getSynthDetail` in-process and API clients (a native app) read this route: the two must
    // never differ, beyond the JSON round trip.
    const direct = await getSynthDetail('model-d');
    const body = await parseJsonResponse(await call('model-d'));
    expect(direct).not.toBeNull();
    expect(body).toEqual({ success: true, data: JSON.parse(JSON.stringify(direct)) });
  });

  it("serves a family member's sibling sounds already carried onto it, each with the member it was made on", async () => {
    const td3 = synthRows('td-3');
    const tb303 = synthRows('tb-303');
    vi.mocked(prisma.synth.findFirst).mockImplementation((async (args: {
      where: { id: string };
    }) => (args.where.id === 'td-3' ? td3.stored : null)) as never);
    const member = (slug: string) => ({
      slug,
      label: slug,
      synthId: slug,
      differences: '',
      instrument: { id: `i-${slug}`, name: slug, maker: 'Roland', year: '1981' },
      synth: { listed: true },
    });
    vi.mocked(prisma.synthFamily.findFirst).mockResolvedValue({
      id: 'tb-303',
      name: 'TB-303',
      defaultMember: 'td-3',
      members: [member('td-3'), member('tb-303')],
    } as never);
    vi.mocked(prisma.synthSound.findMany).mockResolvedValue(
      tb303.stored.sounds.map(({ patterns: _p, ...s }) => ({ ...s, synthId: 'tb-303' })) as never
    );

    const body = await parseJsonResponse(await call('td-3'));

    const { data } = z
      .object({
        data: z.object({
          siblingSounds: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              from: z.object({ synthId: z.string(), name: z.string() }),
              steps: z.array(z.object({ set: z.record(z.string(), z.unknown()).optional() })),
              dropped: z.array(z.unknown()),
              changed: z.array(z.unknown()),
            })
          ),
        }),
      })
      .parse(body);
    expect(data.siblingSounds).toHaveLength(tb303.stored.sounds.length);
    expect(data.siblingSounds[0]).toMatchObject({
      id: tb303.stored.sounds[0].slug,
      name: tb303.stored.sounds[0].name,
      from: { synthId: 'tb-303', name: 'TB-303' },
    });
    // Carried: its one step sets the panel under the TD-3's own control ids.
    expect(data.siblingSounds[0].steps).toHaveLength(1);
    const td3Ids = new Set(getSynthDef('td-3')?.controls.map((c) => c.id));
    const set = Object.keys(data.siblingSounds[0].steps[0].set ?? {});
    expect(set.length).toBeGreaterThan(0);
    expect(set.filter((id) => !td3Ids.has(id))).toEqual([]);
  });

  it('is a 404 in the standard envelope for an id no listed synth has', async () => {
    const response = await call('no-such-synth');
    expect(response.status).toBe(404);
    assertErrorResponse(await parseJsonResponse(response), 'NOT_FOUND', 'Synth not found');
    expect(prisma.synthNote.findMany).not.toHaveBeenCalled();
  });

  it('is a 404 without a database read for an id no synth could have', async () => {
    for (const id of ['../etc', 'Model-D', 'a'.repeat(65), '']) {
      const response = await call(id);
      expect(response.status).toBe(404);
      assertErrorResponse(await parseJsonResponse(response), 'NOT_FOUND');
    }
    expect(prisma.synth.findFirst).not.toHaveBeenCalled();
  });

  it('answers 304 with no body when the client already has this synth', async () => {
    const etag = (await call('model-d')).headers.get('ETag') ?? '';
    const again = await call('model-d', { 'If-None-Match': etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
  });

  it('turns a database failure into the standard error envelope', async () => {
    vi.mocked(prisma.synth.findFirst).mockRejectedValue(new Error('connection lost'));
    const response = await call('model-d');
    expect(response.status).toBe(500);
    assertErrorResponse(await parseJsonResponse(response), 'INTERNAL_ERROR');
  });
});
