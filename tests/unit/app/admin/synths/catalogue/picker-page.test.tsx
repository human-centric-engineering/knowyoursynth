// @vitest-environment happy-dom

/**
 * Admin — the synth picker settings page (`f-synth-picker` t-329): a thin shell over
 * `GET /api/v1/admin/synths/picker`. It opens the form on what the API answers, and says so in place of the form when
 * the settings could not be loaded: a failed request, a refusal, or an answer that is not settings.
 *
 * @see app/admin/synths/catalogue/picker/page.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { serverFetch } = vi.hoisted(() => ({ serverFetch: vi.fn() }));
vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch,
  parseApiResponse: async (res: Response) => (await res.json()) as unknown,
}));
vi.mock('@/components/admin/shared-settings-access', () => ({
  SharedSettingsReadOnlyNotice: () => null,
  useSharedSettingsReadOnly: () => false,
}));
vi.mock('@/lib/api/client', () => ({
  apiClient: { put: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn() } }));

import SynthPickerSettingsPage from '@/app/admin/synths/catalogue/picker/page';
import { FACTORY_PICKER } from '@/lib/app/picker/settings';

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SynthPickerSettingsPage', () => {
  it('opens the form on the settings the API answers', async () => {
    serverFetch.mockResolvedValue(
      answer({ success: true, data: { ...FACTORY_PICKER, group: 'name' } })
    );
    render(await SynthPickerSettingsPage());
    expect(serverFetch).toHaveBeenCalledWith('/api/v1/admin/synths/picker');
    expect(screen.getByRole('radio', { name: 'Name A–Z' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the settings could not be loaded, in place of the form', async () => {
    for (const fail of [
      () => serverFetch.mockRejectedValue(new Error('network')),
      () => serverFetch.mockResolvedValue(answer({ success: false }, 500)),
      () => serverFetch.mockResolvedValue(answer({ success: false })),
      () => serverFetch.mockResolvedValue(answer({ success: true, data: { group: 'name' } })),
    ]) {
      fail();
      const { unmount } = render(await SynthPickerSettingsPage());
      expect(screen.getByRole('alert').textContent).toContain('could not be loaded');
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      unmount();
    }
  });
});
