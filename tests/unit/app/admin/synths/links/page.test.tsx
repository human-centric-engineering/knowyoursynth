// @vitest-environment happy-dom

/**
 * Admin — every video and link (`f-videos-and-links` t-181): a thin server shell over `GET /api/v1/admin/links`, its
 * filters and page read from the address, keeping only values the API knows.
 *
 * @see app/admin/synths/links/page.tsx
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockServerFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: mockServerFetch,
  parseApiResponse: async (res: Response) => res.json(),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/synths/links',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockLogger = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: mockLogger }));

import LinksAdminPage from '@/app/admin/synths/links/page';

const LINK = {
  id: 'l1',
  owner: { kind: 'instrument', id: 'moog-minimoog', name: 'Minimoog Model D' },
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  provider: 'youtube',
  providerId: 'dQw4w9WgXcQ',
  kind: 'demo',
  title: 'Minimoog demo',
  thumbnailUrl: null,
  embedUrl: null,
  ours: true,
  order: 0,
  rating: null,
  views: 12_000,
  likes: 300,
  statsAt: '2026-11-04T00:00:00.000Z',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const ok = (data: unknown, meta: unknown) =>
  new Response(JSON.stringify({ success: true, data, meta }), { status: 200 });
const page = (searchParams: Record<string, string>) =>
  LinksAdminPage({ searchParams: Promise.resolve(searchParams) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LinksAdminPage', () => {
  it('lists a page of links with the filters from the address', async () => {
    mockServerFetch.mockResolvedValue(ok([LINK], { page: 2, limit: 50, total: 51, totalPages: 2 }));

    render(await page({ owner: 'instrument', provider: 'youtube', ours: 'true', page: '2' }));

    expect(mockServerFetch).toHaveBeenCalledWith(
      '/api/v1/admin/links?page=2&limit=50&owner=instrument&provider=youtube&ours=true'
    );
    expect(screen.getByRole('link', { name: 'Minimoog demo' })).toBeInTheDocument();
    expect(screen.getByText('51 links')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('drops a filter or page the API would refuse, rather than failing the page', async () => {
    mockServerFetch.mockResolvedValue(ok([], { page: 1, limit: 50, total: 0, totalPages: 0 }));

    render(await page({ owner: 'synth', provider: 'myspace', ours: 'yes', page: '-3' }));

    expect(mockServerFetch).toHaveBeenCalledWith('/api/v1/admin/links?page=1&limit=50');
    expect(screen.getByText('No links yet.')).toBeInTheDocument();
  });

  it('says so when the links could not be loaded', async () => {
    mockServerFetch.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const { unmount } = render(await page({}));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    unmount();

    mockServerFetch.mockRejectedValueOnce(new Error('down'));
    render(await page({}));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
