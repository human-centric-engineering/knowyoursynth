// @vitest-environment happy-dom

/**
 * Admin — the synth family pages (`f-synth-families` t-323): the list, a new family and one family. Each says so when
 * what it needs could not be loaded, and one family is a 404 when it is not stored.
 *
 * @see app/admin/synths/catalogue/families/page.tsx
 * @see app/admin/synths/catalogue/families/new/page.tsx
 * @see app/admin/synths/catalogue/families/[id]/page.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/admin/synths/catalogue/families/load', () => ({
  getAdminFamilies: vi.fn(),
  getAdminFamily: vi.fn(),
  getFamilyFormOptions: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { put: vi.fn(), post: vi.fn(), delete: vi.fn() },
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

import SynthFamiliesPage from '@/app/admin/synths/catalogue/families/page';
import NewFamilyPage from '@/app/admin/synths/catalogue/families/new/page';
import FamilyPage, { generateMetadata } from '@/app/admin/synths/catalogue/families/[id]/page';
import {
  getAdminFamilies,
  getAdminFamily,
  getFamilyFormOptions,
} from '@/app/admin/synths/catalogue/families/load';
import type { AdminFamily } from '@/lib/app/families/edit';

const FAMILY: AdminFamily = {
  id: 'tb-303',
  name: 'TB-303',
  defaultMember: 'td-3',
  editedAt: '2026-11-26T00:00:00.000Z',
  members: [
    {
      slug: 'td-3',
      label: 'TD-3',
      instrument: 'behringer-td-3',
      synth: 'td-3',
      differences: 'A copy.',
    },
    { slug: 'tb-03', label: 'TB-03', instrument: 'roland-tb-03', differences: 'Reissue.' },
  ],
};
const OPTIONS = { synths: [{ id: 'td-3', name: 'Behringer TD-3' }], instruments: [] };
const props = { params: Promise.resolve({ id: 'tb-303' }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SynthFamiliesPage', () => {
  it('links each family, with its members and whether an admin has edited it', async () => {
    vi.mocked(getAdminFamilies).mockResolvedValue([FAMILY]);

    render(await SynthFamiliesPage());

    expect(screen.getByRole('link', { name: 'TB-303' })).toHaveAttribute(
      'href',
      '/admin/synths/catalogue/families/tb-303'
    );
    expect(screen.getByText('TD-3 · TB-03')).toBeInTheDocument();
    expect(screen.getByText('Edited')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New family' })).toHaveAttribute(
      'href',
      '/admin/synths/catalogue/families/new'
    );
  });

  it('says when there are none, and when they could not be loaded', async () => {
    vi.mocked(getAdminFamilies).mockResolvedValueOnce([]);
    const { unmount } = render(await SynthFamiliesPage());
    expect(screen.getByText('There are no families yet.')).toBeInTheDocument();
    unmount();

    vi.mocked(getAdminFamilies).mockResolvedValueOnce(null);
    render(await SynthFamiliesPage());
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('NewFamilyPage', () => {
  it('shows an empty form to create one', async () => {
    vi.mocked(getFamilyFormOptions).mockResolvedValue(OPTIONS);

    render(await NewFamilyPage());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New family');
    expect(screen.getByRole('button', { name: 'Create family' })).toBeInTheDocument();
  });

  it('says when the synths and instruments could not be loaded', async () => {
    vi.mocked(getFamilyFormOptions).mockResolvedValue(null);

    render(await NewFamilyPage());

    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.queryByRole('button', { name: 'Create family' })).not.toBeInTheDocument();
  });
});

describe('FamilyPage', () => {
  it('names the family and shows its form', async () => {
    vi.mocked(getAdminFamily).mockResolvedValue(FAMILY);
    vi.mocked(getFamilyFormOptions).mockResolvedValue(OPTIONS);

    render(await FamilyPage(props));

    expect(getAdminFamily).toHaveBeenCalledWith('tb-303');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('TB-303');
    expect(screen.getByRole('button', { name: 'Save family' })).toBeInTheDocument();
    await expect(generateMetadata(props)).resolves.toMatchObject({ title: 'TB-303 · Families' });
  });

  it('is a 404 for a family that is not stored', async () => {
    vi.mocked(getAdminFamily).mockResolvedValue('missing');
    vi.mocked(getFamilyFormOptions).mockResolvedValue(OPTIONS);

    await expect(FamilyPage(props)).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(generateMetadata(props)).resolves.toMatchObject({ title: 'Family · Catalogue' });
  });

  it('says when the family could not be loaded', async () => {
    vi.mocked(getAdminFamily).mockResolvedValue(null);
    vi.mocked(getFamilyFormOptions).mockResolvedValue(OPTIONS);

    render(await FamilyPage(props));

    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });
});
