'use client';

/**
 * Who can open one of the user's own sounds, on the synth page (`f-sharing` h3): **Share with a link**, then **Copy
 * link** and **Stop sharing**; **Publish…**, a dialog with the "I made this" tick and up to three of the synth's library
 * tags; and **Unpublish**, which goes back to a link share. Sharing and unpublishing are `PATCH /api/v1/sounds/:id`
 * with `visibility`; publishing is `POST /api/v1/sounds/:id/publish`, whose refusals stay in the dialog in the server's
 * words (`.context/app/sharing.md`, "Publishing").
 *
 * What is shared is the sound as last saved, notes and lesson included: the notes were written when only their owner
 * could read them, so both say so.
 *
 * An unlisted sound (h4: moderators took it down after a report) says so and offers only Stop sharing: the server
 * refuses sharing or publishing it again (`UNLISTED`) until an admin restores it.
 *
 * With no username yet, the dialog's first step sends them to choose one in settings, with the way back to this sound
 * (`chooseUsernameHref`). The panel goes with them in browser storage, as it does for sign-in.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldHelp } from '@/components/ui/field-help';
import { APIClientError, apiClient } from '@/lib/api/client';
import { chooseUsernameHref, sharedSoundHref } from '@/components/app/synth/routes';
import { MAX_SOUND_TAGS } from '@/lib/app/sounds/data';
import type { UserSoundDetail, UserSoundSummary } from '@/lib/app/sounds/data';
import { ProfileViewSchema } from '@/lib/app/profile/profile-data';

const soundPath = (id: string) => `/api/v1/sounds/${encodeURIComponent(id)}`;

/**
 * What went wrong, in the server's words where it gave any. Not My sounds' helper: a 429 here is the publish limit,
 * whose words (how many, and when to try again) are the ones to show.
 */
function failureOf(err: unknown, doing: string): string {
  if (err instanceof APIClientError) {
    if (err.status === 401) return `Your session has ended. Sign in again to ${doing}.`;
    if (err.status === 404) return 'That sound is no longer in your account.';
    return err.message;
  }
  return `Could not ${doing}. Check your connection and try again.`;
}

export interface SoundSharingProps {
  /** The user's sound on the panel. */
  sound: UserSoundSummary;
  /** The tags that synth's library sounds use: what a published sound may be tagged with. */
  libraryTags: string[];
  /** The synth page, for coming back from settings to the panel as it was. */
  backHref: string;
  /** The API's answer after each change. */
  onChanged: (sound: UserSoundDetail) => void;
  buttonClass: string;
}

