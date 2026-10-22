'use client';

/**
 * Sharing one of the user's patterns (`f-step-sequencer` t-83), in the sequencer's patterns strip: the saved pattern
 * held, as last saved. A sound's sharing controls (`sound-sharing.tsx`) for a pattern:
 *
 * | State       | Says                                         | Buttons                              |
 * | ----------- | -------------------------------------------- | ------------------------------------ |
 * | `private`   | Only you can open it.                        | Share with a link · Publish…         |
 * | `link`      | Anyone with the link can open it.            | Copy link · Publish… · Stop sharing  |
 * | `published` | Listed on Explore and your profile.          | Copy link · Unpublish · Stop sharing |
 *
 * **Publish…** asks who it appears as and for the "I made this" tick before sending anything. With no username yet
 * its one step is Choose a username, back to this synth. A pattern moderators unlisted says so and offers only Stop
 * sharing. Every refusal is shown in the server's words.
 */

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';

import { patternHref, chooseUsernameHref } from '@/components/app/synth/routes';
import { soundStateLabel } from '@/components/app/sharing/visibility';
import { APIClientError, apiClient } from '@/lib/api/client';
import { ProfileViewSchema } from '@/lib/app/profile/profile-data';
import type { UserPatternDetail } from '@/lib/app/patterns/data';

const ProfileAnswerSchema = ProfileViewSchema.pick({ username: true }).nullable();

/** What went wrong, in the server's words where it gave any. */
function failureOf(err: unknown, doing: string): string {
  if (err instanceof APIClientError) {
    if (err.status === 401) return `Your session has ended. Sign in again to ${doing}.`;
    if (err.status === 404) return 'That pattern is no longer in your account.';
    return err.message;
  }
  return `Could not ${doing}. Check your connection and try again.`;
}

export interface PatternSharingProps {
  /** The saved pattern, as the API last answered for it. */
  pattern: UserPatternDetail;
  /** Changes who can open it, through the API, and answers with the pattern after. */
  share: (to: 'private' | 'link' | 'published') => Promise<UserPatternDetail>;
  /** The synth page, for coming back from settings. */
  backHref: string;
}

export function PatternSharing({ pattern, share, backHref }: PatternSharingProps) {
  const [current, setCurrent] = useState(pattern);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  useEffect(() => setCurrent(pattern), [pattern]);

  const address = current.slug ? patternHref(current.slug) : null;
  const run = async (to: 'private' | 'link' | 'published', doing: string, done: string) => {
    setBusy(true);
    setStatus(null);
    try {
      setCurrent(await share(to));
      setStatus(done);
      return true;
    } catch (err) {
      setStatus(failureOf(err, doing));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const copyLink = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(new URL(address, window.location.origin).toString());
      setStatus('Link copied.');
    } catch {
      setStatus('Your browser blocked copying. Copy the link from the pattern’s page.');
    }
  };

  const shared = current.visibility !== 'private';
  const says = current.unlisted
    ? 'Moderators unlisted it after a report, so nobody else can open it.'
    : current.visibility === 'published'
      ? 'Listed on Explore and your profile.'
      : current.visibility === 'link'
        ? 'Anyone with the link can open it.'
        : 'Only you can open it.';
  const action = 'kys-seq-lib-action';

  return (
    <div className="kys-seq-lib-form" role="group" aria-label={`Sharing ${current.name}`}>
      <span>
        <strong>{soundStateLabel(current)}.</strong> {says}{' '}
        {shared && address && !current.unlisted && (
          <Link href={address} className="underline">
            Its page
          </Link>
        )}
      </span>
      {!current.unlisted && current.visibility === 'private' && (
        <button
          type="button"
          className={action}
          disabled={busy}
          onClick={() =>
            void run('link', 'share it', 'Shared. Anyone with the link can open it now.')
          }
        >
          Share with a link
        </button>
      )}
      {!current.unlisted && shared && (
        <button type="button" className={action} disabled={busy} onClick={() => void copyLink()}>
          Copy link
        </button>
      )}
      {!current.unlisted && current.visibility !== 'published' && (
        <button
          type="button"
          className={action}
          disabled={busy}
          aria-expanded={publishing}
          onClick={() => setPublishing(!publishing)}
        >
          Publish…
        </button>
      )}
      {!current.unlisted && current.visibility === 'published' && (
        <button
          type="button"
          className={action}
          disabled={busy}
          onClick={() => void run('link', 'unpublish it', 'Unpublished. The link still works.')}
        >
          Unpublish
        </button>
      )}
      {shared && (
        <button
          type="button"
          className={`${action} is-quiet`}
          disabled={busy}
          onClick={() => void run('private', 'stop sharing it', 'Only you can open it now.')}
        >
          Stop sharing
        </button>
      )}
      {publishing && !current.unlisted && current.visibility !== 'published' && (
        <PublishStep
          name={current.name}
          backHref={backHref}
          busy={busy}
          onPublish={async () => {
            if (
              await run('published', 'publish it', 'Published. It is on Explore and your profile.')
            )
              setPublishing(false);
          }}
        />
      )}
      {status && (
        <p className="kys-seq-lib-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}

/** Who it will appear as, and the tick. Reads the profile when it opens: only an answer of `null` means no username. */
function PublishStep({
  name,
  backHref,
  busy,
  onPublish,
}: {
  name: string;
  backHref: string;
  busy: boolean;
  onPublish: () => Promise<void>;
}) {
  const tickId = useId();
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [unreadable, setUnreadable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ticked, setTicked] = useState(false);

  useEffect(() => {
    setUsername(undefined);
    setUnreadable(false);
    let live = true;
    apiClient
      .get<unknown>('/api/v1/me/profile')
      .then((raw) => {
        if (!live) return;
        const parsed = ProfileAnswerSchema.safeParse(raw);
        if (parsed.success) setUsername(parsed.data?.username ?? null);
        else setUnreadable(true);
      })
      .catch(() => {
        if (live) setUnreadable(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  if (unreadable)
    return (
      <span>
        Your profile could not be read.{' '}
        <button
          type="button"
          className="kys-seq-lib-action"
          onClick={() => setAttempt(attempt + 1)}
        >
          Try again
        </button>
      </span>
    );
  if (username === undefined) return <span>Reading your profile…</span>;
  if (username === null)
    return (
      <span>
        Published patterns are listed under a username, and you haven&apos;t chosen one yet.{' '}
        <Link href={chooseUsernameHref(backHref)} className="kys-seq-lib-action">
          Choose a username
        </Link>
      </span>
    );
  return (
    <>
      <span>
        {name} will be listed on Explore and your profile, by @{username}, for anyone to play and
        copy.
      </span>
      <label htmlFor={tickId} className="flex items-center gap-1.5">
        <input
          id={tickId}
          type="checkbox"
          checked={ticked}
          onChange={(e) => setTicked(e.target.checked)}
        />
        I made this pattern, or the one it came from is credited on it
      </label>
      <button
        type="button"
        className="kys-seq-lib-action"
        disabled={busy || !ticked}
        onClick={() => void onPublish()}
      >
        Publish
      </button>
    </>
  );
}
