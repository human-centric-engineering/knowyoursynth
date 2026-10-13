// @vitest-environment happy-dom

/**
 * CatalogueData (`f-catalogue-admin` t-32) — the catalogue against the seed, and the content downloads.
 *
 * Pins: rows that match are hidden until asked for, so what shows first is what has moved; a differing row shows the
 * seed's value beside the stored one; before the seed has recorded anything the page says so instead of comparing;
 * the downloads save what the API returns, and say when a synth's content does not fit the schema.
 *
 * @see components/app/admin/synths/catalogue-data.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CatalogueData } from '@/components/app/admin/synths/catalogue-data';
import { apiClient } from '@/lib/api/client';
import type {
  CatalogueReconciliation,
  ReconciledRow,
  RowStatus,
} from '@/lib/app/catalogue/reconcile';

vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
const get = vi.mocked(apiClient.get);

const ZERO: Record<RowStatus, number> = {
  matches: 0,
  differs: 0,
  edited: 0,
  'edited-matches': 0,
  'not-in-seed': 0,
  'not-in-tables': 0,
};

function row(overrides: Partial<ReconciledRow>): ReconciledRow {
  return {
    table: 'SOUND',
    key: 'model-d/a',
    label: 'Sound: A',
    status: 'matches',
    editedAt: null,
    differences: [],
    ...overrides,
  };
}

function reconciliation(): CatalogueReconciliation {
  const rows = [
    row({ table: 'SYNTH', key: 'model-d', label: 'Details' }),
    row({
      key: 'model-d/night-bass',
      label: 'Sound: Night bass',
      status: 'edited',
      editedAt: '2026-10-12T09:00:00.000Z',
      differences: [{ field: 'blurb', seed: 'The seed’s blurb.', current: 'The admin’s blurb.' }],
    }),
    row({ key: 'model-d/admin-sound', label: 'Sound: Admin sound', status: 'not-in-seed' }),
  ];
  return {
    recorded: true,
    lastRecordedAt: '2026-10-11T08:00:00.000Z',
    groups: [
      {
        synthId: 'model-d',
        name: 'Model D',
        counts: { ...ZERO, matches: 1, edited: 1, 'not-in-seed': 1 },
        rows,
      },
      {
        synthId: null,
        name: 'Every panel',
        counts: { ...ZERO, matches: 1 },
        rows: [row({ table: 'NOTE', key: 'shared/limit/x', label: 'Limit: X' })],
      },
    ],
  };
}

const saved: { name: string; text: Promise<string> }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  saved.length = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    saved.push({ name: '', text: blob.text() });
    return 'blob:x';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    saved[saved.length - 1].name = this.download;
  });
});

const groupOf = (id: string) => screen.getByTestId(`catalogue-data-${id}`);

describe('CatalogueData', () => {
  it('shows what has moved and hides matching rows until asked for', async () => {
    render(<CatalogueData data={reconciliation()} />);
    const modelD = groupOf('model-d');

    expect(within(modelD).getByText('1 · Edited')).toBeInTheDocument();
    expect(within(modelD).getByText('1 · Not in the seed')).toBeInTheDocument();
    expect(within(modelD).getByText('Sound: Night bass')).toBeInTheDocument();
    expect(within(modelD).getByText('Sound: Admin sound')).toBeInTheDocument();
    expect(within(modelD).queryByText('Details')).not.toBeInTheDocument();
    expect(within(groupOf('shared')).getByText(/Every row matches the seed/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Show rows that match the seed' }));

    expect(within(modelD).getByText('Details')).toBeInTheDocument();
    expect(within(groupOf('shared')).getByText('Limit: X')).toBeInTheDocument();
  });

  it('shows a differing column with the seed’s value beside the stored one', () => {
    render(<CatalogueData data={reconciliation()} />);
    const modelD = groupOf('model-d');

    expect(within(modelD).getByText('Differs in blurb')).toBeInTheDocument();
    expect(within(modelD).getByText('The seed’s blurb.')).toBeInTheDocument();
    expect(within(modelD).getByText('The admin’s blurb.')).toBeInTheDocument();
    expect(within(modelD).getByText('edited 2026-10-12')).toBeInTheDocument();
  });

  it('offers the upload only for synths the tables have', () => {
    const data = reconciliation();
    data.groups.push({
      synthId: 'tb-303',
      name: 'TB-303',
      counts: { ...ZERO, 'not-in-tables': 1 },
      rows: [row({ table: 'SYNTH', key: 'tb-303', label: 'Details', status: 'not-in-tables' })],
    });
    render(<CatalogueData data={data} />);

    const options = within(screen.getByLabelText('Synth')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Model D']);
  });

  it('says the seed has recorded nothing yet instead of comparing', () => {
    render(<CatalogueData data={{ recorded: false, lastRecordedAt: null, groups: [] }} />);

    expect(screen.getByRole('status')).toHaveTextContent('The seed has not recorded anything yet');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('saves the schema and a synth’s content as files', async () => {
    get.mockResolvedValueOnce({ title: 'schema' });
    render(<CatalogueData data={reconciliation()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Download the schema' }));

    expect(get).toHaveBeenCalledWith('/api/v1/admin/synths/data/schema');
    expect(saved[0].name).toBe('synth-content.schema.json');
    expect(JSON.parse(await saved[0].text)).toEqual({ title: 'schema' });

    get.mockResolvedValueOnce({ content: { synth: 'model-d', sounds: [] }, problems: [] });
    await userEvent.click(
      within(groupOf('model-d')).getByRole('button', { name: 'Download content' })
    );

    expect(get).toHaveBeenLastCalledWith('/api/v1/admin/synths/data/model-d/template');
    expect(saved[1].name).toBe('model-d.content.json');
    expect(JSON.parse(await saved[1].text)).toEqual({ synth: 'model-d', sounds: [] });
  });

  it('saves content that does not fit the schema, and says where it does not', async () => {
    get.mockResolvedValueOnce({
      content: { synth: 'model-d' },
      problems: [{ path: 'sounds.0', message: 'made on version 2, not 1' }],
    });
    render(<CatalogueData data={reconciliation()} />);

    await userEvent.click(
      within(groupOf('model-d')).getByRole('button', { name: 'Download content' })
    );

    expect(saved).toHaveLength(1);
    expect(within(groupOf('model-d')).getByRole('status')).toHaveTextContent(
      'Saved, but 1 part(s) do not fit the schema: sounds.0 (made on version 2, not 1)'
    );
  });

  it('says so in place when a download fails, and saves nothing', async () => {
    get.mockRejectedValueOnce(new Error('network'));
    render(<CatalogueData data={reconciliation()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Download the schema' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Could not download it. Try again.');
    expect(saved).toHaveLength(0);
  });
});
