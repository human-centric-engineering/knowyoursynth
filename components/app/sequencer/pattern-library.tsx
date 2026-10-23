'use client';

/**
 * The sequencer's patterns strip (`f-step-sequencer` t-81): what the module holds, and where patterns come from and go.
 *
 * - The name of the pattern held (the sound's riff, one of the user's patterns, or a library riff), marked when edited.
 * - Save, Save as, Rename and Delete, against My patterns (`/api/v1/patterns`). Signed out, a link to sign in instead.
 * - My patterns: the user's saved patterns, any of which opens in place of what is held (Undo brings that back).
 * - Library: any synth's library riffs, as a starting point. A riff from one synth plays on any other.
 * - With one of the user's sounds open, "Play with <sound>": the sound opens the sequencer on this pattern from then on.
 * - Share: who can open the saved pattern held, by link or published on Explore (t-83, `PatternSharing`).
 *
 * Every write goes through the API, so a pattern saved here is the one a reload, or another device, opens.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { BookOpen, FolderOpen, Link2, Pencil, Save, SaveAll, Share2, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import type { SynthDetail } from '@/lib/app/catalogue/read';
import { importPhrase } from '@/lib/app/sequencer/import';
import { PatternNameSchema } from '@/lib/app/patterns/data';
import type { Sequencer } from '@/components/app/sequencer/use-sequencer';
import type { MyPatterns } from '@/components/app/sequencer/use-my-patterns';
import { SeqSelect } from '@/components/app/sequencer/select';
import { PlayerTip } from '@/components/app/synth/player-tip';
import { PatternSharing } from '@/components/app/sharing/pattern-sharing';
import { soundStateLabel } from '@/components/app/sharing/visibility';
import { synthHref } from '@/components/app/synth/routes';
import type { UserPatternDetail } from '@/lib/app/patterns/data';
import { logger } from '@/lib/logging';

/** One of the user's sounds, open on the panel: the pattern it plays by default, and how to change that. */
export interface OpenSoundDefault {
  name: string;
  patternId: string | null;
  /** Points the sound at a pattern, or at none. Rejects when the API refuses. */
  setPattern: (patternId: string | null) => Promise<void>;
}

export interface PatternLibraryProps {
  /** Null while the session is not known yet. */
  signedIn: boolean | null;
  /**
   * Whether the sequencer holds a shared pattern on its page (t-83): then Save and Save as give way to the page's Save a
   * copy, which credits it, as a shared sound's panel hides its Save buttons.
   */
  sharedHeld?: boolean;
  signInHref: string;
  /** The synth on the panel: what a new pattern is saved as made on, and the library shown first. */
  synthId: string;
  /** Every synth in the catalogue, for the library and the list. */
  synths: readonly { id: string; name: string }[];
  mine: MyPatterns;
  sound: OpenSoundDefault | null;
}

type Panel = 'mine' | 'library' | 'share' | null;
/** `id` is the saved pattern a rename is for: the one held when the box opened. */
type Form = {
  mode: 'save' | 'saveAs' | 'rename';
  name: string;
  error: string | null;
  id?: string;
} | null;

/** A library sound as the browser lists it: only what loading its riff needs. */
type LibraryRiff = Pick<SynthDetail['sounds'][number], 'id' | 'name' | 'phrase'>;

/** A save or rename's status when the sequencer holds another pattern by the time it comes back. */
const since = '. The sequencer holds another pattern now.';

const failure = (err: unknown) =>
  err instanceof Error && err.message ? err.message : 'Try again.';

