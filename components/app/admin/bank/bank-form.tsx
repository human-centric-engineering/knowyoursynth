'use client';

/**
 * BankForm — create, edit or remove one databank row (`f-databank` t-36): a maker, instrument, artist or song, a song
 * with its parts.
 *
 * Saved whole: `POST /api/v1/admin/bank/[kind]` for a new row, `PUT /api/v1/admin/bank/[kind]/[id]` for an existing
 * one, `DELETE` to remove it. Lists of ids are typed as ids separated by commas; the server checks every one against the
 * databank, as the seed does, and refuses a save or removal that would leave a reference dangling, naming each. Saving
 * marks the row edited, so the seed no longer updates it.
 */

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import { BANK_SINGULAR, bankAdminPath } from '@/components/app/admin/bank/paths';
import { MoveButtons, move, nextRowKey } from '@/components/app/admin/synths/order-controls';
import {
  FieldProblems,
  placeProblems,
  refusalOf,
  RefusalSummary,
  type Refusal,
} from '@/components/app/admin/synths/problems';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api/client';
import {
  ARTIST_KINDS,
  BankPartSchema,
  INSTRUMENT_KINDS,
  SONG_KINDS,
  type BankPart,
} from '@/lib/app/bank/data';
import type { AdminBankDetail } from '@/lib/app/bank/admin';
import type { BankKind } from '@/lib/app/bank/read';

/**
 * How a field is typed: one line of text (`text`, or `optional` when it may be left empty), a paragraph, a list with
 * one entry per line (`lines`), a list separated by commas (`list`), or one of a fixed set (`select`).
 */
type FieldType = 'text' | 'optional' | 'textarea' | 'lines' | 'list' | 'select';

interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  help?: ReactNode;
}

const idList = (what: string, example: string) => (
  <p>
    The ids of {what}, separated by commas, in order: <code>{example}</code>. Each must already be
    in the databank; a save naming one that is not is refused.
  </p>
);

