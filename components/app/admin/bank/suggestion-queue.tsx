'use client';

/**
 * SuggestionQueue — the synths users say are missing (`f-databank` t-37), for an admin to accept, merge or decline.
 *
 * Each decision is `POST /api/v1/admin/bank/suggestions/[id]`. **Accept** creates the instrument through the
 * databank's create path, so the server checks it as it checks any new row, and a refusal is shown on the fields it
 * names. **Merge** records that it is already in the databank. **Decline** keeps a reason. A decided suggestion shows
 * its outcome and cannot be decided again.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import { bankAdminPath } from '@/components/app/admin/bank/paths';
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
import { INSTRUMENT_KINDS } from '@/lib/app/bank/data';
import type { AdminSuggestion, SuggestionDecision } from '@/lib/app/bank/suggestion-data';

type Mode = 'accept' | 'merge' | 'decline';

/** A databank id from free text: lowercase words joined by hyphens, as `BankIdSchema` requires. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const STATUS_LABEL: Record<AdminSuggestion['status'], string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  MERGED: 'Merged',
  DECLINED: 'Declined',
};

export function SuggestionQueue({ suggestions }: { suggestions: AdminSuggestion[] }) {
  if (suggestions.length === 0)
    return <p className="text-muted-foreground text-sm">No suggestions here.</p>;
  return (
    <ul className="space-y-4">
      {suggestions.map((s) => (
        <li key={s.id}>
          <SuggestionCard suggestion={s} />
        </li>
      ))}
    </ul>
  );
}

function SuggestionCard({ suggestion: s }: { suggestion: AdminSuggestion }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const readOnly = useSharedSettingsReadOnly();

  return (
    <article className="rounded-md border p-4" aria-labelledby={`suggestion-${s.id}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`suggestion-${s.id}`} className="font-medium">
          {s.name} <span className="text-muted-foreground font-normal">· {s.maker}</span>
        </h2>
        <span className="text-muted-foreground text-xs">
          {STATUS_LABEL[s.status]} · suggested by {s.suggestedBy ?? 'an erased account'} on{' '}
          {new Date(s.createdAt).toLocaleDateString()}
        </span>
      </header>
      {s.link && (
        <p className="mt-1 text-sm break-all">
          <a href={s.link} target="_blank" rel="noopener noreferrer nofollow" className="underline">
            {s.link}
          </a>
        </p>
      )}
      {s.note && <p className="mt-2 text-sm whitespace-pre-line">{s.note}</p>}

      {s.status === 'PENDING' ? (
        mode === null ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={readOnly} onClick={() => setMode('accept')}>
              Accept…
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={readOnly}
              onClick={() => setMode('merge')}
            >
              Merge…
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={readOnly}
              onClick={() => setMode('decline')}
            >
              Decline…
            </Button>
          </div>
        ) : (
          <DecisionForm suggestion={s} mode={mode} onCancel={() => setMode(null)} />
        )
      ) : (
        <Outcome suggestion={s} />
      )}
    </article>
  );
}

function Outcome({ suggestion: s }: { suggestion: AdminSuggestion }) {
  return (
    <p className="mt-3 text-sm">
      {s.status === 'DECLINED' ? (
        <>Declined: {s.reason}</>
      ) : s.instrumentId ? (
        <>
          {s.status === 'ACCEPTED' ? 'Added as ' : 'Already in the databank as '}
          <Link href={bankAdminPath('instruments', s.instrumentId)} className="underline">
            {s.instrumentId}
          </Link>
        </>
      ) : null}
    </p>
  );
}

const ACCEPT_KEYS = [
  'instrument.id',
  'instrument.name',
  'instrument.maker',
  'instrument.year',
  'instrument.kind',
  'instrument.text',
  'instrument.source',
];

function DecisionForm({
  suggestion: s,
  mode,
  onCancel,
}: {
  suggestion: AdminSuggestion;
  mode: Mode;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [instrument, setInstrument] = useState({
    id: slugify(`${s.maker} ${s.name}`),
    name: s.name,
    maker: s.maker,
    year: '',
    kind: 'mono' as (typeof INSTRUMENT_KINDS)[number],
    text: '',
    source: s.link ?? '',
  });
  const [instrumentId, setInstrumentId] = useState('');
  const [reason, setReason] = useState('');

  const placed = placeProblems(refusal?.problems ?? [], [...ACCEPT_KEYS, 'instrumentId', 'reason']);
  const f = (key: string) => `suggestion-${s.id}-${key}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setRefusal(null);
    const body: SuggestionDecision =
      mode === 'accept'
        ? {
            action: 'accept',
            instrument: { ...instrument, source: instrument.source.trim() || undefined },
          }
        : mode === 'merge'
          ? { action: 'merge', instrumentId: instrumentId.trim() }
          : { action: 'decline', reason };
    try {
      await apiClient.post(`/api/v1/admin/bank/suggestions/${encodeURIComponent(s.id)}`, { body });
      // Stays saving until the refresh replaces this form with the outcome, so it cannot be sent twice.
      router.refresh();
    } catch (err) {
      setRefusal(refusalOf(err, 'Could not save the decision. Try again.'));
      setSaving(false);
    }
  }

  const set = (key: keyof typeof instrument) => (value: string) =>
    setInstrument((prev) => ({ ...prev, [key]: value }));

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3" noValidate>
      {mode === 'accept' && (
        <>
          <p className="text-muted-foreground text-sm">
            Adds the instrument to the databank. Fill in what the suggestion did not say; it can be
            edited further from the Databank page.
          </p>
          <Field
            id={f('id')}
            label="Id"
            value={instrument.id}
            onChange={set('id')}
            problems={placed.at('instrument.id')}
            help={
              <p>
                Lowercase letters, digits and hyphens: <code>sequential-prophet-5</code>. It is the
                instrument&apos;s URL and cannot be changed later.
              </p>
            }
          />
          <Field
            id={f('name')}
            label="Name"
            value={instrument.name}
            onChange={set('name')}
            problems={placed.at('instrument.name')}
          />
          <Field
            id={f('maker')}
            label="Company"
            value={instrument.maker}
            onChange={set('maker')}
            problems={placed.at('instrument.maker')}
            help={
              <p>
                The company that sold it, as text: <code>Moog Music</code>.
              </p>
            }
          />
          <Field
            id={f('year')}
            label="Year"
            value={instrument.year}
            onChange={set('year')}
            problems={placed.at('instrument.year')}
            help={
              <p>
                A year or range, as text: <code>1970</code>, <code>1980s</code>.
              </p>
            }
          />
          <div className="space-y-1">
            <Label htmlFor={f('kind')}>
              Kind{' '}
              <FieldHelp title="Kind">
                <p>What sort of instrument it is, as the databank sorts them.</p>
              </FieldHelp>
            </Label>
            <select
              id={f('kind')}
              value={instrument.kind}
              onChange={(e) => set('kind')(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {INSTRUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <FieldProblems messages={placed.at('instrument.kind')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={f('text')}>
              Text{' '}
              <FieldHelp title="Text">
                <p>The instrument&apos;s page text: what it is and why it matters.</p>
              </FieldHelp>
            </Label>
            <Textarea
              id={f('text')}
              value={instrument.text}
              onChange={(e) => set('text')(e.target.value)}
              rows={4}
            />
            <FieldProblems messages={placed.at('instrument.text')} />
          </div>
          <Field
            id={f('source')}
            label="Source"
            value={instrument.source}
            onChange={set('source')}
            problems={placed.at('instrument.source')}
            help={
              <p>
                A web address where its facts can be checked, shown on its page. Starts as the
                suggestion&apos;s link. Optional.
              </p>
            }
          />
        </>
      )}

      {mode === 'merge' && (
        <Field
          id={f('instrumentId')}
          label="Instrument id"
          value={instrumentId}
          onChange={setInstrumentId}
          problems={placed.at('instrumentId')}
          help={
            <p>
              The id of the databank instrument this suggestion already is:{' '}
              <code>moog-minimoog</code>. Nothing is added; the suggestion is closed as merged.
            </p>
          }
        />
      )}

      {mode === 'decline' && (
        <div className="space-y-1">
          <Label htmlFor={f('reason')}>
            Reason{' '}
            <FieldHelp title="Reason">
              <p>
                Why it is not being added, kept with the suggestion: not a synth, a duplicate, not
                enough to go on.
              </p>
            </FieldHelp>
          </Label>
          <Textarea
            id={f('reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          <FieldProblems messages={placed.at('reason')} />
        </div>
      )}

      <RefusalSummary refusal={refusal} unplaced={placed.unplaced} />

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {mode === 'accept' ? 'Add instrument' : mode === 'merge' ? 'Merge' : 'Decline'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  problems,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  problems: string[];
  help?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {help && (
          <>
            {' '}
            <FieldHelp title={label}>{help}</FieldHelp>
          </>
        )}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problems.length > 0}
      />
      <FieldProblems messages={problems} />
    </div>
  );
}
