/**
 * What the data-export seam returns for a user's lesson progress and favourites (`f-my-sounds` s4): each row named by
 * what it means outside this database (a synth id, a library sound's synth and slug, the user's own sound), never by a
 * catalogue row id. That the seam asks only for the subject's rows is pinned in defaults.test.ts; that a real export
 * carries them is `npm run smoke:sounds`.
 *
 * FORK NOTE — this file reads `lib/app/data-export.ts` for real, on purpose: it is Know Your Synth's own collector
 * under test, not the seam's empty default. It is a leaf-fork file; a fork of this app that changes what the s4
 * sections return changes these expectations with it.
 *
 * @see lib/app/data-export.ts
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    synthSuggestion: { findMany: vi.fn(async () => []) },
    userSound: { findMany: vi.fn(async () => []) },
    synthPreference: { findMany: vi.fn(async () => []) },
    userPreference: { findMany: vi.fn(async () => []) },
    lessonProgress: { findMany: vi.fn() },
    favourite: { findMany: vi.fn() },
    synthProfile: { findMany: vi.fn(async () => []) },
  },
}));

import { prisma } from '@/lib/db/client';
import { collectAppSubjectData } from '@/lib/app/data-export';

const at = new Date('2026-10-16T10:00:00.000Z');

describe('collectAppSubjectData, s4 sections', () => {
  it('names each lesson by its library sound, and each favourite by what it stars', async () => {
    vi.mocked(prisma.lessonProgress.findMany).mockResolvedValue([
      {
        furthestStep: 3,
        completedAt: at,
        createdAt: at,
        updatedAt: at,
        sound: { synthId: 'model-d', slug: 'fat-bass', name: 'Fat bass' },
      },
    ] as never);
    vi.mocked(prisma.favourite.findMany).mockResolvedValue([
      { createdAt: at, synthId: 'model-d', synthSound: null, userSound: null },
      {
        createdAt: at,
        synthId: null,
        synthSound: { synthId: 'model-d', slug: 'lead', name: 'Lead' },
        userSound: null,
      },
      {
        createdAt: at,
        synthId: null,
        synthSound: null,
        userSound: { id: 'cmmine1', synthId: 'model-d', name: 'My bass' },
      },
    ] as never);

    const data = await collectAppSubjectData({ userId: 'user-1', email: 'user@example.com' });
    expect(data.lessonProgress).toEqual([
      {
        synthId: 'model-d',
        slug: 'fat-bass',
        name: 'Fat bass',
        furthestStep: 3,
        completedAt: at,
        createdAt: at,
        updatedAt: at,
      },
    ]);
    expect(data.favourites).toEqual([
      { kind: 'synth', synthId: 'model-d', createdAt: at },
      { kind: 'sound', synthId: 'model-d', slug: 'lead', name: 'Lead', createdAt: at },
      { kind: 'mine', soundId: 'cmmine1', synthId: 'model-d', name: 'My bass', createdAt: at },
    ]);
  });
});
