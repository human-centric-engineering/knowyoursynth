'use client';

/**
 * The step inspector (`f-step-sequencer` t-80): the selected step's values, on encoders, beside the step keys.
 *
 * What belongs to the step (on, accent, slide, ratchet, probability, condition) is in a row at the top; what belongs to
 * each of its notes (pitch, gate, velocity, nudge) is a row per note, since a chord's notes are not always struck or let
 * go together. A rest has no notes: Add note makes it play.
 */

import { Plus, X } from 'lucide-react';
import {
  DEFAULT_VELOCITY,
  MAX_CHORD,
  MAX_GATE,
  MAX_RATCHET,
  type Step,
  type StepNote,
} from '@/lib/app/sequencer/pattern';
import { CONDITIONS, conditionKey, noteName } from '@/components/app/sequencer/labels';
import { Encoder } from '@/components/app/sequencer/encoder';
import { PlayerTip } from '@/components/app/synth/player-tip';

/** A change to the step, and the group an encoder's turn is undone as. */
export type StepChange = (fn: (s: Step) => Step, group?: string) => void;

const pct = (v: number) => `${Math.round(v)}%`;
const steps = (v: number) => `${Number(v.toFixed(2))}`;

export function Toggle({
  label,
  on,
  onClick,
  help,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  help: string;
}) {
  return (
    <PlayerTip name={label} help={help}>
      <button
        type="button"
        aria-pressed={on}
        onClick={onClick}
        className={`kys-seq-toggle ${on ? 'is-on' : ''}`}
      >
        <span className={`kys-led ${on ? 'is-lit' : ''}`} aria-hidden="true" />
        {label}
      </button>
    </PlayerTip>
  );
}

