// @vitest-environment happy-dom

/**
 * Admin — the synths visitors asked to be modelled (`f-synth-picker` t-330): a thin shell over
 * `GET /api/v1/admin/synths/model-requests`. It lists the tally, says when nobody has asked, and says so in place of the
 * list when it could not be loaded.
 *
 * @see app/admin/synths/catalogue/model-requests/page.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const { serverFetch } = vi.hoisted(() => ({ serverFetch: vi.fn() }));
vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch,
  parseApiResponse: async (res: Response) => (await res.json()) as unknown,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn() } }));

import ModelRequestsPage from '@/app/admin/synths/catalogue/model-requests/page';

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ROW = {
  instrument: {
    id: 'moog-minimoog',
    name: 'Minimoog Model D',
    maker: 'Moog Music',
    year: '1970',
    kind: 'mono',
  },
  count: 4,
  lastAskedAt: '2026-11-27T10:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

describe('ModelRequestsPage', () => {
  it('lists each synth asked for, with how many asked and when, linking to its page', async () => {
    serverFetch.mockResolvedValue(answer({ success: true, data: [ROW] }));
    render(await ModelRequestsPage());
    expect(serverFetch).toHaveBeenCalledWith('/api/v1/admin/synths/model-requests');
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByRole('link').getAttribute('href')).toBe('/synths/about/moog-minimoog');
    expect(row.textContent).toContain('Moog Music Minimoog Model D');
    expect(row.textContent).toContain('4');
    expect(row.textContent).toContain('2026-11-27');
  });

  it('says when nobody has asked yet', async () => {
    serverFetch.mockResolvedValue(answer({ success: true, data: [] }));
    render(await ModelRequestsPage());
    expect(screen.getByText('Nobody has asked for a synth yet.')).toBeTruthy();
  });

  it('says the requests could not be loaded, in place of the list', async () => {
    for (const fail of [
      () => serverFetch.mockRejectedValue(new Error('network')),
      () => serverFetch.mockResolvedValue(answer({ success: false }, 500)),
      () => serverFetch.mockResolvedValue(answer({ success: false })),
      () => serverFetch.mockResolvedValue(answer({ success: true, data: [{ count: 'many' }] })),
    ]) {
      fail();
      const { unmount } = render(await ModelRequestsPage());
      expect(screen.getByRole('alert').textContent).toContain('could not be loaded');
      expect(screen.queryByRole('table')).toBeNull();
      unmount();
    }
  });
});
