import type { Metadata } from 'next';
import Link from 'next/link';

import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import { SuggestionQueue } from '@/components/app/admin/bank/suggestion-queue';
import { BANK_SUGGESTIONS_PATH } from '@/components/app/admin/bank/paths';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import {
  SUGGESTION_STATUSES,
  type AdminSuggestion,
  type SuggestionStatus,
} from '@/lib/app/bank/suggestion-data';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Synth suggestions',
  description: 'Synths users say are missing from the databank: accept, merge or decline each.',
};

interface Props {
  searchParams: Promise<{ status?: string | string[] }>;
}

const TABS: readonly [SuggestionStatus, string][] = [
  ['PENDING', 'Pending'],
  ['ACCEPTED', 'Accepted'],
  ['MERGED', 'Merged'],
  ['DECLINED', 'Declined'],
];

const isStatus = (value: unknown): value is SuggestionStatus =>
  SUGGESTION_STATUSES.some((s) => s === value);

/**
 * Admin — Synth suggestions (`f-databank` t-37). A thin server shell over `GET /api/v1/admin/bank/suggestions`;
 * `?status=` picks the tab, pending by default. A failed fetch says so in place of the queue rather than throwing.
 */
async function getSuggestions(status: SuggestionStatus): Promise<AdminSuggestion[] | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/bank/suggestions?status=${status}`);
    if (!res.ok) return null;
    const body = await parseApiResponse<AdminSuggestion[]>(res);
    return body.success && Array.isArray(body.data) ? body.data : null;
  } catch (err) {
    logger.error('synth suggestions admin page: fetch failed', err, { status });
    return null;
  }
}

export default async function SuggestionsAdminPage({ searchParams }: Props) {
  const { status: asked } = await searchParams;
  const status = isStatus(asked) ? asked : 'PENDING';
  const suggestions = await getSuggestions(status);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Synth suggestions{' '}
          <FieldHelp title="Synth suggestions">
            <p>
              Synths signed-in users say are missing, from the Instruments tab of the public{' '}
              <code>/bank</code> pages.
            </p>
            <p className="mt-2">
              <strong>Accept</strong> adds the instrument, checked like any new databank row.{' '}
              <strong>Merge</strong> closes it as already in the databank. <strong>Decline</strong>{' '}
              keeps your reason. Every decision is in the audit log.
            </p>
          </FieldHelp>
        </h1>
      </header>

      <nav aria-label="Suggestion status" className="flex gap-4 text-sm">
        {TABS.map(([value, label]) => (
          <Link
            key={value}
            href={`${BANK_SUGGESTIONS_PATH}?status=${value}`}
            aria-current={value === status ? 'page' : undefined}
            className={value === status ? 'font-medium underline' : 'text-muted-foreground'}
          >
            {label}
          </Link>
        ))}
      </nav>

      <SharedSettingsReadOnlyNotice />

      {suggestions === null ? (
        <p role="alert" className="text-destructive text-sm">
          The suggestions could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <SuggestionQueue suggestions={suggestions} />
      )}
    </div>
  );
}
