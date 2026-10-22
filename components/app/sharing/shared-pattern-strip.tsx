'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { Byline } from '@/components/app/sharing/byline';
import { ReportButton } from '@/components/app/sharing/report-button';
import type { SharedCopyResult, SharedViewer } from '@/components/app/sharing/shared-sound-strip';
import { patternHref, sharedPatternHref } from '@/components/app/synth/routes';
import type { PublicPattern } from '@/lib/app/patterns/data';

/**
 * What a shared pattern's page says about the pattern (`f-step-sequencer` t-83): its name, byline and credit, above the
 * synth's panel, with what the visitor can do with it. The pattern itself is in the sequencer, open under the panel.
 *
 * - **Play it on** another synth: that synth's page with the same pattern (`/synths/<id>/p/<slug>`). A pattern plays on
 *   any synth; its page starts on the one it was made on.
 * - **Signed out:** sign in to save a copy. **Someone else's:** Save a copy, which credits it, and Report. **Their
 *   own:** open it from My patterns, where Save writes to it.
 * - **Load it again**, once something else is in the sequencer.
 *
 * Who it belongs to is the visitor's own patterns list's answer (it carries each pattern's address), as a shared
 * sound's is: the public read never says. Until that list arrives, no action is offered.
 */
export function SharedPatternStrip({
  pattern,
  synthId,
  synths,
  held,
  onLoad,
  viewer,
  signInHref,
  onCopy,
  onOpen,
  buttonClass,
}: {
  pattern: PublicPattern;
  /** The synth on this page. */
  synthId: string;
  synths: readonly { id: string; name: string }[];
  /** Whether the shared pattern is what the sequencer holds (the visitor may have opened another since). */
  held: boolean;
  onLoad: () => void;
  viewer: SharedViewer;
  signInHref: string;
  onCopy: () => Promise<SharedCopyResult>;
  /** Open it as one of the owner's own. */
  onOpen: () => void;
  buttonClass: string;
}) {
  const router = useRouter();
  const pickId = useId();
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
  const madeOn = synths.find((s) => s.id === pattern.synthId)?.name;
  const shape = `${pattern.steps} steps${pattern.parts > 1 ? ', A and B' : ''}`;

  return (
    <section
      aria-label="Shared pattern"
      className="mb-3 rounded-2xl border border-(--kys-line) bg-(--kys-surface) px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="kys-label text-(--kys-accent)">
            {pattern.visibility === 'published' ? 'Published pattern' : 'Shared pattern'}
          </p>
          <h2 className="text-[19px] font-semibold break-words">{pattern.name}</h2>
          <p className="text-sm text-(--kys-muted)">
            {pattern.author ? (
              <>
                by <Byline author={pattern.author} authorProfile={pattern.authorProfile} />
              </>
            ) : (
              'Shared by its maker'
            )}
            {pattern.basedOn && (
              <>
                {' · from '}
                <Link
                  href={patternHref(pattern.basedOn.slug)}
                  className="hover:text-(--kys-accent)"
                >
                  {pattern.basedOn.name}
                </Link>{' '}
                by @{pattern.basedOn.username}
              </>
            )}
            {pattern.pattern && <> · {shape}</>}
            {madeOn && <> · made on the {madeOn}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor={pickId} className="text-(--kys-muted)">
            Play it on
          </label>
          <select
            id={pickId}
            value={synthId}
            onChange={(e) => router.push(sharedPatternHref(e.target.value, pattern.slug))}
            className="h-8 rounded-md border border-(--kys-line) bg-(--kys-surface) px-2 text-sm text-(--kys-text)"
          >
            {synths.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {pattern.pattern && !held && (
            <button type="button" onClick={onLoad} className={buttonClass}>
              Load it again
            </button>
          )}
          {viewer === 'guest' && (
            <Link href={signInHref} className={buttonClass}>
              Sign in to save a copy
            </Link>
          )}
          {viewer === 'other' && !copied && held && (
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
            <ReportButton
              slug={pattern.slug}
              soundName={pattern.name}
              buttonClass={buttonClass}
              kind="pattern"
            />
          )}
          {viewer === 'owner' && (
            <>
              <span className="text-(--kys-muted)">This is one of your patterns.</span>
              <button type="button" onClick={onOpen} className={buttonClass}>
                Open it to edit
              </button>
            </>
          )}
        </div>
      </div>
      {!pattern.pattern && (
        <p role="status" className="mt-2 text-sm text-(--kys-warn)">
          This pattern was saved in a shape the sequencer can&apos;t read any more, so it can&apos;t
          be played.
        </p>
      )}
      {copied && (
        <p role="status" className="mt-2 text-sm text-(--kys-good)">
          {copied.note ?? 'Saved a copy to My patterns.'} It is open in the sequencer.
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
