// @vitest-environment happy-dom

/**
 * Admin — one synth in the catalogue (`f-catalogue-admin` t-31): its header, the editor on the tab `?tab=` names, a
 * 404 for a synth that does not exist, and a message for one that could not be loaded.
 *
 * @see app/admin/synths/catalogue/[id]/page.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/admin/synths/catalogue/[id]/admin-synth', () => ({
  getAdminSynthDetail: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { put: vi.fn(), patch: vi.fn(), post: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import CatalogueSynthPage, { generateMetadata } from '@/app/admin/synths/catalogue/[id]/page';
import { getAdminSynthDetail } from '@/app/admin/synths/catalogue/[id]/admin-synth';
import { adminSynthDetail } from '@/tests/helpers/admin-synth-detail';

const getDetail = vi.mocked(getAdminSynthDetail);

const props = (tab?: string) => ({
  params: Promise.resolve({ id: 'model-d' }),
  searchParams: Promise.resolve({ tab }),
});

describe('CatalogueSynthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the synth and whether it is listed, and opens on its details', async () => {
    getDetail.mockResolvedValue(adminSynthDetail());

    render(await CatalogueSynthPage(props()));

    expect(getDetail).toHaveBeenCalledWith('model-d');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Moog Model D');
    expect(heading).toHaveTextContent('Listed');
    expect(heading).not.toHaveTextContent('Not built');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: '← Catalogue' })).toHaveAttribute(
      'href',
      '/admin/synths/catalogue'
    );
  });

  it('says an unlisted, unbuilt synth is both', async () => {
    const detail = adminSynthDetail();
    getDetail.mockResolvedValue({
      ...detail,
      synth: { ...detail.synth, listed: false, playable: false },
    });

    render(await CatalogueSynthPage(props()));

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Unlisted');
    expect(heading).toHaveTextContent('Not built');
  });

  it('opens the tab `?tab=` names', async () => {
    getDetail.mockResolvedValue(adminSynthDetail());

    render(await CatalogueSynthPage(props('sounds')));

    expect(screen.getByRole('tab', { name: 'Sounds (1)' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('sound-row-funk-bass')).toBeInTheDocument();
  });

  it('opens on the details for a tab it does not have', async () => {
    getDetail.mockResolvedValue(adminSynthDetail());

    render(await CatalogueSynthPage(props('nope')));

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  });

  it('is a 404 for a synth that does not exist', async () => {
    getDetail.mockResolvedValue('missing');

    await expect(CatalogueSynthPage(props())).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('says the synth could not be loaded, in place of the editor', async () => {
    getDetail.mockResolvedValue(null);

    render(await CatalogueSynthPage(props()));

    expect(screen.getByRole('alert')).toHaveTextContent('The synth could not be loaded.');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});

describe('generateMetadata', () => {
  it('titles the page with the synth', async () => {
    getDetail.mockResolvedValue(adminSynthDetail());
    const meta = await generateMetadata(props());
    expect(meta.title).toBe('Moog Model D · Catalogue');
  });

  it('falls back to a generic title when the synth is missing or not loaded', async () => {
    getDetail.mockResolvedValue('missing');
    expect((await generateMetadata(props())).title).toBe('Synth · Catalogue');
    getDetail.mockResolvedValue(null);
    expect((await generateMetadata(props())).title).toBe('Synth · Catalogue');
  });
});
