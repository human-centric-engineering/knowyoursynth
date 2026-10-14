// @vitest-environment happy-dom

/**
 * Admin — synth suggestions (`f-databank` t-37): the queue for the status `?status=` names, pending by default, and a
 * message where the API could not be read.
 *
 * @see app/admin/synths/bank/suggestions/page.tsx
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

import SuggestionsAdminPage from '@/app/admin/synths/bank/suggestions/page';

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });

const SUGGESTION = {
  id: 'sug-1',
  name: 'Prophet-5 Rev4',
  maker: 'Sequential',
  link: null,
  note: null,
  status: 'PENDING',
  instrumentId: null,
  reason: null,
  decidedAt: null,
  createdAt: '2026-10-14T10:00:00.000Z',
  suggestedBy: 'Dana Owner',
};

const page = async (status?: string) =>
  render(await SuggestionsAdminPage({ searchParams: Promise.resolve({ status }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SuggestionsAdminPage', () => {
  it('shows the pending queue by default, with the Pending tab current', async () => {
    mockServerFetch.mockResolvedValue(ok([SUGGESTION]));
    await page();

    expect(mockServerFetch).toHaveBeenCalledWith('/api/v1/admin/bank/suggestions?status=PENDING');
    expect(screen.getByText(/Prophet-5 Rev4/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pending' })).toHaveAttribute('aria-current', 'page');
  });

  it('asks for the status ?status= names, and ignores one it does not know', async () => {
    mockServerFetch.mockResolvedValue(ok([]));
    await page('DECLINED');
    expect(mockServerFetch).toHaveBeenLastCalledWith(
      '/api/v1/admin/bank/suggestions?status=DECLINED'
    );
    expect(screen.getByText('No suggestions here.')).toBeInTheDocument();

    await page('nonsense');
    expect(mockServerFetch).toHaveBeenLastCalledWith(
      '/api/v1/admin/bank/suggestions?status=PENDING'
    );
  });

  it('says the queue could not be loaded when the API fails or throws', async () => {
    mockServerFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    const { unmount } = await page();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    unmount();

    mockServerFetch.mockRejectedValue(new Error('down'));
    await page();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
