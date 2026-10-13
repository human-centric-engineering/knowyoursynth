'use client';

/**
 * SynthDetailsForm — a synth's descriptive columns (`f-catalogue-admin`): name, maker, year, heritage and summary,
 * through `PATCH /api/v1/admin/synths/[id]`. Saving marks the synth edited, so the seed no longer updates it.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
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

type Synth = AdminSynthDetail['synth'];

const FIELDS = ['name', 'maker', 'year', 'heritage', 'summary'] as const;
type Draft = Record<(typeof FIELDS)[number], string>;

const draftOf = (s: Pick<Synth, (typeof FIELDS)[number]>): Draft => ({
  name: s.name,
  maker: s.maker,
  year: String(s.year),
  heritage: s.heritage,
  summary: s.summary,
});

export function SynthDetailsForm({ synth }: { synth: Synth }) {
  const router = useRouter();
  const readOnly = useSharedSettingsReadOnly();
  const [saved, setSaved] = useState(draftOf(synth));
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const dirty = FIELDS.some((f) => draft[f] !== saved[f]);
  const placed = placeProblems(refusal?.problems ?? [], FIELDS);
  const set = (field: keyof Draft) => (value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setSavedNote(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setRefusal(null);
    try {
      // The route answers with the synth's editable columns, not the whole detail.
      const after = await apiClient.patch<Pick<Synth, (typeof FIELDS)[number]>>(
        `/api/v1/admin/synths/${encodeURIComponent(synth.id)}`,
        {
          body: {
            name: draft.name,
            maker: draft.maker,
            // Not a number is sent as written, so the server's refusal names the field.
            year: /^\d+$/.test(draft.year.trim()) ? Number(draft.year) : draft.year,
            heritage: draft.heritage,
            summary: draft.summary,
          },
        }
      );
      const next = draftOf(after);
      setSaved(next);
      setDraft(next);
      setSavedNote('Saved.');
      // The page heading and title are server-rendered from the same columns.
      router.refresh();
    } catch (err) {
      setRefusal(refusalOf(err, 'Could not save the synth. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const field = (
    name: keyof Draft,
    label: string,
    help: React.ReactNode,
    input: (props: {
      id: string;
      value: string;
      'aria-invalid': boolean;
      'aria-describedby'?: string;
    }) => React.ReactNode
  ) => {
    const messages = placed.at(name);
    const id = `synth-${name}`;
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>
          {label}{' '}
          <FieldHelp title={label} ariaLabel={`About the ${label.toLowerCase()}`}>
            {help}
          </FieldHelp>
        </Label>
        {input({
          id,
          value: draft[name],
          'aria-invalid': messages.length > 0,
          'aria-describedby': messages.length ? `${id}-problems` : undefined,
        })}
        <FieldProblems id={`${id}-problems`} messages={messages} />
      </div>
    );
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-2xl space-y-4">
      <RefusalSummary refusal={refusal} unplaced={placed.unplaced} />
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          'name',
          'Name',
          <p>
            The model name as the catalogue shows it, without the maker: <code>Model D</code>.
          </p>,
          (p) => (
            <Input {...p} maxLength={200} onChange={(e) => set('name')(e.target.value)} />
          )
        )}
        {field(
          'maker',
          'Maker',
          <p>
            Who made the original instrument: <code>Moog</code>.
          </p>,
          (p) => (
            <Input {...p} maxLength={200} onChange={(e) => set('maker')(e.target.value)} />
          )
        )}
        {field('year', 'Year', <p>The year the original came out, as four digits.</p>, (p) => (
          <Input
            {...p}
            inputMode="numeric"
            className="max-w-[8rem]"
            onChange={(e) => set('year')(e.target.value)}
          />
        ))}
        {field(
          'heritage',
          'Heritage',
          <p>
            One short line placing the synth in its family, shown under its name in the catalogue:
            for example <code>Monophonic, three oscillators</code>.
          </p>,
          (p) => (
            <Input {...p} maxLength={200} onChange={(e) => set('heritage')(e.target.value)} />
          )
        )}
      </div>
      {field(
        'summary',
        'Summary',
        <p>
          The paragraph that introduces the synth on its page and in the catalogue. Plain text.
        </p>,
        (p) => (
          <Textarea
            {...p}
            rows={5}
            maxLength={5000}
            onChange={(e) => set('summary')(e.target.value)}
          />
        )
      )}
      <p className="text-muted-foreground text-xs">
        Saving marks the synth edited: the seed stops updating these fields from its data files.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={readOnly || !dirty || saving}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>
        {savedNote && <span className="text-muted-foreground text-sm">{savedNote}</span>}
      </div>
    </form>
  );
}
