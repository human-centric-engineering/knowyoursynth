// @vitest-environment happy-dom

/**
 * `/u/[username]`: a user's public synth profile (`f-profiles` r3), rendered from the real public read over the fake
 * tables in `tests/helpers/public-profile-db.ts`.
 *
 * @see app/(public)/u/[username]/page.tsx
 * @see components/app/profile/public-profile.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { notFound } from 'next/navigation';

const mockPrisma = vi.hoisted((): Record<string, unknown> => ({}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

import PublicProfileRoute, { generateMetadata } from '@/app/(public)/u/[username]/page';
import {
  ACCOUNT_EMAIL,
  ACCOUNT_NAME,
  publicProfileDelegates,
  seedPublicProfileDb,
  type PublicProfileDb,
} from '@/tests/helpers/public-profile-db';

let db: PublicProfileDb;

beforeEach(() => {
  vi.clearAllMocks();
  db = seedPublicProfileDb();
  Object.assign(mockPrisma, publicProfileDelegates(db));
});

const props = (username: string) => ({ params: Promise.resolve({ username }) });
const profileOf = (username: string) => {
  const p = db.profiles.find((r) => r.username === username);
  if (!p) throw new Error(`no profile ${username}`);
  return p;
};

async function renderPage(username: string) {
  return render(await PublicProfileRoute(props(username)));
}

describe('/u/[username]', () => {
  it('shows the username, the links and both lists, each synth opening its databank page', async () => {
    await renderPage('moog_fan');
    expect(screen.getByRole('heading', { level: 1, name: 'moog_fan' })).toBeInTheDocument();

    const links = within(screen.getByRole('list', { name: 'Where their music is' }));
    const youtube = links.getByRole('link', { name: /YouTube/ });
    expect(youtube).toHaveAttribute('href', 'https://www.youtube.com/@moogfan');
    expect(youtube).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(links.getByRole('link', { name: /Bandcamp/ })).toHaveAttribute(
      'href',
      'https://moogfan.bandcamp.com'
    );
    expect(links.queryByRole('link', { name: /Spotify/ })).toBeNull();

    const owned = within(screen.getByRole('heading', { name: /Synths they own/ }).parentElement!);
    expect(owned.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Minimoog Model DMoog · 1970',
      'Juno-60Roland · 1982',
    ]);
    expect(owned.getByRole('link', { name: /Juno-60/ })).toHaveAttribute(
      'href',
      '/bank/instruments/juno-60'
    );
    const wanted = within(screen.getByRole('heading', { name: /On their wishlist/ }).parentElement!);
    expect(wanted.getByRole('link', { name: /CS-80/ })).toBeInTheDocument();
  });

  it('never renders the account name or email, on a page that has content', async () => {
    const { container } = await renderPage('moog_fan');
    const html = container.innerHTML;
    expect(html).toContain('Minimoog Model D');
    expect(html).not.toContain(ACCOUNT_NAME);
    expect(html).not.toContain(ACCOUNT_EMAIL);
  });

  it('leaves out a list the user hides, and says when a shown one is empty', async () => {
    profileOf('moog_fan').showOwned = false;
    db.owned = db.owned.filter((r) => r.kind !== 'wishlist');
    await renderPage('moog_fan');
    expect(screen.queryByRole('heading', { name: /Synths they own/ })).toBeNull();
    expect(screen.getByRole('heading', { name: /On their wishlist/ })).toBeInTheDocument();
    expect(screen.getByText('None listed yet.')).toBeInTheDocument();
  });

  it('says there is nothing else when the profile shows only its name', async () => {
    Object.assign(profileOf('moog_fan'), {
      youtube: null,
      instagram: null,
      bandcamp: null,
      showOwned: false,
      showWishlist: false,
    });
    await renderPage('moog_fan');
    expect(screen.getByText('Nothing else here yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Where their music is' })).toBeNull();
  });

  it('is a 404 for a private profile, an unknown name and a held one', async () => {
    await expect(PublicProfileRoute(props('quiet_one'))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(PublicProfileRoute(props('nobody_here'))).rejects.toThrow('NEXT_NOT_FOUND');
    profileOf('moog_fan').username = 'synth_wiz';
    await expect(PublicProfileRoute(props('moog_fan'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledTimes(3);
  });

  describe('metadata', () => {
    it('titles the page with the username and says what it lists', async () => {
      expect(await generateMetadata(props('Moog_Fan'))).toEqual({
        title: 'moog_fan',
        description: expect.stringMatching(
          /^moog_fan on .+: the synths they own and the ones they want\.$/
        ),
        alternates: { canonical: '/u/moog_fan' },
      });
    });

    it('describes a profile with no lists by its name alone', async () => {
      Object.assign(profileOf('moog_fan'), { showOwned: false, showWishlist: false });
      const meta = await generateMetadata(props('moog_fan'));
      expect(meta.description).toMatch(/^moog_fan on [^:]+\.$/);
    });

    it('gives a private profile no title of its own', async () => {
      const meta = await generateMetadata(props('quiet_one'));
      expect(meta).toEqual({ title: 'Not found' });
      expect(JSON.stringify(meta)).not.toContain('quiet_one');
    });

    it('never puts the account name in the metadata', async () => {
      const meta = JSON.stringify(await generateMetadata(props('moog_fan')));
      expect(meta).toContain('moog_fan');
      expect(meta).not.toContain(ACCOUNT_NAME);
      expect(meta).not.toContain(ACCOUNT_EMAIL);
    });
  });
});
