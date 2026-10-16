// @vitest-environment happy-dom

/**
 * SynthProfileSection (`f-profiles` r1): the settings card around the form. It reads the signed-in user's own profile
 * and hands it to the form, and says the account name and email are never public.
 *
 * @see components/app/account/synth-profile-section.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SynthProfileSection } from '@/components/app/account/synth-profile-section';
import { getProfile } from '@/lib/app/profile/profile';

vi.mock('@/lib/app/profile/profile', () => ({ getProfile: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiClient: { put: vi.fn() }, APIClientError: Error }));

const read = vi.mocked(getProfile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SynthProfileSection', () => {
  it("reads the user's own profile and shows it in the form", async () => {
    read.mockResolvedValue({
      username: 'tape_loops',
      nextChangeAt: null,
      links: { youtube: null, spotify: null, instagram: null, bandcamp: null },
      public: false,
      showOwned: false,
      showWishlist: false,
    });
    render(await SynthProfileSection({ userId: 'user-a' }));

    expect(read).toHaveBeenCalledWith('user-a');
    expect(screen.getByText('Synth profile')).toBeInTheDocument();
    expect(
      screen.getByText(/Your account name and email\s+are never public\./)
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Username/ })).toHaveValue('tape_loops');
  });

  it('offers to create a profile before a username is chosen', async () => {
    read.mockResolvedValue(null);
    render(await SynthProfileSection({ userId: 'user-b' }));

    expect(read).toHaveBeenCalledWith('user-b');
    expect(screen.getByRole('button', { name: 'Create profile' })).toBeInTheDocument();
  });
});
