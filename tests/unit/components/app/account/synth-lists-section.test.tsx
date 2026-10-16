// @vitest-environment happy-dom

/**
 * SynthListsSection (`f-profiles` r2): the settings card around the lists. It reads the signed-in user's own lists and
 * hands them to the client, and says the public page shows each only when it is switched on.
 *
 * @see components/app/account/synth-lists-section.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { SynthListsSection } from '@/components/app/account/synth-lists-section';
import { listInstruments } from '@/lib/app/profile/instruments';

vi.mock('@/lib/app/profile/instruments', () => ({ listInstruments: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn() }, APIClientError: Error }));
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({ data: { user: { id: 'user-a' } }, isPending: false }),
}));

const read = vi.mocked(listInstruments);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SynthListsSection', () => {
  it("reads the user's own lists and shows them", async () => {
    read.mockResolvedValue({
      owned: [
        {
          instrumentId: 'moog-minimoog',
          kind: 'owned',
          name: 'Minimoog',
          maker: 'Moog',
          year: '1970',
          addedAt: '2026-10-16T00:00:00.000Z',
        },
      ],
      wishlist: [],
    });
    render(await SynthListsSection({ userId: 'user-a' }));

    expect(read).toHaveBeenCalledWith('user-a');
    expect(screen.getByText('Your synths')).toBeInTheDocument();
    expect(
      screen.getByText(/only\s+if you switch it on in your synth profile/)
    ).toBeInTheDocument();
    const owned = screen.getByRole('region', { name: 'Synths I own' });
    expect(within(owned).getByText('Minimoog')).toBeInTheDocument();
  });
});
