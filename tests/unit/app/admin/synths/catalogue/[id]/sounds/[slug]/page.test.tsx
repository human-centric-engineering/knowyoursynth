// @vitest-environment happy-dom

/**
 * Admin — one library sound and its lesson (`f-catalogue-admin` t-31): the sound from the synth's detail, why the
 * public page leaves it out, and a 404 for a synth or a sound that does not exist.
 *
 * @see app/admin/synths/catalogue/[id]/sounds/[slug]/page.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/admin/synths/catalogue/[id]/admin-synth', () => ({
  getAdminSynthDetail: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { patch: vi.fn() },
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

import CatalogueSoundPage from '@/app/admin/synths/catalogue/[id]/sounds/[slug]/page';
import { getAdminSynthDetail } from '@/app/admin/synths/catalogue/[id]/admin-synth';
import { adminSound, adminSynthDetail } from '@/tests/helpers/admin-synth-detail';

const getDetail = vi.mocked(getAdminSynthDetail);
const props = (slug = 'funk-bass') => ({ params: Promise.resolve({ id: 'model-d', slug }) });

describe('CatalogueSoundPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the sound's form, named, linking back to the synth's sounds", async () => {
    getDetail.mockResolvedValue(adminSynthDetail());

    render(await CatalogueSoundPage(props()));

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Rubber Funk Bass');
    expect(heading).not.toHaveTextContent('Edited');
    expect(screen.getByRole('button', { name: 'Save patch' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Moog Model D sounds/ })).toHaveAttribute(
      'href',
      '/admin/synths/catalogue/model-d?tab=sounds'
    );
  });

  it('says an edited sound is edited, and why the public page leaves it out', async () => {
    getDetail.mockResolvedValue(
      adminSynthDetail({
        sounds: [
          adminSound({
            editedAt: '2026-10-12T00:00:00.000Z',
            problems: [{ path: 'steps.1.set.cutoff', message: 'cutoff must be between 0 and 10' }],
          }),
        ],
      })
    );

    render(await CatalogueSoundPage(props()));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Edited');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('The public page leaves this patch out');
    expect(status).toHaveTextContent('cutoff must be between 0 and 10');
  });

  it('is a 404 for a sound the synth does not have', async () => {
    getDetail.mockResolvedValue(adminSynthDetail());

    await expect(CatalogueSoundPage(props('nope'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('is a 404 for a synth that does not exist', async () => {
    getDetail.mockResolvedValue('missing');

    await expect(CatalogueSoundPage(props())).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('says the sound could not be loaded when the synth could not be', async () => {
    getDetail.mockResolvedValue(null);

    render(await CatalogueSoundPage(props()));

    expect(screen.getByRole('alert')).toHaveTextContent('The patch could not be loaded.');
    expect(screen.getByRole('link', { name: /model-d sounds/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save patch' })).not.toBeInTheDocument();
  });
});
