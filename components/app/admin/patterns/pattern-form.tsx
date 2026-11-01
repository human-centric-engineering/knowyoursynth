'use client';

/**
 * PatternForm — one library pattern, as an admin changes it (`f-pattern-library` t-126).
 *
 * Its name, role, provenance (Inspired by, fidelity, sources and origin) and tempo range are fields; its notes are
 * edited in the sequencer module itself (`components/app/sequencer/sequencer.tsx`), silent here, as there is no panel
 * to play them through. Save sends only what changed to `PATCH /api/v1/admin/library-patterns/[id]`, which checks the
 * whole pattern and refuses with every problem: each lands on the field it names (`problems.tsx`). Saving marks the
 * pattern edited, so the seed leaves it alone, and rewrites the riff of every patch it is the default of.
 */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import type {
  PatternFidelity,
  PatternInspiration,
  PatternOrigin,
  PatternRole,
} from '@prisma/client';

import {
  SharedSettingsSaveHint,
  useSharedSettingsReadOnly,
} from '@/components/admin/shared-settings-access';
import { ORIGIN_LABELS, soundPatternsPath } from '@/components/app/admin/patterns/paths';
import {
  FieldProblems,
  placeProblems,
  refusalOf,
  RefusalSummary,
  type Refusal,
} from '@/components/app/admin/synths/problems';
import { nextRowKey } from '@/components/app/admin/synths/order-controls';
import { Sequencer } from '@/components/app/sequencer/sequencer';
import { useSequencer } from '@/components/app/sequencer/use-sequencer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api/client';
import { FIDELITY_LABELS, ROLE_LABELS } from '@/lib/app/patterns/library-labels';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-roles';
// Types only: these modules hold the database client.
import type {
  AdminLibraryPattern,
  AdminLibraryRow,
  InspiredByInput,
  LibraryPatternChoices,
  LibraryPatternEdit,
} from '@/lib/app/patterns/library-edit';
import type { PatternSource } from '@/lib/app/patterns/library';

const SELECT = 'border-input bg-background h-9 rounded-md border px-3 text-sm';

/** Each source type's name (`pattern-library.md`, Sources), in the design's order of trust. */
export const SOURCE_LABELS: Record<PatternSource['type'], string> = {
  score: 'Score',
  stems: 'Stems or MIDI',
  isolated_part: 'Isolated part',
  interview: 'Interview',
  gear_writeup: 'Gear write-up',
  video: 'Video of the performance',
  transcription: 'Published transcription',
  by_ear: 'By ear',
};

const INSPIRATION_LABELS: Record<PatternInspiration, string> = {
  work: 'A work',
  artist: 'An artist',
  synth: 'A synth',
  genre: 'A genre',
};

/** Inspired by as the form holds it: every kind's choice kept, so switching kind and back loses nothing. */
interface InspiredDraft {
  kind: PatternInspiration;
  songId: string;
  partId: string;
  artistId: string;
  synthId: string;
  label: string;
}

interface SourceDraft {
  key: number;
  type: PatternSource['type'];
  citation: string;
  url: string;
  checkedAt: string;
}

interface Draft {
  name: string;
  role: PatternRole;
  fidelity: PatternFidelity;
  origin: PatternOrigin;
  tempoMin: string;
  tempoMax: string;
  inspired: InspiredDraft;
  sources: SourceDraft[];
}

function draftOf(p: AdminLibraryPattern): Draft {
  const by = p.inspiredBy;
  return {
    name: p.name,
    role: p.role,
    fidelity: p.fidelity,
    origin: p.origin,
    tempoMin: p.tempo ? String(p.tempo.min) : '',
    tempoMax: p.tempo ? String(p.tempo.max) : '',
    inspired: {
      kind: by.kind,
      songId: by.songId ?? '',
      partId: by.partId ?? '',
      artistId: by.artistId ?? '',
      synthId: by.synthId ?? '',
      label: by.kind === 'genre' ? by.label : '',
    },
    sources: p.sources.map((s) => ({
      key: nextRowKey(),
      type: s.type,
      citation: s.citation,
      url: s.url ?? '',
      checkedAt: s.checkedAt,
    })),
  };
}

