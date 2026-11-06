import type { Metadata } from 'next';
import Link from 'next/link';

import { SharedSettingsReadOnlyNotice } from '@/components/admin/shared-settings-access';
import {
  LINK_SUGGESTIONS_API,
  LINK_SUGGESTIONS_PATH,
  LINKS_ADMIN_PATH,
  readSuggestedLinks,
  type SuggestedLinkView,
} from '@/components/app/admin/links/data';
import { LinkSuggestionQueue } from '@/components/app/admin/links/suggestion-queue';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import {
  LINK_SUGGESTION_STATUSES,
  type LinkSuggestionStatus,
} from '@/lib/app/links/suggestion-data';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Suggested links',
  description: 'Videos and links users suggested: approve or decline each.',
};

interface Props {
  searchParams: Promise<{ status?: string | string[] }>;
}

const TABS: readonly [LinkSuggestionStatus, string][] = [
  ['PENDING', 'Pending'],
  ['ACCEPTED', 'Accepted'],
  ['DECLINED', 'Declined'],
];

const isStatus = (value: unknown): value is LinkSuggestionStatus =>
  LINK_SUGGESTION_STATUSES.some((s) => s === value);

/**
 * Admin — suggested links (`f-link-suggestions` t-186), under Synths → Videos and links. A thin server shell over
 * `GET /api/v1/admin/links/suggestions`; `?status=` picks the tab, pending by default. A failed fetch says so in place
 * of the queue rather than throwing.
 */
async function getSuggestions(status: LinkSuggestionStatus): Promise<SuggestedLinkView[] | null> {
  try {
    const res = await serverFetch(`${LINK_SUGGESTIONS_API}?status=${status}`);
    if (!res.ok) {
      logger.warn('link suggestions admin page: queue refused', { status, code: res.status });
      return null;
    }
    const body = await parseApiResponse<unknown>(res);
    return body.success ? readSuggestedLinks(body.data) : null;
  } catch (err) {
    logger.error('link suggestions admin page: fetch failed', err, { status });
    return null;
  }
}

export default async function LinkSuggestionsAdminPage({ searchParams }: Props) {
  const { status: asked } = await searchParams;
  const status = isStatus(asked) ? asked : 'PENDING';
  const suggestions = await getSuggestions(status);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-muted-foreground text-sm">
          <Link href={LINKS_ADMIN_PATH} className="underline">
            Videos and links
          </Link>{' '}
          ›
        </p>
        <h1 className="flex items-center gap-1 text-2xl font-semibold">
          Suggested links
          <FieldHelp title="Suggested links">
            <p>
              Videos and links signed-in users say belong on an instrument, a library patch, a
              record or an artist, from the Videos and links sections of the public pages.
            </p>
            <p className="mt-2">
              <strong>Approve</strong> adds the link, read from its provider and checked like any
              you add. <strong>Decline</strong> keeps your reason. Every decision is in the audit
              log.
            </p>
          </FieldHelp>
        </h1>
      </header>

      <nav aria-label="Suggestion status" className="flex gap-4 text-sm">
        {TABS.map(([value, label]) => (
          <Link
            key={value}
            href={`${LINK_SUGGESTIONS_PATH}?status=${value}`}
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
        <LinkSuggestionQueue suggestions={suggestions} />
      )}
    </div>
  );
}
