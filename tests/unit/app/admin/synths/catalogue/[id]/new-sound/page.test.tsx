// @vitest-environment happy-dom

/**
 * Admin — a new library sound (`f-catalogue-admin` t-31): the form for a built synth, and why there is none for a synth
 * with no definition.
 *
 * @see app/admin/synths/catalogue/[id]/new-sound/page.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/admin/synths/catalogue/[id]/admin-synth', () => ({
  getAdminSynthDetail: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import NewCatalogueSoundPage from '@/app/admin/synths/catalogue/[id]/new-sound/page';
import { getAdminSynthDetail } from '@/app/admin/synths/catalogue/[id]/admin-synth';
import { adminSynthDetail } from '@/tests/helpers/admin-synth-detail';

const getDetail = vi.mocked(getAdminSynthDetail);
const props = { params: Promise.resolve({ id: 'model-d' }) };

describe('NewCatalogueSoundPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a blank sound form, linking back to the synth's sounds", async () => {
    getDetail.mockResolvedValue(adminSynthDetail());

    render(await NewCatalogueSoundPage(props));

    expect(screen.getByRole('heading', { name: 'Add a patch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add patch' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Moog Model D sounds/ })).toHaveAttribute(
      'href',
      '/admin/synths/catalogue/model-d?tab=sounds'
    );
  });

  it('says a synth with no definition cannot take a sound, and shows no form', async () => {
    getDetail.mockResolvedValue(adminSynthDetail({ definitionVersion: null }));

    render(await NewCatalogueSoundPage(props));

    expect(screen.getByText(/Model D is not built yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add patch' })).not.toBeInTheDocument();
  });

  it('says the synth could not be loaded, naming it by its id', async () => {
    getDetail.mockResolvedValue(null);

    render(await NewCatalogueSoundPage(props));

    expect(screen.getByRole('alert')).toHaveTextContent('The synth could not be loaded.');
    expect(screen.getByRole('link', { name: /model-d sounds/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add patch' })).not.toBeInTheDocument();
  });

  it('is a 404 for a synth that does not exist', async () => {
    getDetail.mockResolvedValue('missing');

    await expect(NewCatalogueSoundPage(props)).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
