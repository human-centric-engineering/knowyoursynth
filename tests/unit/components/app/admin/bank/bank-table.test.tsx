// @vitest-environment happy-dom

/**
 * BankTable (`f-databank` t-36): one kind of databank row, filtered in the browser, each linking to its editor.
 *
 * @see components/app/admin/bank/bank-table.tsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BankTable } from '@/components/app/admin/bank/bank-table';
import type { AdminBankRow } from '@/lib/app/bank/admin';

const ROWS: AdminBankRow[] = [
  { id: 'devo', name: 'Devo', detail: 'group', editedAt: null },
  {
    id: 'vince-clarke',
    name: 'Vince Clarke',
    detail: 'person',
    editedAt: '2026-10-14T00:00:00.000Z',
  },
];

describe('BankTable', () => {
  it('links each row to its editor, says whose it is, and offers to add one', () => {
    render(<BankTable kind="artists" rows={ROWS} />);

    expect(screen.getByRole('link', { name: 'Vince Clarke' })).toHaveAttribute(
      'href',
      '/admin/synths/bank/artists/vince-clarke'
    );
    expect(screen.getByText('Edited')).toBeInTheDocument();
    expect(screen.getByText('Seed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add artist' })).toHaveAttribute(
      'href',
      '/admin/synths/bank/artists/new'
    );
    expect(screen.getByRole('link', { name: 'Artists' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Records' })).toHaveAttribute(
      'href',
      '/admin/synths/bank?kind=songs'
    );
  });

  it('filters on name and id', async () => {
    const user = userEvent.setup();
    render(<BankTable kind="artists" rows={ROWS} />);

    await user.type(screen.getByLabelText('Find'), 'vince');
    expect(screen.queryByRole('link', { name: 'Devo' })).toBeNull();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Find'));
    await user.type(screen.getByLabelText('Find'), 'zzz');
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument();
  });
});
