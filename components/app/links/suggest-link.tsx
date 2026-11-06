'use client';

/**
 * SuggestLink — a signed-in user says a video or link belongs here (`f-link-suggestions` t-186). Spec:
 * `.context/app/links.md` (Suggestions).
 *
 * It sits in each place links are shown: the section under the panel and on `/bank` (`LinksSection`), a library
 * patch's lesson and a History → Heard on row (`LinksToggle`), including where there are none yet. It sends
 * `POST /api/v1/links/suggestions`, checked here first with the route's own schema. A visitor without a session is
 * offered sign-in, back to this page, as Suggest a synth does. Once sent it says so, and offers another.
 *
 * A synth's videos belong to its databank instruments, so under a panel modelling more than one the form asks which.
 */

import { useId, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

import { KIND_LABEL } from '@/components/app/links/data';
import { FieldHelp } from '@/components/ui/field-help';
import { APIClientError, apiClient } from '@/lib/api/client';
import { useSession } from '@/lib/auth/client';
import { LINK_KINDS } from '@/lib/app/links/providers';
import { LinkSuggestionInputSchema } from '@/lib/app/links/suggestion-data';
// Type only: `owner.ts` holds the database client.
import type { OwnerKind } from '@/lib/app/links/owner';

/** What a suggestion can be about, and what the form calls it. */
export interface SuggestTarget {
  kind: OwnerKind;
  id: string;
  name: string;
}

export interface SuggestLinkProps {
  /** What it can be about: one, or (under a panel modelling several instruments) a choice. None draws nothing. */
  targets: readonly SuggestTarget[];
  /** Told when the form opens and closes, for a container that makes room for it. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const FIELDS = ['target', 'url', 'kind', 'title', 'note'] as const;
type Field = (typeof FIELDS)[number];
type Draft = Record<Field, string>;

/**
 * This page's address with its query (a synth page's `?sound=`), for sign-in to come back to. Read from the browser
 * after hydration; the server, and the first render, have none and link to plain sign-in.
 */
const noSubscription = () => () => {};
const useHere = (): string | null =>
  useSyncExternalStore(
    noSubscription,
    () => `${window.location.pathname}${window.location.search}`,
    () => null
  );

const inputClass =
  'w-full rounded-md border border-(--kys-line) bg-transparent px-2.5 py-1.5 text-sm text-(--kys-text) focus:border-(--kys-muted) focus:outline-none';

/** What a refusal says, by status: the server's own words where they are the user's to act on. */
function refusalOf(err: unknown): { field?: Field; message: string } {
  if (!(err instanceof APIClientError))
    return { message: 'Your suggestion could not be sent. Try again.' };
  if (err.status === 429)
    return { message: 'You have sent a lot of suggestions in the last hour. Try again later.' };
  // "That link is already listed here", "That link has already been suggested here".
  if (err.status === 409) return { field: 'url', message: err.message };
  if (err.status === 404) return { message: 'This is no longer here to suggest a link for.' };
  // A URL the parser refuses names the field, with the parser's reason.
  if (err.status === 400) return { field: 'url', message: err.message };
  return { message: 'Your suggestion could not be sent. Try again.' };
}

export function SuggestLink(props: SuggestLinkProps) {
  const [first, ...rest] = props.targets;
  // Nothing to suggest for asks nothing of the session: a Heard on list draws one per row.
  return first ? <Suggest {...props} first={first} several={rest.length > 0} /> : null;
}

function Suggest({
  targets,
  first,
  several,
  onOpenChange,
  className = '',
}: SuggestLinkProps & { first: SuggestTarget; several: boolean }) {
  const { data: session, isPending } = useSession();
  const here = useHere();
  const uid = useId();
  const empty = (): Draft => ({
    target: `${first.kind}:${first.id}`,
    url: '',
    kind: 'demo',
    title: '',
    note: '',
  });
  const [open, setOpenState] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);
  const [problems, setProblems] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (isPending) return null;

  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  if (!session)
    return (
      <p className={`text-sm text-(--kys-muted) ${className}`}>
        Know a good video?{' '}
        <Link
          href={here ? `/login?callbackUrl=${encodeURIComponent(here)}` : '/login'}
          className="text-(--kys-accent) underline"
        >
          Sign in to suggest a link
        </Link>
      </p>
    );

  if (sent)
    return (
      <div className={`text-sm ${className}`} role="status">
        <p className="text-(--kys-text)">
          Thanks: your link is with the people who look after the videos.
        </p>
        <button
          type="button"
          className="mt-1 text-(--kys-accent) underline"
          onClick={() => {
            setSent(false);
            setDraft(empty());
            setOpen(true);
          }}
        >
          Suggest another
        </button>
      </div>
    );

  if (!open)
    return (
      <p className={`text-sm text-(--kys-muted) ${className}`}>
        Know a good video?{' '}
        <button
          type="button"
          className="text-(--kys-accent) underline"
          onClick={() => setOpen(true)}
        >
          Suggest a link
        </button>
      </p>
    );

  const target = targets.find((t) => `${t.kind}:${t.id}` === draft.target) ?? first;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(null);
    // Empty optional fields are left out rather than sent as empty text.
    const parsed = LinkSuggestionInputSchema.safeParse({
      target: { kind: target.kind, id: target.id },
      url: draft.url,
      kind: draft.kind,
      title: draft.title.trim() || undefined,
      note: draft.note.trim() || undefined,
    });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = FIELDS.find((f) => f === issue.path[0]);
        if (field && !next[field]) next[field] = issue.message;
      }
      setProblems(next);
      return;
    }
    setProblems({});
    setSending(true);
    try {
      await apiClient.post('/api/v1/links/suggestions', { body: parsed.data });
      setSent(true);
      setOpen(false);
    } catch (err) {
      const refusal = refusalOf(err);
      if (refusal.field) setProblems({ [refusal.field]: refusal.message });
      else setFailure(refusal.message);
    } finally {
      setSending(false);
    }
  }

  const id = (key: Field) => `${uid}-${key}`;
  const field = (key: Field) => ({
    id: id(key),
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setDraft((prev) => ({ ...prev, [key]: e.target.value })),
    'aria-invalid': problems[key] ? true : undefined,
    'aria-describedby': problems[key] ? `${id(key)}-problem` : undefined,
    className: inputClass,
  });
  const problem = (key: Field) =>
    problems[key] ? (
      <p id={`${id(key)}-problem`} role="alert" className="text-xs text-red-400">
        {problems[key]}
      </p>
    ) : null;

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby={`${uid}-heading`}
      className={`max-w-md space-y-3 rounded-md border border-(--kys-line) p-4 ${className}`}
    >
      <h3 id={`${uid}-heading`} className="kys-label text-(--kys-muted)">
        Suggest a link{several ? '' : ` for ${first.name}`}
      </h3>
      {several && (
        <div className="space-y-1">
          <label htmlFor={id('target')} className="text-sm text-(--kys-text)">
            About{' '}
            <FieldHelp title="What it is about">
              <p>
                This synth models more than one instrument. A video goes with the one it shows, and
                is listed under every panel that models it.
              </p>
            </FieldHelp>
          </label>
          <select {...field('target')}>
            {targets.map((t) => (
              <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
                {t.name}
              </option>
            ))}
          </select>
          {problem('target')}
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor={id('url')} className="text-sm text-(--kys-text)">
          Address{' '}
          <FieldHelp title="The address">
            <p>
              A YouTube, Vimeo, Spotify, SoundCloud or Bandcamp page for one video, track or album,
              or any other page starting with https://.
            </p>
          </FieldHelp>
        </label>
        <input
          {...field('url')}
          type="url"
          inputMode="url"
          spellCheck={false}
          autoComplete="off"
          placeholder="https://www.youtube.com/watch?v=…"
        />
        {problem('url')}
      </div>
      <div className="space-y-1">
        <label htmlFor={id('kind')} className="text-sm text-(--kys-text)">
          Kind{' '}
          <FieldHelp title="Kind">
            <p>
              <strong>Demo</strong>: it played, to show it off. <strong>Review</strong>.{' '}
              <strong>Recording</strong>: music made with it. <strong>Lesson</strong>: how to use
              it, or how a sound is made. <strong>Original</strong>: the record a sound is inspired
              by.
            </p>
          </FieldHelp>
        </label>
        <select {...field('kind')}>
          {LINK_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        {problem('kind')}
      </div>
      <div className="space-y-1">
        <label htmlFor={id('title')} className="text-sm text-(--kys-text)">
          Title <span className="text-(--kys-muted)">(optional)</span>{' '}
          <FieldHelp title="Title">
            <p>
              What it is, if its own title doesn&apos;t say. Left empty, we use the title its site
              gives it.
            </p>
          </FieldHelp>
        </label>
        <input {...field('title')} />
        {problem('title')}
      </div>
      <div className="space-y-1">
        <label htmlFor={id('note')} className="text-sm text-(--kys-text)">
          Anything else <span className="text-(--kys-muted)">(optional)</span>{' '}
          <FieldHelp title="Anything else">
            <p>
              Why it belongs here, for whoever checks it: which part to watch, or who is playing.
              Not shown on the page. Up to 1,000 characters.
            </p>
          </FieldHelp>
        </label>
        <textarea {...field('note')} rows={3} />
        {problem('note')}
      </div>
      {failure && (
        <p role="alert" className="text-sm text-red-400">
          {failure}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={sending}
          className="rounded-md border border-(--kys-accent)/60 px-3 py-1 text-sm text-(--kys-accent) hover:bg-(--kys-accent) hover:text-(--kys-accent-ink) disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send suggestion'}
        </button>
        <button
          type="button"
          className="text-sm text-(--kys-muted)"
          onClick={() => setOpen(false)}
          disabled={sending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
