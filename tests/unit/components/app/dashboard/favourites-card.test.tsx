// @vitest-environment happy-dom

/**
 * Favourites on `/dashboard` (`f-my-sounds` s4): the user's stars, each opening on its synth. The read is a fake; what
 * is checked is what the card makes of it.
 *
 * @see components/app/dashboard/favourites-card.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Favourite } from '@/lib/app/sounds/favourite-data';

vi.mock('@/lib/app/sounds/favourites', () => ({ listFavourites: vi.fn() }));

import { FavouritesCard } from '@/components/app/dashboard/favourites-card';
import { listFavourites } from '@/lib/app/sounds/favourites';

const fav = (over: Partial<Favourite>): Favourite => ({
  id: 'cmfav1',
  kind: 'synth',
  synthId: 'model-d',
  slug: null,
  soundId: null,
  name: 'Model D',
  available: true,
  createdAt: '2026-10-16T10:00:00.000Z',
  ...over,
});

const renderCard = async () => render(await FavouritesCard({ userId: 'user-1' }));

describe('FavouritesCard', () => {
  it("reads the caller's favourites and links each to what it stars", async () => {
    vi.mocked(listFavourites).mockResolvedValue([
      fav({}),
      fav({ id: 'cmfav2', kind: 'sound', slug: 'fat-bass', name: 'Fat bass' }),
      fav({ id: 'cmfav3', kind: 'mine', soundId: 'cmmine1', name: 'My bass' }),
    ]);
    await renderCard();
    expect(listFavourites).toHaveBeenCalledExactlyOnceWith('user-1');
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Model DSynth',
      'Fat bassLibrary sound',
      'My bassYour sound',
    ]);
    expect(items.map((li) => within(li).getByRole('link').getAttribute('href'))).toEqual([
      '/synths/model-d',
      '/synths/model-d?sound=fat-bass',
      '/synths/model-d?mine=cmmine1',
    ]);
  });

  it('shows one on a synth no longer listed without a link', async () => {
    vi.mocked(listFavourites).mockResolvedValue([fav({ available: false })]);
    await renderCard();
    const item = screen.getByRole('listitem');
    expect(within(item).queryByRole('link')).toBeNull();
    expect(item.textContent).toContain('No longer available');
  });

  it('says how to star one when there are none', async () => {
    vi.mocked(listFavourites).mockResolvedValue([]);
    await renderCard();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/None yet/)).toBeTruthy();
  });
});
