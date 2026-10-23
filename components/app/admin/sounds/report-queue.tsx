'use client';

/**
 * ReportQueue — shared sounds people reported, and sounds moderators unlisted (`f-sharing` h4), for an admin to act on.
 *
 * Each action is `POST /api/v1/admin/sounds/[id]`: **Unlist** (a sound that is up), **Restore** (one that is
 * unlisted), **Dismiss** (one with open reports). The owner is named by their username; **who reported a sound is
 * never shown**, and the queue's data does not carry it.
 *
 * Reported patterns (`f-step-sequencer` t-83) are the same queue, `patterns` in place of `sounds`, acted on with
 * `POST /api/v1/admin/patterns/[id]`.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { VISIBILITY_LABELS } from '@/components/app/sharing/visibility';
import { patternHref, sharedSoundHref } from '@/components/app/synth/routes';
import { Button } from '@/components/ui/button';
import { APIClientError, apiClient } from '@/lib/api/client';
import {
  SOUND_REPORT_REASON_LABELS,
  type ModerationAction,
  type QueueSound,
} from '@/lib/app/sounds/report-data';
import type { QueuePattern } from '@/lib/app/patterns/report-data';

/** A queued sound or pattern, as its card shows it. */
interface QueueItem extends Pick<
  QueueSound,
  'id' | 'name' | 'visibility' | 'slug' | 'owner' | 'unlistedAt' | 'reports'
> {
  /** The synth it is on, or a pattern was made on. */
  context: string | null;
  notes: string | null;
  /** Its public page, or null. */
  href: string | null;
  /** Where its actions are sent. */
  action: string;
}

const soundItem = (s: QueueSound): QueueItem => ({
  ...s,
  context: s.synthName,
  href: s.slug ? sharedSoundHref(s.synthId, s.slug) : null,
  action: `/api/v1/admin/sounds/${encodeURIComponent(s.id)}`,
});

const patternItem = (p: QueuePattern): QueueItem => ({
  ...p,
  context: p.synthName ? `pattern made on the ${p.synthName}` : 'pattern',
  notes: null,
  href: p.slug ? patternHref(p.slug) : null,
  action: `/api/v1/admin/patterns/${encodeURIComponent(p.id)}`,
});

export function ReportQueue({
  sounds = [],
  patterns = [],
}: {
  sounds?: QueueSound[];
  patterns?: QueuePattern[];
}) {
  const items = [...sounds.map(soundItem), ...patterns.map(patternItem)];
  if (items.length === 0) return <p className="text-muted-foreground text-sm">Nothing here.</p>;
  return (
    <ul className="space-y-4">
      {items.map((s) => (
        <li key={s.action}>
          <QueueCard sound={s} />
        </li>
      ))}
    </ul>
  );
}

function QueueCard({ sound: s }: { sound: QueueItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const open = s.reports.filter((r) => r.status === 'open');
  const live = s.unlistedAt === null && s.visibility !== 'private' && s.href;

  const act = async (action: ModerationAction) => {
    setBusy(action);
    setFailure(null);
    try {
      await apiClient.post(s.action, { body: { action } });
      // Stays busy until the refresh moves this card, so an action cannot be sent twice.
      router.refresh();
    } catch (err) {
      setFailure(err instanceof APIClientError ? err.message : 'Could not save that. Try again.');
      setBusy(null);
    }
  };

  return (
    <article className="rounded-md border p-4" aria-labelledby={`sound-${s.id}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`sound-${s.id}`} className="font-medium">
          {live && s.href ? (
            <Link href={s.href} className="underline-offset-2 hover:underline">
              {s.name}
            </Link>
          ) : (
            s.name
          )}
          {s.context && <span className="text-muted-foreground font-normal"> · {s.context}</span>}
        </h2>
        <span className="text-muted-foreground text-xs">
          by {s.owner ? `@${s.owner}` : 'an owner with no username'} ·{' '}
          {VISIBILITY_LABELS[s.visibility].toLowerCase()}
          {s.unlistedAt && <> · unlisted on {new Date(s.unlistedAt).toLocaleDateString()}</>}
        </span>
      </header>
      {s.notes && <p className="mt-2 text-sm whitespace-pre-line">{s.notes}</p>}

      {s.reports.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm" aria-label="Reports">
          {s.reports.map((r, i) => (
            <li key={i}>
              <span className="font-medium">{SOUND_REPORT_REASON_LABELS[r.reason]}</span>
              <span className="text-muted-foreground">
                {' '}
                · {new Date(r.createdAt).toLocaleDateString()}
                {r.status !== 'open' && ` · ${r.status}`}
              </span>
              {r.note && <span className="block whitespace-pre-line">{r.note}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {s.unlistedAt === null ? (
          <Button size="sm" disabled={busy !== null} onClick={() => void act('unlist')}>
            {busy === 'unlist' ? 'Unlisting…' : 'Unlist'}
          </Button>
        ) : (
          <Button size="sm" disabled={busy !== null} onClick={() => void act('restore')}>
            {busy === 'restore' ? 'Restoring…' : 'Restore'}
          </Button>
        )}
        {open.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void act('dismiss')}
          >
            {busy === 'dismiss'
              ? 'Dismissing…'
              : `Dismiss ${open.length === 1 ? 'report' : `${open.length} reports`}`}
          </Button>
        )}
      </div>
      {failure && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {failure}
        </p>
      )}
    </article>
  );
}
