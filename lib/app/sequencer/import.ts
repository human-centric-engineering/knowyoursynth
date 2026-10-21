/**
 * A library riff as a pattern (`f-step-sequencer` t-78), without changing a note.
 *
 * Riffs were written as free note lists, not on a grid: chords of up to five notes, up to 32 beats, lengths of any
 * size, and about a hundred notes that start off the sixteenth grid (triplets, flams, a late push). So the import
 * keeps every note's own start, length and velocity. It picks the step size that puts the fewest notes off the grid,
 * puts each note on the step it starts in, and carries the rest of its start as that note's `nudge`.
 *
 * The test that holds it to that: every seeded riff, imported and compiled for its first loop, gives back the riff's
 * own notes (`tests/unit/lib/app/sequencer/import.test.ts`).
 */
import type { Phrase } from '@/lib/app/synths/contract';
import {
  MAX_BPM,
  MAX_STEPS,
  MIN_BPM,
  PATTERN_VERSION,
  STEP_SIZES,
  emptyStep,
  type Pattern,
  type StepNote,
  type StepSize,
} from '@/lib/app/sequencer/pattern';

/** Within this of a step boundary, a start is on it: riffs are written in decimals, so 0.67 beats is not 2/3. */
const ON_GRID = 1e-6;

/** Step sizes in the order they are preferred when two fit equally well: a straight sixteenth first. */
const PREFERRED: StepSize[] = ['1/16', '1/8t', '1/16t', '1/8', '1/32'];

/** How long the engine plays a riff for before it loops: its last note's end, rounded up to a whole beat. */
export function phraseBeats(ph: Pick<Phrase, 'steps'>): number {
  const end = ph.steps.reduce((e, [b, , len]) => Math.max(e, b + len), 0);
  return Math.max(1, Math.ceil(end - 0.001));
}

const offGrid = (beat: number, perBeat: number) => {
  const at = beat * perBeat;
  return Math.abs(at - Math.round(at)) > ON_GRID;
};

/** The step size that leaves the fewest notes off the grid and still fits the riff in `MAX_STEPS`. */
export function bestStepSize(ph: Pick<Phrase, 'steps'>): StepSize {
  const beats = phraseBeats(ph);
  let best: StepSize = '1/16';
  let bestOff = Infinity;
  for (const size of PREFERRED) {
    const perBeat = STEP_SIZES[size];
    if (beats * perBeat > MAX_STEPS) continue;
    const off = ph.steps.filter(([b]) => offGrid(b, perBeat)).length;
    if (off < bestOff) {
      best = size;
      bestOff = off;
    }
  }
  return best;
}

/**
 * The riff as a one-part pattern: forward, straight, chromatic, at the riff's tempo. A riff too long for any step size
 * (none in the library are) is refused rather than cut.
 */
export function importPhrase(ph: Phrase): Pattern {
  const stepSize = bestStepSize(ph);
  const perBeat = STEP_SIZES[stepSize];
  const length = phraseBeats(ph) * perBeat;
  if (length > MAX_STEPS)
    throw new RangeError(`A riff of ${length} steps is longer than ${MAX_STEPS}`);
  const steps = Array.from({ length }, emptyStep);
  for (const [beat, note, len, velocity] of ph.steps) {
    const at = beat * perBeat;
    const near = Math.round(at);
    // A start within ON_GRID of a boundary is on it, so a decimal riff does not gain a nudge of 1e-15.
    const index = Math.abs(at - near) <= ON_GRID ? near : Math.floor(at);
    const nudge = Math.abs(at - near) <= ON_GRID ? 0 : at - index;
    const n: StepNote = { note, gate: len * perBeat };
    if (velocity !== undefined) n.velocity = velocity;
    if (nudge > 0) n.nudge = nudge;
    steps[index].notes.push(n);
  }
  return {
    version: PATTERN_VERSION,
    bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, ph.bpm)),
    stepSize,
    loop: ph.loop !== false,
    direction: 'forward',
    swing: 50,
    transpose: ph.transpose ?? 0,
    root: 0,
    scale: 'chromatic',
    parts: [{ steps }],
    chain: [0],
  };
}