/** The fields of each kind, in the order the form shows them. The id is not here: it is set once, on create. */
export const BANK_FIELDS: Record<BankKind, FieldSpec[]> = {
  makers: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'born', label: 'Born', type: 'optional', help: <p>A year, as text. Optional.</p> },
    { key: 'died', label: 'Died', type: 'optional', help: <p>A year, as text. Optional.</p> },
    { key: 'country', label: 'Country', type: 'text' },
    {
      key: 'companies',
      label: 'Companies',
      type: 'lines',
      help: <p>The companies they founded or worked at, one per line.</p>,
    },
    {
      key: 'summary',
      label: 'Summary',
      type: 'textarea',
      help: <p>One or two sentences, shown in the Innovators list.</p>,
    },
    { key: 'story', label: 'Story', type: 'textarea', help: <p>The page&apos;s main text.</p> },
    {
      key: 'innovations',
      label: 'Innovations',
      type: 'lines',
      help: <p>What they brought to synthesis, one per line.</p>,
    },
  ],
  instruments: [
    { key: 'name', label: 'Name', type: 'text' },
    {
      key: 'maker',
      label: 'Company',
      type: 'text',
      help: (
        <p>
          The company that sold it, as text: <code>Moog Music</code>.
        </p>
      ),
    },
    {
      key: 'year',
      label: 'Year',
      type: 'text',
      help: (
        <p>
          A year or range, as text: <code>1970</code>, <code>1980s</code>.
        </p>
      ),
    },
    { key: 'kind', label: 'Kind', type: 'select', options: INSTRUMENT_KINDS },
    {
      key: 'people',
      label: 'People',
      type: 'list',
      help: idList('the innovators behind it', 'robert-moog, jim-scott'),
    },
    {
      key: 'app',
      label: 'App synths',
      type: 'list',
      help: (
        <p>
          The ids of the app&apos;s synths that model it: <code>model-d</code>. Records played on it
          then show in those synths&apos; &quot;Heard on&quot; lists.
        </p>
      ),
    },
    {
      key: 'recreationOf',
      label: 'Recreation of',
      type: 'optional',
      help: (
        <p>
          For a recreation, the id of the original instrument it models: <code>moog-minimoog</code>.
          Leave empty for an original.
        </p>
      ),
    },
    { key: 'text', label: 'Text', type: 'textarea', help: <p>The instrument&apos;s page text.</p> },
  ],
  artists: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'kind', label: 'Kind', type: 'select', options: ARTIST_KINDS },
    {
      key: 'members',
      label: 'Members',
      type: 'list',
      help: (
        <p>
          For a group, the ids of its members, in order. A group lists its members, so this is where
          membership is set; a member&apos;s page shows the groups that list them.
        </p>
      ),
    },
    { key: 'country', label: 'Country', type: 'text' },
    {
      key: 'active',
      label: 'Active',
      type: 'text',
      help: (
        <p>
          The years they were active, as text: <code>1968–present</code>.
        </p>
      ),
    },
    {
      key: 'eras',
      label: 'Eras',
      type: 'list',
      help: (
        <p>
          Decades to file them under, separated by commas: <code>1970s, 1980s</code>. Leave empty to
          use the decades of their records.
        </p>
      ),
    },
    { key: 'genres', label: 'Genres', type: 'list', help: <p>Separated by commas.</p> },
    {
      key: 'roles',
      label: 'Roles',
      type: 'list',
      help: (
        <p>
          What they did, separated by commas: <code>player, producer</code>.
        </p>
      ),
    },
    {
      key: 'summary',
      label: 'Summary',
      type: 'textarea',
      help: <p>One or two sentences, shown in the Artists list.</p>,
    },
    { key: 'story', label: 'Story', type: 'textarea', help: <p>The page&apos;s main text.</p> },
    {
      key: 'innovations',
      label: 'Innovations',
      type: 'lines',
      help: <p>What they brought to synth music, one per line.</p>,
    },
    {
      key: 'instruments',
      label: 'Other instruments',
      type: 'list',
      help: idList(
        'instruments they are known to have used beyond their records (those are joined in)',
        'roland-tb-303'
      ),
    },
  ],
  songs: [
    { key: 'title', label: 'Title', type: 'text' },
    {
      key: 'kind',
      label: 'Kind',
      type: 'select',
      options: SONG_KINDS,
      help: (
        <p>
          A body of work (<code>body</code>) has no single record to name.
        </p>
      ),
    },
    { key: 'year', label: 'Year', type: 'optional', help: <p>A year or range, as text.</p> },
    { key: 'album', label: 'Album', type: 'optional' },
    {
      key: 'artists',
      label: 'Artists',
      type: 'list',
      help: idList('its credited artists', 'kraftwerk'),
    },
    {
      key: 'credit',
      label: 'Credit',
      type: 'optional',
      help: (
        <p>
          The printed credit, when the artists&apos; names alone lose something. Optional: by
          default the names are joined.
        </p>
      ),
    },
  ],
};

interface SynthRow {
  key: number;
  synthId: string;
  listed: boolean;
  sound: string;
  note: string;
}

interface PartRow {
  key: number;
  instruments: string;
  on: string;
  player: string;
  text: string;
  synths: SynthRow[];
}

interface Draft {
  id: string;
  fields: Record<string, string>;
  parts: PartRow[];
}

const splitList = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const splitLines = (v: string) =>
  v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

const emptyPart = (): PartRow => ({
  key: nextRowKey(),
  instruments: '',
  on: '',
  player: '',
  text: '',
  synths: [],
});

const emptySynth = (): SynthRow => ({
  key: nextRowKey(),
  synthId: '',
  listed: false,
  sound: '',
  note: '',
});

function partRowOf(p: BankPart): PartRow {
  const ids = [
    ...new Set([
      ...(p.synths ?? []),
      ...Object.keys(p.sounds ?? {}),
      ...Object.keys(p.notes ?? {}),
    ]),
  ];
  return {
    key: nextRowKey(),
    instruments: p.instruments.join(', '),
    on: p.on,
    player: p.player ?? '',
    text: p.text,
    synths: ids.map((synthId) => ({
      key: nextRowKey(),
      synthId,
      listed: Boolean(p.synths?.includes(synthId)),
      sound: p.sounds?.[synthId] ?? '',
      note: p.notes?.[synthId] ?? '',
    })),
  };
}

