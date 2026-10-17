'use client';

/**
 * The user's own sounds on the synth page (`f-my-sounds` s2): the list beside the library, and Save, Save as, Rename,
 * Delete and Save a copy over the panel. Every one goes through the sounds API (`/api/v1/sounds`, s1), which checks the
 * panel against the synth; this file only sends the panel and keeps the list in step with what each call returns.
 *
 * Signed out, the same buttons lead to sign-in and back to this synth. The panel survives the trip because the page
 * keeps it in browser storage (`storage.ts`) and writes it on the way out, so the return address is all this adds.
 *
 * The name form opens under the buttons rather than in a modal `<dialog>`: its ⓘ help opens in a popover outside the
 * dialog, which a modal dialog would leave behind it, unclickable.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { FieldHelp } from '@/components/ui/field-help';
import { APIClientError, apiClient } from '@/lib/api/client';
import { StarButton } from '@/components/app/synth/favourites';
import { sharedSoundHref, synthHref } from '@/components/app/synth/routes';
import { SoundSharing } from '@/components/app/sharing/sound-sharing';
import { VISIBILITY_LABELS } from '@/components/app/sharing/visibility';
import { NameSchema, NotesSchema } from '@/lib/app/sounds/data';
import type { UserSoundDetail, UserSoundSummary } from '@/lib/app/sounds/data';
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';

/** A panel as the API takes it. */
export interface PanelInput {
  values: ControlValues;
  cables: CablePair[];
}

const soundPath = (id: string) => `/api/v1/sounds/${encodeURIComponent(id)}`;

/** A detail as the list keeps it: without its panel. */
function summaryOf(d: UserSoundDetail): UserSoundSummary {
  const { panel: _panel, problems: _problems, fitted: _fitted, ...summary } = d;
  return summary;
}

/** What went wrong, in words the person can act on. */
function failureOf(err: unknown, doing: string, existing: boolean): string {
  if (err instanceof APIClientError) {
    if (err.status === 429) return `Too many changes at once. Wait a minute, then ${doing} again.`;
    if (err.status === 401) return `Your session has ended. Sign in again to ${doing}.`;
    // Only a request about a sound they have can say it has gone; a new one's 404 is the synth's, said as the API says it.
    if (err.status === 404 && existing) return 'That sound is no longer in your account.';
    return err.message;
  }
  return `Could not ${doing}. Check your connection and try again.`;
}

export interface MySounds {
  /** The user's sounds on this synth, most recently changed first; `null` while signed out or still loading. */
  sounds: UserSoundSummary[] | null;
  /** The list could not be read. */
  failed: boolean;
  /** Put a sound the API returned at the top of the list, replacing it if it was there. */
  put: (sound: UserSoundDetail) => void;
  remove: (id: string) => void;
}

