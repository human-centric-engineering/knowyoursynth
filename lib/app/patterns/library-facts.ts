/**
 * What a library pattern plays, read from its notes (`f-pattern-library` t-122): the role the default role rule gives
 * it, and the facts matching weighs. The rules are in `.context/app/pattern-library.md` (Roles), with the exact terms
 * this file implements.
 *
 * Everything here is read from the pattern's first loop, as `compileLoop` plays it, so a fact can never disagree with
 * the notes. Pure, so the seed, the API and the tests read a pattern with the same code.
 */
import type { PatternRole } from '@prisma/client';
import type { PhraseNote } from '@/lib/app/synths/contract';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import type { Pattern } from '@/lib/app/sequencer/pattern';

/** The roles, in the order the design lists them. */
export const PATTERN_ROLES = [
  'lead_line',
  'held',
  'bass_line',
  'slow_melody',
  'percussive',
  'chord_changes',
  'arp',
  'chord_stabs',
] as const satisfies readonly PatternRole[];

/** C3: a line whose median note is below it is a bass line. */
const BASS_BELOW = 48;

/** A pattern's first loop: its notes, and how long it is in beats. The seed is fixed, so it compiles the same way every time. */
export function firstLoop(pattern: Pattern): { notes: PhraseNote[]; beats: number } {
  const { notes, beats } = compileLoop(pattern, { loop: 0, rng: seededRng(1) });
  return { notes, beats };
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Starts within this of each other are one onset: a riff's decimals and a compiled nudge differ by less. */
const SAME_START = 1e-6;

/** The notes grouped by start time, in order: a chord is one onset. */
function onsets(notes: PhraseNote[]): PhraseNote[][] {
  const sorted = [...notes].sort((a, b) => a[0] - b[0]);
  const groups: PhraseNote[][] = [];
  for (const n of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0][0] - n[0]) <= SAME_START) last.push(n);
    else groups.push([n]);
  }
  return groups;
}

/**
 * The role the default role rule gives these notes, over a loop of `beats`. The first rule that fits wins; a loop
 * with no notes is held, since nothing in it moves.
 */
export function defaultRole(notes: PhraseNote[], beats: number): PatternRole {
  if (!notes.length) return 'held';
  const groups = onsets(notes);
  const average = notes.reduce((sum, [, , len]) => sum + len, 0) / notes.length;
  const pitches = new Set(notes.map(([, note]) => note));
  const chords = groups.filter((g) => g.length >= 2).length;

  if (groups.length <= 2 && notes.every(([, , len]) => len >= 0.4 * beats)) return 'held';
  if (pitches.size <= 2 && average <= 0.5) return 'percussive';
  if (chords * 2 >= groups.length) return average <= 1 ? 'chord_stabs' : 'chord_changes';
  if (median(notes.map(([, note]) => note)) < BASS_BELOW) return 'bass_line';
  if (groups.length >= 2 * beats && average <= 0.5) return 'arp';
  if (average >= 1.5) return 'slow_melody';
  return 'lead_line';
}

/** The facts matching weighs, every one read from the notes. */
export interface PatternFacts {
  /** Lowest, highest and median MIDI note. Null for a pattern with no notes. */
  register: { low: number; high: number; median: number } | null;
  /** Onsets per beat of the first loop. */
  density: number;
  /** The average note's length, in beats. */
  noteLength: number;
  /** The most notes that start together: 1 is a line with no chords. */
  voices: number;
  /** Bars (of four beats) the chain plays through once. */
  bars: number;
  /** Whether any step slides. */
  slides: boolean;
}

const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places;

export function patternFacts(pattern: Pattern): PatternFacts {
  const { notes, beats } = firstLoop(pattern);
  const groups = onsets(notes);
  const pitches = notes.map(([, note]) => note);
  const chainBeats = beats * pattern.chain.length;
  return {
    register: notes.length
      ? { low: Math.min(...pitches), high: Math.max(...pitches), median: median(pitches) }
      : null,
    density: beats ? round(groups.length / beats) : 0,
    noteLength: notes.length
      ? round(notes.reduce((sum, [, , len]) => sum + len, 0) / notes.length)
      : 0,
    voices: groups.reduce((most, g) => Math.max(most, g.length), 0),
    bars: round(chainBeats / 4, 2),
    slides: pattern.parts.some((part) => part.steps.some((s) => s.slide)),
  };
}
