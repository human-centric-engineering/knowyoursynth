/**
 * GET /api/v1/synths/:id — one synth with its sounds, lineage and notes.
 *
 * Runs the real read layer (`lib/app/catalogue/read.ts`) over a mocked database holding the rows the seed would write
 * for Model D, so the response is Model D's real content in the shape a client gets.
 * getRouteLogger is mocked globally in tests/setup.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { GET } from '@/app/api/v1/synths/[id]/route';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import { planCatalogue } from '@/lib/app/catalogue/seed';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import {
  assertErrorResponse,
  assertSuccessResponse,
  createMockRequest,
  parseJsonResponse,
} from '@/tests/helpers/api';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    synth: { findFirst: vi.fn() },
    synthNote: { findMany: vi.fn() },
  },
}));

const { prisma } = await import('@/lib/db/client');
const data = loadCatalogueData();
const rows = planCatalogue(data);
const stored = {
  ...rows.synths[0],
  _count: { sounds: rows.sounds.length },
  sounds: rows.sounds.map((s, i) => ({ id: `row-${i}`, editedAt: null, ...s })),
  lineage: { ...rows.lineage[0], editedAt: null },
};
const noteRows = rows.notes.map(({ kind, synthId, target, title, text }) => ({
  kind,
  synthId,
  target,
  title,
  text,
}));

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
  vi.mocked(prisma.synth.findFirst).mockImplementation((async (args: { where: { id: string } }) =>
    args.where.id === 'model-d' ? stored : null) as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(noteRows as never);
});

describe('GET /api/v1/synths/:id', () => {
  it('serves Model D: its entry, all 99 sounds as the panel plays them, lineage and notes', async () => {
    const response = await call('model-d');
    const body = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    assertSuccessResponse(body);
    const { data: detail } = DetailBody.parse(body);
    expect(Object.keys(detail)).toEqual(['synth', 'sounds', 'lineage', 'notes']);
    expect(detail).toMatchObject({
      synth: { id: 'model-d', name: 'Model D', definitionVersion: 1, soundCount: 99 },
      lineage: { title: 'From the Moog modular to the Model D' },
      notes: {
        limits: {
          intro: expect.stringMatching(/^Every control/),
          items: [{ title: 'The lower VOLUME knob' }, { title: 'MIDI IN and MIDI THRU' }],
        },
      },
    });
    // A sound comes back exactly as the seed data holds it, plus the version it was made on.
    expect(detail.sounds).toHaveLength(99);
    expect(detail.sounds[0]).toEqual({ ...data.sounds[0].sounds[0], version: 1 });
    expect(response.headers.get('ETag')).toMatch(/^W\/".+"$/);
  });

  it('serves exactly what the read layer returns, which is what the synth page renders', async () => {
    // The web page reads `getSynthDetail` in-process and API clients (a native app) read this route: the two must
    // never differ, beyond the JSON round trip.
    const direct = await getSynthDetail('model-d');
    const body = await parseJsonResponse(await call('model-d'));
    expect(direct).not.toBeNull();
    expect(body).toEqual({ success: true, data: JSON.parse(JSON.stringify(direct)) });
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
