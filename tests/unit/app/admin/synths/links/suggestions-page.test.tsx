// @vitest-environment happy-dom

/**
 * Admin — suggested links (`f-link-suggestions` t-186): the queue for the status `?status=` names, pending by default,
 * a suggestion the browser cannot read left out, and a message where the API could not be read.
 *
 * @see app/admin/synths/links/suggestions/page.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockServerFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: mockServerFetch,
  parseApiResponse: async (res: Response) => res.json(),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockLogger = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: mockLogger }));

import LinkSuggestionsAdminPage from '@/app/admin/synths/links/suggestions/page';

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });

const SUGGESTION = {
  id: 'lsug-1',
  target: { kind: 'instrument', id: 'moog-minimoog', name: 'Minimoog Model D' },
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  kind: 'demo',
  title: 'Minimoog bass demo',
  note: null,
  status: 'PENDING',
  linkId: null,
  reason: null,
  decidedAt: null,
  createdAt: '2026-11-06T09:00:00.000Z',
  suggestedBy: 'Dana Owner',
};

const page = async (status?: string) =>
  render(await LinkSuggestionsAdminPage({ searchParams: Promise.resolve({ status }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LinkSuggestionsAdminPage', () => {
  it('shows the pending queue by default, with the Pending tab current', async () => {
    mockServerFetch.mockResolvedValue(ok([SUGGESTION]));
    await page();

    expect(mockServerFetch).toHaveBeenCalledWith('/api/v1/admin/links/suggestions?status=PENDING');
    expect(screen.getByText(/Minimoog bass demo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pending' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Accepted' })).toHaveAttribute(
      'href',
      '/admin/synths/links/suggestions?status=ACCEPTED'
    );
    expect(screen.getByRole('link', { name: 'Videos and links' })).toHaveAttribute(
      'href',
      '/admin/synths/links'
    );
  });

  it('asks for the status ?status= names, and ignores one it does not know', async () => {
    mockServerFetch.mockResolvedValue(ok([]));
    const { unmount } = await page('DECLINED');
    expect(mockServerFetch).toHaveBeenLastCalledWith(
      '/api/v1/admin/links/suggestions?status=DECLINED'
    );
    expect(screen.getByRole('link', { name: 'Declined' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('No suggestions here.')).toBeInTheDocument();
    unmount();

    // MERGED is a synth suggestion's status, not a link's.
    await page('MERGED');
    expect(mockServerFetch).toHaveBeenLastCalledWith(
      '/api/v1/admin/links/suggestions?status=PENDING'
    );
  });

  it('leaves out a suggestion it cannot read, and shows the rest', async () => {
    mockServerFetch.mockResolvedValue(
      ok([SUGGESTION, { ...SUGGESTION, id: 'lsug-2', title: 'Broken', kind: 'podcast' }])
    );
    await page();
    expect(screen.getByText(/Minimoog bass demo/)).toBeInTheDocument();
    expect(screen.queryByText(/Broken/)).toBeNull();
  });

  it('says the queue could not be loaded when the API fails or throws', async () => {
    mockServerFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    const { unmount } = await page();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(mockLogger.warn).toHaveBeenCalled();
    unmount();

    mockServerFetch.mockRejectedValue(new Error('down'));
    await page();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
