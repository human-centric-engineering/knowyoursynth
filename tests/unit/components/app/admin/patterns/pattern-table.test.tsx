// @vitest-environment happy-dom

/**
 * PatternTable (`f-pattern-library` t-126): one page of the library, each row linking to its editor, with the filters as
 * a GET form the server reads and a pager that keeps them.
 *
 * @see components/app/admin/patterns/pattern-table.tsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import {
  PatternTable,
  type PatternTableProps,
} from '@/components/app/admin/patterns/pattern-table';
import { adminLibraryPattern } from '@/tests/helpers/admin-library-pattern';

const CHOICES: PatternTableProps['choices'] = {
  synths: [{ id: 'model-d', name: 'Model D', maker: 'Moog' }],
  artists: [{ id: 'kraftwerk', name: 'Kraftwerk' }],
};

const ROWS: PatternTableProps['rows'] = [
  adminLibraryPattern(),
  adminLibraryPattern({
    id: 'cpat000000000000000000002',
    name: 'The Model bass',
    role: 'arp',
    fidelity: 'reconstructed',
    origin: 'human_authored',
    inspiredBy: {
      kind: 'work',
      label: 'The Model',
      songId: 'the-model',
      partId: null,
      artistId: null,
      synthId: null,
    },
    editedAt: '2026-10-31T00:00:00.000Z',
    sounds: [
      { synthId: 'model-d', slug: 'a', name: 'A', order: 1, isDefault: false },
      { synthId: 'model-d', slug: 'b', name: 'B', order: 0, isDefault: true },
    ],
  }),
  {
    id: 'cpat000000000000000000003',
    key: 'admin:x',
    name: 'Broken',
    problem: 'It no longer parses',
  },
];

const table = (over: Partial<PatternTableProps> = {}) =>
  render(
    <PatternTable
      rows={ROWS}
      total={3}
      page={1}
      limit={50}
      filters={{}}
      choices={CHOICES}
      {...over}
    />
  );

describe('PatternTable', () => {
  it('links each row to its editor, with its role, provenance, patches and whose it is', () => {
    table();

    expect(screen.getByRole('link', { name: 'The Model bass' })).toHaveAttribute(
      'href',
      '/admin/synths/patterns/cpat000000000000000000002'
    );
    const row = screen.getByRole('link', { name: 'The Model bass' }).closest('tr')!;
    expect(within(row).getByText('Arp / sequence')).toBeInTheDocument();
    expect(within(row).getByText('The Model')).toBeInTheDocument();
    expect(within(row).getByText('Reconstructed')).toBeInTheDocument();
    expect(within(row).getByText('Human-authored')).toBeInTheDocument();
    expect(within(row).getByText('2 patches, default of 1')).toBeInTheDocument();
    expect(within(row).getByText('Edited')).toBeInTheDocument();

    const first = screen.getByRole('link', { name: 'Funk bass' }).closest('tr')!;
    expect(within(first).getByText('1 patch, default of 1')).toBeInTheDocument();
    expect(within(first).getByText('Seed')).toBeInTheDocument();

    expect(screen.getByText('It no longer parses')).toBeInTheDocument();
    expect(screen.getByText('1–3 of 3')).toBeInTheDocument();
  });

  it('filters through a GET form on the list, holding the filters it was given', () => {
    table({
      filters: { q: 'bass', synth: 'model-d', artist: 'kraftwerk', fidelity: 'transcribed' },
    });

    const form = screen.getByRole('form', { name: 'Filter patterns' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/admin/synths/patterns');
    expect(screen.getByLabelText('Find')).toHaveValue('bass');
    expect(screen.getByLabelText('Find')).toHaveAttribute('name', 'q');
    expect(screen.getByLabelText('Synth')).toHaveValue('model-d');
    expect(screen.getByLabelText('Artist')).toHaveValue('kraftwerk');
    expect(screen.getByLabelText('Fidelity')).toHaveValue('transcribed');
    expect(screen.getByLabelText('Role')).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Clear' })).toHaveAttribute(
      'href',
      '/admin/synths/patterns'
    );
  });

  it('pages, keeping the filters', () => {
    table({ total: 120, page: 2, filters: { role: 'arp', page: 2 } });

    expect(screen.getByText('51–53 of 120')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/admin/synths/patterns?role=arp'
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/admin/synths/patterns?role=arp&page=3'
    );
  });

  it('says when nothing matches, and when the library is empty', () => {
    const { unmount } = table({ rows: [], total: 0, filters: { q: 'zzz' } });
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
    unmount();

    table({ rows: [], total: 0 });
    expect(screen.getByText('The library is empty.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Clear' })).toBeNull();
  });

  it('says a page past the end is past the end, not that the library is empty', () => {
    table({ rows: [], total: 60, page: 3 });

    expect(screen.getByText('None on page 3 of 2 — 60 in all')).toBeInTheDocument();
    expect(screen.getByText('This page is past the end of the list.')).toBeInTheDocument();
    expect(screen.queryByText('The library is empty.')).toBeNull();
  });
});
