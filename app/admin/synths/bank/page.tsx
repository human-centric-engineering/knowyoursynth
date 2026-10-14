import type { Metadata } from 'next';

import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import { BankTable } from '@/components/app/admin/bank/bank-table';
import { DEFAULT_TAB, isBankTab, tabLabel } from '@/components/app/bank/routes';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { AdminBankRow } from '@/lib/app/bank/admin';
import type { BankKind } from '@/lib/app/bank/read';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Databank',
  description:
    'Create, edit and remove the databank’s artists, innovators, records and instruments.',
};

interface Props {
  searchParams: Promise<{ kind?: string | string[] }>;
}

/**
 * Admin — Databank (`f-databank` t-36). A thin server shell over `GET /api/v1/admin/bank/[kind]`; `?kind=` picks the
 * tab. A failed fetch says so in place of the table rather than throwing.
 */
async function getRows(kind: BankKind): Promise<AdminBankRow[] | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/bank/${kind}`);
    if (!res.ok) return null;
    const body = await parseApiResponse<AdminBankRow[]>(res);
    return body.success && Array.isArray(body.data) ? body.data : null;
  } catch (err) {
    logger.error('databank admin page: fetch failed', err, { kind });
    return null;
  }
}

export default async function BankAdminPage({ searchParams }: Props) {
  const { kind: asked } = await searchParams;
  const kind = typeof asked === 'string' && isBankTab(asked) ? asked : DEFAULT_TAB;
  const rows = await getRows(kind);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Databank{' '}
          <FieldHelp title="The databank">
            <p>
              The artists, innovators, records and instruments behind every synth&apos;s &quot;Heard
              on&quot; list and the public <code>/bank</code> pages.
            </p>
            <p className="mt-2">
              Saving a row makes it an admin&apos;s: the seed never overwrites it again. A save or
              removal that would leave a reference pointing at nothing is refused, with what to fix.
              Every change is in the audit log.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">
          {tabLabel(kind)}: find one to edit, or add one.
        </p>
      </header>

      <SharedSettingsReadOnlyNotice />

      {rows === null ? (
        <p role="alert" className="text-destructive text-sm">
          The databank could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <BankTable kind={kind} rows={rows} />
      )}
    </div>
  );
}
