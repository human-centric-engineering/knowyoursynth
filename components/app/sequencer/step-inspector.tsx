'use client';

/**
 * The step inspector (`f-step-sequencer` t-80): the chosen step's values, on encoders, beside the step keys.
 *
 * It is the same height whatever step is chosen, so the dock does not jump as the steps are walked:
 * - The head: the step, and its On / Accent / Slide.
 * - What belongs to the step: ratchet, chance and condition.
 * - Its notes: a chip per note of the chord (and one to add a note), with one row of encoders (pitch, gate, velocity,
 *   nudge) for the chip chosen, since a chord's notes are not always struck or let go together. A rest has no notes,
 *   and says so in the same space.
 */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  DEFAULT_VELOCITY,
  MAX_CHORD,
  MAX_GATE,
  MAX_RATCHET,
  type Step,
  type StepNote,
} from '@/lib/app/sequencer/pattern';
import { CONDITIONS, conditionKey, noteName, parseNote } from '@/components/app/sequencer/labels';
import { Encoder } from '@/components/app/sequencer/encoder';
import { SeqSelect } from '@/components/app/sequencer/select';
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

/** Mounted afresh for each step (the parent keys it), so the note chosen starts at the first. */
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
  const [chosen, setChosen] = useState(0);
  const at = Math.min(chosen, Math.max(0, step.notes.length - 1));
  const n: StepNote | undefined = step.notes[at];
  const g = (k: string) => `step:${part}:${index}:${k}:${at}`;
  const setNote = (patch: Partial<StepNote>, key: string) =>
    onChange(
      (s) => ({ ...s, notes: s.notes.map((x, k) => (k === at ? { ...x, ...patch } : x)) }),
      g(key)
    );
  const addNote = () => {
    const last = step.notes[step.notes.length - 1];
    // A chord grows by a third above its top note; a rest starts on the pattern's note nearest before it.
    const note = last ? Math.min(127, last.note + 4) : defaultNote;
    onChange((s) => ({
      ...s,
      on: s.notes.length === 0 ? true : s.on,
      notes: [...s.notes, { note, gate: last?.gate ?? 1 }],
    }));
    setChosen(step.notes.length);
  };
  const addName = step.notes.length === 0 ? 'Add a note' : 'Add a note to the chord';
  return (
    <section className="kys-seq-inspect" aria-labelledby="kys-seq-inspect-h">
      <div className="kys-seq-inspect-head">
        <h3 id="kys-seq-inspect-h" className="kys-label">
          Step {index + 1}
          <span className="kys-seq-inspect-part"> · {part}</span>
        </h3>
        <div className="kys-seq-inspect-toggles">
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
            onChange(
              (s) => ({ ...s, ratchet: v > 1 ? v : undefined }),
              `step:${part}:${index}:ratchet`
            )
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
            onChange(
              (s) => ({ ...s, probability: v < 100 ? v / 100 : undefined }),
              `step:${part}:${index}:chance`
            )
          }
        />
        <SeqSelect
          label="Condition"
          help="Which loops the step plays on: only the first, every other, only while Fill is on, and so on."
          value={conditionKey(step.condition)}
          options={CONDITIONS.map((c) => [c.key, c.label])}
          onChange={(v) => {
            const c = CONDITIONS.find((x) => x.key === v);
            if (c) onChange((s) => ({ ...s, condition: c.condition }));
          }}
        />
      </div>

      <div className="kys-seq-notes">
        <div className="kys-seq-chips" role="group" aria-label={`Notes of step ${index + 1}`}>
          {step.notes.map((x, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={i === at}
              aria-label={`Note ${i + 1} of the step: ${noteName(x.note)}`}
              className={`kys-seq-chip ${i === at ? 'is-on' : ''}`}
              onClick={() => setChosen(i)}
            >
              {noteName(x.note)}
            </button>
          ))}
          {step.notes.length < MAX_CHORD && (
            <PlayerTip name={addName} help={`A step plays up to ${MAX_CHORD} notes at once.`}>
              <button
                type="button"
                className="kys-seq-chip kys-seq-chip-add"
                aria-label={addName}
                onClick={addNote}
              >
                <Plus size={13} aria-hidden="true" />
                {step.notes.length === 0 && 'Add note'}
              </button>
            </PlayerTip>
          )}
          {n && (
            <PlayerTip name="Remove this note" help="The chosen note comes out of the step.">
              <button
                type="button"
                className="kys-seq-chip kys-seq-chip-remove"
                aria-label="Remove this note"
                onClick={() => {
                  onChange((s) => ({ ...s, notes: s.notes.filter((_, k) => k !== at) }));
                  setChosen(Math.max(0, at - 1));
                }}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </PlayerTip>
          )}
        </div>
        {n ? (
          <div className="kys-seq-note">
            <Encoder
              label="Note"
              value={n.note}
              min={0}
              max={127}
              big={12}
              format={noteName}
              parse={parseNote}
              help="The note. Page Up and Page Down move it an octave. The pattern's scale and transpose apply as it plays."
              onChange={(v) => setNote({ note: v }, 'note')}
            />
            <Encoder
              label="Gate"
              value={n.gate}
              min={0.05}
              max={MAX_GATE}
              step={0.05}
              big={1}
              format={steps}
              help="How long the note is held, in steps. Past 1 it ties over the steps after it."
              onChange={(v) => setNote({ gate: v }, 'gate')}
            />
            <Encoder
              label="Velocity"
              value={Math.round((n.velocity ?? DEFAULT_VELOCITY) * 100)}
              min={0}
              max={100}
              step={5}
              big={25}
              format={pct}
              unset={n.velocity === undefined}
              help="How hard the note is struck. Accent plays it at 100% whatever this says."
              onChange={(v) => setNote({ velocity: v / 100 }, 'velocity')}
            />
            <Encoder
              label="Nudge"
              value={Math.round((n.nudge ?? 0) * 100)}
              min={0}
              max={95}
              step={5}
              big={25}
              format={pct}
              help="How late the note starts, as a share of a step: a push, a flam, or a triplet on a straight grid."
              onChange={(v) => setNote({ nudge: v > 0 ? v / 100 : undefined }, 'nudge')}
            />
          </div>
        ) : (
          <p className="kys-seq-rest">A rest. Add a note and the step plays it.</p>
        )}
      </div>
    </section>
  );
}