/** The Inspired by a draft sends. */
function inspiredInput(d: InspiredDraft): InspiredByInput {
  switch (d.kind) {
    case 'work':
      return { kind: 'work', songId: d.songId, partId: d.partId || null };
    case 'artist':
      return { kind: 'artist', artistId: d.artistId };
    case 'synth':
      return { kind: 'synth', synthId: d.synthId };
    case 'genre':
      return { kind: 'genre', label: d.label };
  }
}

/** A tempo field as a number. Empty or not a number, it is sent as nothing, and the server names the field. */
const bpm = (text: string): number => (text.trim() === '' ? NaN : Number(text));

/** The tempo range a draft sends: none when both are empty. */
function tempoInput(d: Draft): LibraryPatternEdit['tempo'] {
  if (d.tempoMin.trim() === '' && d.tempoMax.trim() === '') return null;
  return { min: bpm(d.tempoMin), max: bpm(d.tempoMax) };
}

const sourcesInput = (sources: SourceDraft[]): PatternSource[] =>
  sources.map((s) => ({
    type: s.type,
    citation: s.citation,
    ...(s.url.trim() && { url: s.url.trim() }),
    checkedAt: s.checkedAt,
  }));

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A select's value as one of its options: the option it names, else `fallback`. */
function oneOf<T extends string>(options: readonly T[], value: string, fallback: T): T {
  return options.find((o) => o === value) ?? fallback;
}

const keysOf = <T extends string>(record: Record<T, unknown>): T[] =>
  Object.keys(record).filter((k): k is T => k in record);

/** What a draft and the sequencer's notes change about the saved pattern: only those fields. */
export function editOf(
  saved: AdminLibraryPattern,
  d: Draft,
  notes: AdminLibraryPattern['pattern']
): LibraryPatternEdit {
  const savedDraft = draftOf(saved);
  const edit: LibraryPatternEdit = {};
  if (d.name !== saved.name) edit.name = d.name;
  if (d.role !== saved.role) edit.role = d.role;
  if (d.fidelity !== saved.fidelity) edit.fidelity = d.fidelity;
  if (d.origin !== saved.origin) edit.origin = d.origin;
  const tempo = tempoInput(d);
  if (!same(tempo, saved.tempo)) edit.tempo = tempo;
  const inspired = inspiredInput(d.inspired);
  if (!same(inspired, inspiredInput(savedDraft.inspired))) edit.inspiredBy = inspired;
  const sources = sourcesInput(d.sources);
  if (!same(sources, saved.sources)) edit.sources = sources;
  if (!same(notes, saved.pattern)) edit.pattern = notes;
  return edit;
}

const FIELDS = ['name', 'role', 'fidelity', 'origin', 'tempo', 'inspiredBy', 'sources', 'pattern'];

export interface PatternFormProps {
  pattern: AdminLibraryPattern;
  choices: LibraryPatternChoices;
}

