'use client';

/**
 * SoundForm — a library sound and its lesson (`f-catalogue-admin`), new or existing.
 *
 * What a sound and each of its steps say are plain fields. What a step sets on the panel (control values and cables)
 * and the sound's demo phrase are JSON, edited as text: the server checks every value and cable against the synth's
 * definition either way (`validatePreset`), and a refusal lands on the step and field it names. A step editor that
 * drives the panel is not this form.
 *
 * An existing sound saves through `PATCH /api/v1/admin/synths/[id]/sounds/[slug]`, a new one through
 * `POST /api/v1/admin/synths/[id]/sounds` (on the definition's current version, at the end of the library). Either
 * marks the sound edited, so the seed no longer updates it.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import { MoveButtons, move, nextRowKey } from '@/components/app/admin/synths/order-controls';
import {
  FieldProblems,
  placeProblems,
  refusalOf,
  RefusalSummary,
  type Problem,
  type Refusal,
} from '@/components/app/admin/synths/problems';
import { soundEditorPath } from '@/components/app/admin/synths/sound-library';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api/client';
import { SYNTH_MODULES } from '@/lib/app/synths/contract';

/** A stored sound's JSON columns, read rather than trusted. Each value is checked by the server on save. */
const StoredSoundSchema = z.object({
  id: z.string(),
  name: z.string(),
  ref: z.string(),
  artist: z.string(),
  tags: z.array(z.string()),
  level: z.number(),
  blurb: z.string(),
  how: z.string(),
  phrase: z.unknown(),
  steps: z.array(
    z.object({
      title: z.string(),
      module: z.string(),
      why: z.string(),
      set: z.record(z.string(), z.unknown()).optional(),
      cables: z.array(z.unknown()).optional(),
    })
  ),
  context: z.record(z.string(), z.string()),
  tweaks: z.array(z.object({ id: z.string(), try: z.string(), hear: z.string() })),
});

interface StepDraft {
  key: number;
  title: string;
  module: string;
  why: string;
  /** JSON text; empty for a step that sets nothing. */
  set: string;
  /** JSON text; empty for a step that patches nothing. */
  cables: string;
}
interface Draft {
  id: string;
  name: string;
  ref: string;
  artist: string;
  tags: string;
  level: string;
  blurb: string;
  how: string;
  phrase: string;
  steps: StepDraft[];
  context: { key: number; control: string; text: string }[];
  tweaks: { key: number; id: string; try: string; hear: string }[];
}

