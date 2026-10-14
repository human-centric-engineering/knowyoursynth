'use client';

/**
 * Suggest a synth (`f-databank` t-37): on the databank's Instruments tab, for someone whose synth is not listed.
 *
 * Signed in only, as `POST /api/v1/bank/suggestions` is: a visitor without a session is offered sign-in, back to this
 * tab. Checked here with the route's own schema, so most mistakes show before anything is sent. Once sent it says so,
 * and offers another.
 */

import { useState } from 'react';
import Link from 'next/link';

import { FieldHelp } from '@/components/ui/field-help';
import { APIClientError, apiClient } from '@/lib/api/client';
import { useSession } from '@/lib/auth/client';
import { SuggestionInputSchema, type SuggestionInput } from '@/lib/app/bank/suggestion-data';

type Draft = Record<keyof SuggestionInput, string>;
const EMPTY: Draft = { name: '', maker: '', link: '', note: '' };

/** Where sign-in brings the visitor back to. */
const HERE = '/bank/instruments';

const inputClass =
  'w-full rounded-md border border-(--kys-line) bg-transparent px-2.5 py-1.5 text-sm text-(--kys-text) focus:border-(--kys-muted) focus:outline-none';

export function SuggestForm() {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [problems, setProblems] = useState<Partial<Record<keyof Draft, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  if (isPending) return null;

  if (!session)
    return (
      <p className="mt-6 text-sm text-(--kys-muted)">
        Is your synth missing?{' '}
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(HERE)}`}
          className="text-(--kys-accent) underline"
        >
          Sign in to suggest it
        </Link>
        .
      </p>
    );

  if (sent)
    return (
      <div className="mt-6 text-sm" role="status">
        <p className="text-(--kys-text)">
          Thanks: {sent} is with the people who look after the databank.
        </p>
        <button
          type="button"
          className="mt-2 text-(--kys-accent) underline"
          onClick={() => {
            setSent(null);
            setDraft(EMPTY);
            setOpen(true);
          }}
        >
          Suggest another
        </button>
      </div>
    );

  if (!open)
    return (
      <p className="mt-6 text-sm text-(--kys-muted)">
        Is your synth missing?{' '}
        <button
          type="button"
          className="text-(--kys-accent) underline"
          onClick={() => setOpen(true)}
        >
          Suggest a synth
        </button>
      </p>
    );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(null);
    // Empty optional fields are left out rather than sent as empty text.
    const parsed = SuggestionInputSchema.safeParse({
      name: draft.name,
      maker: draft.maker,
      link: draft.link.trim() || undefined,
      note: draft.note.trim() || undefined,
    });
    if (!parsed.success) {
      const next: Partial<Record<keyof Draft, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && key in EMPTY && !next[key as keyof Draft])
          next[key as keyof Draft] = issue.message;
      }
      setProblems(next);
      return;
    }
    setProblems({});
    setSending(true);
    try {
      await apiClient.post('/api/v1/bank/suggestions', { body: parsed.data });
      setSent(parsed.data.name);
      setOpen(false);
    } catch (err) {
      setFailure(
        err instanceof APIClientError && err.status === 429
          ? 'You have sent a lot of suggestions in the last hour. Try again later.'
          : 'Your suggestion could not be sent. Try again.'
      );
    } finally {
      setSending(false);
    }
  }

  const field = (key: keyof Draft) => ({
    id: `suggest-${key}`,
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((prev) => ({ ...prev, [key]: e.target.value })),
    'aria-invalid': problems[key] ? true : undefined,
    'aria-describedby': problems[key] ? `suggest-${key}-problem` : undefined,
    className: inputClass,
  });

  const problem = (key: keyof Draft) =>
    problems[key] ? (
      <p id={`suggest-${key}-problem`} role="alert" className="text-xs text-red-400">
        {problems[key]}
      </p>
    ) : null;

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby="suggest-heading"
      className="mt-6 max-w-md space-y-3 rounded-md border border-(--kys-line) p-4"
    >
      <h3 id="suggest-heading" className="kys-label text-(--kys-muted)">
        Suggest a synth
      </h3>
      <div className="space-y-1">
        <label htmlFor="suggest-name" className="text-sm text-(--kys-text)">
          Name
        </label>
        <input {...field('name')} />
        {problem('name')}
      </div>
      <div className="space-y-1">
        <label htmlFor="suggest-maker" className="text-sm text-(--kys-text)">
          Company{' '}
          <FieldHelp title="Company">
            <p>The company that made it, such as Sequential, Korg or Behringer.</p>
          </FieldHelp>
        </label>
        <input {...field('maker')} />
        {problem('maker')}
      </div>
      <div className="space-y-1">
        <label htmlFor="suggest-link" className="text-sm text-(--kys-text)">
          Link <span className="text-(--kys-muted)">(optional)</span>{' '}
          <FieldHelp title="Link">
            <p>
              A page about it, such as the maker&apos;s product page or a review, starting with
              https://. It helps us check the details.
            </p>
          </FieldHelp>
        </label>
        <input {...field('link')} type="url" inputMode="url" />
        {problem('link')}
      </div>
      <div className="space-y-1">
        <label htmlFor="suggest-note" className="text-sm text-(--kys-text)">
          Anything else <span className="text-(--kys-muted)">(optional)</span>{' '}
          <FieldHelp title="Anything else">
            <p>
              The year, what kind of synth it is, or which records it is on. Up to 1,000 characters.
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