/** The form's draft of a stored row, or of a new one. */
export function draftOf(kind: BankKind, row: Record<string, unknown> | null): Draft {
  const fields: Record<string, string> = {};
  for (const f of BANK_FIELDS[kind]) {
    const v = row?.[f.key];
    fields[f.key] = Array.isArray(v)
      ? v.join(f.type === 'lines' ? '\n' : ', ')
      : typeof v === 'string'
        ? v
        : f.type === 'select'
          ? (f.options?.[0] ?? '')
          : '';
  }
  const read = kind === 'songs' ? PartsSchema.safeParse(row?.parts) : null;
  const parts = read?.success ? read.data : [];
  return {
    id: typeof row?.id === 'string' ? row.id : '',
    fields,
    parts: kind === 'songs' ? (parts.length ? parts.map(partRowOf) : [emptyPart()]) : [],
  };
}

/** A song's parts as the API sent them: read, rather than trust their type. */
const PartsSchema = z.array(BankPartSchema);

const nonEmpty = (o: Record<string, string>) => (Object.keys(o).length ? o : undefined);

/** The request body for a draft: the row in the files' shape, with its id when it is new. */
export function bodyOf(kind: BankKind, draft: Draft, withId: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = withId ? { id: draft.id.trim() } : {};
  for (const f of BANK_FIELDS[kind]) {
    const v = draft.fields[f.key] ?? '';
    if (f.type === 'list') body[f.key] = splitList(v);
    else if (f.type === 'lines') body[f.key] = splitLines(v);
    else if (f.type === 'optional') {
      if (v.trim()) body[f.key] = v.trim();
    } else body[f.key] = v;
  }
  if (kind === 'songs')
    body.parts = draft.parts.map((p) => {
      const synths = p.synths.filter((s) => s.synthId.trim());
      const sounds = nonEmpty(
        Object.fromEntries(
          synths.filter((s) => s.sound.trim()).map((s) => [s.synthId.trim(), s.sound.trim()])
        )
      );
      const notes = nonEmpty(
        Object.fromEntries(
          synths.filter((s) => s.note.trim()).map((s) => [s.synthId.trim(), s.note])
        )
      );
      const listed = synths.filter((s) => s.listed).map((s) => s.synthId.trim());
      return {
        instruments: splitList(p.instruments),
        on: p.on,
        ...(p.player.trim() ? { player: p.player.trim() } : {}),
        ...(listed.length ? { synths: listed } : {}),
        ...(sounds ? { sounds } : {}),
        text: p.text,
        ...(notes ? { notes } : {}),
      };
    });
  return body;
}

export interface BankFormProps {
  kind: BankKind;
  /** The stored row, or `null` for a new one. */
  detail: AdminBankDetail | null;
}

