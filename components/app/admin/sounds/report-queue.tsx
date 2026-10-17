'use client';

/**
 * ReportQueue — shared sounds people reported, and sounds moderators unlisted (`f-sharing` h4), for an admin to act on.
 *
 * Each action is `POST /api/v1/admin/sounds/[id]`: **Unlist** (a sound that is up), **Restore** (one that is
 * unlisted), **Dismiss** (one with open reports). The owner is named by their username; **who reported a sound is
 * never shown**, and the queue's data does not carry it.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { sharedSoundHref } from '@/components/app/synth/routes';
import { Button } from '@/components/ui/button';
import { APIClientError, apiClient } from '@/lib/api/client';
import {
  SOUND_REPORT_REASON_LABELS,
  type ModerationAction,
  type QueueSound,
} from '@/lib/app/sounds/report-data';

const VISIBILITY: Record<QueueSound['visibility'], string> = {
  private: 'private',
  link: 'shared by link',
  published: 'published',
};

export function ReportQueue({ sounds }: { sounds: QueueSound[] }) {
  if (sounds.length === 0) return <p className="text-muted-foreground text-sm">Nothing here.</p>;
  return (
    <ul className="space-y-4">
      {sounds.map((s) => (
        <li key={s.id}>
          <QueueCard sound={s} />
        </li>
      ))}
    </ul>
  );
}

function QueueCard({ sound: s }: { sound: QueueSound }) {
  const router = useRouter();
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const open = s.reports.filter((r) => r.status === 'open');
  const live = s.unlistedAt === null && s.visibility !== 'private' && s.slug;

  const act = async (action: ModerationAction) => {
    setBusy(action);
    setFailure(null);
    try {
      await apiClient.post(`/api/v1/admin/sounds/${encodeURIComponent(s.id)}`, {
        body: { action },
      });
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
          {live && s.slug ? (
            <Link
              href={sharedSoundHref(s.synthId, s.slug)}
              className="underline-offset-2 hover:underline"
            >
              {s.name}
            </Link>
          ) : (
            s.name
          )}{' '}
          <span className="text-muted-foreground font-normal">· {s.synthName}</span>
        </h2>
        <span className="text-muted-foreground text-xs">
          by {s.owner ? `@${s.owner}` : 'an owner with no username'} · {VISIBILITY[s.visibility]}
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
