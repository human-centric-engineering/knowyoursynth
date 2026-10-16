// @vitest-environment happy-dom

/**
 * Lessons on `/dashboard` (`f-my-sounds` s4): the ones in progress, then the finished ones, each opening its library
 * sound. The reads are fakes; what is checked is what the card makes of them.
 *
 * @see components/app/dashboard/lessons-card.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CatalogueSynth } from '@/lib/app/catalogue/read';
import type { LessonProgressEntry } from '@/lib/app/sounds/progress-data';

vi.mock('@/lib/app/sounds/progress', () => ({ listProgress: vi.fn() }));
vi.mock('@/lib/app/catalogue/read', () => ({ listSynths: vi.fn() }));

import { LessonsCard } from '@/components/app/dashboard/lessons-card';
import { listSynths } from '@/lib/app/catalogue/read';
import { listProgress } from '@/lib/app/sounds/progress';

const MODEL_D = { id: 'model-d', name: 'Model D', maker: 'Behringer' } as CatalogueSynth;

const entry = (over: Partial<LessonProgressEntry>): LessonProgressEntry => ({
  synthId: 'model-d',
  slug: 'fat-bass',
  name: 'Fat bass',
  steps: 6,
  furthestStep: 2,
  completedAt: null,
  updatedAt: '2026-10-16T10:00:00.000Z',
  available: true,
  ...over,
});

const renderCard = async () => render(await LessonsCard({ userId: 'user-1' }));

beforeEach(() => {
  vi.mocked(listSynths).mockResolvedValue([MODEL_D]);
});

describe('LessonsCard', () => {
  it('lists lessons in progress before finished ones, each opening its sound', async () => {
    vi.mocked(listProgress).mockResolvedValue([
      entry({ slug: 'lead', name: 'Lead', completedAt: '2026-10-15T10:00:00.000Z' }),
      entry({}),
    ]);
    await renderCard();
    expect(listProgress).toHaveBeenCalledExactlyOnceWith('user-1');
    const going = within(screen.getByRole('region', { name: 'In progress' })).getByRole('listitem');
    expect(going.textContent).toBe('Fat bassModel D · Step 3 of 6');
    expect(within(going).getByRole('link').getAttribute('href')).toBe(
      '/synths/model-d?sound=fat-bass'
    );
    const done = within(screen.getByRole('region', { name: 'Finished' })).getByRole('listitem');
    expect(done.textContent).toBe('LeadModel D · Finished');
  });

  it('shows a lesson on a synth no longer listed without a link', async () => {
    vi.mocked(listProgress).mockResolvedValue([entry({ synthId: 'gone', available: false })]);
    await renderCard();
    const item = screen.getByRole('listitem');
    expect(within(item).queryByRole('link')).toBeNull();
    expect(item.textContent).toContain('gone, no longer available');
  });

  it('says how to start one when there are none', async () => {
    vi.mocked(listProgress).mockResolvedValue([]);
    await renderCard();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/None yet/)).toBeTruthy();
  });
});
