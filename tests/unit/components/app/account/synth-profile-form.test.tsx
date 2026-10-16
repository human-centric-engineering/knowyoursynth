// @vitest-environment happy-dom

/**
 * SynthProfileForm (`f-profiles` r1): Settings → Synth profile. It checks a draft with the API's own schema, so it
 * refuses what the server would before sending anything; it sends `PUT /api/v1/me/profile` with the links already
 * rebuilt; and it shows the server's refusal (a taken name) under the form.
 *
 * @see components/app/account/synth-profile-form.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SynthProfileForm } from '@/components/app/account/synth-profile-form';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { ProfileView } from '@/lib/app/profile/profile-data';

vi.mock('@/lib/api/client', () => ({
  apiClient: { put: vi.fn() },
  APIClientError: class APIClientError extends Error {
    constructor(
      message: string,
      public code?: string,
      public status?: number,
      public details?: Record<string, unknown>
    ) {
      super(message);
    }
  },
}));

const put = vi.mocked(apiClient.put);

const NO_LINKS = { youtube: null, spotify: null, instagram: null, bandcamp: null };

const SAVED: ProfileView = {
  username: 'tape_loops',
  nextChangeAt: null,
  links: { ...NO_LINKS, bandcamp: 'https://tapeloops.bandcamp.com' },
  public: true,
  showOwned: false,
  showWishlist: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SynthProfileForm', () => {
  it('starts a new profile empty and private, with owned and wishlist hidden', () => {
    render(<SynthProfileForm profile={null} />);
    expect(screen.getByRole('textbox', { name: /^Username/ })).toHaveValue('');
    for (const name of [/^Public profile/, /^Show synths I own/, /^Show my wishlist/]) {
      expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false');
    }
    expect(screen.getByRole('button', { name: 'Create profile' })).toBeInTheDocument();
  });

  it('shows a saved profile as it is', () => {
    render(<SynthProfileForm profile={SAVED} />);
    expect(screen.getByRole('textbox', { name: /^Username/ })).toHaveValue('tape_loops');
    expect(screen.getByRole('textbox', { name: /^Bandcamp/ })).toHaveValue(
      'https://tapeloops.bandcamp.com'
    );
    expect(screen.getByRole('textbox', { name: /^YouTube/ })).toHaveValue('');
    expect(screen.getByRole('switch', { name: /^Public profile/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('switch', { name: /^Show my wishlist/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeInTheDocument();
  });

  it('sends the profile with its links rebuilt and its name folded, and says it saved', async () => {
    put.mockResolvedValue({
      ...SAVED,
      username: 'reel_to_reel',
      links: { ...NO_LINKS, youtube: 'https://www.youtube.com/@Reels' },
      public: false,
      showWishlist: false,
    });
    const user = userEvent.setup();
    render(<SynthProfileForm profile={null} />);
    await user.type(screen.getByRole('textbox', { name: /^Username/ }), 'Reel_To_Reel');
    await user.type(
      screen.getByRole('textbox', { name: /^YouTube/ }),
      'https://youtube.com/@Reels?si=abc'
    );
    await user.click(screen.getByRole('switch', { name: /^Show synths I own/ }));
    await user.click(screen.getByRole('button', { name: 'Create profile' }));

    expect(put).toHaveBeenCalledWith('/api/v1/me/profile', {
      body: {
        username: 'reel_to_reel',
        links: { ...NO_LINKS, youtube: 'https://www.youtube.com/@Reels' },
        public: false,
        showOwned: true,
        showWishlist: false,
      },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
    expect(screen.getByRole('textbox', { name: /^YouTube/ })).toHaveValue(
      'https://www.youtube.com/@Reels'
    );
  });

  it("refuses a link that is not its platform's before sending anything, naming what would work", async () => {
    const user = userEvent.setup();
    render(<SynthProfileForm profile={null} />);
    await user.type(screen.getByRole('textbox', { name: /^Username/ }), 'tape_loops');
    await user.type(
      screen.getByRole('textbox', { name: /^Spotify/ }),
      'https://open.spotify.com.evil.example/artist/x'
    );
    await user.click(screen.getByRole('button', { name: 'Create profile' }));

    expect(
      await screen.findByText('Use the https link to your artist page, open.spotify.com/artist/….')
    ).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it('refuses a reserved username before sending anything', async () => {
    const user = userEvent.setup();
    render(<SynthProfileForm profile={null} />);
    await user.type(screen.getByRole('textbox', { name: /^Username/ }), 'synths');
    await user.click(screen.getByRole('button', { name: 'Create profile' }));

    expect(await screen.findByText("That username isn't available.")).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it("shows the server's refusal under the username when the name is taken", async () => {
    put.mockRejectedValue(
      new APIClientError("That one's taken. Try another.", 'CONFLICT', 409, { username: ['taken'] })
    );
    const user = userEvent.setup();
    render(<SynthProfileForm profile={null} />);
    await user.type(screen.getByRole('textbox', { name: /^Username/ }), 'tape_loops');
    await user.click(screen.getByRole('button', { name: 'Create profile' }));

    expect(await screen.findByText("That one's taken. Try another.")).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Username/ })).toHaveAttribute(
      'aria-invalid',
      'true'
    );
  });

  it('says when the username can next change', () => {
    render(<SynthProfileForm profile={{ ...SAVED, nextChangeAt: '2026-11-15T10:00:00.000Z' }} />);
    expect(screen.getByText(/You can change it again from 2026-11-15\./)).toBeInTheDocument();
  });
});
