/**
 * The sequencer's tools (`f-step-sequencer` t-78): Euclidean fill, rotate, shift, reverse, randomise, mutate, copy,
 * paste, clear and resize. Each takes steps (or a pattern) and returns new ones, never changing what it was given, so
 * the page's Undo is a stack of the values these return.
 */
import { snapToScale, type Rng } from '@/lib/app/sequencer/compile';
import {
  MAX_STEPS,
  SCALES,
  clampNote,
  emptyStep,
  pitchClass,
  type Pattern,
  type ScaleName,
  type Step,
} from '@/lib/app/sequencer/pattern';

const clone = (steps: Step[]): Step[] => structuredClone(steps);
/** A note moved by whole octaves back inside MIDI, so it keeps its place in the scale. */
const foldIntoMidi = (n: number) => {
  let x = n;
  while (x > 127) x -= 12;
  while (x < 0) x += 12;
  return x;
};

/**
 * `hits` spread as evenly as they go over `length` steps, then turned `rotate` steps later. Bjorklund's algorithm,
 * starting on a hit. For most rhythms that is how Toussaint's tables write them (3 in 8 is the tresillo `x..x..x.`, 5 in
 * 8 the cinquillo `x.xx.xx.`); for a few it is another rotation of the same rhythm (4 in 7 comes out `x.x.x.x`, which
 * the tables start as `x.xx.x.`), and `rotate` reaches it.
 */
export function euclid(hits: number, length: number, rotate = 0): boolean[] {
  const k = Math.max(0, Math.min(hits, length));
  if (length <= 0) return [];
  if (k === 0 || k === length) return rotateArray(Array<boolean>(length).fill(k > 0), rotate);
  // Start with k groups of [hit] and length - k groups of [rest]; deal the remainder onto the front groups, at least
  // once, until one group or none is left over.
  let front: boolean[][] = Array.from({ length: k }, () => [true]);
  let rest: boolean[][] = Array.from({ length: length - k }, () => [false]);
  do {
    const n = Math.min(front.length, rest.length);
    const merged = front.slice(0, n).map((g, i) => [...g, ...rest[i]]);
    const left = front.length > n ? front.slice(n) : rest.slice(n);
    front = merged;
    rest = left;
  } while (rest.length > 1);
  return rotateArray([...front, ...rest].flat(), rotate);
}

function rotateArray<T>(xs: T[], by: number): T[] {
  const n = xs.length;
  if (n === 0) return xs;
  const r = ((by % n) + n) % n;
  return xs.map((_, i) => xs[(i - r + n) % n]);
}

/**
 * Turns on the steps a Euclidean rhythm hits and turns off the rest, keeping every step's notes, so it can be undone
 * by hand. A hit on a rest gets `note`.
 */
export function euclidFill(
  steps: Step[],
  hits: number,
  rotate: number,
  note: number,
  gate = 0.5
): Step[] {
  const rhythm = euclid(hits, steps.length, rotate);
  return clone(steps).map((s, i) => {
    s.on = rhythm[i];
    if (rhythm[i] && s.notes.length === 0) s.notes = [{ note: clampNote(Math.round(note)), gate }];
    return s;
  });
}

/** Moves every step `by` places later, round the end. */
export const rotateSteps = (steps: Step[], by: number): Step[] => rotateArray(clone(steps), by);

/** The steps back to front. Each step keeps its own notes and settings. */
export const reverseSteps = (steps: Step[]): Step[] => clone(steps).reverse();

/** Every note moved by whole octaves. A note pushed past either end of MIDI stays an octave inside it. */
export function shiftOctave(steps: Step[], octaves: number): Step[] {
  return clone(steps).map((s) => {
    s.notes.forEach((n) => (n.note = foldIntoMidi(n.note + 12 * Math.round(octaves))));
    return s;
  });
}

