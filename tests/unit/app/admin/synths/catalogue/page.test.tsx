// @vitest-environment happy-dom

/**
 * Admin — the synth catalogue (`f-catalogue-admin` t-31): a thin shell over `GET /api/v1/admin/synths`.
 *
 * @see app/admin/synths/catalogue/page.tsx
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
  apiClient: { put: vi.fn(), patch: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

import SynthCataloguePage from '@/app/admin/synths/catalogue/page';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { AdminSynth } from '@/lib/app/catalogue/edit';
import { logger } from '@/lib/logging';

const MODEL_D: AdminSynth = {
  id: 'model-d',
  name: 'Model D',
  maker: 'Moog',
  listed: true,
  order: 0,
  playable: true,
  design: 'neutral',
  approval: null,
  year: 1970,
  heritage: 'Monophonic',
  summary: 'The classic.',
  editedAt: null,
  counts: { sounds: 3, notes: 2, lineage: true },
};

const LOAD_FAILED = 'The synth list could not be loaded. Reload the page to try again.';

describe('SynthCataloguePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every synth from the admin synths endpoint', async () => {
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: [MODEL_D] } as never);

    render(await SynthCataloguePage());

    expect(serverFetch).toHaveBeenCalledWith('/api/v1/admin/synths');
    expect(screen.getByRole('heading', { name: /Catalogue/ })).toBeInTheDocument();
    expect(screen.getByTestId('catalogue-row-model-d')).toHaveTextContent('Model D');
    expect(screen.queryByText(LOAD_FAILED)).not.toBeInTheDocument();
  });

  it('says the list could not be loaded when the fetch is refused', async () => {
    vi.mocked(serverFetch).mockResolvedValue({ ok: false } as Response);

    render(await SynthCataloguePage());

    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_FAILED);
    expect(parseApiResponse).not.toHaveBeenCalled();
  });

  it('says the list could not be loaded when the body is not a success with an array', async () => {
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: {} } as never);

    render(await SynthCataloguePage());

    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_FAILED);
    expect(screen.queryByTestId('catalogue-row-model-d')).not.toBeInTheDocument();
  });

  it('says the list could not be loaded, and logs, when the fetch throws', async () => {
    vi.mocked(serverFetch).mockRejectedValue(new Error('network'));

    render(await SynthCataloguePage());

    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_FAILED);
    expect(logger.error).toHaveBeenCalledWith(
      'synth catalogue page: fetch failed',
      expect.any(Error)
    );
  });
});
