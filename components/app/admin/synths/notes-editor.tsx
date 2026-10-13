'use client';

/**
 * NotesEditor — what a synth's page says beside the panel (`f-catalogue-admin`): its "Unusual on…" notes, the intro
 * and entries of its "What is not modelled" list, and the limits shared by every panel.
 *
 * Each note saves on its own through `PATCH /api/v1/admin/synth-notes/[noteId]`; a new unusual note goes through
 * `POST /api/v1/admin/synths/[id]/notes`. What a note is about never changes: to move a note, edit the one on the new
 * target. Saving marks the note edited, so the seed no longer updates it.
 */

import { useState } from 'react';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import {
  FieldProblems,
  placeProblems,
  refusalOf,
  RefusalSummary,
  type Refusal,
} from '@/components/app/admin/synths/problems';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api/client';
import type { AdminNote } from '@/lib/app/catalogue/edit';

interface NotesEditorProps {
  synthId: string;
  notes: AdminNote[];
  sharedLimits: AdminNote[];
  /** `false` when the registry has no definition, so a new note's target cannot be checked. */
  canAdd: boolean;
}

export function NotesEditor({ synthId, notes: initial, sharedLimits, canAdd }: NotesEditorProps) {
  const [notes, setNotes] = useState(initial);
  const unusual = notes.filter((n) => n.kind === 'UNUSUAL');
  const intro = notes.filter((n) => n.kind === 'LIMIT_INTRO');
  const limits = notes.filter((n) => n.kind === 'LIMIT');

  return (
    <div className="max-w-3xl space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Unusual on this synth{' '}
          <FieldHelp title="Unusual notes" ariaLabel="About unusual notes">
            <p>
              One to three sentences on how this synth names or does something differently from most
              synths, attached to one of its controls, jacks or panel areas. A control, jack or area
              has at most one note.
            </p>
          </FieldHelp>
        </h2>
        {unusual.length === 0 && (
          <p className="text-muted-foreground text-sm">No unusual notes yet.</p>
        )}
        {unusual.map((n) => (
          <NoteForm key={n.id} note={n} label={`Unusual on ${n.target ?? ''}`} />
        ))}
        {canAdd && (
          <NewUnusualNote
            synthId={synthId}
            onCreated={(note) => setNotes((current) => [...current, note])}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          What is not modelled{' '}
          <FieldHelp title="What is not modelled" ariaLabel="About what is not modelled">
            <p>
              The honest list of what this panel leaves out of the real instrument: an intro, then
              titled entries. The shared limits below follow this synth&apos;s own.
            </p>
          </FieldHelp>
        </h2>
        {intro.map((n) => (
          <NoteForm key={n.id} note={n} label="Intro" />
        ))}
        {limits.map((n) => (
          <NoteForm key={n.id} note={n} label={n.title ?? 'Limit'} />
        ))}
        {intro.length === 0 && limits.length === 0 && (
          <p className="text-muted-foreground text-sm">This synth has no limits listed.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Shared limits{' '}
          <FieldHelp title="Shared limits" ariaLabel="About shared limits">
            <p>
              Limits true of every panel, shown on every synth&apos;s page. A change here changes
              them all.
            </p>
          </FieldHelp>
        </h2>
        {sharedLimits.map((n) => (
          <NoteForm key={n.id} note={n} label={n.title ?? 'Limit'} shared />
        ))}
      </section>
    </div>
  );
}

/** One note: its text, and a limit's title. */
function NoteForm({ note, label, shared }: { note: AdminNote; label: string; shared?: boolean }) {
  const readOnly = useSharedSettingsReadOnly();
  const [saved, setSaved] = useState(note);
  const [text, setText] = useState(note.text);
  const [title, setTitle] = useState(note.title ?? '');
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const isLimit = note.kind === 'LIMIT';
  const dirty = text !== saved.text || (isLimit && title !== (saved.title ?? ''));
  const placed = placeProblems(refusal?.problems ?? [], ['text', 'title']);
  const id = `note-${note.id}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setRefusal(null);
    try {
      const after = await apiClient.patch<AdminNote>(
        `/api/v1/admin/synth-notes/${encodeURIComponent(note.id)}`,
        { body: { text, ...(isLimit ? { title } : {}) } }
      );
      setSaved(after);
      setText(after.text);
      setTitle(after.title ?? '');
      setSavedNote('Saved.');
    } catch (err) {
      setRefusal(refusalOf(err, 'Could not save the note. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-2 rounded-md border p-3"
      data-testid={`note-${note.id}`}
    >
      <div className="flex items-center gap-2">
        {/* A limit is named by its title as last saved here, not as the page loaded it. */}
        <span className="text-sm font-medium">{isLimit ? saved.title || label : label}</span>
        {shared && <Badge variant="secondary">Every panel</Badge>}
        {saved.editedAt && <Badge variant="outline">Edited</Badge>}
      </div>
      <RefusalSummary refusal={refusal} unplaced={placed.unplaced} />
      {isLimit && (
        <div className="grid gap-1">
          <Label htmlFor={`${id}-title`} className="text-xs">
            Title
          </Label>
          <Input
            id={`${id}-title`}
            value={title}
            maxLength={200}
            aria-invalid={placed.at('title').length > 0}
            onChange={(e) => {
              setTitle(e.target.value);
              setSavedNote(null);
            }}
          />
          <FieldProblems messages={placed.at('title')} />
        </div>
      )}
      <div className="grid gap-1">
        <Label htmlFor={`${id}-text`} className="text-xs">
          Text
        </Label>
        <Textarea
          id={`${id}-text`}
          value={text}
          rows={3}
          maxLength={5000}
          aria-invalid={placed.at('text').length > 0}
          onChange={(e) => {
            setText(e.target.value);
            setSavedNote(null);
          }}
        />
        <FieldProblems messages={placed.at('text')} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={readOnly || !dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {savedNote && <span className="text-muted-foreground text-xs">{savedNote}</span>}
      </div>
    </form>
  );
}

/** A new "Unusual on…" note: which control, jack or area, and what to say. */
function NewUnusualNote({
  synthId,
  onCreated,
}: {
  synthId: string;
  onCreated: (note: AdminNote) => void;
}) {
  const readOnly = useSharedSettingsReadOnly();
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const placed = placeProblems(refusal?.problems ?? [], ['target', 'text']);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setRefusal(null);
    try {
      const note = await apiClient.post<AdminNote>(
        `/api/v1/admin/synths/${encodeURIComponent(synthId)}/notes`,
        { body: { target: target.trim(), text } }
      );
      onCreated(note);
      setTarget('');
      setText('');
    } catch (err) {
      setRefusal(refusalOf(err, 'Could not add the note. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-2 rounded-md border border-dashed p-3"
    >
      <div className="text-sm font-medium">Add an unusual note</div>
      <RefusalSummary refusal={refusal} unplaced={placed.unplaced} />
      <div className="grid gap-1">
        <Label htmlFor="new-note-target" className="text-xs">
          Control, jack or area{' '}
          <FieldHelp title="What the note is about" ariaLabel="About the note's target">
            <p>
              The id of one of this synth&apos;s controls, jacks or panel areas, as its definition
              names it: for example <code>osc1.range</code>. A wrong id is refused and the reason
              shown here. It cannot be changed once the note exists.
            </p>
          </FieldHelp>
        </Label>
        <Input
          id="new-note-target"
          value={target}
          maxLength={100}
          className="max-w-xs font-mono"
          aria-invalid={placed.at('target').length > 0}
          onChange={(e) => setTarget(e.target.value)}
        />
        <FieldProblems messages={placed.at('target')} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="new-note-text" className="text-xs">
          Text
        </Label>
        <Textarea
          id="new-note-text"
          value={text}
          rows={3}
          maxLength={5000}
          aria-invalid={placed.at('text').length > 0}
          onChange={(e) => setText(e.target.value)}
        />
        <FieldProblems messages={placed.at('text')} />
      </div>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={readOnly || saving || !target.trim() || !text.trim()}
      >
        {saving ? 'Adding…' : 'Add note'}
      </Button>
    </form>
  );
}
