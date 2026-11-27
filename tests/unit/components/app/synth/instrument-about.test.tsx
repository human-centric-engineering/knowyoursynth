// @vitest-environment happy-dom

/**
 * A databank instrument nobody has modelled, in the synth's place (`f-synth-picker` t-330). Pins:
 *
 * - it says what the instrument is, that nothing plays, what it recreates and what recreates it (each to its synth's
 *   page when it plays, else its own page here), who played it and what it is heard on;
 * - Play the nearest goes to the nearest relative that plays; Open in the databank to its `/bank` page;
 * - signed out, owning and asking say to sign in; signed in, they show what the user did already, and change it
 *   through the APIs: owned on and off, moved from the wishlist, asked and withdrawn, with how many have asked;
 * - a change that fails says so, and changes nothing shown.
 *
 * @see components/app/synth/instrument-about.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({ data: auth.user ? { user: auth.user } : null, isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/app/synth/settings', () => ({
  useSettings: () => ({ picker: [{}, vi.fn()] }),
}));
vi.mock('@/components/app/synth/family-toggle', () => ({
  useOwnedInstruments: () => new Set<string>(),
}));
vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));
vi.mock('@/lib/logging', () => ({ logger: { warn: vi.fn() } }));

import { InstrumentAbout } from '@/components/app/synth/instrument-about';
import { apiClient } from '@/lib/api/client';
import { FACTORY_PICKER } from '@/lib/app/picker/settings';
import type { InstrumentDetail } from '@/lib/app/bank/read';
import type { CatalogueSynth } from '@/lib/app/catalogue/read';

const DETAIL: InstrumentDetail = {
  instrument: {
    id: 'moog-minimoog',
    name: 'Minimoog Model D',
    maker: 'Moog Music',
    year: '1970',
    kind: 'mono',
    text: 'The first portable synthesizer.\n\nThree oscillators into a ladder filter.',
  },
  people: [],
  synths: [],
  recreationOf: null,
  recreations: [
    { id: 'behringer-model-d', name: 'Model D', maker: 'Behringer', year: '2018', kind: 'mono' },
    {
      id: 'studio-boomstar',
      name: 'Boomstar',
      maker: 'Studio Electronics',
      year: '2014',
      kind: 'module',
    },
  ],
  songs: [{ id: 'song-1', title: 'Lucky Man', kind: 'song', year: '1970', who: 'ELP' } as never],
  artists: [{ id: 'keith-emerson', name: 'Keith Emerson' }],
};
const SYNTHS = [
  { id: 'model-d', name: 'Model D', maker: 'Behringer', year: 2018, heritage: '', kind: 'mono' },
] as unknown as CatalogueSynth[];

const page = () =>
  render(
    <InstrumentAbout
      detail={DETAIL}
      synths={SYNTHS}
      families={[]}
      pickerSite={FACTORY_PICKER}
      playsAs={{ 'behringer-model-d': 'model-d' }}
    />
  );

const lists = (owned: string[], wishlist: string[] = []) => ({
  owned: owned.map((instrumentId) => ({ instrumentId })),
  wishlist: wishlist.map((instrumentId) => ({ instrumentId })),
});
const answer = (owned: string[], wishlist: string[], asked: boolean, count: number) =>
  vi
    .mocked(apiClient.get)
    .mockImplementation(async (path: string) =>
      path === '/api/v1/me/instruments' ? lists(owned, wishlist) : { asked, count }
    );

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
});

describe('InstrumentAbout', () => {
  it('says what it is, that nothing plays, and where it sits, each relative to its page', () => {
    page();
    const panel = screen.getByRole('region', { name: 'Moog Music Minimoog Model D, not modelled' });
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe(
      'Moog Music Minimoog Model D'
    );
    expect(panel.textContent).toContain('Not modelled yet');
    expect(panel.textContent).toContain('Three oscillators into a ladder filter.');
    const link = (text: RegExp) =>
      within(panel).getByRole('link', { name: text }).getAttribute('href');
    expect(link(/Behringer Model D/)).toBe('/synths/model-d');
    expect(link(/Studio Boomstar/)).toBe('/synths/about/studio-boomstar');
    expect(link(/Keith Emerson/)).toBe('/bank/artists/keith-emerson');
    expect(panel.textContent).toContain('ELP — Lucky Man');
    expect(link(/Play the nearest: Model D/)).toBe('/synths/model-d');
    expect(link(/Open in the databank/)).toBe('/bank/instruments/moog-minimoog');
  });

  it('says to sign in to own it or ask for it, signed out, reading nothing', () => {
    page();
    expect(screen.getByRole('link', { name: /Sign in/ }).getAttribute('href')).toBe(
      '/login?callbackUrl=%2Fsynths%2Fabout%2Fmoog-minimoog'
    );
    expect(screen.queryByRole('button', { name: /own this/ })).toBeNull();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('shows what the user did, and owns it, then takes it off again', async () => {
    auth.user = { id: 'user-1' };
    answer([], [], false, 2);
    const user = userEvent.setup();
    page();
    const own = await screen.findByRole('button', { name: 'I own this' });
    await waitFor(() => expect(own).toHaveProperty('disabled', false));
    expect(screen.getByText('2 people have asked for it to be modelled.')).toBeTruthy();

    await user.click(own);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/me/instruments', {
      body: { instrumentId: 'moog-minimoog', kind: 'owned' },
    });
    const owned = await screen.findByRole('button', { name: 'You own this' });
    expect(owned.getAttribute('aria-pressed')).toBe('true');
    await user.click(owned);
    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/me/instruments/moog-minimoog');
  });

  it('moves it from the wishlist to the synths owned', async () => {
    auth.user = { id: 'user-1' };
    answer([], ['moog-minimoog'], false, 0);
    const user = userEvent.setup();
    page();
    const own = await screen.findByRole('button', { name: 'I own this' });
    await waitFor(() => expect(own).toHaveProperty('disabled', false));
    await user.click(own);
    expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/me/instruments/moog-minimoog', {
      body: { kind: 'owned' },
    });
  });

  it('asks for it to be modelled, and withdraws, with how many have asked', async () => {
    auth.user = { id: 'user-1' };
    answer([], [], false, 0);
    vi.mocked(apiClient.put).mockResolvedValue({ asked: true, count: 1 });
    vi.mocked(apiClient.delete).mockResolvedValue({ asked: false, count: 0 });
    const user = userEvent.setup();
    page();
    const ask = await screen.findByRole('button', { name: 'Ask for it to be modelled' });
    await waitFor(() => expect(ask).toHaveProperty('disabled', false));
    await user.click(ask);
    expect(apiClient.put).toHaveBeenCalledWith('/api/v1/me/model-requests/moog-minimoog');
    expect(await screen.findByText('1 person has asked for it to be modelled.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'You asked for it to be modelled' }));
    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/me/model-requests/moog-minimoog');
    await waitFor(() => expect(screen.queryByText(/asked for it to be modelled\./)).toBeNull());
  });

  it('says when a change could not be made, and changes nothing shown', async () => {
    auth.user = { id: 'user-1' };
    answer([], [], false, 0);
    vi.mocked(apiClient.post).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    page();
    const own = await screen.findByRole('button', { name: 'I own this' });
    await waitFor(() => expect(own).toHaveProperty('disabled', false));
    await user.click(own);
    expect((await screen.findByRole('alert')).textContent).toContain('could not be changed');
    expect(screen.getByRole('button', { name: 'I own this' })).toBeTruthy();
  });
});
