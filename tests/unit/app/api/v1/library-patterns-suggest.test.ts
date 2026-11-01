/**
 * Unit Tests: patterns that suit the sound on the panel (`f-pattern-library` t-125).
 *
 * POST /api/v1/library-patterns/suggest over a mocked database, with the real detector's features, the real model and
 * the real ranking. Pins:
 *
 * - a body that is not a reading is refused naming the field, and reads nothing;
 * - an unknown synth or sound is a 404;
 * - the answer: what the patch sounds like, then patterns that suit it, each with the pattern itself and why, the
 *   sound's own left out;
 * - at most two reads a call, and the library read at most once a minute: no read per pattern;
 * - a silent patch is offered nothing;
 * - the route sits under the section rate limit with no handler work.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { LibraryPattern } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  synthSound: { findFirst: vi.fn() },
  libraryPattern: { findMany: vi.fn() },
}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import { POST } from '@/app/api/v1/library-patterns/suggest/route';
import { forgetSuggestLibrary, type SuggestResult } from '@/lib/app/patterns/suggest-read';
import { importPhrase } from '@/lib/app/sequencer/import';
import { PATTERN_VERSION } from '@/lib/app/sequencer/pattern';
import { CATCH_ALL_RULE, findRateLimitRule } from '@/lib/security/rate-limit-policy';
import { soundFeatures, type SoundFeatures } from '@/lib/app/synths/lib/soundkind';
import type { Phrase } from '@/lib/app/synths/contract';
import { monoParams } from '@/tests/unit/lib/app/synths/audio/render';

/** A plucked bass, read by the real detector. */
const BASS: SoundFeatures = soundFeatures(
  monoParams({
    osc: [
      { level: 0.8, mix: { saw: 1 }, semi: -12 },
      { level: 0.5, mix: { pulse: 1 }, pw: 0.4, semi: -24 },
      { level: 0, mix: { tri: 1 }, semi: 0 },
    ],
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 300,
      res: 0.4,
      envAmt: 3,
      envSrc: 'env1',
      kbd: 0.3,
    },
    env1: { a: 0.002, d: 0.12, s: 0, r: 0.05 },
    env2: { a: 0.002, d: 0.25, s: 0, r: 0.05 },
  })
);

