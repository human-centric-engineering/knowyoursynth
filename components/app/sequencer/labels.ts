/**
 * How the sequencer names what it shows (`f-step-sequencer` t-80): notes, scales, directions, step sizes, conditions
 * and chains, in the words the module and its help use.
 */

import type { Direction, ScaleName, StepCondition, StepSize } from '@/lib/app/sequencer/pattern';

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** A MIDI note as it is read on a keyboard: 60 is C4. */
export const noteName = (n: number): string =>
  `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;

const PITCH: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * A note typed in: a name and octave ("C#3", "Db3", "E♭4", "c4", 60 being C4), or a MIDI number. `null` for anything
 * else.
 */
export function parseNote(text: string): number | null {
  const t = text.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^([a-g])\s*([#♯b♭]?)\s*(-?\d+)$/i.exec(t);
  if (!m) return null;
  const shift = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + PITCH[m[1].toLowerCase()] + shift;
}

/** The twelve roots, C first. */
export const ROOT_NAMES = NOTE_NAMES;

export const SCALE_LABELS: Record<ScaleName, string> = {
  chromatic: 'Chromatic',
  major: 'Major',
  minor: 'Minor',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  locrian: 'Locrian',
  harmonicMinor: 'Harmonic minor',
  majorPentatonic: 'Major pentatonic',
  minorPentatonic: 'Minor pentatonic',
  blues: 'Blues',
};

export const DIRECTION_LABELS: Record<Direction, string> = {
  forward: 'Forward',
  reverse: 'Reverse',
  pendulum: 'Pendulum',
  random: 'Random',
  brownian: 'Brownian',
};

export const STEP_SIZE_LABELS: Record<StepSize, string> = {
  '1/8': '1/8',
  '1/8t': '1/8 triplet',
  '1/16': '1/16',
  '1/16t': '1/16 triplet',
  '1/32': '1/32',
};

/** The conditions offered for a step, keyed as `conditionKey` reads one. "Loop A of B" up to every fourth loop. */
export const CONDITIONS: readonly {
  key: string;
  label: string;
  condition: StepCondition | undefined;
}[] = [
  { key: 'always', label: 'Always', condition: undefined },
  { key: 'first', label: '1st loop only', condition: { t: 'first' } },
  { key: 'notFirst', label: 'Not the 1st loop', condition: { t: 'notFirst' } },
  { key: 'fill', label: 'Only with Fill', condition: { t: 'fill' } },
  { key: 'notFill', label: 'Not with Fill', condition: { t: 'notFill' } },
  ...[2, 3, 4].flatMap((b) =>
    Array.from({ length: b }, (_, i) => ({
      key: `ab:${i + 1}:${b}`,
      label: `Loop ${i + 1} of ${b}`,
      condition: { t: 'ab' as const, a: i + 1, b },
    }))
  ),
];

export const conditionKey = (c: StepCondition | undefined): string =>
  !c ? 'always' : c.t === 'ab' ? `ab:${c.a}:${c.b}` : c.t;

/** A short mark for a step key: `1:2`, `1st`, `Fill`. */
export const conditionMark = (c: StepCondition | undefined): string | null =>
  !c
    ? null
    : c.t === 'ab'
      ? `${c.a}:${c.b}`
      : { first: '1st', notFirst: '!1st', fill: 'Fill', notFill: '!Fill' }[c.t];

/** The part names. */
export const PART_NAMES = ['A', 'B'];

/** The chains offered once there is a B. */
export const CHAINS: readonly { key: string; label: string; chain: number[] }[] = [
  { key: '0', label: 'A', chain: [0] },
  { key: '1', label: 'B', chain: [1] },
  { key: '0,1', label: 'A B', chain: [0, 1] },
  { key: '0,0,0,1', label: 'A A A B', chain: [0, 0, 0, 1] },
  { key: '0,0,1,1', label: 'A A B B', chain: [0, 0, 1, 1] },
];

export const chainLabel = (chain: readonly number[]): string =>
  chain.map((c) => PART_NAMES[c] ?? '?').join(' ');