/** JSON with arrays of plain values on one line, so a phrase or a cable list reads a row at a time. */
export function prettyJson(value: unknown, indent = ''): string {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) return JSON.stringify(value);
    return `[\n${value.map((v) => inner + prettyJson(v, inner)).join(',\n')}\n${indent}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${prettyJson(v, inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value) ?? '';
}

/** A phrase needs at least one note to be accepted, so a new sound starts with one: C3 on the first beat. */
const STARTER_PHRASE = { bpm: 100, loop: true, steps: [[0, 48, 1]] };

function draftOf(stored: unknown): Draft | null {
  const parsed = StoredSoundSchema.safeParse(stored);
  if (!parsed.success) return null;
  const s = parsed.data;
  return {
    id: s.id,
    name: s.name,
    ref: s.ref,
    artist: s.artist,
    tags: s.tags.join(', '),
    level: String(s.level),
    blurb: s.blurb,
    how: s.how,
    phrase: prettyJson(s.phrase),
    steps: s.steps.map((step) => ({
      key: nextRowKey(),
      title: step.title,
      module: step.module,
      why: step.why,
      set: step.set ? prettyJson(step.set) : '',
      cables: step.cables ? prettyJson(step.cables) : '',
    })),
    context: Object.entries(s.context).map(([control, text]) => ({
      key: nextRowKey(),
      control,
      text,
    })),
    tweaks: s.tweaks.map((t) => ({ key: nextRowKey(), ...t })),
  };
}

const blankDraft = (): Draft => ({
  id: '',
  name: '',
  ref: '',
  artist: '',
  tags: '',
  level: '1',
  blurb: '',
  how: '',
  phrase: prettyJson(STARTER_PHRASE),
  steps: [],
  context: [],
  tweaks: [],
});

/** The draft as a sound, or the problems that stop it being sent (JSON that does not parse, a control twice). */
function bodyOf(d: Draft): { body: Record<string, unknown> } | { problems: Problem[] } {
  const problems: Problem[] = [];
  const parse = (text: string, path: string): unknown => {
    try {
      return JSON.parse(text);
    } catch (err) {
      problems.push({
        path,
        message: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
      return undefined;
    }
  };
  const phrase = parse(d.phrase, 'phrase');
  const steps = d.steps.map((s, i) => ({
    title: s.title,
    module: s.module,
    why: s.why,
    ...(s.set.trim() ? { set: parse(s.set, `steps.${i}.set`) } : {}),
    ...(s.cables.trim() ? { cables: parse(s.cables, `steps.${i}.cables`) } : {}),
  }));
  const seen = new Set<string>();
  for (const row of d.context) {
    const control = row.control.trim();
    if (!control) {
      problems.push({ path: 'context', message: 'Every control row needs a control id' });
      continue;
    }
    if (seen.has(control))
      problems.push({ path: `context.${control}`, message: `${control} is listed twice` });
    seen.add(control);
  }
  if (problems.length) return { problems };
  return {
    body: {
      name: d.name,
      ref: d.ref,
      artist: d.artist,
      tags: d.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      level: Number(d.level),
      blurb: d.blurb,
      how: d.how,
      phrase,
      steps,
      context: Object.fromEntries(d.context.map((r) => [r.control.trim(), r.text])),
      tweaks: d.tweaks.map(({ id, try: tryIt, hear }) => ({ id, try: tryIt, hear })),
    },
  };
}

type SoundFormProps =
  | { synthId: string; mode: 'edit'; sound: unknown }
  | { synthId: string; mode: 'new'; sound?: undefined };

export function SoundForm({ synthId, mode, sound }: SoundFormProps) {
  const router = useRouter();
  const readOnly = useSharedSettingsReadOnly();
  const [draft, setDraft] = useState<Draft | null>(() =>
    mode === 'edit' ? draftOf(sound) : blankDraft()
  );
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  if (!draft) {
    return (
      <p role="alert" className="text-destructive text-sm">
        The stored sound is not in a shape this form can show, so it cannot be edited here.
      </p>
    );
  }

  const keys = [
    'id',
    'name',
    'ref',
    'artist',
    'tags',
    'level',
    'blurb',
    'how',
    'phrase',
    'steps',
    'context',
    'tweaks',
    ...draft.steps.flatMap((_, i) =>
      ['', '.title', '.module', '.why', '.set', '.cables'].map((f) => `steps.${i}${f}`)
    ),
    ...draft.context.map((r) => `context.${r.control.trim()}`),
    ...draft.tweaks.flatMap((_, i) => ['', '.id', '.try', '.hear'].map((f) => `tweaks.${i}${f}`)),
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
  const setField = (field: keyof Omit<Draft, 'steps' | 'context' | 'tweaks'>) => (v: string) =>
    update((d) => ({ ...d, [field]: v }));
  const setStep = (i: number, field: keyof Omit<StepDraft, 'key'>) => (v: string) =>
    update((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, [field]: v } : s)) }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setRefusal(null);
    const out = bodyOf(draft);
    if ('problems' in out) {
      setRefusal({ message: 'Fix these before saving.', problems: out.problems });
      return;
    }
    setSaving(true);
    try {
      if (mode === 'new') {
        const created = await apiClient.post<{ id: string }>(
          `/api/v1/admin/synths/${encodeURIComponent(synthId)}/sounds`,
          { body: { id: draft.id.trim(), ...out.body } }
        );
        router.push(soundEditorPath(synthId, created.id));
        return;
      }
      const after = await apiClient.patch<unknown>(
        `/api/v1/admin/synths/${encodeURIComponent(synthId)}/sounds/${encodeURIComponent(draft.id)}`,
        { body: out.body }
      );
      const next = draftOf(after);
      if (next) setDraft(next);
      setSavedNote('Saved.');
    } catch (err) {
      setRefusal(refusalOf(err, 'Could not save the sound. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  /** A labelled field with its problems. `key` is the path the server names it by. */
  const field = (
    key: string,
    label: string,
    control: (props: { id: string; 'aria-invalid': boolean }) => React.ReactNode,
    help?: React.ReactNode
  ) => {
    const id = `sound-${key.replace(/\./g, '-')}`;
    const messages = placed.at(key);
    return (
      <div className="grid gap-1">
        <Label htmlFor={id} className="text-xs">
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
        {control({ id, 'aria-invalid': messages.length > 0 })}
        <FieldProblems messages={messages} />
      </div>
    );
  };
  const textInput = (
    key: 'id' | 'name' | 'ref' | 'artist' | 'tags',
    label: string,
    help?: React.ReactNode
  ) =>
    field(
      key,
      label,
      (p) => <Input {...p} value={draft[key]} onChange={(e) => setField(key)(e.target.value)} />,
      help
    );
  const json = (value: string, onChange: (v: string) => void, rows: number) =>
    function renderJson(p: { id: string; 'aria-invalid': boolean }) {
      return (
        <Textarea
          {...p}
          value={value}
          rows={rows}
          spellCheck={false}
          className="font-mono text-xs"
          onChange={(e) => onChange(e.target.value)}
        />
      );
    };

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-4xl space-y-6">
      <RefusalSummary refusal={refusal} unplaced={placed.unplaced} />

      <section className="grid gap-4 sm:grid-cols-2">
        {mode === 'new'
          ? textInput(
              'id',
              'Id',
              <p>
                The sound&apos;s permanent id within this synth: lowercase letters, digits and
                hyphens, for example <code>rubber-funk-bass</code>. Users&apos; copies and the seed
                match on it, so it cannot be changed later.
              </p>
            )
          : field('id', 'Id', (p) => <Input {...p} value={draft.id} readOnly disabled />)}
        {textInput('name', 'Name', <p>What the library lists the sound as.</p>)}
        {textInput(
          'ref',
          'Reference',
          <p>
            <code>In the style of &lt;artist&gt; — &quot;&lt;work&gt;&quot;</code>. Never a claim to
            be the exact patch.
          </p>
        )}
        {textInput('artist', 'Artist', <p>The player the sound is in the style of.</p>)}
        {textInput(
          'tags',
          'Tags',
          <p>
            Comma-separated. The first is the category (<code>bass</code>, <code>lead</code>,{' '}
            <code>pad</code>…), which the library groups by.
          </p>
        )}
        {field(
          'level',
          'Level',
          (p) => (
            <select
              {...p}
              value={draft.level}
              onChange={(e) => setField('level')(e.target.value)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="1">1 · Beginner</option>
              <option value="2">2 · Intermediate</option>
              <option value="3">3 · Advanced</option>
            </select>
          ),
          <p>How much the lesson assumes. Beginner lessons explain every term they use.</p>
        )}
      </section>

      {field(
        'blurb',
        'Blurb',
        (p) => (
          <Textarea
            {...p}
            rows={2}
            value={draft.blurb}
            onChange={(e) => setField('blurb')(e.target.value)}
          />
        ),
        <p>One sentence describing the sound, shown in the library.</p>
      )}
      {field(
        'how',
        'How it works',
        (p) => (
          <Textarea
            {...p}
            rows={4}
            value={draft.how}
            onChange={(e) => setField('how')(e.target.value)}
          />
        ),
        <p>Two to four sentences: which module does what, and why it sounds the way it does.</p>
      )}
      {field(
        'phrase',
        'Phrase (JSON)',
        json(draft.phrase, setField('phrase'), 6),
        <p>
          The short riff that shows the sound off:{' '}
          <code>{'{ "bpm": 104, "loop": true, "steps": [[0, 36, 0.4], …] }'}</code>. Each step is{' '}
          <code>[beat, MIDI note, length in beats]</code>.
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">
          Lesson steps{' '}
          <FieldHelp title="Lesson steps" ariaLabel="About lesson steps">
            <p>
              The sound is built a step at a time, each on top of the last, from the synth&apos;s
              starting state. A step says what it does (title, module, why) and what it changes on
              the panel.
            </p>
            <p className="mt-2">
              <strong>Values</strong> is a JSON object of control id → value, for example{' '}
              <code>{'{ "osc1.range": "16" }'}</code>. <strong>Cables</strong> is a JSON list of{' '}
              <code>[output jack, input jack]</code> pairs. Leave either empty when the step sets
              none. The server checks every control, value and jack against the synth.
            </p>
          </FieldHelp>
        </legend>
        <FieldProblems messages={placed.at('steps')} />
        {draft.steps.map((step, i) => (
          <div key={step.key} className="space-y-3 rounded-md border p-3" data-testid={`step-${i}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Step {i + 1}</span>
              <MoveButtons
                label={`step ${i + 1}`}
                index={i}
                length={draft.steps.length}
                onMove={(by) => restructure((d) => ({ ...d, steps: move(d.steps, i, by) }))}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  restructure((d) => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))
                }
              >
                Remove step {i + 1}
              </Button>
            </div>
            <FieldProblems messages={placed.at(`steps.${i}`)} />
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              {field(
                `steps.${i}.title`,
                'Title',
                (p) => (
                  <Input
                    {...p}
                    value={step.title}
                    onChange={(e) => setStep(i, 'title')(e.target.value)}
                  />
                ),
                <p>
                  What this step does, in a few words, for example &quot;Drop to 16&apos;&quot;.
                </p>
              )}
              {field(
                `steps.${i}.module`,
                'Module',
                (p) => (
                  <select
                    {...p}
                    value={step.module}
                    onChange={(e) => setStep(i, 'module')(e.target.value)}
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  >
                    {!SYNTH_MODULES.some((m) => m === step.module) && (
                      <option value={step.module}>{step.module || 'Choose…'}</option>
                    )}
                    {SYNTH_MODULES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ),
                <p>The section of the panel the step works in. The lesson highlights it.</p>
              )}
            </div>
            {field(
              `steps.${i}.why`,
              'Why',
              (p) => (
                <Textarea
                  {...p}
                  rows={4}
                  value={step.why}
                  onChange={(e) => setStep(i, 'why')(e.target.value)}
                />
              ),
              <p>What the change does to the sound and what to listen for as it happens.</p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {field(
                `steps.${i}.set`,
                'Values (JSON)',
                json(step.set, setStep(i, 'set'), 6),
                <p>
                  A JSON object of control id → value, for example{' '}
                  <code>{'{ "osc1.range": "16" }'}</code>. Leave empty when the step sets nothing.
                </p>
              )}
              {field(
                `steps.${i}.cables`,
                'Cables (JSON)',
                json(step.cables, setStep(i, 'cables'), 6),
                <p>
                  A JSON list of <code>[output jack, input jack]</code> pairs. Leave empty when the
                  step patches nothing.
                </p>
              )}
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            update((d) => ({
              ...d,
              steps: [
                ...d.steps,
                { key: nextRowKey(), title: '', module: '', why: '', set: '', cables: '' },
              ],
            }))
          }
        >
          Add a step
        </Button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-base font-semibold">
          What each control is doing{' '}
          <FieldHelp title="Control context" ariaLabel="About control context">
            <p>
              Shown when a learner points at a control: its id, and what it is doing in this sound.
              Each control once.
            </p>
          </FieldHelp>
        </legend>
        <FieldProblems messages={placed.at('context')} />
        {draft.context.map((row, i) => {
          const key = `context.${row.control.trim()}`;
          const set = (f: 'control' | 'text') => (v: string) =>
            update((d) => ({
              ...d,
              context: d.context.map((r, j) => (j === i ? { ...r, [f]: v } : r)),
            }));
          return (
            <div key={row.key} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
              <Input
                aria-label={`Control ${i + 1}`}
                value={row.control}
                className="font-mono"
                aria-invalid={placed.at(key).length > 0}
                onChange={(e) => set('control')(e.target.value)}
              />
              <Input
                aria-label={`What control ${i + 1} is doing`}
                value={row.text}
                onChange={(e) => set('text')(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  restructure((d) => ({ ...d, context: d.context.filter((_, j) => j !== i) }))
                }
              >
                Remove
              </Button>
              <div className="sm:col-span-3">
                <FieldProblems messages={placed.at(key)} />
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
              context: [...d.context, { key: nextRowKey(), control: '', text: '' }],
            }))
          }
        >
          Add a control
        </Button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-base font-semibold">
          Tweaks{' '}
          <FieldHelp title="Tweaks" ariaLabel="About tweaks">
            <p>
              Suggestions once the sound is built: which control to move, what to try with it, and
              what to listen for.
            </p>
          </FieldHelp>
        </legend>
        <FieldProblems messages={placed.at('tweaks')} />
        {draft.tweaks.map((row, i) => {
          const set = (f: 'id' | 'try' | 'hear') => (v: string) =>
            update((d) => ({
              ...d,
              tweaks: d.tweaks.map((r, j) => (j === i ? { ...r, [f]: v } : r)),
            }));
          return (
            <div key={row.key} className="space-y-2 rounded-md border p-3">
              <FieldProblems messages={placed.at(`tweaks.${i}`)} />
              <div className="grid gap-2 sm:grid-cols-[12rem_1fr_1fr]">
                {field(
                  `tweaks.${i}.id`,
                  'Control',
                  (p) => (
                    <Input
                      {...p}
                      className="font-mono"
                      value={row.id}
                      onChange={(e) => set('id')(e.target.value)}
                    />
                  ),
                  <p>
                    The id of the control to move, for example <code>filter.cutoff</code>.
                  </p>
                )}
                {field(
                  `tweaks.${i}.try`,
                  'Try',
                  (p) => (
                    <Input {...p} value={row.try} onChange={(e) => set('try')(e.target.value)} />
                  ),
                  <p>What to do with the control, for example &quot;Sweep it slowly up&quot;.</p>
                )}
                {field(
                  `tweaks.${i}.hear`,
                  'Hear',
                  (p) => (
                    <Input {...p} value={row.hear} onChange={(e) => set('hear')(e.target.value)} />
                  ),
                  <p>What changes in the sound when they do.</p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  restructure((d) => ({ ...d, tweaks: d.tweaks.filter((_, j) => j !== i) }))
                }
              >
                Remove tweak {i + 1}
              </Button>
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
              tweaks: [...d.tweaks, { key: nextRowKey(), id: '', try: '', hear: '' }],
            }))
          }
        >
          Add a tweak
        </Button>
      </fieldset>

      <p className="text-muted-foreground text-xs">
        Saving checks the whole sound against the synth and marks it edited: the seed stops updating
        it from its data file.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={readOnly || saving}>
          {saving ? 'Saving…' : mode === 'new' ? 'Add sound' : 'Save sound'}
        </Button>
        {savedNote && <span className="text-muted-foreground text-sm">{savedNote}</span>}
      </div>
    </form>
  );
}