function row(id: string, role: LibraryPattern['role'], phrase: Phrase): LibraryPattern {
  const at = new Date('2026-10-31T00:00:00Z');
  return {
    id,
    key: `riff:model-d/${id}`,
    name: id,
    pattern: JSON.parse(JSON.stringify(importPhrase(phrase))),
    version: PATTERN_VERSION,
    role,
    bpmMin: null,
    bpmMax: null,
    inspiration: 'genre',
    inspiredBy: 'Funk',
    inspiredSongId: null,
    inspiredPartId: null,
    inspiredArtistId: null,
    inspiredSynthId: null,
    fidelity: 'in_the_style_of',
    sources: [],
    origin: 'ai_generated',
    madeBy: null,
    madeByUserId: null,
    madeAt: null,
    research: null,
    rightsRisk: 'none',
    rightsReason: null,
    status: 'enabled',
    statusReason: null,
    editedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

const line = (notes: number[], len = 0.4): Phrase => ({
  bpm: 120,
  loop: true,
  steps: notes.map((n, i) => [i * 0.5, n, len]),
});

const ROWS = [
  row('patbassownsound00000001', 'bass_line', line([36, 36, 43, 36])),
  row('patbasslow0000000000002', 'bass_line', line([33, 36, 40, 31])),
  row('patbasshigh000000000003', 'bass_line', line([45, 47, 43, 45])),
  row('patchords00000000000004', 'chord_changes', {
    bpm: 120,
    loop: true,
    steps: [
      [0, 48, 2],
      [0, 52, 2],
      [2, 50, 2],
      [2, 53, 2],
    ],
  }),
  row('pathit00000000000000005', 'percussive', line([60, 60, 60], 0.1)),
];

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost:3000/api/v1/library-patterns/suggest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

async function answer(res: Response): Promise<SuggestResult> {
  const json: unknown = await res.json();
  if (typeof json !== 'object' || json === null || !('data' in json))
    throw new Error('not a success');
  return json.data as SuggestResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  forgetSuggestLibrary();
  mockPrisma.libraryPattern.findMany.mockResolvedValue(ROWS);
  mockPrisma.synthSound.findFirst.mockResolvedValue({
    patterns: [
      { patternId: 'patbassownsound00000001', pattern: { inspiredArtistId: 'kraftwerk' } },
    ],
  });
});

describe('POST /api/v1/library-patterns/suggest', () => {
  it('refuses a body that is not a reading, naming the field, and reads nothing', async () => {
    for (const [body, field] of [
      [{ synthId: 'model-d' }, 'features'],
      [{ synthId: 'model-d', features: { ...BASS, voices: 0 } }, 'features.voices'],
      [{ synthId: 'model-d', features: { ...BASS, attack: 'slow' } }, 'features.attack'],
      [{ synthId: 'Model D!', features: BASS }, 'synthId'],
      [{ synthId: 'model-d', sound: '../x', features: BASS }, 'sound'],
      [{ synthId: 'model-d', features: BASS, limit: 500 }, 'limit'],
    ] as const) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toContain(`"path":"${field}"`);
    }
    expect(mockPrisma.libraryPattern.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.synthSound.findFirst).not.toHaveBeenCalled();
  });

  it('is a 404 for a synth the app does not have, or a sound its synth does not list', async () => {
    expect((await post({ synthId: 'no-such-synth', features: BASS })).status).toBe(404);
    expect(mockPrisma.synthSound.findFirst).not.toHaveBeenCalled();
    mockPrisma.synthSound.findFirst.mockResolvedValueOnce(null);
    expect((await post({ synthId: 'model-d', sound: 'gone', features: BASS })).status).toBe(404);
    expect(mockPrisma.synthSound.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { synthId: 'model-d', slug: 'gone', synth: { listed: true } },
      })
    );
  });

  it('says what the patch sounds like and offers bass lines that suit it, with each pattern and why, not the sound’s own', async () => {
    const res = await post({ synthId: 'model-d', sound: 'funk-bass', features: BASS });
    expect(res.status).toBe(200);
    const data = await answer(res);
    expect(data.reading).toMatchObject({ category: 'bass', role: 'bass_line', register: 'low' });
    expect(data.reading?.summary).toMatch(/→ bass line/);
    const ids = data.suggestions.map((s) => s.id);
    expect(ids[0]).toBe('patbasslow0000000000002'); // the lower line suits a low patch better
    expect(ids).toContain('patbasshigh000000000003');
    expect(ids).not.toContain('patbassownsound00000001'); // the sound lists it already
    expect(ids).not.toContain('patchords00000000000004'); // a mono patch plays no chords
    for (const s of data.suggestions) {
      expect(s.pattern.id).toBe(s.id);
      expect(s.pattern.pattern.parts.length).toBeGreaterThan(0);
      expect(s.reason).toMatch(/ → /);
    }
  });

  it('reads the sound and the library once each, and the library at most once a minute', async () => {
    await post({ synthId: 'model-d', sound: 'funk-bass', features: BASS });
    await post({ synthId: 'model-d', features: { ...BASS, attack: 0.3 } });
    expect(mockPrisma.libraryPattern.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.synthSound.findFirst).toHaveBeenCalledTimes(1);
    forgetSuggestLibrary();
    await post({ synthId: 'model-d', features: BASS });
    expect(mockPrisma.libraryPattern.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not keep a library read that failed', async () => {
    mockPrisma.libraryPattern.findMany.mockRejectedValueOnce(new Error('connection lost'));
    expect((await post({ synthId: 'model-d', features: BASS })).status).toBe(500);
    const res = await post({ synthId: 'model-d', features: BASS });
    expect(res.status).toBe(200);
    expect((await answer(res)).suggestions.length).toBeGreaterThan(0);
    expect(mockPrisma.libraryPattern.findMany).toHaveBeenCalledTimes(2);
  });

  it('offers a silent patch nothing, without reading the library', async () => {
    const res = await post({ synthId: 'model-d', features: { ...BASS, silent: true } });
    expect(await answer(res)).toEqual({ reading: null, suggestions: [] });
    expect(mockPrisma.libraryPattern.findMany).not.toHaveBeenCalled();
  });

  it('returns no more than it is asked for', async () => {
    const data = await answer(await post({ synthId: 'model-d', features: BASS, limit: 1 }));
    expect(data.suggestions).toHaveLength(1);
  });

  it('sits under the section rate limit, keyed on the session, like any public read', () => {
    expect(findRateLimitRule('/api/v1/library-patterns/suggest')).toBe(CATCH_ALL_RULE);
    expect(CATCH_ALL_RULE.tier).toBe('api');
  });
});
