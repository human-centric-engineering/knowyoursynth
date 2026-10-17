import type { Metadata } from 'next';
import Link from 'next/link';

import { ReportQueue } from '@/components/app/admin/sounds/report-queue';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import {
  MODERATION_VIEWS,
  type ModerationView,
  type QueueSound,
} from '@/lib/app/sounds/report-data';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Reported sounds',
  description: 'Shared sounds people reported: unlist, restore or dismiss each.',
};

/** Where the queue lives, for the tabs. */
const REPORTS_PATH = '/admin/synths/reports';

interface Props {
  searchParams: Promise<{ view?: string | string[] }>;
}

const TABS: readonly [ModerationView, string][] = [
  ['reported', 'Reported'],
  ['unlisted', 'Unlisted'],
];

const isView = (value: unknown): value is ModerationView =>
  MODERATION_VIEWS.some((v) => v === value);

/**
 * Admin — Reported sounds (`f-sharing` h4). A thin server shell over `GET /api/v1/admin/sounds`; `?view=` picks the
 * tab, reported by default. A failed fetch says so in place of the queue rather than throwing.
 */
async function getQueue(view: ModerationView): Promise<QueueSound[] | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/sounds?view=${view}`);
    if (!res.ok) return null;
    const body = await parseApiResponse<QueueSound[]>(res);
    return body.success && Array.isArray(body.data) ? body.data : null;
  } catch (err) {
    logger.error('reported sounds admin page: fetch failed', err, { view });
    return null;
  }
}

export default async function ReportedSoundsAdminPage({ searchParams }: Props) {
  const { view: asked } = await searchParams;
  const view = isView(asked) ? asked : 'reported';
  const sounds = await getQueue(view);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Reported sounds{' '}
          <FieldHelp title="Reported sounds">
            <p>
              Shared sounds signed-in users reported from the sound&apos;s page. Who reported a
              sound is never shown.
            </p>
            <p className="mt-2">
              <strong>Unlist</strong> takes it off its page, Explore, its owner&apos;s profile and
              the sitemap, and stops its owner sharing it again; My sounds tells them.{' '}
              <strong>Restore</strong> puts it back as they left it. <strong>Dismiss</strong> closes
              the reports and leaves it up. Every action is in the audit log.
            </p>
          </FieldHelp>
        </h1>
      </header>

      <nav aria-label="Queue" className="flex gap-4 text-sm">
        {TABS.map(([value, label]) => (
          <Link
            key={value}
            href={`${REPORTS_PATH}?view=${value}`}
            aria-current={value === view ? 'page' : undefined}
            className={value === view ? 'font-medium underline' : 'text-muted-foreground'}
          >
            {label}
          </Link>
        ))}
      </nav>

      {sounds === null ? (
        <p role="alert" className="text-destructive text-sm">
          The queue could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <ReportQueue sounds={sounds} />
      )}
    </div>
  );
}