export function SoundSharing({
  sound,
  libraryTags,
  backHref,
  onChanged,
  buttonClass,
}: SoundSharingProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Another sound on the panel: what was said about the last one is over, and an answer about it that arrives later
  // is not this one's to show (`current`). The list still takes it.
  const current = useRef(sound.id);
  useEffect(() => {
    current.current = sound.id;
    setBusy(false);
    setFailure(null);
    setStatus(null);
    setPublishing(false);
  }, [sound.id]);

  const change = async (visibility: 'private' | 'link', done: string, doing: string) => {
    const id = sound.id;
    setBusy(true);
    setFailure(null);
    setStatus(null);
    try {
      onChanged(await apiClient.patch<UserSoundDetail>(soundPath(id), { body: { visibility } }));
      if (current.current === id) setStatus(done);
    } catch (err) {
      if (current.current === id) setFailure(failureOf(err, doing));
    } finally {
      if (current.current === id) setBusy(false);
    }
  };

  const path =
    sound.visibility !== 'private' && sound.slug
      ? sharedSoundHref(sound.synthId, sound.slug)
      : null;

  const copyLink = async () => {
    if (!path) return;
    setFailure(null);
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setStatus('Link copied.');
    } catch {
      setStatus(null);
      setFailure('Copying was blocked. Open the link and copy it from the address bar.');
    }
  };

  const shareButton = (
    <button
      type="button"
      disabled={busy}
      onClick={() => void change('link', 'Shared. Anyone with the link can open it.', 'share it')}
      className={buttonClass}
    >
      Share with a link
    </button>
  );
  const publishButton = (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setStatus(null);
        setFailure(null);
        setPublishing(true);
      }}
      className={buttonClass}
    >
      Publish…
    </button>
  );
  const stopButton = (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        void change('private', 'Stopped sharing. Only you can open it.', 'stop sharing it')
      }
      className={buttonClass}
    >
      Stop sharing
    </button>
  );

  if (sound.unlisted)
    return (
      <section aria-label="Sharing" className="flex w-full flex-col items-start gap-1.5 text-sm">
        <p className="text-(--kys-warn)">
          Unlisted by moderators after a report: nobody else can open it, and it can&apos;t be
          shared again for now.
        </p>
        {sound.visibility !== 'private' && <div className="flex gap-2">{stopButton}</div>}
        {failure && (
          <p role="alert" className="text-(--kys-warn)">
            {failure}
          </p>
        )}
        {status && (
          <p role="status" className="text-(--kys-good)">
            {status}
          </p>
        )}
      </section>
    );

  return (
    <section aria-label="Sharing" className="flex w-full flex-col items-start gap-1.5 text-sm">
      <p className="text-(--kys-muted)">
        {sound.visibility === 'private' ? (
          'Private: only you can open it.'
        ) : sound.visibility === 'link' ? (
          <>
            Shared: anyone with{' '}
            {path && (
              <Link href={path} className="text-(--kys-accent) underline underline-offset-2">
                the link
              </Link>
            )}{' '}
            can open it, notes included.
          </>
        ) : (
          <>
            Published: listed on Explore and your profile, at{' '}
            {path && (
              <Link href={path} className="text-(--kys-accent) underline underline-offset-2">
                its page
              </Link>
            )}
            .
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {sound.visibility === 'private' ? (
          <>
            {shareButton}
            {publishButton}
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void copyLink()}
              className={buttonClass}
            >
              Copy link
            </button>
            {sound.visibility === 'link' ? (
              publishButton
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void change(
                    'link',
                    'Unpublished. The link still works, but it is not listed.',
                    'unpublish it'
                  )
                }
                className={buttonClass}
              >
                Unpublish
              </button>
            )}
            {stopButton}
          </>
        )}
      </div>
      {failure && (
        <p role="alert" className="text-(--kys-warn)">
          {failure}
        </p>
      )}
      {status && (
        <p role="status" className="text-(--kys-good)">
          {status}
        </p>
      )}
      {publishing && (
        <PublishDialog
          onClose={() => setPublishing(false)}
          sound={sound}
          libraryTags={libraryTags}
          backHref={backHref}
          onPublished={(d) => {
            onChanged(d);
            if (current.current !== d.id) return;
            setPublishing(false);
            setStatus('Published. It is on Explore and your profile.');
          }}
          onChanged={onChanged}
          buttonClass={buttonClass}
        />
      )}
    </section>
  );
}

// ── the publish dialog ──────────────────────────────────────────────────────

const ProfileAnswerSchema = ProfileViewSchema.pick({ username: true }).nullable();

interface PublishDialogProps {
  onClose: () => void;
  sound: UserSoundSummary;
  libraryTags: string[];
  backHref: string;
  onPublished: (sound: UserSoundDetail) => void;
  /** The sound changed without being published: its lesson was removed. */
  onChanged: (sound: UserSoundDetail) => void;
  buttonClass: string;
}

/**
 * Publish, in a dialog: who it will appear as, that the notes go with it, the tags, and the tick. A refusal leaves the
 * dialog open with the server's reason in it; `USERNAME_REQUIRED` turns it to the username step. `LESSON_NOT_ALLOWED`
 * (a blocked word in the lesson, which cannot be reworded) offers to remove the lesson, after which it can be published.
 *
 * Mounted only while open, so each opening starts afresh: unticked, with the tags the sound had that the library still
 * uses. The username is read when the dialog opens. Only an answer of `null` means there is none yet: a read that failed
 * says so and offers to try again, rather than sending someone who has one off to choose another.
 */
