/**
 * Playing notes into a pattern (`f-step-sequencer` t-86): step record and live record.
 *
 * - **Step record** writes what is played on the chosen step and moves on, as a hardware sequencer's step write does.
 *   Keys pressed together are a chord on one step. A rest moves on, leaving a rest; a tie holds the notes before it on
 *   over the step.
 * - **Live record** writes what is played over the loop as it plays, on the step it falls on. Quantised, a note goes on
 *   the nearest step; not, it goes on the step it falls in and keeps how late it was as its nudge.
 *
 * Shapes and pure functions only: the module and the page hold the keys, and these make the steps. The rules are in
 * `.context/app/sequencer.md`.
 */
import {
  DEFAULT_VELOCITY,
  MAX_CHORD,
  MAX_GATE,
  emptyStep,
  type Step,
  type StepNote,
} from '@/lib/app/sequencer/pattern';
import { keepMods } from '@/lib/app/sequencer/tools';

/** A note played: its pitch, and its velocity when the keys gave one. */
export interface PlayedNote {
  note: number;
  velocity?: number;
}

/**
 * The velocity a note played is written with: none at the default (the computer keyboard's and the piano's), so it
 * plays as a step does, and a MIDI key's to three places.
 */
export function playedVelocity(v: number | undefined): number | undefined {
  if (v === undefined || Math.abs(v - DEFAULT_VELOCITY) < 1e-6) return undefined;
  return Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
}

/** The shortest note live record writes unquantised, in steps: a key tapped and let go at once still sounds. */
export const MIN_LIVE_GATE = 0.1;

const asNote = (p: PlayedNote, gate: number): StepNote =>
  p.velocity === undefined ? { note: p.note, gate } : { note: p.note, gate, velocity: p.velocity };

/** A step that plays `chord` (up to {@link MAX_CHORD} notes, one of each pitch), a step long, and keeps everything else. */
export function writeChord(step: Step, chord: readonly PlayedNote[]): Step {
  const notes: StepNote[] = [];
  for (const p of chord)
    if (notes.length < MAX_CHORD && !notes.some((n) => n.note === p.note)) notes.push(asNote(p, 1));
  return { ...step, on: true, notes };
}

/** Step `at` as a rest. Its mod lanes' values stay, as Delete leaves them. */
export function restAt(steps: readonly Step[], at: number): Step[] {
  return steps.map((s, i) => (i === at ? keepMods([s], [emptyStep()])[0] : s));
}

/**
 * Step `at` tied to the notes before it: the nearest step before it with notes holds each of them on to the end of `at`,
 * and `at` becomes a rest. A tie on the first step, or with only rests before it, is a rest.
 */
export function tieOver(steps: readonly Step[], at: number): Step[] {
  const rested = restAt(steps, at);
  let from = at - 1;
  while (from >= 0 && steps[from].notes.length === 0) from--;
  if (from < 0) return rested;
  const reach = at - from + 1;
  return rested.map((s, i) =>
    i === from
      ? {
          ...s,
          notes: s.notes.map((n) => ({ ...n, gate: Math.min(MAX_GATE, Math.max(n.gate, reach)) })),
        }
      : s
  );
}

/** The step after `at`, round to the first after the last. */
export const nextStep = (at: number, length: number): number => (at + 1) % length;

/** Where a slot of the loop starts, in steps, with swing (50–75) moving every second slot later. */
export function slotStart(slot: number, swing: number): number {
  return slot + (slot % 2 === 1 ? (swing / 100) * 2 - 1 : 0);
}

/**
 * Which slot of the loop a note struck at `at` steps from its start goes on, and how late it was.
 *
 * - Quantised: the slot whose start is nearest, with no nudge. Past the middle of the last slot that is the first slot
 *   of the next loop, which is slot 0 (`slot` is always below `length`).
 * - Not: the slot it fell in, with how far past that slot's start it was as `nudge`, kept below a whole step (the
 *   pattern's limit). A swung slot is shorter or longer than a step, so a note late in a long one is kept at the limit.
 */
export function placeHit(
  at: number,
  length: number,
  swing: number,
  quantise: boolean
): { slot: number; nudge: number } {
  const pos = Math.max(0, at);
  let slot = Math.min(length - 1, Math.floor(pos));
  // Swing can put the start of the slot the note fell in after it: then it fell in the slot before.
  while (slot > 0 && slotStart(slot, swing) > pos) slot--;
  if (quantise) {
    const next = slot + 1;
    // The slot after the last is the next loop's first, which is never swung.
    const nextStart = next === length ? length : slotStart(next, swing);
    const nearer = pos - slotStart(slot, swing) > nextStart - pos ? next : slot;
    return { slot: nearer % length, nudge: 0 };
  }
  const nudge = Math.min(0.99, Math.max(0, pos - slotStart(slot, swing)));
  return { slot, nudge: Math.round(nudge * 1000) / 1000 };
}

/** How long a note held for `held` steps is written: whole steps (at least one) quantised, as played if not. */
export function liveGate(held: number, quantise: boolean): number {
  const g = quantise ? Math.max(1, Math.round(held)) : Math.max(MIN_LIVE_GATE, held);
  return Math.min(MAX_GATE, Math.round(g * 1000) / 1000);
}

export type LiveMode = 'overdub' | 'replace';
export const LIVE_MODES: readonly LiveMode[] = ['overdub', 'replace'];

/**
 * Step `step` with a note recorded on it. Overdub adds it to what the step plays (a note of the same pitch is played
 * again, so it takes its place); a step already playing six keeps them. Replace puts it in place of the step's notes,
 * unless `chord` says another note has already been recorded on this step this time round: notes struck together are
 * a chord, in either mode.
 */
export function recordNote(step: Step, note: StepNote, mode: LiveMode, chord: boolean): Step {
  const kept = mode === 'replace' && !chord ? [] : step.notes.filter((n) => n.note !== note.note);
  if (kept.length >= MAX_CHORD) return step;
  return { ...step, on: true, notes: [...kept, note] };
}
