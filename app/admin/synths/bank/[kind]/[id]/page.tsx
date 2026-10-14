import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import {
  SharedSettingsReadOnlyNotice,
  SharedSettingsSaveHint,
} from '@/components/admin/shared-settings-access';
import { BankForm } from '@/components/app/admin/bank/bank-form';
import { BANK_SINGULAR, bankAdminPath } from '@/components/app/admin/bank/paths';
import { bankHref, isBankTab, tabLabel } from '@/components/app/bank/routes';
import { Badge } from '@/components/ui/badge';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { AdminBankDetail } from '@/lib/app/bank/admin';
import type { BankKind } from '@/lib/app/bank/read';
import { logger } from '@/lib/logging';

interface Props {
  params: Promise<{ kind: string; id: string }>;
}

/**
 * One row from `GET /api/v1/admin/bank/[kind]/[id]`: `'missing'` for a 404, `null` when it could not be loaded.
 * Cached per request, so the page and its `generateMetadata` share one fetch.
 */
const getRow = cache(async function getRow(
  kind: BankKind,
  id: string
): Promise<AdminBankDetail | 'missing' | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/bank/${kind}/${encodeURIComponent(id)}`);
    if (res.status === 404) return 'missing';
    if (!res.ok) return null;
    const body = await parseApiResponse<AdminBankDetail>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('databank admin: row fetch failed', err, { kind, id });
    return null;
  }
});

const nameOf = (detail: AdminBankDetail): string => {
  const row: object = detail.row;
  if ('title' in row && typeof row.title === 'string') return row.title;
  if ('name' in row && typeof row.name === 'string') return row.name;
  return '';
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kind, id } = await params;
  const label = isBankTab(kind) ? tabLabel(kind) : 'Databank';
  if (!isBankTab(kind) || id === 'new')
    return { title: `New · ${label}`, description: 'Add a row to the databank.' };
  const detail = await getRow(kind, id);
  return {
    title: detail && detail !== 'missing' ? `${nameOf(detail)} · ${label}` : label,
    description: 'Edit or remove a databank row.',
  };
}

/**
 * Admin — create or edit one databank row (`f-databank` t-36). `/admin/synths/bank/[kind]/new` is the empty form; any
 * other id is a thin server shell over `GET /api/v1/admin/bank/[kind]/[id]`.
 */
export default async function BankRowPage({ params }: Props) {
  const { kind, id } = await params;
  if (!isBankTab(kind)) notFound();
  const isNew = id === 'new';
  const detail = isNew ? null : await getRow(kind, id);
  if (detail === 'missing') notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={bankAdminPath(kind)} className="text-muted-foreground text-sm hover:underline">
          ← {tabLabel(kind)}
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
          {isNew ? `New ${BANK_SINGULAR[kind]}` : detail ? nameOf(detail) : id}
          {detail && (
            <Badge variant={detail.editedAt ? 'secondary' : 'outline'}>
              {detail.editedAt ? 'Edited' : 'Seed'}
            </Badge>
          )}
        </h1>
        {detail && (
          <Link href={bankHref(kind, id)} className="text-muted-foreground text-sm hover:underline">
            Its public page
          </Link>
        )}
      </header>

      <SharedSettingsReadOnlyNotice />

      {!isNew && detail === null ? (
        <p role="alert" className="text-destructive text-sm">
          The row could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <>
          <SharedSettingsSaveHint />
          <BankForm key={`${kind}/${id}`} kind={kind} detail={detail} />
        </>
      )}
    </div>
  );
}