export function PublishDialog({
  onClose,
  sound,
  libraryTags,
  backHref,
  onPublished,
  onChanged,
  buttonClass,
}: PublishDialogProps) {
  // `undefined` while being read; `null` when there is none yet.
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [unreadable, setUnreadable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tags, setTags] = useState(() => sound.tags.filter((t) => libraryTags.includes(t)));
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The lesson is what was refused: the one thing to offer is publishing without it.
  const [lessonRefused, setLessonRefused] = useState(false);
  const [lessonRemoved, setLessonRemoved] = useState(false);

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

  const toggleTag = (t: string) =>
    setTags((on) => (on.includes(t) ? on.filter((x) => x !== t) : [...on, t]));

  const publish = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const d = await apiClient.post<UserSoundDetail>(`${soundPath(sound.id)}/publish`, {
        body: { confirm: true, tags },
      });
      onPublished(d);
    } catch (err) {
      if (err instanceof APIClientError && err.code === 'USERNAME_REQUIRED') setUsername(null);
      else {
        setLessonRefused(err instanceof APIClientError && err.code === 'LESSON_NOT_ALLOWED');
        setFailure(failureOf(err, 'publish it'));
      }
    } finally {
      setBusy(false);
    }
  };

  const removeLesson = async () => {
    setBusy(true);
    setFailure(null);
    try {
      onChanged(
        await apiClient.patch<UserSoundDetail>(soundPath(sound.id), { body: { lesson: null } })
      );
      setLessonRefused(false);
      setLessonRemoved(true);
    } catch (err) {
      setFailure(failureOf(err, 'remove the lesson'));
    } finally {
      setBusy(false);
    }
  };

  const needsName = !unreadable && username === null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(480px,calc(100vw-32px))] rounded-xl border-(--kys-line) bg-(--kys-raised) p-5 text-(--kys-text)">
        <DialogTitle className="text-base font-semibold">Publish {sound.name}</DialogTitle>
        {unreadable ? (
          <DialogDescription asChild>
            <p role="alert" className="text-sm text-(--kys-warn)">
              Your username could not be checked just now.{' '}
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="underline underline-offset-2"
              >
                Try again
              </button>
            </p>
          </DialogDescription>
        ) : username === undefined ? (
          <DialogDescription className="text-sm text-(--kys-faint)">Checking…</DialogDescription>
        ) : needsName ? (
          <>
            <DialogDescription className="text-sm text-(--kys-muted)">
              Published sounds go under your username, so choose one first. It does not have to be
              your real name, and your account name and email are never shown. You will come back to
              this sound afterwards.
            </DialogDescription>
            <DialogFooter>
              <button type="button" onClick={onClose} className={buttonClass}>
                Cancel
              </button>
              <Link href={chooseUsernameHref(backHref)} className={buttonClass}>
                Choose a username
              </Link>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ticked) void publish();
            }}
            className="space-y-4"
          >
            <DialogDescription className="text-sm text-(--kys-muted)">
              Anyone can find it on Explore and your profile, play it and save a copy, which credits
              you. It appears as <strong className="text-(--kys-text)">by @{username}</strong>, with
              its notes{sound.lesson ? ' and its lesson' : ''}. What is published is the sound as
              last saved. You can unpublish it whenever you like; copies people have saved stay
              theirs.
            </DialogDescription>
            {libraryTags.length > 0 && (
              <fieldset className="space-y-1.5">
                <legend className="flex items-center gap-1 text-sm">
                  Tags <span className="text-(--kys-muted)">(up to {MAX_SOUND_TAGS})</span>
                  <FieldHelp title="Tags">
                    <p>
                      How people find it on Explore. Chosen from the tags this synth&apos;s library
                      sounds use.
                    </p>
                  </FieldHelp>
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {libraryTags.map((t) => {
                    const on = tags.includes(t);
                    return (
                      <label
                        key={t}
                        className={`cursor-pointer rounded border px-2 py-0.5 text-[13px] ${on ? 'border-(--kys-accent) text-(--kys-text)' : 'border-(--kys-line) text-(--kys-muted)'} has-disabled:cursor-not-allowed has-disabled:opacity-50`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!on && tags.length >= MAX_SOUND_TAGS}
                          onChange={() => toggleTag(t)}
                          className="sr-only"
                        />
                        {t}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={ticked}
                onChange={(e) => setTicked(e.target.checked)}
                className="mt-1"
              />
              <span>I made this, or the sound it came from is credited on it.</span>
            </label>
            {failure && (
              <p role="alert" className="text-sm text-(--kys-warn)">
                {failure}
              </p>
            )}
            {lessonRefused && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-(--kys-muted)">
                <span>Removing it takes the lesson off this sound for good. The panel stays.</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeLesson()}
                  className={buttonClass}
                >
                  Remove the lesson
                </button>
              </div>
            )}
            {lessonRemoved && (
              <p role="status" className="text-sm text-(--kys-good)">
                The lesson is removed. Publish the sound without it.
              </p>
            )}
            <DialogFooter>
              <button type="button" onClick={onClose} className={buttonClass}>
                Cancel
              </button>
              <button type="submit" disabled={!ticked || busy} className={buttonClass}>
                {busy ? 'Publishing…' : 'Publish'}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
