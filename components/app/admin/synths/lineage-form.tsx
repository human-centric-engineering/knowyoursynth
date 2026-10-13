'use client';

/**
 * LineageForm — a synth's history section (`f-catalogue-admin`), saved whole through
 * `PUT /api/v1/admin/synths/[id]/lineage`: title, intro, the timeline, relatives, players and a caveat. Creates the
 * section when the synth has none. Saving marks it edited, so the seed no longer updates it. "Heard on" is not here:
 * it comes from the databank.
 */

import { useState } from 'react';
import { z } from 'zod';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import { MoveButtons, move, nextRowKey } from '@/components/app/admin/synths/order-controls';
import {
  FieldProblems,
  placeProblems,
  refusalOf,
  RefusalSummary,
  type Refusal,
} from '@/components/app/admin/synths/problems';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api/client';
import type { AdminSynthDetail } from '@/lib/app/catalogue/edit';

type StoredLineage = NonNullable<AdminSynthDetail['lineage']>;

/** The stored timeline and relatives are JSON columns: read them, rather than trust their type. */
const TimelineSchema = z.array(
  z.object({ year: z.string(), name: z.string(), tag: z.string().optional(), text: z.string() })
);
const RelativesSchema = z.array(
  z.object({ name: z.string(), years: z.string(), text: z.string() })
);

interface TimelineRow {
  key: number;
  year: string;
  name: string;
  tag: string;
  text: string;
}
interface RelativeRow {
  key: number;
  name: string;
  years: string;
  text: string;
}
interface Draft {
  title: string;
  intro: string;
  timeline: TimelineRow[];
  relatives: RelativeRow[];
  users: string;
  note: string;
}

/** `null` when the stored lineage is not a shape this form can show. */
function draftOf(lineage: Omit<StoredLineage, 'editedAt'> | null): Draft | null {
  if (!lineage) return { title: '', intro: '', timeline: [], relatives: [], users: '', note: '' };
  const timeline = TimelineSchema.safeParse(lineage.timeline);
  const relatives = RelativesSchema.safeParse(lineage.relatives);
  if (!timeline.success || !relatives.success) return null;
  return {
    title: lineage.title,
    intro: lineage.intro,
    timeline: timeline.data.map((t) => ({ key: nextRowKey(), ...t, tag: t.tag ?? '' })),
    relatives: relatives.data.map((r) => ({ key: nextRowKey(), ...r })),
    users: lineage.users.join('\n'),
    note: lineage.note ?? '',
  };
}

const bodyOf = (d: Draft) => ({
  title: d.title,
  intro: d.intro,
  timeline: d.timeline.map(({ year, name, tag, text }) => ({
    year,
    name,
    ...(tag.trim() ? { tag } : {}),
    text,
  })),
  relatives: d.relatives.map(({ name, years, text }) => ({ name, years, text })),
  users: d.users
    .split('\n')
    .map((u) => u.trim())
    .filter(Boolean),
  ...(d.note.trim() ? { note: d.note } : {}),
});

