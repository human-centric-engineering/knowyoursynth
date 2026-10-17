'use client';

import Link from 'next/link';
import { useState } from 'react';
import { z } from 'zod';

import { Byline } from '@/components/app/sharing/byline';
import { ReportButton } from '@/components/app/sharing/report-button';
import { APIClientError } from '@/lib/api/client';
import { sharedSoundHref } from '@/components/app/synth/routes';
import type { PublicSound } from '@/lib/app/sounds/data';

/**
 * What a shared sound's page says about the sound (`f-sharing` h2): its name, byline, credits, notes and tags, above the
 * synth's panel, with what the visitor can do with it.
 *
 * - **Signed out:** sign in to save a copy.
 * - **Signed in, someone else's:** Save a copy (`POST /api/v1/sounds` with `source: { shared }`), which credits it;
 *   once saved it is not offered again, so a second click is not a second copy.
 *   The parent saves the panel as it is, so a copy keeps whatever the visitor changed before saving it. If the original
 *   has stopped being shared since the page opened, it saves the panel alone as a new sound, without the original's
 *   name or notes (t-52), and the strip says so.
 * - **Their own:** open it as one of theirs instead, where Save writes to it.
 * - **Report** (h4), for a signed-in visitor whose sound it is not: never on their own, and not signed out.
 *
 * Who it belongs to is the visitor's own sounds list's answer (it carries each sound's address): the public read never
 * says, so it cannot leak whose a sound is. Until that list arrives, no action is offered.
 */

/** A validation refusal's details, as far as this reads them. */
const ProblemsSchema = z.object({ errors: z.array(z.object({ path: z.string() })) });

/** What Save a copy came to: saved, with a word to say when it was not the credited copy asked for; or not. */
export type SharedCopyResult = { ok: true; note: string | null } | { ok: false; error: string };

/**
 * Whether a copy was refused because the sound is not shared any more (made private, deleted, or its owner erased):
 * the copy route's one 400 on `source.shared` (`sharedCopySource` in `lib/app/sounds/store.ts`).
 */
export function sharedSourceGone(err: unknown): boolean {
  if (!(err instanceof APIClientError) || err.status !== 400) return false;
  const details = ProblemsSchema.safeParse(err.details);
  return details.success && details.data.errors.some((e) => e.path === 'source.shared');
}

/**
 * Who is looking: `guest` signed out; `pending` signed in, whose it is not known yet; `owner` it is theirs; `other` it
 * is someone else's.
 */
export type SharedViewer = 'guest' | 'pending' | 'owner' | 'other';

/**
 * Who is looking at a shared sound. Theirs when their own list has a sound at its address; until the session and that
 * list are both known, `pending`, so Save a copy is never offered on a sound that turns out to be theirs.
 */
export function sharedViewerOf({
  slug,
  authPending,
  signedIn,
  mine,
}: {
  slug: string;
  authPending: boolean;
  signedIn: boolean;
  /** The visitor's own sounds on this synth, or null until read. */
  mine: { slug: string | null }[] | null;
}): SharedViewer {
  if (authPending) return 'pending';
  if (!signedIn) return 'guest';
  if (!mine) return 'pending';
  return mine.some((s) => s.slug === slug) ? 'owner' : 'other';
}

export function SharedSoundStrip({
  sound,
  loaded,
  onLoad,
  viewer,
  signInHref,
  onCopy,
  onOpen,
  buttonClass,
}: {
  sound: PublicSound;
  /** Whether the shared sound is what is on the panel (the visitor may have opened another since). */
  loaded: boolean;
  onLoad: () => void;
  viewer: SharedViewer;
  signInHref: string;
  /** Save a copy. */
  onCopy: () => Promise<SharedCopyResult>;
  /** Open it as one of the owner's own. */
  onOpen: () => void;
  buttonClass: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ note: string | null } | null>(null);
  const copy = async () => {
    setBusy(true);
    setError(null);
    const result = await onCopy();
    if (result.ok) setCopied({ note: result.note });
    else setError(result.error);
    setBusy(false);
  };

  return (
    <section
      aria-label="Shared sound"
      className="mb-3 rounded-2xl border border-(--kys-line) bg-(--kys-surface) px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="kys-label text-(--kys-accent)">
            {sound.visibility === 'published' ? 'Published sound' : 'Shared sound'}
          </p>
          <h2 className="text-[19px] font-semibold break-words">{sound.name}</h2>
          <p className="text-sm text-(--kys-muted)">
            {sound.author ? (
              <>
                by <Byline author={sound.author} authorProfile={sound.authorProfile} />
              </>
            ) : (
              'Shared by its maker'
            )}
            {sound.basedOn && (
              <>
                {' · from '}
                <Link
                  href={sharedSoundHref(sound.basedOn.synthId, sound.basedOn.slug)}
                  className="hover:text-(--kys-accent)"
                >
                  {sound.basedOn.name}
                </Link>{' '}
                by @{sound.basedOn.username}
              </>
            )}
            {sound.source && <> · {sound.source.ref}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {!loaded && (
            <button type="button" onClick={onLoad} className={buttonClass}>
              Load it again
            </button>
          )}
          {viewer === 'guest' && (
            <Link href={signInHref} className={buttonClass}>
              Sign in to save a copy
            </Link>
          )}
          {viewer === 'other' && !copied && (
            <button
              type="button"
              onClick={() => void copy()}
              disabled={busy}
              className={buttonClass}
            >
              {busy ? 'Saving…' : 'Save a copy'}
            </button>
          )}
          {viewer === 'other' && (
            <ReportButton slug={sound.slug} soundName={sound.name} buttonClass={buttonClass} />
          )}
          {viewer === 'owner' && (
            <>
              <span className="text-(--kys-muted)">This is one of your sounds.</span>
              <button type="button" onClick={onOpen} className={buttonClass}>
                Open it to edit
              </button>
            </>
          )}
        </div>
      </div>
      {sound.notes && (
        <p className="mt-2 max-w-[80ch] text-[15px] break-words whitespace-pre-line">
          {sound.notes}
        </p>
      )}
      {sound.tags.length > 0 && (
        <ul
          className="mt-2 flex flex-wrap gap-1.5 text-[12px] text-(--kys-muted)"
          aria-label="Tags"
        >
          {sound.tags.map((t) => (
            <li key={t} className="rounded border border-(--kys-line) px-1.5">
              {t}
            </li>
          ))}
        </ul>
      )}
      {copied && (
        <p role="status" className="mt-2 text-sm text-(--kys-good)">
          {copied.note ?? 'Saved a copy to My sounds.'} It is open on the panel.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-(--kys-warn)">
          {error}
        </p>
      )}
    </section>
  );
}