export function PatternForm({ pattern, choices }: PatternFormProps) {
  const readOnly = useSharedSettingsReadOnly();
  const [saved, setSaved] = useState(pattern);
  const [draft, setDraft] = useState(() => draftOf(pattern));
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // The sequencer edits the notes. It has no engine here: nothing plays, and nothing needs to.
  const seq = useSequencer({ engine: null, ensureAudio: () => Promise.resolve(false), riff: null });
  const { load } = seq;
  // What the sequencer holds once the saved notes are loaded: the baseline its edits are compared with.
  const [notesBase, setNotesBase] = useState(saved.pattern);
  // On mount and after each save: the sequencer then holds the notes as the server stored them.
  useEffect(() => {
    const held = load(saved.pattern, { id: null, name: saved.name }, { quiet: true });
    if (held) setNotesBase(held);
  }, [load, saved]);

  const edit = useMemo(
    () => editOf({ ...saved, pattern: notesBase }, draft, seq.pattern),
    [saved, notesBase, draft, seq.pattern]
  );
  const changed = Object.keys(edit).length > 0;
  const placed = placeProblems(refusal?.problems ?? [], FIELDS);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus(null);
  };
  const setInspired = (patch: Partial<InspiredDraft>) =>
    set('inspired', { ...draft.inspired, ...patch });
  const setSource = (key: number, patch: Partial<SourceDraft>) =>
    set(
      'sources',
      draft.sources.map((s) => (s.key === key ? { ...s, ...patch } : s))
    );
  const song = choices.songs.find((s) => s.id === draft.inspired.songId);
  const defaults = saved.sounds.filter((s) => s.isDefault);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!changed || readOnly) return;
    setSaving(true);
    setRefusal(null);
    setStatus(null);
    try {
      const row = await apiClient.patch<AdminLibraryRow>(
        `/api/v1/admin/library-patterns/${saved.id}`,
        { body: edit }
      );
      if ('problem' in row) {
        setRefusal({ message: row.problem, problems: [] });
        return;
      }
      setSaved(row);
      setDraft(draftOf(row));
      setStatus(
        defaults.length
          ? `Saved. The riff of ${defaults.length === 1 ? 'the patch' : `${defaults.length} patches`} it is the default of now plays it.`
          : 'Saved.'
      );
    } catch (err) {
      setRefusal(refusalOf(err, 'The pattern could not be saved. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  const field = (
    id: string,
    label: string,
    help: ReactNode | null,
    input: ReactNode,
    key: string
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {help && (
          <>
            {' '}
            <FieldHelp title={label} ariaLabel={`About ${label.toLowerCase()}`}>
              {help}
            </FieldHelp>
          </>
        )}
      </Label>
      {input}
      <FieldProblems messages={placed.at(key)} />
    </div>
  );

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-6" aria-label="Edit pattern">
      <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
        {field(
          'pattern-name',
          'Name',
          null,
          <Input
            id="pattern-name"
            value={draft.name}
            maxLength={120}
            onChange={(e) => set('name', e.target.value)}
          />,
          'name'
        )}
        {field(
          'pattern-role',
          'Role',
          <p>
            The part the notes play, not what the patch sounds like: a pad patch can play a bass
            line. Suggestions match a patch to patterns by role.
          </p>,
          <select
            id="pattern-role"
            value={draft.role}
            onChange={(e) => set('role', oneOf(PATTERN_ROLES, e.target.value, draft.role))}
            className={SELECT}
          >
            {PATTERN_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>,
          'role'
        )}
        {field(
          'pattern-fidelity',
          'Fidelity',
          <>
            {Object.values(FIDELITY_LABELS).map(({ label, means }) => (
              <p key={label} className="mt-1 first:mt-0">
                <strong>{label}</strong>: {means}
              </p>
            ))}
            <p className="mt-2">
              Transcribed and reconstructed patterns recreate a part of a work, so they are inspired
              by that work and list their sources. The weakest source sets the label.
            </p>
          </>,
          <select
            id="pattern-fidelity"
            value={draft.fidelity}
            onChange={(e) =>
              set('fidelity', oneOf(keysOf(FIDELITY_LABELS), e.target.value, draft.fidelity))
            }
            className={SELECT}
          >
            {Object.entries(FIDELITY_LABELS).map(([f, { label }]) => (
              <option key={f} value={f}>
                {label}
              </option>
            ))}
          </select>,
          'fidelity'
        )}
        {field(
          'pattern-origin',
          'Origin',
          <p>
            Who or what made the notes: an agent (AI-generated), the owner or an admin
            (Human-authored), or a user whose pattern was taken into the library (User-contributed).
            Separate from fidelity.
          </p>,
          <select
            id="pattern-origin"
            value={draft.origin}
            onChange={(e) =>
              set('origin', oneOf(keysOf(ORIGIN_LABELS), e.target.value, draft.origin))
            }
            className={SELECT}
          >
            {Object.entries(ORIGIN_LABELS).map(([o, label]) => (
              <option key={o} value={o}>
                {label}
              </option>
            ))}
          </select>,
          'origin'
        )}
        <div className="grid gap-1.5 sm:col-span-2">
          <span className="text-sm leading-none font-medium">
            Tempo range{' '}
            <FieldHelp title="Tempo range" ariaLabel="About tempo range">
              <p>
                The slowest and fastest tempos, in bpm, the pattern still works at. It must include
                the tempo the notes are written at ({notesBase.bpm} bpm). Leave both empty when
                nobody has said: then it is only known to work at its own tempo.
              </p>
            </FieldHelp>
          </span>
          <div className="flex items-center gap-2">
            <Label htmlFor="pattern-tempo-min" className="sr-only">
              Slowest bpm
            </Label>
            <Input
              id="pattern-tempo-min"
              inputMode="numeric"
              placeholder="Slowest"
              value={draft.tempoMin}
              onChange={(e) => set('tempoMin', e.target.value)}
              className="w-28"
            />
            <span aria-hidden>–</span>
            <Label htmlFor="pattern-tempo-max" className="sr-only">
              Fastest bpm
            </Label>
            <Input
              id="pattern-tempo-max"
              inputMode="numeric"
              placeholder="Fastest"
              value={draft.tempoMax}
              onChange={(e) => set('tempoMax', e.target.value)}
              className="w-28"
            />
            <span className="text-muted-foreground text-sm">bpm</span>
          </div>
          <FieldProblems messages={placed.at('tempo')} />
        </div>
      </div>

      <fieldset className="max-w-3xl space-y-3">
        <legend className="text-sm font-medium">
          Inspired by{' '}
          <FieldHelp title="Inspired by" ariaLabel="About Inspired by">
            <p>
              Exactly one of a work in the databank (and the part of it, where the databank lists
              it), an artist in the databank, a synth in the catalogue, or a genre. A linked one is
              labelled from what it links to.
            </p>
            <p className="mt-2">
              &quot;Classic technique&quot; is not an answer: name a player, a band or a genre. A
              work not in the databank is added there first.
            </p>
          </FieldHelp>
        </legend>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="inspired-kind" className="text-xs">
              Kind
            </Label>
            <select
              id="inspired-kind"
              value={draft.inspired.kind}
              onChange={(e) =>
                setInspired({
                  kind: oneOf(keysOf(INSPIRATION_LABELS), e.target.value, draft.inspired.kind),
                })
              }
              className={SELECT}
            >
              {Object.entries(INSPIRATION_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {draft.inspired.kind === 'work' && (
            <>
              <div className="grid gap-1">
                <Label htmlFor="inspired-song" className="text-xs">
                  Work
                </Label>
                <select
                  id="inspired-song"
                  value={draft.inspired.songId}
                  onChange={(e) => setInspired({ songId: e.target.value, partId: '' })}
                  className={`${SELECT} max-w-72`}
                >
                  <option value="">Choose a work</option>
                  {choices.songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="inspired-part" className="text-xs">
                  Part
                </Label>
                <select
                  id="inspired-part"
                  value={draft.inspired.partId}
                  onChange={(e) => setInspired({ partId: e.target.value })}
                  disabled={!song || song.parts.length === 0}
                  className={`${SELECT} max-w-72`}
                >
                  <option value="">The work as a whole</option>
                  {song?.parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.on}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          {draft.inspired.kind === 'artist' && (
            <div className="grid gap-1">
              <Label htmlFor="inspired-artist" className="text-xs">
                Artist
              </Label>
              <select
                id="inspired-artist"
                value={draft.inspired.artistId}
                onChange={(e) => setInspired({ artistId: e.target.value })}
                className={`${SELECT} max-w-72`}
              >
                <option value="">Choose an artist</option>
                {choices.artists.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {draft.inspired.kind === 'synth' && (
            <div className="grid gap-1">
              <Label htmlFor="inspired-synth" className="text-xs">
                Synth
              </Label>
              <select
                id="inspired-synth"
                value={draft.inspired.synthId}
                onChange={(e) => setInspired({ synthId: e.target.value })}
                className={`${SELECT} max-w-72`}
              >
                <option value="">Choose a synth</option>
                {choices.synths.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.maker} {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {draft.inspired.kind === 'genre' && (
            <div className="grid gap-1">
              <Label htmlFor="inspired-genre" className="text-xs">
                Genre
              </Label>
              <Input
                id="inspired-genre"
                value={draft.inspired.label}
                maxLength={120}
                placeholder="Berlin school"
                onChange={(e) => setInspired({ label: e.target.value })}
                className="w-64"
              />
            </div>
          )}
        </div>
        <FieldProblems messages={placed.at('inspiredBy')} />
      </fieldset>

      <fieldset className="max-w-3xl space-y-3">
        <legend className="text-sm font-medium">
          Sources{' '}
          <FieldHelp title="Sources" ariaLabel="About sources">
            <p>
              Where the notes came from. Every transcribed or reconstructed pattern lists at least
              one. Give a citation a reader could find again (author, title, publisher or site, and
              date), a link where there is one, and the date you checked it.
            </p>
            <p className="mt-2">
              The citation is kept; the source itself never is. Scores, MIDI files and saved
              articles stay on your machine: the repo is public.
            </p>
          </FieldHelp>
        </legend>
        {draft.sources.length === 0 && (
          <p className="text-muted-foreground text-sm">No sources listed.</p>
        )}
        {draft.sources.map((s, i) => (
          <div
            key={s.key}
            role="group"
            aria-label={`Source ${i + 1}`}
            className="grid gap-2 rounded-md border p-3 sm:grid-cols-[auto_1fr]"
          >
            <Label htmlFor={`source-${s.key}-type`} className="text-xs sm:pt-2">
              Type
            </Label>
            <select
              id={`source-${s.key}-type`}
              value={s.type}
              onChange={(e) =>
                setSource(s.key, { type: oneOf(keysOf(SOURCE_LABELS), e.target.value, s.type) })
              }
              className={SELECT}
            >
              {Object.entries(SOURCE_LABELS).map(([t, label]) => (
                <option key={t} value={t}>
                  {label}
                </option>
              ))}
            </select>
            <Label htmlFor={`source-${s.key}-citation`} className="text-xs sm:pt-2">
              Citation
            </Label>
            <Input
              id={`source-${s.key}-citation`}
              value={s.citation}
              maxLength={500}
              onChange={(e) => setSource(s.key, { citation: e.target.value })}
            />
            <Label htmlFor={`source-${s.key}-url`} className="text-xs sm:pt-2">
              Link
            </Label>
            <Input
              id={`source-${s.key}-url`}
              type="url"
              value={s.url}
              placeholder="Optional"
              onChange={(e) => setSource(s.key, { url: e.target.value })}
            />
            <Label htmlFor={`source-${s.key}-checked`} className="text-xs sm:pt-2">
              Checked
            </Label>
            <div className="flex items-center justify-between gap-2">
              <Input
                id={`source-${s.key}-checked`}
                type="date"
                value={s.checkedAt}
                onChange={(e) => setSource(s.key, { checkedAt: e.target.value })}
                className="w-44"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Remove source ${i + 1}`}
                onClick={() =>
                  set(
                    'sources',
                    draft.sources.filter((x) => x.key !== s.key)
                  )
                }
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={draft.sources.length >= 20}
          onClick={() =>
            set('sources', [
              ...draft.sources,
              {
                key: nextRowKey(),
                type: 'by_ear',
                citation: '',
                url: '',
                checkedAt: new Date().toISOString().slice(0, 10),
              },
            ])
          }
        >
          Add a source
        </Button>
        <FieldProblems messages={placed.at('sources')} />
      </fieldset>

      <section className="space-y-2" aria-labelledby="pattern-notes">
        <h2 id="pattern-notes" className="text-sm font-medium">
          Notes{' '}
          <FieldHelp title="Notes" ariaLabel="About notes">
            <p>
              The sequencer, as players have it under the panel. It is silent here: to hear the
              pattern, open a patch that lists it.
            </p>
            <p className="mt-2">
              A pattern that is a patch&apos;s default is that patch&apos;s riff, so it must play
              the same every loop: one part, forward or reverse, no chance or conditions, no mod
              lanes, and no rests after its last note.
            </p>
          </FieldHelp>
        </h2>
        <div className="kys-seq-dock overflow-x-auto rounded-md">
          <Sequencer seq={seq} playing={false} onPlay={() => {}} onStop={() => {}} />
        </div>
        <FieldProblems messages={placed.at('pattern')} />
      </section>

      <section className="max-w-3xl space-y-2" aria-labelledby="pattern-sounds">
        <h2 id="pattern-sounds" className="text-sm font-medium">
          On patches
        </h2>
        {saved.sounds.length === 0 ? (
          <p className="text-muted-foreground text-sm">No patch lists this pattern yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {saved.sounds.map((s) => (
              <li key={`${s.synthId}/${s.slug}`} className="flex flex-wrap items-center gap-2">
                <Link href={soundPatternsPath(s.synthId, s.slug)} className="hover:underline">
                  {s.name}
                </Link>
                <code className="text-muted-foreground text-xs">{s.synthId}</code>
                {s.isDefault && <Badge variant="secondary">Default</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="max-w-3xl space-y-3">
        <RefusalSummary refusal={refusal} unplaced={placed.unplaced} />
        <SharedSettingsSaveHint />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!changed || saving || readOnly}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {changed && defaults.length > 0 && (
            <p className="text-muted-foreground text-sm">
              Saving rewrites the riff of{' '}
              {defaults.length === 1 ? 'the patch' : `${defaults.length} patches`} it is the default
              of.
            </p>
          )}
          {status && (
            <p role="status" className="text-sm">
              {status}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
