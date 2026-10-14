// @vitest-environment happy-dom

/**
 * Admin — the databank's pages (`f-databank` t-36): the list on the tab `?kind=` names, a row's editor, the empty form
 * at `new`, a 404 for an unknown kind or row, and a message where the API could not be read.
 *
 * @see app/admin/synths/bank/page.tsx
 * @see app/admin/synths/bank/[kind]/[id]/page.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockServerFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: mockServerFetch,
  parseApiResponse: async (res: Response) => res.json(),
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

vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import BankAdminPage from '@/app/admin/synths/bank/page';
import BankRowPage, { generateMetadata } from '@/app/admin/synths/bank/[kind]/[id]/page';

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });

const MAKER = {
  kind: 'makers',
  editedAt: null,
  row: {
    id: 'robert-moog',
    name: 'Robert Moog',
    country: 'USA',
    companies: ['Moog Music'],
    summary: 'S.',
    story: 'Story.',
    innovations: ['The ladder filter'],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BankAdminPage', () => {
  it('lists the kind ?kind= names, from the admin API', async () => {
    mockServerFetch.mockResolvedValue(
      ok([{ id: 'robert-moog', name: 'Robert Moog', detail: 'USA', editedAt: null }])
    );

    render(await BankAdminPage({ searchParams: Promise.resolve({ kind: 'makers' }) }));

    expect(mockServerFetch).toHaveBeenCalledWith('/api/v1/admin/bank/makers');
    expect(screen.getByRole('link', { name: 'Robert Moog' })).toHaveAttribute(
      'href',
      '/admin/synths/bank/makers/robert-moog'
    );
    expect(screen.getByText(/^Innovators:/)).toBeInTheDocument();
  });

  it('opens on the artists for a kind it does not know', async () => {
    mockServerFetch.mockResolvedValue(ok([]));
    render(await BankAdminPage({ searchParams: Promise.resolve({ kind: 'synths' }) }));
    expect(mockServerFetch).toHaveBeenCalledWith('/api/v1/admin/bank/artists');
  });

  it('says so when the list could not be loaded', async () => {
    mockServerFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    render(await BankAdminPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('BankRowPage', () => {
  const props = (kind: string, id: string) => ({ params: Promise.resolve({ kind, id }) });

  it('edits a row: its name, whose it is, its public page and the form', async () => {
    mockServerFetch.mockResolvedValue(ok(MAKER));

    render(await BankRowPage(props('makers', 'robert-moog')));

    expect(mockServerFetch).toHaveBeenCalledWith('/api/v1/admin/bank/makers/robert-moog');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Robert Moog');
    expect(heading).toHaveTextContent('Seed');
    expect(screen.getByRole('link', { name: 'Its public page' })).toHaveAttribute(
      'href',
      '/bank/makers/robert-moog'
    );
    expect(screen.getByRole('button', { name: 'Save innovator' })).toBeInTheDocument();
  });

  it('is the empty form at new, without asking the API', async () => {
    render(await BankRowPage(props('songs', 'new')));

    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New record');
    expect(screen.getByRole('button', { name: 'Create record' })).toBeInTheDocument();
  });

  it('is a 404 for an unknown kind or a row the API does not have', async () => {
    await expect(BankRowPage(props('synths', 'x'))).rejects.toThrow('NEXT_NOT_FOUND');
    mockServerFetch.mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(BankRowPage(props('makers', 'nope'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('is a 404 for an id no row can have, without asking the API', async () => {
    await expect(BankRowPage(props('artists', 'Aphex_Twin'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect((await generateMetadata(props('artists', 'Aphex_Twin'))).title).toBe('Artists');
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('says so when the row could not be loaded', async () => {
    mockServerFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    render(await BankRowPage(props('makers', 'robert-moog')));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });

  it('titles the page after the row', async () => {
    mockServerFetch.mockResolvedValue(ok(MAKER));
    expect((await generateMetadata(props('makers', 'robert-moog'))).title).toBe(
      'Robert Moog · Innovators'
    );
    expect((await generateMetadata(props('songs', 'new'))).title).toBe('New · Records');
  });
});
