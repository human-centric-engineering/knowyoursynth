/**
 * Unit Tests: the categories each public pattern belongs to (`listPublicPatternCategories`, t-255).
 *
 * Over a mocked database. Pins: a pattern is in the category (first tag) of every sound that lists it, each once; a
 * sound whose first tag is not a category gives none; and the read asks only for enabled patterns on sounds of a
 * listed synth, as the public reads do.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({ synthSoundPattern: { findMany: vi.fn() } }));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { listPublicPatternCategories } from '@/lib/app/patterns/library-read';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listPublicPatternCategories', () => {
  it('puts a pattern in the category of every sound that lists it, each once', async () => {
    mockPrisma.synthSoundPattern.findMany.mockResolvedValue([
      { patternId: 'a', sound: { tags: ['bass', 'funk'] } },
      { patternId: 'a', sound: { tags: ['lead'] } },
      { patternId: 'a', sound: { tags: ['bass', 'acid'] } },
      { patternId: 'b', sound: { tags: ['pad'] } },
    ]);
    const got = await listPublicPatternCategories();
    expect([...(got.get('a') ?? [])].sort()).toEqual(['bass', 'lead']);
    expect([...(got.get('b') ?? [])]).toEqual(['pad']);
  });

  it('gives a pattern no category from a sound whose first tag is not one', async () => {
    mockPrisma.synthSoundPattern.findMany.mockResolvedValue([
      { patternId: 'a', sound: { tags: ['funk', 'bass'] } },
      { patternId: 'b', sound: { tags: [] } },
      { patternId: 'b', sound: { tags: ['keys'] } },
    ]);
    const got = await listPublicPatternCategories();
    expect(got.has('a')).toBe(false);
    expect([...(got.get('b') ?? [])]).toEqual(['keys']);
  });

  it('reads only enabled patterns on sounds of a listed synth', async () => {
    mockPrisma.synthSoundPattern.findMany.mockResolvedValue([]);
    await listPublicPatternCategories();
    expect(mockPrisma.synthSoundPattern.findMany).toHaveBeenCalledWith({
      where: {
        pattern: { status: 'enabled' },
        sound: { synth: { listed: true, id: { in: expect.any(Array) } } },
      },
      select: { patternId: true, sound: { select: { tags: true } } },
    });
  });
});
