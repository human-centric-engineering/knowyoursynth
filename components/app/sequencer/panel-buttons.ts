/**
 * The sequencer synths' own buttons driving the sequencer (`f-step-sequencer` t-85).
 *
 * A definition maps its buttons onto the sequencer (`SynthDef.seqButtons`). The page asks `seqButtonFor` whether a
 * press is the sequencer's, and draws the panel with `seqLamps` over its values, so a button the sequencer takes
 * lights for what it drives rather than for a value of its own.
 *
 * @see .context/app/sequencer.md
 */

import type { ControlValues, SeqButton, SynthDef } from '@/lib/app/synths/contract';
import { patternLength, type Pattern, type Step } from '@/lib/app/sequencer/pattern';
import { foldIntoMidi } from '@/lib/app/sequencer/tools';

/** The presses the page makes itself; the rest are the module's, on the step it has chosen. */
export type PageButton = 'run' | 'arp' | 'record' | 'hold';
export type StepButton = Exclude<SeqButton, PageButton>;

export const isPageButton = (b: SeqButton): b is PageButton =>
  b === 'run' || b === 'arp' || b === 'record' || b === 'hold';

/** The step the module has chosen, and the page of keys it shows. */
export interface ChosenStep {
  part: number;
  step: number;
  page: number;
}

/**
 * What a press on control `id` does to the sequencer, or null when it is the panel's own. A button that changes the
 * sound (not `ui`, the 303's ACCENT and SLIDE) is the sequencer's only while it is open, and plays live otherwise.
 */
export function seqButtonFor(def: SynthDef, id: string, open: boolean): SeqButton | null {
  const b = def.seqButtons?.[id];
  if (!b) return null;
  if (open) return b;
  return def.controls.find((c) => c.id === id)?.ui ? b : null;
}

export interface LampState {
  /** The sequencer is on show. */
  open: boolean;
  playing: boolean;
  keys: string;
  hold: boolean;
  pattern: Pattern;
  /** The module's chosen step; null while it is not there. */
  chosen: ChosenStep | null;
  /** Steps on one page of the module's keys. */
  pageSize: number;
}

const sounds = (s: Step | undefined) => !!s && s.on && s.notes.length > 0;

/**
 * The panel's values with each button the sequencer takes set to what it shows: RUN while the pattern plays, ARP,
 * REC and HOLD while they are on, and with the module open the chosen step's marks, its note on the 303's keys and
 * each step key while its step plays. A C lights both of the 303's C keys: the step holds only the note, which is the
 * top of one octave of keys as much as the bottom of the next. A button that changes the sound keeps its own value
 * while the sequencer is closed, since it is the panel's then.
 */
export function seqLamps(def: SynthDef, values: ControlValues, s: LampState): ControlValues {
  const map = def.seqButtons;
  if (!map) return values;
  const chosen = s.open ? s.chosen : null;
  const part = chosen ? s.pattern.parts[Math.min(chosen.part, s.pattern.parts.length - 1)] : null;
  const len = patternLength(s.pattern);
  const step = part && chosen ? part.steps[Math.min(chosen.step, len - 1)] : undefined;
  const out: ControlValues = { ...values };
  for (const [id, b] of Object.entries(map)) {
    if (seqButtonFor(def, id, s.open) === null) continue;
    let lit = false;
    if (b === 'run') lit = s.playing;
    else if (b === 'arp') lit = s.keys === 'arp';
    else if (b === 'record') lit = s.keys === 'step';
    else if (b === 'hold') lit = s.hold;
    else if (b === 'toggle') lit = sounds(step);
    else if (b === 'accent') lit = !!step?.accent;
    else if (b === 'slide') lit = !!step?.slide;
    else if (b === 'ratchet') lit = (step?.ratchet ?? 1) > 1;
    else if (typeof b === 'object' && 'step' in b)
      lit = !!chosen && sounds(part?.steps[chosen.page * s.pageSize + b.step]);
    else if (typeof b === 'object' && 'note' in b)
      lit = !!step && sounds(step) && step.notes[0].note % 12 === b.note % 12;
    out[id] = lit;
  }
  return out;
}

/** The note a `{ note }` key puts on a step: `semitone` above the C of the octave the step's note (or `near`) is in. */
export function noteInOctave(step: Step, near: number, semitone: number): number {
  const from = step.notes[0]?.note ?? near;
  return foldIntoMidi(from - (from % 12) + semitone);
}

/** Two sets of panel values with every value the same: the lamps the page has drawn, and the lamps now. */
export function sameValues(a: ControlValues, b: ControlValues): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}