export function PatternLibrary({ seq, library }: { seq: Sequencer; library: PatternLibraryProps }) {
  const { signedIn, signInHref, synthId, synths, mine, sound, sharedHeld = false } = library;
  const { loaded, edited } = seq;
  const [panel, setPanel] = useState<Panel>(null);
  const [form, setForm] = useState<Form>(null);
  /** The saved pattern Delete was pressed for: what the confirmation names and removes. */
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  /** The saved pattern's sharing, read when Share is pressed. */
  const [sharing, setSharing] = useState<UserPatternDetail | null>(null);
  const nameId = useId();
  const nameInput = useRef<HTMLInputElement | null>(null);
  // The name box takes focus as it opens, so a name can be typed at once.
  const formMode = form?.mode ?? null;
  useEffect(() => {
    if (formMode) nameInput.current?.focus();
  }, [formMode]);
  const own = loaded?.id ? { id: loaded.id, name: loaded.name } : null;

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
    } catch (err) {
      logger.warn('sequencer: pattern action failed', { what, err: String(err) });
      setStatus(`Could not ${what}. ${failure(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!own) {
      setForm({ mode: 'save', name: loaded?.name ?? '', error: null });
      return;
    }
    // What was sent is what is saved: an edit made while it was on its way is still an edit, and a pattern opened
    // meanwhile is not named as the one saved.
    const sent = seq.pattern;
    const at = seq.held();
    void run('save the pattern', async () => {
      const d = await mine.update(own.id, { pattern: sent });
      setStatus(
        seq.markSaved({ id: d.id, name: d.name }, sent, at)
          ? `Saved ${d.name}.`
          : `Saved ${d.name}${since}`
      );
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const name = PatternNameSchema.safeParse(form.name);
    if (!name.success) {
      setForm({ ...form, error: name.error.issues[0]?.message ?? 'Name the pattern' });
      return;
    }
    const { mode } = form;
    // The pattern being renamed went while the name was typed (deleted, or something else opened): nothing to rename,
    // and not a reason to save a new one, or to rename what is held now.
    if (mode === 'rename' && (!own || own.id !== form.id)) {
      setForm(null);
      setStatus('There is no saved pattern to rename now.');
      return;
    }
    const sent = seq.pattern;
    const at = seq.held();
    void run(mode === 'rename' ? 'rename the pattern' : 'save the pattern', async () => {
      if (mode === 'rename' && own) {
        const d = await mine.update(own.id, { name: name.data });
        // A rename leaves the steps as they were saved: an edited pattern stays edited.
        const named = seq.relabel({ id: d.id, name: d.name }, at);
        setStatus(named ? `Renamed to ${d.name}.` : `Renamed to ${d.name}${since}`);
      } else {
        const d = await mine.create(name.data, sent, synthId);
        const named = seq.markSaved({ id: d.id, name: d.name }, sent, at);
        setStatus(
          named ? `Saved ${d.name} to My patterns.` : `Saved ${d.name} to My patterns${since}`
        );
      }
      setForm(null);
    });
  };

  const remove = () => {
    const target = confirmDelete;
    if (!target) return;
    // Only the pattern it was pressed for, and only while that is what is held, is relabelled.
    const at = own?.id === target.id ? seq.held() : null;
    void run('delete the pattern', async () => {
      await mine.remove(target.id);
      setConfirmDelete(null);
      // What is held is still the pattern, now saved nowhere: Save puts it back as a new one.
      if (at !== null && seq.relabel({ id: null, name: target.name }, at))
        setStatus(
          `Deleted ${target.name}. The sequencer still holds it until something else opens.`
        );
      else setStatus(`Deleted ${target.name}.`);
    });
  };

  const openMine = (id: string) =>
    void run('open the pattern', async () => {
      const d = await mine.open(id);
      if (!d.pattern) {
        setStatus(`${d.name} cannot be opened: ${d.problems.join(' ')}`);
        return;
      }
      if (!seq.load(d.pattern, { id: d.id, name: d.name })) {
        setStatus(`${d.name} cannot be opened in the sequencer.`);
        return;
      }
      setPanel(null);
      setStatus(`Opened ${d.name}. Undo goes back to what was here.`);
    });

  const openRiff = (riff: LibraryRiff, synthName: string) => {
    let p;
    try {
      p = importPhrase(riff.phrase);
    } catch (err) {
      logger.warn('sequencer: library riff could not be imported', { err: String(err) });
      setStatus(`${riff.name} cannot be opened in the sequencer.`);
      return;
    }
    if (!seq.load(p, { id: null, name: `${riff.name} (${synthName})` })) {
      setStatus(`${riff.name} cannot be opened in the sequencer.`);
      return;
    }
    setPanel(null);
    setStatus(
      `Opened the riff of ${riff.name} from the ${synthName}. Undo goes back to what was here.`
    );
  };

  const openSharing = () => {
    if (panel === 'share') {
      setPanel(null);
      return;
    }
    if (!own) return;
    void run('read how the pattern is shared', async () => {
      setSharing(await mine.open(own.id));
      setPanel('share');
    });
  };

  const playsWithSound = !!sound && !!own && sound.patternId === own.id;
  const toggleDefault = () => {
    if (!sound || !own) return;
    void run('change the patch', async () => {
      await sound.setPattern(playsWithSound ? null : own.id);
      setStatus(
        playsWithSound
          ? `${sound.name} plays its own riff again.`
          : `${sound.name} opens the sequencer on ${own.name} from now on.`
      );
    });
  };

  const button = (
    name: string,
    help: string,
    icon: ReactNode,
    onClick: () => void,
    opts: { disabled?: boolean; pressed?: boolean; expanded?: boolean; text?: string } = {}
  ) => (
    <PlayerTip name={name} help={help}>
      <button
        type="button"
        className={`kys-seq-tool ${opts.expanded || opts.pressed ? 'is-open' : ''}`}
        aria-label={name}
        aria-pressed={opts.pressed}
        aria-expanded={opts.expanded}
        disabled={busy || opts.disabled}
        onClick={onClick}
      >
        {icon}
        <span className="kys-seq-tool-text">{opts.text ?? name}</span>
      </button>
    </PlayerTip>
  );

  return (
    <div className="kys-seq-lib">
      <div className="kys-seq-lib-row" role="toolbar" aria-label="Patterns">
        <p className="kys-seq-lib-name" aria-live="polite">
          <span className="kys-seq-lib-label">Pattern</span>
          <span className="kys-seq-lib-value">{loaded?.name ?? 'The patch’s riff'}</span>
          {edited && <span className="kys-seq-lib-edited">edited</span>}
        </p>
        <div className="kys-seq-tool-group">
          {signedIn === false ? (
            <a className="kys-seq-lib-signin" href={signInHref}>
              Sign in to save patterns
            </a>
          ) : signedIn ? (
            <>
              {sharedHeld && (
                <span className="kys-seq-lib-signin">Save a copy, above the panel, to keep it</span>
              )}
              {!sharedHeld &&
                button(
                  own ? `Save ${own.name}` : 'Save to My patterns',
                  own
                    ? 'Saves the pattern as it is now over the saved one.'
                    : 'Names the pattern and keeps it in My patterns, to play on any synth.',
                  <Save size={15} aria-hidden="true" />,
                  save,
                  { disabled: !!own && !edited, text: 'Save' }
                )}
              {!sharedHeld &&
                button(
                  'Save as',
                  'Keeps the pattern as a new one in My patterns, under another name.',
                  <SaveAll size={15} aria-hidden="true" />,
                  () =>
                    setForm({
                      mode: 'saveAs',
                      name: loaded ? `${loaded.name} 2` : '',
                      error: null,
                    }),
                  { disabled: !loaded }
                )}
              {button(
                'Rename',
                'Gives the saved pattern another name.',
                <Pencil size={14} aria-hidden="true" />,
                () => own && setForm({ mode: 'rename', name: own.name, error: null, id: own.id }),
                { disabled: !own }
              )}
              {button(
                'Delete',
                'Removes the pattern from My patterns. Patches that played it play their own riff.',
                <Trash2 size={14} aria-hidden="true" />,
                () => own && setConfirmDelete({ id: own.id, name: own.name }),
                { disabled: !own }
              )}
              {button(
                'My patterns',
                'Your saved patterns. Open one to play and edit it.',
                <FolderOpen size={15} aria-hidden="true" />,
                () => {
                  const next = panel === 'mine' ? null : 'mine';
                  setPanel(next);
                  // A list that could not be read closes again, so the status says so alone and this button tries again.
                  if (next && mine.patterns === null)
                    void run('read My patterns', () =>
                      mine.refresh().catch((err: unknown) => {
                        setPanel(null);
                        throw err;
                      })
                    );
                },
                { expanded: panel === 'mine' }
              )}
              {button(
                'Share',
                own
                  ? 'Share the saved pattern by a link, or publish it on Explore for anyone to play and copy.'
                  : 'Save the pattern first: a pattern is shared as it is saved.',
                <Share2 size={15} aria-hidden="true" />,
                openSharing,
                { disabled: !own || sharedHeld, expanded: panel === 'share' }
              )}
            </>
          ) : null}
          {button(
            'Library',
            'Every synth’s library riffs. Open one as a starting point: it plays on this synth.',
            <BookOpen size={15} aria-hidden="true" />,
            () => setPanel(panel === 'library' ? null : 'library'),
            { expanded: panel === 'library' }
          )}
          {sound &&
            signedIn &&
            button(
              `Play with ${sound.name}`,
              own
                ? `Opens the sequencer on this pattern whenever ${sound.name} opens.`
                : 'Save the pattern first: a patch plays one of My patterns.',
              <Link2 size={15} aria-hidden="true" />,
              toggleDefault,
              { disabled: !own, pressed: playsWithSound, text: 'With patch' }
            )}
        </div>
      </div>

      {form && (
        <form className="kys-seq-lib-form" onSubmit={submit} noValidate>
          <label htmlFor={nameId} className="kys-seq-lib-label">
            {form.mode === 'rename' ? 'New name' : 'Name the pattern'}
          </label>
          <input
            id={nameId}
            className="kys-seq-lib-input"
            value={form.name}
            ref={nameInput}
            maxLength={120}
            aria-invalid={!!form.error}
            aria-describedby={form.error ? `${nameId}-error` : undefined}
            // Typing a name must not play notes on the page.
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => setForm({ ...form, name: e.target.value, error: null })}
          />
          <button type="submit" className="kys-seq-lib-action" disabled={busy}>
            {form.mode === 'rename' ? 'Rename' : 'Save'}
          </button>
          <button
            type="button"
            className="kys-seq-lib-action is-quiet"
            onClick={() => setForm(null)}
          >
            Cancel
          </button>
          {form.error && (
            <p id={`${nameId}-error`} className="kys-seq-lib-error" role="alert">
              {form.error}
            </p>
          )}
        </form>
      )}

      {confirmDelete && (
        <div className="kys-seq-lib-form" role="group" aria-label="Delete the pattern">
          <span>Delete {confirmDelete.name} from My patterns?</span>
          <button
            type="button"
            className="kys-seq-lib-action is-danger"
            onClick={remove}
            disabled={busy}
          >
            Delete
          </button>
          <button
            type="button"
            className="kys-seq-lib-action is-quiet"
            onClick={() => setConfirmDelete(null)}
          >
            Keep it
          </button>
        </div>
      )}

      {status && (
        <p className="kys-seq-lib-status" role="status">
          {status}
        </p>
      )}

      {panel === 'mine' && (
        <MyPatternList mine={mine} synths={synths} current={own?.id ?? null} onOpen={openMine} />
      )}
      {panel === 'share' && sharing && own?.id === sharing.id && (
        <PatternSharing
          pattern={sharing}
          share={(to) => mine.share(sharing.id, to)}
          backHref={synthHref(synthId)}
        />
      )}
      {panel === 'library' && (
        <LibraryBrowser synthId={synthId} synths={synths} onOpen={openRiff} />
      )}
    </div>
  );
}

function MyPatternList({
  mine,
  synths,
  current,
  onOpen,
}: {
  mine: MyPatterns;
  synths: readonly { id: string; name: string }[];
  current: string | null;
  onOpen: (id: string) => void;
}) {
  if (mine.patterns === null) return <p className="kys-seq-lib-empty">Reading My patterns…</p>;
  if (mine.patterns.length === 0)
    return (
      <p className="kys-seq-lib-empty">
        No patterns saved yet. Save the one in the sequencer to keep it here.
      </p>
    );
  return (
    <ul className="kys-seq-lib-list" aria-label="My patterns">
      {mine.patterns.map((p) => {
        const made = synths.find((s) => s.id === p.synthId)?.name;
        return (
          <li key={p.id}>
            <button
              type="button"
              className="kys-seq-lib-item"
              aria-current={p.id === current ? 'true' : undefined}
              onClick={() => onOpen(p.id)}
            >
              <span className="kys-seq-lib-item-name">{p.name}</span>
              <span className="kys-seq-lib-item-meta">
                {p.steps} steps{p.parts > 1 ? ', A and B' : ''}
                {made ? ` · made on the ${made}` : ''}
                {p.visibility !== 'private' || p.unlisted ? ` · ${soundStateLabel(p)}` : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** One synth's library riffs at a time, read from the catalogue's own read and kept for the visit. */
function LibraryBrowser({
  synthId,
  synths,
  onOpen,
}: {
  synthId: string;
  synths: readonly { id: string; name: string }[];
  onOpen: (riff: LibraryRiff, synthName: string) => void;
}) {
  const [from, setFrom] = useState(synthId);
  const [riffs, setRiffs] = useState<LibraryRiff[] | null>(null);
  const [error, setError] = useState(false);
  const cache = useRef(new Map<string, LibraryRiff[]>());

  useEffect(() => {
    const kept = cache.current.get(from);
    if (kept) {
      setRiffs(kept);
      setError(false);
      return undefined;
    }
    let live = true;
    setRiffs(null);
    setError(false);
    apiClient
      .get<SynthDetail>(`/api/v1/synths/${encodeURIComponent(from)}`)
      .then((d) => {
        const list = d.sounds
          .filter((s) => s.phrase.steps.length > 0)
          .map(({ id, name, phrase }) => ({ id, name, phrase }));
        cache.current.set(from, list);
        if (live) setRiffs(list);
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [from]);

  const synthName = synths.find((s) => s.id === from)?.name ?? from;
  return (
    <div className="kys-seq-lib-browser">
      <SeqSelect
        label="Synth"
        help="The synth whose library riffs are listed. Any of them plays on this synth."
        value={from}
        options={synths.map((s) => [s.id, s.name])}
        onChange={setFrom}
      />
      {error ? (
        <p className="kys-seq-lib-empty">The {synthName}’s library could not be read. Try again.</p>
      ) : riffs === null ? (
        <p className="kys-seq-lib-empty">Reading the {synthName}’s library…</p>
      ) : riffs.length === 0 ? (
        <p className="kys-seq-lib-empty">The {synthName}’s library has no riffs.</p>
      ) : (
        <ul className="kys-seq-lib-list" aria-label={`The ${synthName}’s library riffs`}>
          {riffs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="kys-seq-lib-item"
                onClick={() => onOpen(r, synthName)}
              >
                <span className="kys-seq-lib-item-name">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
