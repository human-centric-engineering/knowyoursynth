// @vitest-environment happy-dom

/**
 * `/explore/patterns`: published patterns (`f-step-sequencer` t-83). The read is a fake; what it was asked for, and what
 * the page then shows, are the subject. The read itself is tested in tests/unit/app/api/v1/patterns/sharing.test.ts.
 *
 * @see app/(public)/explore/patterns/page.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/app/patterns/public', () => ({ listPublishedPatterns: vi.fn() }));

import ExplorePatternsRoute from '@/app/(public)/explore/patterns/page';
import { EXPLORE_PAGE_SIZE } from '@/lib/app/sounds/data';
import type { PublishedPatternCard } from '@/lib/app/patterns/data';
import { listPublishedPatterns } from '@/lib/app/patterns/public';

const card = (over: Partial<PublishedPatternCard> = {}): PublishedPatternCard => ({
  slug: 'abcdefghjk',
  name: 'Acid walk',
  synthId: 'model-d',
  synthName: 'Model D',
  steps: 16,
  parts: 2,
  publishedAt: '2026-10-22T10:00:00.000Z',
  author: 'patchwork',
  authorProfile: true,
  saves: 3,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPublishedPatterns).mockResolvedValue({
    patterns: [
      card(),
      card({
        slug: 'mnpqrstvwx',
        name: 'Loose groove',
        synthId: null,
        synthName: null,
        parts: 1,
        saves: 0,
        author: 'moog_fan',
        authorProfile: false,
      }),
    ],
    total: 2,
  });
});

async function renderPage(searchParams: Record<string, string | string[]> = {}) {
  return render(await ExplorePatternsRoute({ searchParams: Promise.resolve(searchParams) }));
}

describe('/explore/patterns', () => {
  it('lists the patterns, each opening its address, with what it was made on, its byline and saves', async () => {
    await renderPage();
    const list = within(screen.getByRole('region', { name: 'Patterns' }));
    expect(list.getByRole('link', { name: 'Acid walk' })).toHaveAttribute(
      'href',
      '/patterns/abcdefghjk'
    );
    expect(list.getByText(/Made on the Model D/)).toBeInTheDocument();
    expect(list.getByText('16 steps, A and B')).toBeInTheDocument();
    expect(list.getByText('3 saves')).toBeInTheDocument();
    expect(list.getByRole('link', { name: '@patchwork' })).toHaveAttribute('href', '/u/patchwork');
    expect(list.getByText('@moog_fan').closest('a')).toBeNull();
    // the tabs between Explore's two lists
    expect(screen.getByRole('link', { name: 'Patterns' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Sounds' })).toHaveAttribute('href', '/explore');
  });

  it('asks the read for the sort and page in the address, and drops what does not parse', async () => {
    await renderPage({ sort: 'saves', page: '2' });
    expect(listPublishedPatterns).toHaveBeenLastCalledWith({ sort: 'saves', page: 2 });
    await renderPage({ sort: 'loudest', page: 'x' });
    expect(listPublishedPatterns).toHaveBeenLastCalledWith({ sort: 'newest', page: 1 });
  });

  it('pages, keeping the sort', async () => {
    vi.mocked(listPublishedPatterns).mockResolvedValue({
      patterns: [card()],
      total: EXPLORE_PAGE_SIZE * 2 + 1,
    });
    await renderPage({ sort: 'saves', page: '2' });
    const pages = within(screen.getByRole('navigation', { name: 'Pages' }));
    expect(pages.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(pages.getByRole('link', { name: '← Previous' })).toHaveAttribute(
      'href',
      '/explore/patterns?sort=saves'
    );
    expect(pages.getByRole('link', { name: 'Next →' })).toHaveAttribute(
      'href',
      '/explore/patterns?sort=saves&page=3'
    );
  });

  it('says when nothing is published, and when the page is past the end', async () => {
    vi.mocked(listPublishedPatterns).mockResolvedValue({ patterns: [], total: 0 });
    await renderPage();
    expect(screen.getByText(/Nobody has published a pattern yet/)).toBeInTheDocument();
    await renderPage({ page: '4' });
    expect(screen.getByRole('link', { name: 'Back to the first page' })).toHaveAttribute(
      'href',
      '/explore/patterns'
    );
  });
});
