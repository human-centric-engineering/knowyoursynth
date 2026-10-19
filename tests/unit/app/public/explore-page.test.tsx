// @vitest-environment happy-dom

/**
 * `/explore`: published sounds with their filters (`f-sharing` h2). The read is a fake; what it was asked for, and
 * what the page then shows, are the subject. The read itself is tested in
 * tests/unit/app/api/v1/public/published-sounds.test.ts.
 *
 * @see app/(public)/explore/page.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/app/catalogue/read', () => ({
  listSynths: vi.fn(async () => [
    { id: 'model-d', name: 'Model D' },
    { id: 'pro-1', name: 'Pro-One' },
  ]),
}));
vi.mock('@/lib/app/sounds/public', () => ({
  listPublishedSounds: vi.fn(),
  exploreTags: vi.fn(async () => ['bass', 'lead']),
}));

import ExploreRoute from '@/app/(public)/explore/page';
import { EXPLORE_PAGE_SIZE, type PublishedSoundCard } from '@/lib/app/sounds/data';
import { exploreTags, listPublishedSounds } from '@/lib/app/sounds/public';

const card = (over: Partial<PublishedSoundCard>): PublishedSoundCard => ({
  slug: 'abcdefghjk',
  synthId: 'model-d',
  synthName: 'Model D',
  name: 'Night bass',
  tags: ['bass'],
  publishedAt: '2026-10-16T10:00:00.000Z',
  author: 'patchwork',
  authorProfile: true,
  saves: 2,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPublishedSounds).mockImplementation(async (query) => ({
    sounds: [card({}), card({ slug: 'mnpqrstvwx', name: 'Quiet', author: 'moog_fan', authorProfile: false, saves: 0, tags: [] })],
    total: 2,
    applied: query,
  }));
});

async function renderPage(searchParams: Record<string, string | string[]> = {}) {
  return render(await ExploreRoute({ searchParams: Promise.resolve(searchParams) }));
}

describe('/explore', () => {
  it('lists the sounds, each opening its page, with its byline and saves', async () => {
    await renderPage();
    const list = within(screen.getByRole('region', { name: 'Sounds' }));
    expect(list.getByRole('link', { name: 'Night bass' })).toHaveAttribute(
      'href',
      '/synths/model-d/s/abcdefghjk'
    );
    // the byline links to a profile only when it shows anything
    expect(list.getByRole('link', { name: '@patchwork' })).toHaveAttribute('href', '/u/patchwork');
    expect(list.getByText('@moog_fan').closest('a')).toBeNull();
    expect(list.getByText('2 saves')).toBeInTheDocument();
  });

  it('asks the read for the filters in the address, and drops one that does not parse', async () => {
    await renderPage({ synth: 'model-d', tag: 'bass', sort: 'saves', page: '2' });
    expect(listPublishedSounds).toHaveBeenLastCalledWith({
      synth: 'model-d',
      tag: 'bass',
      sort: 'saves',
      page: 2,
    });
    expect(exploreTags).toHaveBeenCalledWith('model-d');

    await renderPage({ synth: 'NOT A SYNTH', tag: '!!', sort: 'loudest', page: 'x' });
    expect(listPublishedSounds).toHaveBeenLastCalledWith({ sort: 'newest', page: 1 });
  });

  it('shows the filters the read applied, and a way to clear them', async () => {
    await renderPage({ synth: 'pro-1', tag: 'lead' });
    expect(screen.getByRole('combobox', { name: 'Synth' })).toHaveValue('pro-1');
    expect(screen.getByRole('combobox', { name: 'Tag' })).toHaveValue('lead');
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/explore');
  });

  it('says when nothing matches', async () => {
    vi.mocked(listPublishedSounds).mockImplementation(async (query) => ({
      sounds: [],
      total: 0,
      applied: query,
    }));
    await renderPage({ tag: 'bass' });
    expect(screen.getByText('No published sound matches these filters. Take one away, or try another synth.')).toBeInTheDocument();
  });

  it('says when nothing is published, and where to start', async () => {
    vi.mocked(listPublishedSounds).mockImplementation(async (query) => ({
      sounds: [],
      total: 0,
      applied: query,
    }));
    await renderPage();
    expect(screen.getByText(/^Nobody has published a sound yet\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'synth' })).toHaveAttribute('href', '/synths');
  });

  it('links back to the first page, keeping the filters, from a page past the end', async () => {
    vi.mocked(listPublishedSounds).mockImplementation(async (query) => ({
      sounds: [],
      total: 3,
      applied: query,
    }));
    await renderPage({ tag: 'bass', page: '9' });
    expect(screen.getByText(/^There aren't that many pages\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the first page' })).toHaveAttribute(
      'href',
      '/explore?tag=bass'
    );
  });

  it('pages, keeping the filters in each link', async () => {
    vi.mocked(listPublishedSounds).mockImplementation(async (query) => ({
      sounds: [card({})],
      total: EXPLORE_PAGE_SIZE * 2 + 1,
      applied: query,
    }));
    await renderPage({ tag: 'bass', sort: 'saves', page: '2' });
    const pages = within(screen.getByRole('navigation', { name: 'Pages' }));
    expect(pages.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(pages.getByRole('link', { name: '← Previous' })).toHaveAttribute(
      'href',
      '/explore?tag=bass&sort=saves'
    );
    expect(pages.getByRole('link', { name: 'Next →' })).toHaveAttribute(
      'href',
      '/explore?tag=bass&sort=saves&page=3'
    );
  });
});