export function LineageForm({
  synthId,
  lineage,
}: {
  synthId: string;
  lineage: StoredLineage | null;
}) {
  const readOnly = useSharedSettingsReadOnly();
  const [draft, setDraft] = useState(() => draftOf(lineage));
  const [exists, setExists] = useState(lineage !== null);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  if (!draft) {
    return (
      <p role="alert" className="text-destructive text-sm">
        The stored history section is not in a shape this form can show, so it cannot be edited
        here. Its timeline and relatives must be lists of entries.
      </p>
    );
  }

  const keys = [
    'title',
    'intro',
    'timeline',
    'relatives',
    'users',
    'note',
    ...draft.timeline.flatMap((_, i) =>
      ['year', 'name', 'tag', 'text'].map((f) => `timeline.${i}.${f}`)
    ),
    ...draft.relatives.flatMap((_, i) =>
      ['name', 'years', 'text'].map((f) => `relatives.${i}.${f}`)
    ),
  ];
  const placed = placeProblems(refusal?.problems ?? [], keys);

  const update = (change: (d: Draft) => Draft) => {
    setDraft((d) => (d ? change(d) : d));
    setSavedNote(null);
  };
  /** Moving or removing a row changes which row an index names, so an earlier refusal no longer points anywhere. */
  const restructure = (change: (d: Draft) => Draft) => {
    update(change);
    setRefusal(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setRefusal(null);
    try {
      const after = await apiClient.put<Omit<StoredLineage, 'editedAt'>>(
        `/api/v1/admin/synths/${encodeURIComponent(synthId)}/lineage`,
        { body: bodyOf(draft) }
      );
      const next = draftOf(after);
      if (next) setDraft(next);
      setExists(true);
      setSavedNote('Saved.');
    } catch (err) {
      setRefusal(refusalOf(err, 'Could not save the history section. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const text = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { multiline?: boolean; help?: React.ReactNode; rows?: number } = {}
  ) => {
    const id = `lineage-${key.replace(/\./g, '-')}`;
    const messages = placed.at(key);
    const common = {
      id,
      value,
      'aria-invalid': messages.length > 0,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange(e.target.value),
    };
    return (
      <div className="grid gap-1">
        <Label htmlFor={id} className="text-xs">
          {label}
          {opts.help && (
            <>
              {' '}
              <FieldHelp title={label} ariaLabel={`About the ${label.toLowerCase()}`}>
                {opts.help}
              </FieldHelp>
            </>
          )}
        </Label>
        {opts.multiline ? <Textarea {...common} rows={opts.rows ?? 3} /> : <Input {...common} />}
        <FieldProblems messages={messages} />
      </div>
    );
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-3xl space-y-5">
      <RefusalSummary refusal={refusal} unplaced={placed.unplaced} />
      {!exists && (
        <p className="text-muted-foreground text-sm">
          This synth has no history section yet. Saving creates one.
        </p>
      )}
      {text('title', 'Title', draft.title, (v) => update((d) => ({ ...d, title: v })), {
        help: (
          <p>
            The section&apos;s heading on the synth&apos;s page:{' '}
            <code>Where the Model D comes from</code>.
          </p>
        ),
      })}
      {text('intro', 'Intro', draft.intro, (v) => update((d) => ({ ...d, intro: v })), {
        multiline: true,
        help: <p>Two or three sentences above the timeline.</p>,
      })}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Timeline{' '}
          <FieldHelp title="Timeline" ariaLabel="About the timeline">
            <p>
              The family history, oldest first, at least one entry. The year is text, so a range
              like <code>1975–81</code> is fine. The tag is a short label such as{' '}
              <code>The original</code> or <code>This synth</code>, and can be left empty.
            </p>
          </FieldHelp>
        </legend>
        <FieldProblems messages={placed.at('timeline')} />
        {draft.timeline.map((row, i) => {
          const set = (field: keyof Omit<TimelineRow, 'key'>) => (v: string) =>
            update((d) => ({
              ...d,
              timeline: d.timeline.map((t, j) => (j === i ? { ...t, [field]: v } : t)),
            }));
          return (
            <div key={row.key} className="space-y-2 rounded-md border p-3">
              <div className="grid gap-2 sm:grid-cols-[8rem_1fr_12rem]">
                {text(`timeline.${i}.year`, 'Year', row.year, set('year'))}
                {text(`timeline.${i}.name`, 'Name', row.name, set('name'))}
                {text(`timeline.${i}.tag`, 'Tag', row.tag, set('tag'))}
              </div>
              {text(`timeline.${i}.text`, 'Text', row.text, set('text'), {
                multiline: true,
                rows: 2,
              })}
              <div className="flex gap-2">
                <MoveButtons
                  label={`timeline entry ${i + 1}`}
                  index={i}
                  length={draft.timeline.length}
                  onMove={(by) => restructure((d) => ({ ...d, timeline: move(d.timeline, i, by) }))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    restructure((d) => ({ ...d, timeline: d.timeline.filter((_, j) => j !== i) }))
                  }
                >
                  Remove entry
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            update((d) => ({
              ...d,
              timeline: [
                ...d.timeline,
                { key: nextRowKey(), year: '', name: '', tag: '', text: '' },
              ],
            }))
          }
        >
          Add a timeline entry
        </Button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Relatives{' '}
          <FieldHelp title="Relatives" ariaLabel="About the relatives">
            <p>
              Closely related instruments, or an honest rival labelled as one. Each has a name, its
              years as text, and a sentence or two on how it relates. The list can be empty.
            </p>
          </FieldHelp>
        </legend>
        <FieldProblems messages={placed.at('relatives')} />
        {draft.relatives.map((row, i) => {
          const set = (field: keyof Omit<RelativeRow, 'key'>) => (v: string) =>
            update((d) => ({
              ...d,
              relatives: d.relatives.map((r, j) => (j === i ? { ...r, [field]: v } : r)),
            }));
          return (
            <div key={row.key} className="space-y-2 rounded-md border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                {text(`relatives.${i}.name`, 'Name', row.name, set('name'))}
                {text(`relatives.${i}.years`, 'Years', row.years, set('years'))}
              </div>
              {text(`relatives.${i}.text`, 'Text', row.text, set('text'), {
                multiline: true,
                rows: 2,
              })}
              <div className="flex gap-2">
                <MoveButtons
                  label={`relative ${i + 1}`}
                  index={i}
                  length={draft.relatives.length}
                  onMove={(by) =>
                    restructure((d) => ({ ...d, relatives: move(d.relatives, i, by) }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    restructure((d) => ({ ...d, relatives: d.relatives.filter((_, j) => j !== i) }))
                  }
                >
                  Remove relative
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            update((d) => ({
              ...d,
              relatives: [...d.relatives, { key: nextRowKey(), name: '', years: '', text: '' }],
            }))
          }
        >
          Add a relative
        </Button>
      </fieldset>

      {text('users', 'Players', draft.users, (v) => update((d) => ({ ...d, users: v })), {
        multiline: true,
        help: (
          <p>
            Players known to have used one where there is no single record to list, one per line.
            Optional.
          </p>
        ),
      })}
      {text('note', 'Note', draft.note, (v) => update((d) => ({ ...d, note: v })), {
        multiline: true,
        rows: 2,
        help: <p>A caveat about the lists, shown under them. Optional.</p>,
      })}

      <p className="text-muted-foreground text-xs">
        Saving marks the history section edited: the seed stops updating it from its data file.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={readOnly || saving}>
          {saving ? 'Saving…' : exists ? 'Save history' : 'Create history section'}
        </Button>
        {savedNote && <span className="text-muted-foreground text-sm">{savedNote}</span>}
      </div>
    </form>
  );
}
