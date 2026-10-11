// @vitest-environment happy-dom

/**
 * Admin — Designs page (D11, `f-panel-designs` t-28).
 *
 * @see app/admin/synths/page.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));

vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: { patch: vi.fn(), post: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

import SynthDesignsPage from '@/app/admin/synths/page';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { AdminSynthDesign } from '@/lib/app/catalogue/designs';
import { logger } from '@/lib/logging';

const MODEL_D: AdminSynthDesign = {
  id: 'model-d',
  name: 'Model D',
  maker: 'Moog',
  listed: true,
  order: 1,
  playable: true,
  design: 'neutral',
  approval: null,
};

const LOAD_FAILED = 'The synth list could not be loaded. Reload the page to try again.';

describe('SynthDesignsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders every synth from the admin synths endpoint', async () => {
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: [MODEL_D] } as never);

    render(await SynthDesignsPage());

    expect(serverFetch).toHaveBeenCalledWith('/api/v1/admin/synths');
    expect(screen.getByRole('heading', { name: /Designs/ })).toBeInTheDocument();
    expect(screen.getByTestId('synth-row-model-d')).toHaveTextContent('Model D');
    expect(screen.queryByText(LOAD_FAILED)).not.toBeInTheDocument();
  });

  it('says the list could not be loaded when the fetch is refused', async () => {
    vi.mocked(serverFetch).mockResolvedValue({ ok: false } as Response);

    render(await SynthDesignsPage());

    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_FAILED);
    expect(parseApiResponse).not.toHaveBeenCalled();
  });

  it('says the list could not be loaded when the body is not a success with an array', async () => {
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    } as never);

    render(await SynthDesignsPage());

    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_FAILED);
  });

  it('says the list could not be loaded, and logs, when the fetch throws', async () => {
    vi.mocked(serverFetch).mockRejectedValue(new Error('network'));

    render(await SynthDesignsPage());

    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_FAILED);
    expect(logger.error).toHaveBeenCalledWith(
      'synth designs page: fetch failed',
      expect.any(Error)
    );
  });
});
