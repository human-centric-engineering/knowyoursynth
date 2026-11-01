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
    soundReport: { findMany: vi.fn(async () => []) },
    synthPreference: { findMany: vi.fn(async () => []) },
    userPreference: { findMany: vi.fn(async () => []) },
    lessonProgress: { findMany: vi.fn() },
    favourite: { findMany: vi.fn() },
    synthProfile: { findMany: vi.fn(async () => []) },
    ownedInstrument: { findMany: vi.fn(async () => []) },
    userPattern: { findMany: vi.fn(async () => []) },
    patternReport: { findMany: vi.fn(async () => []) },
    libraryPattern: { findMany: vi.fn(async () => []) },
    libraryPatternComment: { findMany: vi.fn(async () => []) },
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

describe('collectAppSubjectData, the reports a user filed (f-sharing h4)', () => {
  it('names the sound by its address, and never asks for or returns who resolved the report', async () => {
    vi.mocked(prisma.soundReport.findMany).mockResolvedValue([
      {
        id: 'rep1',
        reason: 'offensive',
        note: 'Rude name',
        status: 'actioned',
        resolvedAt: at,
        createdAt: at,
        updatedAt: at,
        sound: { synthId: 'model-d', slug: 'abcdefghjk' },
      },
    ] as never);

    const data = await collectAppSubjectData({ userId: 'user-1', email: 'user@example.com' });
    expect(data.soundReportsFiled).toEqual([
      {
        id: 'rep1',
        reason: 'offensive',
        note: 'Rude name',
        status: 'actioned',
        resolvedAt: at,
        createdAt: at,
        updatedAt: at,
        synthId: 'model-d',
        soundSlug: 'abcdefghjk',
      },
    ]);
    const { select } = vi.mocked(prisma.soundReport.findMany).mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(select).not.toHaveProperty('resolvedById');
    expect(select).not.toHaveProperty('reporterId');
  });
});

describe("collectAppSubjectData, a sound's lesson and the tutor's mark (f-tutor t-55)", () => {
  it('asks for both with each sound, and returns them as stored', async () => {
    const lesson = { blurb: 'A bass.', steps: [{ title: 'One', why: 'Why.' }] };
    vi.mocked(prisma.userSound.findMany).mockResolvedValueOnce([
      { id: 'cmmine1', synthId: 'model-d', name: 'Tutor bass', lesson, fromTutor: true },
    ] as never);

    const data = await collectAppSubjectData({ userId: 'user-1', email: 'user@example.com' });
    expect(data.sounds).toEqual([expect.objectContaining({ lesson, fromTutor: true })]);
    const { where, select } = vi.mocked(prisma.userSound.findMany).mock.lastCall![0] as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    };
    expect(where).toEqual({ userId: 'user-1' });
    expect(select).toMatchObject({ lesson: true, lessonVersion: true, fromTutor: true });
  });
});

describe('collectAppSubjectData, patterns (f-step-sequencer t-81)', () => {
  it("returns the subject's patterns as stored, and each sound's default pattern", async () => {
    const pattern = { version: 1, bpm: 120 };
    vi.mocked(prisma.userPattern.findMany).mockResolvedValueOnce([
      { id: 'cmpat1', name: 'Acid line', pattern, version: 1, synthId: 'tb-303' },
    ] as never);

    const data = await collectAppSubjectData({ userId: 'user-1', email: 'user@example.com' });
    expect(data.patterns).toEqual([
      { id: 'cmpat1', name: 'Acid line', pattern, version: 1, synthId: 'tb-303' },
    ]);
    const { where, select } = vi.mocked(prisma.userPattern.findMany).mock.lastCall![0] as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    };
    expect(where).toEqual({ userId: 'user-1' });
    expect(select).toMatchObject({ name: true, pattern: true, version: true, synthId: true });
    const sounds = vi.mocked(prisma.userSound.findMany).mock.lastCall![0] as {
      select: Record<string, unknown>;
    };
    expect(sounds.select).toMatchObject({ patternId: true });
  });
});

describe('collectAppSubjectData, sharing patterns (f-step-sequencer t-83)', () => {
  it("carries each pattern's sharing, never the source it was copied from", async () => {
    await collectAppSubjectData({ userId: 'user-1', email: 'user@example.com' });
    const { select } = vi.mocked(prisma.userPattern.findMany).mock.lastCall![0] as {
      select: Record<string, unknown>;
    };
    expect(select).toMatchObject({
      visibility: true,
      slug: true,
      publishedAt: true,
      unlistedAt: true,
    });
    // the row id of a pattern someone else shared is about them
    expect(select).not.toHaveProperty('sourceUserPatternId');
  });

  it('names a reported pattern by its address, and never who resolved the report', async () => {
    vi.mocked(prisma.patternReport.findMany).mockResolvedValueOnce([
      {
        id: 'prep1',
        reason: 'spam',
        note: null,
        status: 'open',
        resolvedAt: null,
        createdAt: at,
        updatedAt: at,
        pattern: { slug: 'abcdefghjk' },
      },
    ] as never);

    const data = await collectAppSubjectData({ userId: 'user-1', email: 'user@example.com' });
    expect(data.patternReportsFiled).toEqual([
      {
        id: 'prep1',
        reason: 'spam',
        note: null,
        status: 'open',
        resolvedAt: null,
        createdAt: at,
        updatedAt: at,
        patternSlug: 'abcdefghjk',
      },
    ]);
    const { where, select } = vi.mocked(prisma.patternReport.findMany).mock.lastCall![0] as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    };
    expect(where).toEqual({ reporterId: 'user-1' });
    expect(select).not.toHaveProperty('resolvedById');
    expect(select).not.toHaveProperty('reporterId');
  });
});
