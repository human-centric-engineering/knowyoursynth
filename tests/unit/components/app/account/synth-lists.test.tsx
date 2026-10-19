// @vitest-environment happy-dom

/**
 * SynthLists and InstrumentPicker (`f-profiles` r2): Settings → Your synths. The picker reads the databank's instrument
 * list once, the first time it is used, and filters it; each match is offered as owned or wanted unless it is on a list
 * already; Suggest a synth sits beside it. Each list shows in the user's order and can be reordered, moved between and
 * removed from, every change showing only once the API has answered. A refusal is shown, and a 409 reads the lists
 * again.
 *
 * @see components/app/account/synth-lists.tsx
 * @see components/app/account/instrument-picker.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { matchInstruments } from '@/components/app/account/instrument-picker';
import { SynthLists } from '@/components/app/account/synth-lists';
import { apiClient, APIClientError } from '@/lib/api/client';
import type { OwnedEntry, OwnedLists } from '@/lib/app/profile/instruments-data';

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
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
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } }, isPending: false }),
}));

const api = vi.mocked(apiClient);

const BANK = [
  { id: 'moog-minimoog', name: 'Minimoog', maker: 'Moog', year: '1970', kind: 'synth' },
  { id: 'korg-ms-20', name: 'MS-20', maker: 'Korg', year: '1978', kind: 'synth' },
  { id: 'roland-juno-60', name: 'Juno-60', maker: 'Roland', year: '1982', kind: 'synth' },
  { id: 'roland-juno-106', name: 'Juno-106', maker: 'Roland', year: '1984', kind: 'synth' },
];

const entry = (instrumentId: string, kind: OwnedEntry['kind']): OwnedEntry => {
  const i = BANK.find((b) => b.id === instrumentId)!;
  return {
    instrumentId,
    kind,
    name: i.name,
    maker: i.maker,
    year: i.year,
    addedAt: '2026-10-16T00:00:00.000Z',
  };
};

const EMPTY: OwnedLists = { owned: [], wishlist: [] };

const listItems = (heading: string) => {
  const section = screen.getByRole('region', { name: heading });
  const items = within(section).queryAllByRole('listitem');
  return items.map((li) => li.textContent?.split(' · ')[0]);
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async (url: string) =>
    url === '/api/v1/bank/instruments' ? BANK : EMPTY
  );
});

describe('matchInstruments', () => {
  it('needs every word somewhere in the name or maker, ignoring case and accents', () => {
    expect(matchInstruments(BANK, 'roland juno').map((i) => i.id)).toEqual([
      'roland-juno-60',
      'roland-juno-106',
    ]);
    expect(matchInstruments(BANK, 'KORG ms').map((i) => i.id)).toEqual(['korg-ms-20']);
    expect(matchInstruments(BANK, 'mínimoog').map((i) => i.id)).toEqual(['moog-minimoog']);
    expect(matchInstruments(BANK, 'roland moog')).toEqual([]);
    expect(matchInstruments(BANK, '   ')).toEqual([]);
  });
});

describe('SynthLists', () => {
  it('shows both lists in the order given, and says when one is empty', () => {
    render(
      <SynthLists
        initial={{
          owned: [entry('korg-ms-20', 'owned'), entry('moog-minimoog', 'owned')],
          wishlist: [],
        }}
      />
    );
    expect(listItems('Synths I own')).toEqual(['MS-20', 'Minimoog']);
    expect(
      screen.getByText(/None yet\. Search above and choose “I want it”\./)
    ).toBeInTheDocument();
  });

  it('reads the databank once, when the search is first used, and offers Suggest a synth', async () => {
    const user = userEvent.setup();
    render(<SynthLists initial={EMPTY} />);
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Suggest a synth' })).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: /^Add a synth/ }), 'juno');
    const matches = await screen.findByRole('list', { name: 'Matching synths' });
    expect(
      within(matches)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual([expect.stringContaining('Juno-60'), expect.stringContaining('Juno-106')]);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/api/v1/bank/instruments');
  });

  it('says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<SynthLists initial={EMPTY} />);
    await user.type(screen.getByRole('searchbox'), 'theremin');
    expect(
      await screen.findByText(
        "No synth in the databank matches that. Try the maker's name, or part of the model name."
      )
    ).toBeInTheDocument();
  });

  it('offers a retry when the databank does not load', async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValueOnce(new Error('offline'));
    render(<SynthLists initial={EMPTY} />);
    await user.click(screen.getByRole('searchbox'));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await user.type(screen.getByRole('searchbox'), 'ms');
    expect(await screen.findByRole('button', { name: 'I own MS-20' })).toBeInTheDocument();
  });

  it('adds a match to a list once the API answers, and then shows it as listed', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue(entry('roland-juno-60', 'wishlist'));
    api.get.mockImplementation(async (url: string) =>
      url === '/api/v1/bank/instruments'
        ? BANK
        : {
            owned: [entry('moog-minimoog', 'owned')],
            wishlist: [entry('roland-juno-60', 'wishlist')],
          }
    );
    render(<SynthLists initial={{ owned: [entry('moog-minimoog', 'owned')], wishlist: [] }} />);

    await user.type(screen.getByRole('searchbox'), 'o');
    // Already owned: no buttons, just where it is.
    const matches = await screen.findByRole('list', { name: 'Matching synths' });
    const minimoog = within(matches).getByText('Minimoog').closest('li')!;
    expect(within(minimoog).queryByRole('button')).toBeNull();
    expect(minimoog).toHaveTextContent('On synths you own');

    await user.click(screen.getByRole('button', { name: 'I want Juno-60' }));
    expect(api.post).toHaveBeenCalledWith('/api/v1/me/instruments', {
      body: { instrumentId: 'roland-juno-60', kind: 'wishlist' },
    });
    expect(listItems('My wishlist')).toEqual(['Juno-60']);
    expect(screen.getByText('On your wishlist')).toBeInTheDocument();
  });

  it('shows the stored order after an add, for one already listed from another tab', async () => {
    const user = userEvent.setup();
    const stored = [entry('roland-juno-60', 'owned'), entry('moog-minimoog', 'owned')];
    api.post.mockResolvedValue(stored[0]);
    api.get.mockImplementation(async (url: string) =>
      url === '/api/v1/bank/instruments' ? BANK : { owned: stored, wishlist: [] }
    );
    render(<SynthLists initial={{ owned: [entry('moog-minimoog', 'owned')], wishlist: [] }} />);

    await user.type(screen.getByRole('searchbox'), 'juno');
    await user.click(await screen.findByRole('button', { name: 'I own Juno-60' }));
    await waitFor(() => expect(listItems('Synths I own')).toEqual(['Juno-60', 'Minimoog']));
    expect(api.get).toHaveBeenCalledWith('/api/v1/me/instruments');
  });

  it('moves an entry to the other list', async () => {
    const user = userEvent.setup();
    api.patch.mockResolvedValue(entry('roland-juno-60', 'owned'));
    render(
      <SynthLists
        initial={{
          owned: [entry('moog-minimoog', 'owned')],
          wishlist: [entry('roland-juno-60', 'wishlist')],
        }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'I own it now: Juno-60' }));
    expect(api.patch).toHaveBeenCalledWith('/api/v1/me/instruments/roland-juno-60', {
      body: { kind: 'owned' },
    });
    expect(listItems('Synths I own')).toEqual(['Minimoog', 'Juno-60']);
    expect(listItems('My wishlist')).toEqual([]);
  });

  it('removes an entry', async () => {
    const user = userEvent.setup();
    api.delete.mockResolvedValue({ instrumentId: 'moog-minimoog' });
    render(<SynthLists initial={{ owned: [entry('moog-minimoog', 'owned')], wishlist: [] }} />);
    await user.click(screen.getByRole('button', { name: 'Remove Minimoog' }));
    expect(api.delete).toHaveBeenCalledWith('/api/v1/me/instruments/moog-minimoog');
    expect(listItems('Synths I own')).toEqual([]);
  });

  it('reorders by sending the whole list, and shows the order the API answers', async () => {
    const user = userEvent.setup();
    const owned = [entry('moog-minimoog', 'owned'), entry('korg-ms-20', 'owned')];
    api.put.mockResolvedValue({ owned: [owned[1], owned[0]], wishlist: [] });
    render(<SynthLists initial={{ owned, wishlist: [] }} />);

    expect(screen.getByRole('button', { name: 'Move Minimoog up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move MS-20 down' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move MS-20 up' }));
    expect(api.put).toHaveBeenCalledWith('/api/v1/me/instruments/order', {
      body: { kind: 'owned', instrumentIds: ['korg-ms-20', 'moog-minimoog'] },
    });
    expect(listItems('Synths I own')).toEqual(['MS-20', 'Minimoog']);
  });

  it('shows a refusal, and reads the lists again after a 409', async () => {
    const user = userEvent.setup();
    const owned = [entry('moog-minimoog', 'owned'), entry('korg-ms-20', 'owned')];
    api.put.mockRejectedValue(
      new APIClientError('Synths you own changed since you opened it. Reload it.', 'CONFLICT', 409)
    );
    const stored: OwnedLists = { owned: [owned[0]], wishlist: [] };
    api.get.mockImplementation(async (url: string) =>
      url === '/api/v1/me/instruments' ? stored : BANK
    );
    render(<SynthLists initial={{ owned, wishlist: [] }} />);

    await user.click(screen.getByRole('button', { name: 'Move MS-20 up' }));
    expect(
      await screen.findByText('Synths you own changed since you opened it. Reload it.')
    ).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/v1/me/instruments');
    expect(listItems('Synths I own')).toEqual(['Minimoog']);
  });

  it('keeps the lists as they were when a change fails for another reason', async () => {
    const user = userEvent.setup();
    api.delete.mockRejectedValue(new Error('offline'));
    render(<SynthLists initial={{ owned: [entry('moog-minimoog', 'owned')], wishlist: [] }} />);
    await user.click(screen.getByRole('button', { name: 'Remove Minimoog' }));
    expect(await screen.findByText("That didn't save. Try again.")).toBeInTheDocument();
    expect(listItems('Synths I own')).toEqual(['Minimoog']);
    expect(api.get).not.toHaveBeenCalledWith('/api/v1/me/instruments');
  });
});
