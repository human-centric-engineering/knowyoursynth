// @vitest-environment happy-dom

/**
 * Admin — Data (`f-catalogue-admin` t-32): a thin shell over `GET /api/v1/admin/synths/data`.
 *
 * @see app/admin/synths/data/page.tsx
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
  apiClient: { get: vi.fn() },
}));

import CatalogueDataPage from '@/app/admin/synths/data/page';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { CatalogueReconciliation } from '@/lib/app/catalogue/reconcile';
import { logger } from '@/lib/logging';

const counts = {
  matches: 1,
  differs: 0,
  edited: 0,
  'edited-matches': 0,
  'not-in-seed': 0,
  'not-in-tables': 0,
};

const DATA: CatalogueReconciliation = {
  recorded: true,
  lastRecordedAt: '2026-10-13T07:00:00.000Z',
  groups: [
    {
      synthId: 'model-d',
      name: 'Model D',
      counts,
      rows: [
        {
          table: 'SYNTH',
          key: 'model-d',
          label: 'Details',
          status: 'matches',
          editedAt: null,
          differences: [],
        },
      ],
    },
  ],
};

const LOAD_FAILED = 'The comparison could not be loaded. Reload the page to try again.';

describe('CatalogueDataPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains the data path and shows the comparison from the data endpoint', async () => {
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: DATA } as never);

    render(await CatalogueDataPage());

    expect(serverFetch).toHaveBeenCalledWith('/api/v1/admin/synths/data');
    expect(screen.getByRole('heading', { level: 1, name: /Data/ })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Step 1Seed data')])
    );
    expect(screen.getByTestId('catalogue-data-model-d')).toHaveTextContent('Model D');
    expect(screen.queryByText(LOAD_FAILED)).not.toBeInTheDocument();
  });

  it('says the comparison could not be loaded when the fetch is refused', async () => {
    vi.mocked(serverFetch).mockResolvedValue({ ok: false } as Response);

    render(await CatalogueDataPage());

    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_FAILED);
    expect(parseApiResponse).not.toHaveBeenCalled();
  });

  it('says the comparison could not be loaded when the body is not a success', async () => {
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    } as never);

    render(await CatalogueDataPage());

    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_FAILED);
    expect(screen.queryByTestId('catalogue-data-model-d')).not.toBeInTheDocument();
  });

  it('says the comparison could not be loaded, and logs, when the fetch throws', async () => {
    vi.mocked(serverFetch).mockRejectedValue(new Error('network'));

    render(await CatalogueDataPage());

    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_FAILED);
    expect(logger.error).toHaveBeenCalledWith(
      'catalogue data page: fetch failed',
      expect.any(Error)
    );
  });
});
