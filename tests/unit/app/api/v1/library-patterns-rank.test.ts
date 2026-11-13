/**
 * Unit Tests: the whole library ranked for the patch on the panel (`f-pattern-picker` t-212).
 *
 * POST /api/v1/library-patterns/rank over a mocked database, with the real detector's features, the real model and
 * the real ranking. Pins:
 *
 * - a body that is not a reading is refused naming the field, and reads nothing;
 * - an unknown synth or sound is a 404;
 * - the answer: what the patch sounds like, then every role's section of lean rows, the sound's own left out;
 * - with no features, or a silent patch, every pattern still, by role and name;
 * - the library kept for a minute is the one suggestions keep: no second read;
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

import { POST } from '@/app/api/v1/library-patterns/rank/route';
import { POST as SUGGEST } from '@/app/api/v1/library-patterns/suggest/route';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-roles';
import type { RankResult } from '@/lib/app/patterns/rank-read';
import { forgetSuggestLibrary } from '@/lib/app/patterns/suggest-read';
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

function row(
  id: string,
  name: string,
  role: LibraryPattern['role'],
  phrase: Phrase
): LibraryPattern {
  const at = new Date('2026-10-31T00:00:00Z');
  return {
    id,
    key: `riff:model-d/${id}`,
    name,
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

const OWN = 'patbassownsound00000001';
const ROWS = [
  row(OWN, 'Own bass', 'bass_line', line([36, 36, 43, 36])),
  row('patbasshigh000000000003', 'A high bass', 'bass_line', line([45, 47, 43, 45])),
  row('patbasslow0000000000002', 'Z low bass', 'bass_line', line([33, 36, 40, 31])),
  row('patchords00000000000004', 'Chords', 'chord_changes', {
    bpm: 120,
    loop: true,
    steps: [
      [0, 48, 2],
      [0, 52, 2],
      [2, 50, 2],
      [2, 53, 2],
    ],
  }),
  row('pathit00000000000000005', 'Hit', 'percussive', line([60, 60, 60], 0.1)),
];

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost:3000/api/v1/library-patterns/rank', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

async function answer(res: Response): Promise<RankResult> {
  const json: unknown = await res.json();
  if (typeof json !== 'object' || json === null || !('data' in json))
    throw new Error('not a success');
  return json.data as RankResult;
}

const listed = (data: RankResult) => data.sections.flatMap((s) => s.patterns.map((p) => p.id));
const patternsOf = (data: RankResult, role: string) =>
  data.sections.find((s) => s.role === role)?.patterns ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  forgetSuggestLibrary();
  mockPrisma.libraryPattern.findMany.mockResolvedValue(ROWS);
  mockPrisma.synthSound.findFirst.mockResolvedValue({
    patterns: [{ patternId: OWN, pattern: { inspiredArtistId: null, status: 'enabled' } }],
  });
});

describe('POST /api/v1/library-patterns/rank', () => {
  it('refuses a body that is not a reading, naming the field, and reads nothing', async () => {
    for (const [body, field] of [
      [{ synthId: 'model-d', features: { ...BASS, voices: 0 } }, 'features.voices'],
      [{ synthId: 'model-d', features: { ...BASS, attack: 'slow' } }, 'features.attack'],
      [{ features: BASS }, 'synthId'],
      [{ synthId: 'Model D!' }, 'synthId'],
      [{ synthId: 'model-d', sound: '../x' }, 'sound'],
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

  it('says what the patch sounds like and lists every other pattern by role, best suited first, without notes', async () => {
    const res = await post({ synthId: 'model-d', sound: 'funk-bass', features: BASS });
    expect(res.status).toBe(200);
    const data = await answer(res);
    expect(data.reading).toMatchObject({ category: 'bass', role: 'bass_line', register: 'low' });
    expect(data.sections.map((s) => s.role).sort()).toEqual([...PATTERN_ROLES].sort());
    expect(data.sections[0]).toMatchObject({ role: 'bass_line', label: 'Bass line' });
    // Clearly first, not by a hair. Relative, not a fixed share: the shares come from the fitted model, which a refit
    // to a grown library moves (t-193's refit read these features as bass a little less surely, 0.474).
    expect(data.sections[0].share).toBeGreaterThan(2 * data.sections[1].share);
    // Every pattern once but the sound's own, which the picker lists first.
    expect(listed(data).sort()).toEqual(
      ROWS.map((r) => r.id)
        .filter((id) => id !== OWN)
        .sort()
    );
    // The lower line suits a low patch better, whatever its name.
    expect(patternsOf(data, 'bass_line').map((p) => p.id)).toEqual([
      'patbasslow0000000000002',
      'patbasshigh000000000003',
    ]);
    // A mono patch can't play the chords: listed, and marked.
    expect(patternsOf(data, 'chord_changes')).toEqual([
      expect.objectContaining({ id: 'patchords00000000000004', tooManyVoices: true }),
    ]);
    const [first] = patternsOf(data, 'bass_line');
    expect(first).toEqual({
      id: 'patbasslow0000000000002',
      name: 'Z low bass',
      role: 'bass_line',
      bars: 0.5,
      inspiredBy: {
        kind: 'genre',
        label: 'Funk',
        songId: null,
        partId: null,
        artistId: null,
        synthId: null,
      },
      fidelity: 'in_the_style_of',
      why: expect.stringMatching(/ → bass line$/),
      tooManyVoices: false,
    });
  });

  it('with no features, or a silent patch, still lists every pattern, by role and then name', async () => {
    for (const body of [
      { synthId: 'model-d' },
      { synthId: 'model-d', features: { ...BASS, silent: true } },
    ]) {
      const data = await answer(await post(body));
      expect(data.reading).toBeNull();
      expect(data.sections.map((s) => s.role)).toEqual([...PATTERN_ROLES]);
      expect(listed(data)).toHaveLength(ROWS.length);
      expect(patternsOf(data, 'bass_line').map((p) => p.name)).toEqual([
        'A high bass',
        'Own bass',
        'Z low bass',
      ]);
      expect(data.sections.every((s) => s.share === null)).toBe(true);
    }
  });

  it('reads the library suggestions keep, once a minute between them', async () => {
    await post({ synthId: 'model-d', features: BASS });
    await SUGGEST(
      new NextRequest('http://localhost:3000/api/v1/library-patterns/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ synthId: 'model-d', features: BASS }),
      })
    );
    await post({ synthId: 'model-d' });
    expect(mockPrisma.libraryPattern.findMany).toHaveBeenCalledTimes(1);
    forgetSuggestLibrary();
    await post({ synthId: 'model-d' });
    expect(mockPrisma.libraryPattern.findMany).toHaveBeenCalledTimes(2);
  });

  it('sits under the section rate limit, keyed on the session, like any public read', () => {
    expect(findRateLimitRule('/api/v1/library-patterns/rank')).toBe(CATCH_ALL_RULE);
    expect(CATCH_ALL_RULE.tier).toBe('api');
  });
});
