// @vitest-environment happy-dom

/**
 * My sounds on `/dashboard` (`f-my-sounds` s2): the user's sounds, each opening on its synth. The two reads are
 * fakes; what is checked is what the card makes of them.
 *
 * @see components/app/dashboard/my-sounds-card.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CatalogueSynth } from '@/lib/app/catalogue/read';
import type { UserSoundSummary } from '@/lib/app/sounds/data';

vi.mock('@/lib/app/sounds/store', () => ({ listUserSounds: vi.fn() }));
vi.mock('@/lib/app/catalogue/read', () => ({ listSynths: vi.fn() }));

import { MySoundsCard } from '@/components/app/dashboard/my-sounds-card';
import { listSynths } from '@/lib/app/catalogue/read';
import { listUserSounds } from '@/lib/app/sounds/store';

const synth = (id: string, maker: string, name: string): CatalogueSynth => ({
  id,
  name,
  maker,
  year: 2018,
  heritage: '',
  summary: '',
  design: 'neutral',
  definitionVersion: 1,
  soundCount: 0,
});

const sound = (over: Partial<UserSoundSummary>): UserSoundSummary => ({
  id: 'cm1',
  synthId: 'model-d',
  name: 'Night bass',
  notes: null,
  definitionVersion: 1,
  source: null,
  basedOn: null,
  visibility: 'private',
  slug: null,
  publishedAt: null,
  tags: [],
  playable: true,
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
  ...over,
});

const renderCard = async () => render(await MySoundsCard({ userId: 'user-1' }));

beforeEach(() => {
  vi.mocked(listSynths).mockResolvedValue([
    synth('model-d', 'Behringer', 'Model D'),
    synth('ob-x', 'Oberheim', 'OB-X'),
  ]);
});

describe('MySoundsCard', () => {
  it("reads the caller's sounds on every synth, and links each to its synth with it open", async () => {
    vi.mocked(listUserSounds).mockResolvedValue([
      sound({ id: 'cm2', synthId: 'ob-x', name: 'Brass stab' }),
      sound({
        id: 'cm1',
        name: 'My fat bass',
        source: { soundId: 's1', slug: 'fat-bass', name: 'Fat bass', ref: 'x' },
      }),
    ]);
    await renderCard();

    expect(listUserSounds).toHaveBeenCalledExactlyOnceWith('user-1');
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Brass stabOberheim OB-X',
      'My fat bassBehringer Model D · copied from Fat bass',
    ]);
    expect(within(items[0]).getByRole('link').getAttribute('href')).toBe('/synths/ob-x?mine=cm2');
    expect(within(items[1]).getByRole('link').getAttribute('href')).toBe(
      '/synths/model-d?mine=cm1'
    );
  });

  it('shows a sound on a synth the catalogue no longer lists without a link to a page that would be a 404', async () => {
    vi.mocked(listUserSounds).mockResolvedValue([
      sound({ synthId: 'gone-synth', name: 'Old one' }),
    ]);
    await renderCard();
    const item = screen.getByRole('listitem');
    expect(within(item).queryByRole('link')).toBeNull();
    expect(item.textContent).toContain('gone-synth, no longer available');
  });

  it('says how to make one when there are none', async () => {
    vi.mocked(listUserSounds).mockResolvedValue([]);
    await renderCard();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/None yet/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Synths' }).getAttribute('href')).toBe('/synths');
  });
});
