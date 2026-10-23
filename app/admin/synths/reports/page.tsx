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
import type { QueuePattern } from '@/lib/app/patterns/report-data';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Reported patches',
  description: 'Shared patches and patterns people reported: unlist, restore or dismiss each.',
};

/** Where the queue lives, for the tabs. */
const REPORTS_PATH = '/admin/synths/reports';

interface Props {
  searchParams: Promise<{ view?: string | string[]; kind?: string | string[] }>;
}

/** What is queued: shared sounds (`f-sharing` h4), or shared patterns (`f-step-sequencer` t-83). */
type Kind = 'sounds' | 'patterns';
const KINDS: readonly [Kind, string][] = [
  ['sounds', 'Patches'],
  ['patterns', 'Patterns'],
];

const TABS: readonly [ModerationView, string][] = [
  ['reported', 'Reported'],
  ['unlisted', 'Unlisted'],
];

const isView = (value: unknown): value is ModerationView =>
  MODERATION_VIEWS.some((v) => v === value);

/**
 * Admin — Reported sounds (`f-sharing` h4), and reported patterns (`f-step-sequencer` t-83). A thin server shell over
 * `GET /api/v1/admin/sounds` and `GET /api/v1/admin/patterns`; `?kind=` picks which, sounds by default, and `?view=`
 * the tab, reported by default. A failed fetch says so in place of the queue rather than throwing.
 */
async function getQueue<T>(kind: Kind, view: ModerationView): Promise<T[] | null> {
  try {
    const res = await serverFetch(`/api/v1/admin/${kind}?view=${view}`);
    if (!res.ok) return null;
    const body = await parseApiResponse<T[]>(res);
    return body.success && Array.isArray(body.data) ? body.data : null;
  } catch (err) {
    logger.error('reported sounds admin page: fetch failed', err, { kind, view });
    return null;
  }
}

const queueHref = (kind: Kind, view: ModerationView) =>
  `${REPORTS_PATH}?view=${view}${kind === 'patterns' ? '&kind=patterns' : ''}`;

export default async function ReportedSoundsAdminPage({ searchParams }: Props) {
  const { view: asked, kind: askedKind } = await searchParams;
  const view = isView(asked) ? asked : 'reported';
  const kind: Kind = askedKind === 'patterns' ? 'patterns' : 'sounds';
  const sounds = kind === 'sounds' ? await getQueue<QueueSound>(kind, view) : null;
  const patterns = kind === 'patterns' ? await getQueue<QueuePattern>(kind, view) : null;
  const failed = kind === 'sounds' ? sounds === null : patterns === null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Reported patches{' '}
          <FieldHelp title="Reported patches">
            <p>
              Shared patches and patterns signed-in users reported from their pages. Who reported
              one is never shown.
            </p>
            <p className="mt-2">
              <strong>Unlist</strong> takes it off its page, Explore, its owner&apos;s profile and
              the sitemap, and stops its owner sharing it again; My patches or My patterns tells
              them. <strong>Restore</strong> puts it back as they left it. <strong>Dismiss</strong>{' '}
              closes the reports and leaves it up. Every action is in the audit log.
            </p>
          </FieldHelp>
        </h1>
      </header>

      <nav aria-label="What" className="flex gap-4 text-sm">
        {KINDS.map(([value, label]) => (
          <Link
            key={value}
            href={queueHref(value, view)}
            aria-current={value === kind ? 'page' : undefined}
            className={value === kind ? 'font-medium underline' : 'text-muted-foreground'}
          >
            {label}
          </Link>
        ))}
      </nav>

      <nav aria-label="Queue" className="flex gap-4 text-sm">
        {TABS.map(([value, label]) => (
          <Link
            key={value}
            href={queueHref(kind, value)}
            aria-current={value === view ? 'page' : undefined}
            className={value === view ? 'font-medium underline' : 'text-muted-foreground'}
          >
            {label}
          </Link>
        ))}
      </nav>

      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          The queue could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <ReportQueue sounds={sounds ?? []} patterns={patterns ?? []} />
      )}
    </div>
  );
}