/** The signed-in user's sounds on one synth: one list request, then kept in step with what each call returns. */
export function useMySounds(synthId: string, signedIn: boolean): MySounds {
  const [sounds, setSounds] = useState<UserSoundSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSounds(null);
    setFailed(false);
    if (!signedIn) return undefined;
    let live = true;
    apiClient
      .get<UserSoundSummary[]>('/api/v1/sounds', { params: { synthId } })
      // A sound saved or opened before the list arrived stays in it: the list may have been read before it existed.
      .then((list) => {
        if (live)
          setSounds((kept) =>
            kept ? [...kept, ...list.filter((s) => !kept.some((k) => k.id === s.id))] : list
          );
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [synthId, signedIn]);
  const put = useCallback(
    (d: UserSoundDetail) =>
      setSounds((list) => [summaryOf(d), ...(list ?? []).filter((s) => s.id !== d.id)]),
    []
  );
  const remove = useCallback(
    (id: string) => setSounds((list) => list && list.filter((s) => s.id !== id)),
    []
  );
  return { sounds, failed, put, remove };
}

// ── the list ────────────────────────────────────────────────────────────────

export interface MySoundsListProps {
  /** `null` while the session is still being read. */
  signedIn: boolean | null;
  /** Sign-in, coming back to this synth. */
  signInHref: string;
  sounds: UserSoundSummary[] | null;
  failed: boolean;
  /** The user's sound on the panel, if any. */
  currentId: string | null;
  onOpen: (id: string) => void;
  /** Whether a sound is starred (`f-my-sounds` s4); `null` when no star shows. */
  isStarred?: (id: string) => boolean | null;
  onStar?: (id: string) => void;
}

export function MySoundsList({
  signedIn,
  signInHref,
  sounds,
  failed,
  currentId,
  onOpen,
  isStarred,
  onStar,
}: MySoundsListProps) {
  return (
    <section aria-labelledby="mine-h" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 id="mine-h" className="kys-label text-(--kys-muted)">
          My sounds
        </h2>
        {sounds && sounds.length > 0 && (
          <span className="font-mono text-xs text-(--kys-faint)">{sounds.length}</span>
        )}
      </div>
      {signedIn === null ? (
        <p className="text-sm text-(--kys-faint)">Loading your sounds…</p>
      ) : !signedIn ? (
        <p className="text-sm text-(--kys-muted)">
          <Link href={signInHref} className="text-(--kys-accent) underline underline-offset-2">
            Sign in
          </Link>{' '}
          to keep your own sounds and copies of these.
        </p>
      ) : failed ? (
        <p role="alert" className="text-sm text-(--kys-warn)">
          Your sounds could not be loaded. Reload the page to try again.
        </p>
      ) : !sounds ? (
        <p className="text-sm text-(--kys-faint)">Loading your sounds…</p>
      ) : !sounds.length ? (
        <p className="text-sm text-(--kys-muted)">
          None on this synth yet. Save the panel, or save a copy of a sound below.
        </p>
      ) : (
        <ul className="kys-scroll -mr-1 flex max-h-[240px] flex-col gap-1.5 overflow-y-auto pr-1">
          {sounds.map((s) => {
            const on = s.id === currentId;
            const starred = isStarred?.(s.id) ?? null;
            return (
              <li key={s.id} className="flex items-start gap-1">
                <button
                  type="button"
                  onClick={() => onOpen(s.id)}
                  aria-current={on}
                  className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${on ? 'border-(--kys-accent) bg-(--kys-raised)' : 'border-transparent bg-(--kys-surface) hover:border-(--kys-line)'}`}
                >
                  <span className="block leading-tight font-semibold">{s.name}</span>
                  {s.source && (
                    <span className="mt-0.5 block text-[13px] leading-snug text-(--kys-muted)">
                      Copied from {s.source.name}
                    </span>
                  )}
                  {!s.playable && (
                    <span className="mt-0.5 block text-[13px] leading-snug text-(--kys-warn)">
                      Opens with what still fits this synth
                    </span>
                  )}
                  <span className="mt-0.5 block text-[12px] leading-snug text-(--kys-faint)">
                    {VISIBILITY_LABELS[s.visibility]}
                  </span>
                </button>
                {s.visibility !== 'private' && s.slug && (
                  <Link
                    href={sharedSoundHref(s.synthId, s.slug)}
                    aria-label={`${s.name}: its shared page`}
                    title="Its shared page"
                    className="mt-1 rounded-md px-1.5 py-1 text-(--kys-muted) hover:text-(--kys-accent)"
                  >
                    ↗
                  </Link>
                )}
                {starred !== null && onStar && (
                  <StarButton
                    on={starred}
                    name={s.name}
                    onToggle={() => onStar(s.id)}
                    className="mt-1"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── the buttons over the panel ──────────────────────────────────────────────

type FormMode = 'new' | 'saveAs' | 'rename';

export interface SoundActionsProps {
  synthId: string;
  signedIn: boolean;
  /** Sign-in, coming back to this synth. */
  signInHref: string;
  /** The user's sound on the panel, which Save writes back to. */
  open: UserSoundSummary | null;
  /**
   * The library sound a new sound from this panel is a copy of, credited when saved. With no sound of the user's open,
   * the one the panel came from; with one open, the one that was copied from, if the library still has it.
   */
  credit: { slug: string; name: string } | null;
  /** The panel as it is now. */
  panel: () => PanelInput;
  /**
   * A sound was saved as a new one, saved over with the panel, renamed, or shared, published or unpublished (its panel
   * left as it was in those last two).
   */
  onSaved: (sound: UserSoundDetail, how: 'created' | 'saved' | 'renamed' | 'shared') => void;
  /** The tags that synth's library sounds use, which a published sound may carry (`f-sharing` h3). */
  libraryTags: string[];
  onDeleted: (id: string) => void;
  /** Class for each button, so they match the others in the row. */
  buttonClass: string;
}

export function SoundActions({
  synthId,
  signedIn,
  signInHref,
  open,
  credit,
  panel,
  onSaved,
  onDeleted,
  libraryTags,
  buttonClass,
}: SoundActionsProps) {
  const [form, setForm] = useState<FormMode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // Another sound on the panel: whatever was being done to the last one is over.
  const openId = open?.id ?? null;
  useEffect(() => {
    setForm(null);
    setConfirmDelete(false);
    setFailure(null);
  }, [openId]);

  const newLabel = credit && !open ? 'Save a copy' : 'Save';

  if (!signedIn)
    return (
      <Link href={signInHref} className={buttonClass} title="Sign in to keep this sound">
        {newLabel}…
      </Link>
    );

  const run = async (doing: string, fn: () => Promise<void>, existing = true) => {
    setBusy(true);
    setFailure(null);
    setStatus(null);
    try {
      await fn();
    } catch (err) {
      setFailure(failureOf(err, doing, existing));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run('save', async () => {
      if (!open) return;
      const d = await apiClient.patch<UserSoundDetail>(soundPath(open.id), {
        body: { panel: panel() },
      });
      onSaved(d, 'saved');
      setStatus(`Saved ${d.name}.`);
    });

  const remove = () =>
    run('delete it', async () => {
      if (!open) return;
      await apiClient.delete(soundPath(open.id));
      setConfirmDelete(false);
      onDeleted(open.id);
      setStatus(`Deleted ${open.name}.`);
    });

  const submit = (mode: FormMode, name: string, notes: string) =>
    run(
      mode === 'rename' ? 'rename it' : 'save',
      async () => {
        if (mode === 'rename') {
          if (!open) return;
          const d = await apiClient.patch<UserSoundDetail>(soundPath(open.id), {
            body: { name, notes: notes || null },
          });
          onSaved(d, 'renamed');
          setStatus(`Renamed to ${d.name}.`);
        } else {
          const d = await apiClient.post<UserSoundDetail>('/api/v1/sounds', {
            body: {
              synthId,
              name,
              ...(notes ? { notes } : {}),
              panel: panel(),
              ...(credit ? { source: { slug: credit.slug } } : {}),
            },
          });
          onSaved(d, 'created');
          setStatus(`Saved ${d.name} to My sounds.`);
        }
        setForm(null);
      },
      mode === 'rename'
    );

  const toggle = (mode: FormMode) => {
    setConfirmDelete(false);
    setStatus(null);
    setFailure(null);
    setForm((f) => (f === mode ? null : mode));
  };

  return (
    <div className="mt-2 flex flex-col items-start gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {open ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className={buttonClass}
            >
              Save
            </button>
            <button
              type="button"
              aria-expanded={form === 'saveAs'}
              onClick={() => toggle('saveAs')}
              className={buttonClass}
            >
              Save as…
            </button>
            <button
              type="button"
              aria-expanded={form === 'rename'}
              onClick={() => toggle('rename')}
              className={buttonClass}
            >
              Rename…
            </button>
            <button
              type="button"
              aria-expanded={confirmDelete}
              onClick={() => {
                setForm(null);
                setStatus(null);
                setConfirmDelete((c) => !c);
              }}
              className={buttonClass}
            >
              Delete…
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-expanded={form === 'new'}
            onClick={() => toggle('new')}
            className={buttonClass}
          >
            {newLabel}…
          </button>
        )}
      </div>
      {confirmDelete && open && (
        <div
          role="group"
          aria-label="Delete this sound"
          className="flex flex-wrap items-center gap-2"
        >
          <span>Delete {open.name} from My sounds? The panel stays as it is.</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className={buttonClass}
          >
            Delete it
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass}>
            Keep it
          </button>
        </div>
      )}
      {form && (
        <SoundForm
          key={`${form}/${openId ?? ''}`}
          mode={form}
          open={open}
          credit={credit}
          busy={busy}
          onSubmit={(name, notes) => void submit(form, name, notes)}
          onCancel={() => setForm(null)}
          buttonClass={buttonClass}
        />
      )}
      {failure && (
        <p role="alert" className="text-sm text-(--kys-warn)">
          {failure}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm text-(--kys-good)">
          {status}
        </p>
      )}
      {open && (
        <SoundSharing
          sound={open}
          libraryTags={libraryTags}
          backHref={synthHref(synthId)}
          onChanged={(d) => onSaved(d, 'shared')}
          buttonClass={buttonClass}
        />
      )}
    </div>
  );
}

interface SoundFormProps {
  mode: FormMode;
  open: UserSoundSummary | null;
  credit: { slug: string; name: string } | null;
  busy: boolean;
  onSubmit: (name: string, notes: string) => void;
  onCancel: () => void;
  buttonClass: string;
}

const inputClass =
  'w-full rounded-md border border-(--kys-line) bg-(--kys-surface) px-2.5 py-1.5 text-sm text-(--kys-text) focus:border-(--kys-muted) focus:outline-none';

/** Name and notes, for a new sound or a rename. Checked with the API's own schemas before anything is sent. */
function SoundForm({ mode, open, credit, busy, onSubmit, onCancel, buttonClass }: SoundFormProps) {
  const [name, setName] = useState(() =>
    mode === 'rename' && open
      ? open.name
      : mode === 'saveAs' && open
        ? `${open.name} (copy)`
        : (credit?.name ?? '')
  );
  const [notes, setNotes] = useState(() => (mode === 'rename' && open?.notes) || '');
  const [problems, setProblems] = useState<{ name?: string; notes?: string }>({});

  const heading =
    mode === 'rename'
      ? 'Rename this sound'
      : mode === 'saveAs'
        ? 'Save as a new sound'
        : credit
          ? `Save a copy of ${credit.name}`
          : 'Save this sound';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = NameSchema.safeParse(name);
    const t = NotesSchema.safeParse(notes);
    setProblems({
      name: n.success ? undefined : n.error.issues[0]?.message,
      notes: t.success ? undefined : t.error.issues[0]?.message,
    });
    if (n.success && t.success) onSubmit(n.data, t.data);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="sound-form-h"
      className="w-full max-w-md space-y-3 rounded-lg border border-(--kys-line) bg-(--kys-ground) p-3 text-left"
    >
      <h3 id="sound-form-h" className="kys-label text-(--kys-muted)">
        {heading}
      </h3>
      {mode !== 'rename' && credit && (
        <p className="text-sm text-(--kys-muted)">
          It goes into My sounds with the panel as it is now, and keeps the credit to {credit.name}.
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor="sound-name" className="text-sm text-(--kys-text)">
          Name{' '}
          <FieldHelp title="Name">
            <p>What My sounds lists it as, here and on your dashboard. Up to 120 characters.</p>
          </FieldHelp>
        </label>
        <input
          id="sound-name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!problems.name}
          aria-describedby={problems.name ? 'sound-name-problem' : undefined}
          className={inputClass}
        />
        {problems.name && (
          <p id="sound-name-problem" className="text-sm text-(--kys-warn)">
            {problems.name}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <label htmlFor="sound-notes" className="text-sm text-(--kys-text)">
          Notes <span className="text-(--kys-muted)">(optional)</span>{' '}
          <FieldHelp title="Notes">
            <p>
              Anything you want to remember about it: what it is for, what you changed, how to play
              it. Only you see them, until you share the sound: then they go with it. Up to 2,000
              characters.
            </p>
          </FieldHelp>
        </label>
        <textarea
          id="sound-notes"
          value={notes}
          rows={2}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
          aria-invalid={!!problems.notes}
          className={inputClass}
        />
        {problems.notes && <p className="text-sm text-(--kys-warn)">{problems.notes}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy
            ? 'Saving…'
            : mode === 'rename'
              ? 'Rename'
              : mode === 'saveAs'
                ? 'Save as new'
                : 'Save'}
        </button>
      </div>
    </form>
  );
}
