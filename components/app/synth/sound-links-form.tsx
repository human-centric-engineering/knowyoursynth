'use client';

/**
 * SoundLinksForm — the videos and recordings on one of the user's own sounds (`f-link-suggestions` t-187), from My
 * patches: up to five addresses on YouTube, Vimeo, Spotify, Bandcamp or SoundCloud, each with an optional title, in the
 * order they show on the sound's page. Saving sends the whole list, `PATCH /api/v1/sounds/:id` with `links`; the server
 * reads each new one from its provider and says, per row, what it could not take.
 *
 * Opens under the buttons, as the name form does, so its ⓘ help is clickable.
 */

import { useState } from 'react';
import { z } from 'zod';

import { FieldHelp } from '@/components/ui/field-help';
import { APIClientError, apiClient } from '@/lib/api/client';
import {
  MAX_SOUND_LINKS,
  SoundLinkInputSchema,
  type UserSoundDetail,
  type UserSoundSummary,
} from '@/lib/app/sounds/data';

const soundPath = (id: string) => `/api/v1/sounds/${encodeURIComponent(id)}`;

const inputClass =
  'w-full rounded-md border border-(--kys-line) bg-(--kys-surface) px-2.5 py-1.5 text-sm text-(--kys-text) focus:border-(--kys-muted) focus:outline-none';

/** A validation refusal's details, as far as this reads them: `links.<row>.<field>`. */
const ProblemsSchema = z.object({
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
});

type Row = { url: string; title: string };
type RowProblems = Record<number, { url?: string; title?: string }>;

/** The server's refusals, by row, when it named them; else null. */
function rowProblemsOf(err: unknown): RowProblems | null {
  if (!(err instanceof APIClientError) || err.status !== 400) return null;
  const details = ProblemsSchema.safeParse(err.details);
  if (!details.success) return null;
  const out: RowProblems = {};
  for (const e of details.data.errors) {
    const m = /^links\.(\d+)\.(url|title)$/.exec(e.path);
    if (m) out[Number(m[1])] = { ...out[Number(m[1])], [m[2]]: e.message };
  }
  return Object.keys(out).length > 0 ? out : null;
}

function failureOf(err: unknown): string {
  if (err instanceof APIClientError) {
    if (err.status === 429) return 'That is a lot of link changes in an hour. Try again later.';
    if (err.status === 401) return 'Your session has ended. Sign in again to save the links.';
    if (err.status === 404) return 'That patch is no longer in your account.';
    return err.message;
  }
  return 'Could not save the links. Check your connection and try again.';
}

export interface SoundLinksFormProps {
  sound: UserSoundSummary;
  onSaved: (sound: UserSoundDetail) => void;
  onCancel: () => void;
  buttonClass: string;
}

export function SoundLinksForm({ sound, onSaved, onCancel, buttonClass }: SoundLinksFormProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    sound.links.map((l) => ({ url: l.url, title: l.title }))
  );
  const [problems, setProblems] = useState<RowProblems>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setRow = (i: number, change: Partial<Row>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...change } : r)));
    // what was said about the field being changed is over
    setProblems((ps) => {
      const field = 'url' in change ? 'url' : 'title';
      if (!ps[i]?.[field]) return ps;
      return { ...ps, [i]: { ...ps[i], [field]: undefined } };
    });
  };
  const removeRow = (i: number) => {
    setRows((rs) => rs.filter((_, j) => j !== i));
    setProblems({});
  };
  const move = (i: number, by: -1 | 1) => {
    setProblems({});
    setRows((rs) => {
      const next = [...rs];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const found: RowProblems = {};
    const links = rows.map((r, i) => {
      const parsed = SoundLinkInputSchema.safeParse({ url: r.url, title: r.title || undefined });
      if (!parsed.success)
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] === 'title' ? 'title' : 'url';
          found[i] = { ...found[i], [field]: found[i]?.[field] ?? issue.message };
        }
      return parsed.success ? parsed.data : null;
    });
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const d = await apiClient.patch<UserSoundDetail>(soundPath(sound.id), { body: { links } });
      onSaved(d);
    } catch (err) {
      const byRow = rowProblemsOf(err);
      if (byRow) setProblems(byRow);
      else setFailure(failureOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      method="post"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby="sound-links-h"
      className="w-full max-w-md space-y-3 rounded-lg border border-(--kys-line) bg-(--kys-ground) p-3 text-left"
    >
      <h3 id="sound-links-h" className="kys-label text-(--kys-muted)">
        Videos and recordings{' '}
        <FieldHelp title="Videos and recordings">
          <p>
            Your own demo of this patch, or a recording made with it: up to {MAX_SOUND_LINKS} links
            on YouTube, Vimeo, Spotify, Bandcamp or SoundCloud. They show, in this order, on the
            patch&apos;s page once you share it, where each plays when someone presses it. A copy
            someone saves of your patch does not take them.
          </p>
        </FieldHelp>
      </h3>
      {rows.length === 0 && <p className="text-sm text-(--kys-muted)">No links on it yet.</p>}
      {rows.map((r, i) => (
        <fieldset
          key={i}
          className="space-y-1.5 border-t border-(--kys-line) pt-2 first-of-type:border-t-0 first-of-type:pt-0"
        >
          <legend className="sr-only">Link {i + 1}</legend>
          <label htmlFor={`sound-link-url-${i}`} className="text-sm text-(--kys-text)">
            Address{' '}
            <FieldHelp title="Address">
              <p>
                Paste it as the site gives it, from the address bar or its Share button. Plain web
                pages can&apos;t be linked on a patch.
              </p>
            </FieldHelp>
          </label>
          <input
            id={`sound-link-url-${i}`}
            value={r.url}
            inputMode="url"
            maxLength={2000}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(e) => setRow(i, { url: e.target.value })}
            aria-invalid={!!problems[i]?.url}
            className={inputClass}
          />
          {problems[i]?.url && <p className="text-sm text-(--kys-warn)">{problems[i].url}</p>}
          <label htmlFor={`sound-link-title-${i}`} className="text-sm text-(--kys-text)">
            Title <span className="text-(--kys-muted)">(optional)</span>{' '}
            <FieldHelp title="Title">
              <p>
                What the card says. Left empty, the title the site gives it is used. On a published
                patch it is held to the same wording rules as the name. Up to 200 characters.
              </p>
            </FieldHelp>
          </label>
          <input
            id={`sound-link-title-${i}`}
            value={r.title}
            maxLength={200}
            onChange={(e) => setRow(i, { title: e.target.value })}
            aria-invalid={!!problems[i]?.title}
            className={inputClass}
          />
          {problems[i]?.title && <p className="text-sm text-(--kys-warn)">{problems[i].title}</p>}
          <div className="flex flex-wrap gap-2">
            {i > 0 && (
              <button type="button" onClick={() => move(i, -1)} className={buttonClass}>
                Move up
              </button>
            )}
            {i < rows.length - 1 && (
              <button type="button" onClick={() => move(i, 1)} className={buttonClass}>
                Move down
              </button>
            )}
            <button type="button" onClick={() => removeRow(i)} className={buttonClass}>
              Remove
            </button>
          </div>
        </fieldset>
      ))}
      {rows.length < MAX_SOUND_LINKS && (
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { url: '', title: '' }])}
          className={buttonClass}
        >
          Add a link
        </button>
      )}
      {failure && (
        <p role="alert" className="text-sm text-(--kys-warn)">
          {failure}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Saving…' : 'Save links'}
        </button>
      </div>
    </form>
  );
}
