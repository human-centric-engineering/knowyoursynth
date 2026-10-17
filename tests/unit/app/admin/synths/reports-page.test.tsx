// @vitest-environment happy-dom

/**
 * Admin — reported sounds (`f-sharing` h4): the queue for the view `?view=` names, reported by default, and a message
 * where the API could not be read.
 *
 * @see app/admin/synths/reports/page.tsx
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

import ReportedSoundsAdminPage from '@/app/admin/synths/reports/page';

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });

const SOUND = {
  id: 'snd1',
  synthId: 'model-d',
  synthName: 'Model D',
  name: 'Rude bass',
  notes: null,
  visibility: 'published',
  slug: 'abcdefghjk',
  owner: 'patchwork',
  unlistedAt: null,
  reports: [{ reason: 'spam', note: null, status: 'open', createdAt: '2026-10-17T10:00:00.000Z' }],
};

const page = async (view?: string) =>
  render(await ReportedSoundsAdminPage({ searchParams: Promise.resolve({ view }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReportedSoundsAdminPage', () => {
  it('shows the reported view by default, with its tab current', async () => {
    mockServerFetch.mockResolvedValue(ok([SOUND]));
    await page();
    expect(mockServerFetch).toHaveBeenCalledWith('/api/v1/admin/sounds?view=reported');
    expect(screen.getByText('Rude bass')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reported' })).toHaveAttribute('aria-current', 'page');
  });

  it('asks for the view ?view= names, and ignores one it does not know', async () => {
    mockServerFetch.mockResolvedValue(ok([]));
    await page('unlisted');
    expect(mockServerFetch).toHaveBeenLastCalledWith('/api/v1/admin/sounds?view=unlisted');
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();

    await page('nonsense');
    expect(mockServerFetch).toHaveBeenLastCalledWith('/api/v1/admin/sounds?view=reported');
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