/** The note `degrees` steps up (or down) the scale from `note`, which is first put on the scale. */
export function moveByDegree(
  note: number,
  degrees: number,
  root: number,
  scale: ScaleName
): number {
  const ds: readonly number[] = SCALES[scale];
  const on = snapToScale(note, root, scale);
  const rel = on - root;
  const octave = Math.floor(rel / 12);
  const index = ds.indexOf(pitchClass(rel)) + degrees;
  const o = octave + Math.floor(index / ds.length);
  const d = ds[((index % ds.length) + ds.length) % ds.length];
  return foldIntoMidi(root + o * 12 + d);
}

/** Every note moved `degrees` steps along the scale. */
export function shiftDegree(
  steps: Step[],
  degrees: number,
  root: number,
  scale: ScaleName
): Step[] {
  return clone(steps).map((s) => {
    s.notes.forEach((n) => (n.note = moveByDegree(n.note, degrees, root, scale)));
    return s;
  });
}

export interface RandomiseOptions {
  root: number;
  scale: ScaleName;
  /** The range notes are picked from, as MIDI notes, both ends included. */
  low: number;
  high: number;
  /** 0..1: the share of steps that get a note. */
  density: number;
  /** 0..1: the chance a step that plays is accented, and that it slides. */
  accents?: number;
  slides?: number;
}

/** A fresh line of `length` steps, every note on the scale and in the range. */
export function randomise(length: number, rng: Rng, o: RandomiseOptions): Step[] {
  const ds: readonly number[] = SCALES[o.scale];
  const pool: number[] = [];
  for (let n = Math.max(0, o.low); n <= Math.min(127, o.high); n++)
    if (ds.includes(pitchClass(n, o.root))) pool.push(n);
  return Array.from({ length }, () => {
    if (pool.length === 0 || rng() >= o.density) return emptyStep();
    const step: Step = {
      on: true,
      notes: [{ note: pool[Math.floor(rng() * pool.length)], gate: 0.5 }],
    };
    if (o.accents && rng() < o.accents) step.accent = true;
    if (o.slides && rng() < o.slides) step.slide = true;
    return step;
  });
}

/**
 * A variation on the steps: each note moves one degree up or down the scale with chance `amount`, and each step with
 * notes is muted or unmuted with chance `amount / 2`. Rests stay rests.
 */
export function mutate(
  steps: Step[],
  rng: Rng,
  amount: number,
  root: number,
  scale: ScaleName
): Step[] {
  return clone(steps).map((s) => {
    if (s.notes.length === 0) return s;
    s.notes.forEach((n) => {
      if (rng() < amount) n.note = moveByDegree(n.note, rng() < 0.5 ? -1 : 1, root, scale);
    });
    if (rng() < amount / 2) s.on = !s.on;
    return s;
  });
}

/** Steps `from` to `to` (end not included), as a clip to paste. */
export const copySteps = (steps: Step[], from: number, to: number): Step[] =>
  clone(steps.slice(from, to));

/** The clip written over the steps from `at`, cut off at either end of the pattern. */
export function pasteSteps(steps: Step[], at: number, clip: Step[]): Step[] {
  const out = clone(steps);
  clip.forEach((s, i) => {
    const to = Math.round(at) + i;
    if (to >= 0 && to < out.length) out[to] = structuredClone(s);
  });
  return out;
}

/** Steps `from` to `to` (end not included) made rests. */
export function clearSteps(steps: Step[], from = 0, to = steps.length): Step[] {
  return clone(steps).map((s, i) => (i >= from && i < to ? emptyStep() : s));
}

/**
 * The pattern with `length` steps in every part: rests added at the end, or steps cut from it. A length that is not a
 * number leaves it as it was.
 */
export function resizePattern(p: Pattern, length: number): Pattern {
  const len = Number.isFinite(length)
    ? Math.max(1, Math.min(MAX_STEPS, Math.round(length)))
    : p.parts[0].steps.length;
  return {
    ...p,
    parts: p.parts.map((part) => ({
      steps: Array.from({ length: len }, (_, i) =>
        i < part.steps.length ? structuredClone(part.steps[i]) : emptyStep()
      ),
    })),
  };
}