export function BankForm({ kind, detail }: BankFormProps) {
  const router = useRouter();
  const readOnly = useSharedSettingsReadOnly();
  const isNew = detail === null;
  const [draft, setDraft] = useState(() => draftOf(kind, detail?.row ?? null));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const singular = BANK_SINGULAR[kind];
  const base = `/api/v1/admin/bank/${kind}`;

  const keys = [
    'id',
    'parts',
    ...BANK_FIELDS[kind].map((f) => f.key),
    ...draft.parts.flatMap((_, i) =>
      ['instruments', 'on', 'player', 'text', 'synths', 'sounds', 'notes'].map(
        (f) => `parts.${i}.${f}`
      )
    ),
  ];
  const placed = placeProblems(refusal?.problems ?? [], keys);

  const update = (change: (d: Draft) => Draft) => {
    setDraft(change);
    setSavedNote(null);
  };
  /** Moving or removing a part changes which part an index names, so an earlier refusal no longer points anywhere. */
  const restructure = (change: (d: Draft) => Draft) => {
    update(change);
    setRefusal(null);
  };
  const setPart = (i: number, change: (p: PartRow) => PartRow) =>
    update((d) => ({ ...d, parts: d.parts.map((p, j) => (j === i ? change(p) : p)) }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setRefusal(null);
    try {
      if (isNew) {
        const body = bodyOf(kind, draft, true);
        await apiClient.post(base, { body });
        router.push(bankAdminPath(kind, draft.id.trim()));
        return;
      }
      const after = await apiClient.put<Record<string, unknown>>(
        `${base}/${encodeURIComponent(draft.id)}`,
        { body: bodyOf(kind, draft, false) }
      );
      setDraft(draftOf(kind, after));
      setSavedNote('Saved.');
      router.refresh();
    } catch (err) {
      setRefusal(refusalOf(err, `Could not save the ${singular}. Try again.`));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    setRefusal(null);
    try {
      await apiClient.delete(`${base}/${encodeURIComponent(draft.id)}`);
      router.push(bankAdminPath(kind));
    } catch (err) {
      setRefusal(refusalOf(err, `Could not remove the ${singular}. Try again.`));
      setRemoving(false);
    }
  };

  const control = (
    key: string,
    label: string,
    type: FieldType,
    value: string,
    onChange: (v: string) => void,
    opts: { help?: ReactNode; options?: readonly string[] } = {}
  ) => {
    const id = `bank-${key.replace(/\./g, '-')}`;
    const messages = placed.at(key);
    const common = {
      id,
      value,
      'aria-invalid': messages.length > 0,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
      ) => onChange(e.target.value),
    };
    return (
      <div className="grid gap-1" key={key}>
        <Label htmlFor={id} className="text-xs">
          {label}
          {opts.help && (
            <>
              {' '}
              <FieldHelp title={label} ariaLabel={`About ${label.toLowerCase()}`}>
                {opts.help}
              </FieldHelp>
            </>
          )}
        </Label>
        {type === 'select' ? (
          <select
            {...common}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            {opts.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : type === 'textarea' || type === 'lines' ? (
          <Textarea {...common} rows={type === 'textarea' ? 4 : 3} />
        ) : (
          <Input {...common} />
        )}
        <FieldProblems messages={messages} />
      </div>
    );
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-3xl space-y-5">
      <RefusalSummary refusal={refusal} unplaced={placed.unplaced} />

      {isNew ? (
        control('id', 'Id', 'text', draft.id, (v) => update((d) => ({ ...d, id: v })), {
          help: (
            <p>
              Lowercase letters, digits and hyphens: <code>aphex-twin</code>. It is the row&apos;s
              address on the public pages and what other rows name it by, so it cannot be changed
              once saved. Artists and innovators share one set of ids.
            </p>
          ),
        })
      ) : (
        <p className="text-muted-foreground text-sm">
          Id <code>{draft.id}</code>
        </p>
      )}

      {BANK_FIELDS[kind].map((f) =>
        control(
          f.key,
          f.label,
          f.type,
          draft.fields[f.key] ?? '',
          (v) => update((d) => ({ ...d, fields: { ...d.fields, [f.key]: v } })),
          { help: f.help, options: f.options }
        )
      )}

      {kind === 'artists' && detail?.memberOf && detail.memberOf.length > 0 && (
        <p className="text-muted-foreground text-sm">
          Member of{' '}
          {detail.memberOf.map((g, i) => (
            <span key={g}>
              {i > 0 && ', '}
              <Link href={bankAdminPath('artists', g)} className="hover:underline">
                <code>{g}</code>
              </Link>
            </span>
          ))}
          . Membership is set on the group.
        </p>
      )}

      {kind === 'songs' && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            Parts{' '}
            <FieldHelp title="Parts" ariaLabel="About the parts">
              <p>
                What a synth plays on the work, at least one. Each part names the instruments it is
                played on (their ids), how the record prints it, who played it, and a sentence or
                two. A synth row ties the part to one of the app&apos;s synths: listed under it
                whatever the instruments, a library sound in its style, or its own text there.
              </p>
            </FieldHelp>
          </legend>
          <FieldProblems messages={placed.at('parts')} />
          {draft.parts.map((part, i) => (
            <div key={part.key} className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium">Part {i + 1}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {control(
                  `parts.${i}.instruments`,
                  'Instruments',
                  'list',
                  part.instruments,
                  (v) => setPart(i, (p) => ({ ...p, instruments: v })),
                  { help: idList('the instruments it is played on, at least one', 'moog-minimoog') }
                )}
                {control(
                  `parts.${i}.player`,
                  'Player',
                  'optional',
                  part.player,
                  (v) => setPart(i, (p) => ({ ...p, player: v })),
                  { help: <p>The id of the artist who played it, when it is not the credit.</p> }
                )}
              </div>
              {control(
                `parts.${i}.on`,
                'On',
                'text',
                part.on,
                (v) => setPart(i, (p) => ({ ...p, on: v })),
                {
                  help: (
                    <p>
                      The instrument as printed: <code>Roland Jupiter-8 (the lead)</code>.
                    </p>
                  ),
                }
              )}
              {control(`parts.${i}.text`, 'Text', 'textarea', part.text, (v) =>
                setPart(i, (p) => ({ ...p, text: v }))
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium">App synths</p>
                <FieldProblems
                  messages={[
                    ...placed.at(`parts.${i}.synths`),
                    ...placed.at(`parts.${i}.sounds`),
                    ...placed.at(`parts.${i}.notes`),
                  ]}
                />
                {part.synths.map((s, k) => {
                  const setSynth = (change: (r: SynthRow) => SynthRow) =>
                    setPart(i, (p) => ({
                      ...p,
                      synths: p.synths.map((r, n) => (n === k ? change(r) : r)),
                    }));
                  const prefix = `bank-parts-${i}-synth-${k}`;
                  return (
                    <div
                      key={s.key}
                      className="grid gap-2 rounded border p-2 sm:grid-cols-[10rem_1fr]"
                    >
                      <div className="grid gap-1">
                        <Label htmlFor={`${prefix}-id`} className="text-xs">
                          Synth
                        </Label>
                        <Input
                          id={`${prefix}-id`}
                          value={s.synthId}
                          onChange={(e) => setSynth((r) => ({ ...r, synthId: e.target.value }))}
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`${prefix}-listed`}
                            checked={s.listed}
                            onCheckedChange={(v) => setSynth((r) => ({ ...r, listed: v === true }))}
                          />
                          <Label htmlFor={`${prefix}-listed`} className="text-xs">
                            Listed under it
                          </Label>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <div className="grid gap-1">
                          <Label htmlFor={`${prefix}-sound`} className="text-xs">
                            Sound{' '}
                            <FieldHelp title="Sound" ariaLabel="About the sound">
                              <p>
                                The id of a sound in this synth&apos;s library, in the part&apos;s
                                style: &quot;Load a sound in this style&quot;. Optional.
                              </p>
                            </FieldHelp>
                          </Label>
                          <Input
                            id={`${prefix}-sound`}
                            value={s.sound}
                            onChange={(e) => setSynth((r) => ({ ...r, sound: e.target.value }))}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor={`${prefix}-note`} className="text-xs">
                            Note{' '}
                            <FieldHelp title="Note" ariaLabel="About the note">
                              <p>
                                Shown in this synth&apos;s list in place of the part&apos;s text.
                                Optional.
                              </p>
                            </FieldHelp>
                          </Label>
                          <Textarea
                            id={`${prefix}-note`}
                            rows={2}
                            value={s.note}
                            onChange={(e) => setSynth((r) => ({ ...r, note: e.target.value }))}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="justify-self-start"
                          onClick={() =>
                            setPart(i, (p) => ({
                              ...p,
                              synths: p.synths.filter((_, n) => n !== k),
                            }))
                          }
                        >
                          Remove synth
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPart(i, (p) => ({ ...p, synths: [...p.synths, emptySynth()] }))}
                >
                  Add an app synth
                </Button>
              </div>

              <div className="flex gap-2">
                <MoveButtons
                  label={`part ${i + 1}`}
                  index={i}
                  length={draft.parts.length}
                  onMove={(by) => restructure((d) => ({ ...d, parts: move(d.parts, i, by) }))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    restructure((d) => ({ ...d, parts: d.parts.filter((_, j) => j !== i) }))
                  }
                >
                  Remove part
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => update((d) => ({ ...d, parts: [...d.parts, emptyPart()] }))}
          >
            Add a part
          </Button>
        </fieldset>
      )}

      <p className="text-muted-foreground text-xs">
        Saving marks the {singular} edited: the seed stops updating it from its data file.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={readOnly || saving || removing}>
          {saving ? 'Saving…' : isNew ? `Create ${singular}` : `Save ${singular}`}
        </Button>
        {savedNote && <span className="text-muted-foreground text-sm">{savedNote}</span>}
        {!isNew && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                className="ml-auto"
                disabled={readOnly || saving || removing}
              >
                {removing ? 'Removing…' : `Remove ${singular}`}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this {singular}?</AlertDialogTitle>
                <AlertDialogDescription>
                  It goes from the databank and its public page, and the seed will not bring it
                  back. While anything else points at it the removal is refused, with a list of what
                  does.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void remove()}>Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </form>
  );
}