export function StepInspector({
  step,
  index,
  part,
  defaultNote,
  onChange,
}: {
  step: Step;
  /** Which step, from 0. */
  index: number;
  /** The part's name, A or B. */
  part: string;
  /** The note a new note starts on. */
  defaultNote: number;
  onChange: StepChange;
}) {
  const g = (k: string) => `step:${part}:${index}:${k}`;
  const setNote = (i: number, patch: Partial<StepNote>, key: string) =>
    onChange(
      (s) => ({ ...s, notes: s.notes.map((n, k) => (k === i ? { ...n, ...patch } : n)) }),
      g(`${key}${i}`)
    );
  const chord = step.notes.length > 1;
  const playsLabel = step.notes.length === 0 ? 'Rest' : step.on ? 'Plays' : 'Muted';
  return (
    <section className="kys-seq-inspect" aria-labelledby="kys-seq-inspect-h">
      <div className="kys-seq-inspect-head">
        <h3 id="kys-seq-inspect-h" className="kys-label">
          Step {index + 1}
          <span className="kys-seq-inspect-part"> · {part}</span>
        </h3>
        <span className="kys-seq-inspect-state">{playsLabel}</span>
      </div>
      <div className="kys-seq-inspect-row">
        <Toggle
          label="On"
          on={step.on}
          help="Whether the step plays. Off keeps its notes, so it can come back."
          onClick={() => onChange((s) => ({ ...s, on: !s.on }))}
        />
        <Toggle
          label="Accent"
          on={!!step.accent}
          help="Plays the step's notes at full velocity, over what each note is set to."
          onClick={() => onChange((s) => ({ ...s, accent: s.accent ? undefined : true }))}
        />
        <Toggle
          label="Slide"
          on={!!step.slide}
          help="Holds the step into the next one, so a mono synth glides to the next note."
          onClick={() => onChange((s) => ({ ...s, slide: s.slide ? undefined : true }))}
        />
      </div>
      <div className="kys-seq-inspect-row">
        <Encoder
          label="Ratchet"
          value={step.ratchet ?? 1}
          min={1}
          max={MAX_RATCHET}
          big={1}
          format={(v) => `×${v}`}
          help="Plays the step this many times inside itself, evenly spaced: a roll."
          onChange={(v) =>
            onChange((s) => ({ ...s, ratchet: v > 1 ? v : undefined }), g('ratchet'))
          }
        />
        <Encoder
          label="Chance"
          value={Math.round((step.probability ?? 1) * 100)}
          min={0}
          max={100}
          step={5}
          big={25}
          format={pct}
          help="The chance the step plays on each pass. 100% always plays."
          onChange={(v) =>
            onChange((s) => ({ ...s, probability: v < 100 ? v / 100 : undefined }), g('chance'))
          }
        />
        <PlayerTip
          name="Condition"
          help="Which loops the step plays on: only the first, every other, only while Fill is on, and so on."
        >
          <label className="kys-seq-field">
            <span className="kys-seq-field-label">Condition</span>
            <select
              className="kys-seq-select"
              value={conditionKey(step.condition)}
              onChange={(e) => {
                const c = CONDITIONS.find((x) => x.key === e.target.value);
                if (c) onChange((s) => ({ ...s, condition: c.condition }));
              }}
            >
              {CONDITIONS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </PlayerTip>
      </div>
      <ol className="kys-seq-notes" aria-label={`Notes of step ${index + 1}`}>
        {step.notes.map((n, i) => {
          const name = (what: string) => (chord ? `${what} ${i + 1}` : what);
          return (
            <li key={i} className="kys-seq-note">
              <Encoder
                label={name('Note')}
                value={n.note}
                min={0}
                max={127}
                big={12}
                format={noteName}
                help="The note. Page Up and Page Down move it an octave. The pattern's scale and transpose apply as it plays."
                onChange={(v) => setNote(i, { note: v }, 'note')}
              />
              <Encoder
                label={name('Gate')}
                value={n.gate}
                min={0.25}
                max={MAX_GATE}
                step={0.25}
                big={4}
                format={steps}
                help="How long the note is held, in steps. Past 1 it ties over the steps after it."
                onChange={(v) => setNote(i, { gate: v }, 'gate')}
              />
              <Encoder
                label={name('Velocity')}
                value={Math.round((n.velocity ?? DEFAULT_VELOCITY) * 100)}
                min={0}
                max={100}
                step={5}
                big={25}
                format={pct}
                unset={n.velocity === undefined}
                help="How hard the note is struck. Accent plays it at 100% whatever this says."
                onChange={(v) => setNote(i, { velocity: v / 100 }, 'velocity')}
              />
              <Encoder
                label={name('Nudge')}
                value={Math.round((n.nudge ?? 0) * 100)}
                min={0}
                max={95}
                step={5}
                big={25}
                format={pct}
                help="How late the note starts, as a share of a step: a push, a flam, or a triplet on a straight grid."
                onChange={(v) => setNote(i, { nudge: v > 0 ? v / 100 : undefined }, 'nudge')}
              />
              <PlayerTip name={`Remove ${name('note').toLowerCase()}`}>
                <button
                  type="button"
                  className="kys-pbtn"
                  aria-label={`Remove ${name('note').toLowerCase()}`}
                  onClick={() =>
                    onChange((s) => ({ ...s, notes: s.notes.filter((_, k) => k !== i) }))
                  }
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </PlayerTip>
            </li>
          );
        })}
      </ol>
      {step.notes.length < MAX_CHORD && (
        <PlayerTip
          name={step.notes.length === 0 ? 'Add a note' : 'Add a note to the chord'}
          help={`A step plays up to ${MAX_CHORD} notes at once.`}
        >
          <button
            type="button"
            className="kys-layer"
            aria-label={step.notes.length === 0 ? 'Add a note' : 'Add a note to the chord'}
            onClick={() =>
              onChange((s) => {
                const last = s.notes[s.notes.length - 1];
                // A chord grows by a third above its top note; a rest starts on the pattern's last note.
                const note = last ? Math.min(127, last.note + 4) : defaultNote;
                return {
                  ...s,
                  on: s.notes.length === 0 ? true : s.on,
                  notes: [...s.notes, { note, gate: last?.gate ?? 1 }],
                };
              })
            }
          >
            <Plus size={15} aria-hidden="true" />
            {step.notes.length === 0 ? 'Add note' : 'Add to chord'}
          </button>
        </PlayerTip>
      )}
    </section>
  );
}
