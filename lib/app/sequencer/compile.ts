/**
 * One pass through a pattern, as the notes the engine plays (`f-step-sequencer` t-78).
 *
 * A pattern with probability, conditions or a random direction plays differently each time round, so it is compiled a
 * loop at a time: the page compiles the next loop while this one plays, and the engine swaps it in at the boundary
 * (t-79). Given the same random source, the same loop compiles the same way, which is what lets the tests pin it.
 *
 * The order the rules apply in, per slot of the loop: which step plays here (direction), whether it plays (on, rests,
 * condition, probability), then each of its notes: transpose and scale, ratchet, nudge, swing, slide and accent.
 */
import type { ControlValues, PhraseNote } from '@/lib/app/synths/contract';
import type { ArpInput } from '@/lib/app/sequencer/arp';
import {
  ACCENT_VELOCITY,
  SCALES,
  clampNote,
  pitchClass,
  patternLength,
  stepsPerBeat,
  type Pattern,
  type ScaleName,
  type Step,
  type StepCondition,
} from '@/lib/app/sequencer/pattern';

/** A source of random numbers in [0, 1). `Math.random` in the page; a seeded one in tests. */
export type Rng = () => number;

/** How far past the next step a slid note is held, in steps, so a mono voice hears the two overlap and glides. */
export const SLIDE_OVERLAP = 0.05;

/** A small seeded generator (mulberry32), so a loop can be compiled again and come out the same. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LoopOptions {
  /** Which pass this is, from 0: it picks the part from the chain, and conditions and pendulum read it. */
  loop: number;
  rng: Rng;
  /** Whether Fill is held. */
  fill?: boolean;
  /** Where a Brownian walk stood at the end of the loop before. Absent starts it before the first step. */
  from?: number;
  /**
   * Arp mode (t-86): each step that plays plays the arp's next note in place of its own, keeping its first note's gate,
   * velocity and nudge. With no notes held, no step plays.
   */
  arp?: ArpInput;
}

export interface CompiledLoop {
  /** The notes, in beats from the start of the loop, sorted by start then note. */
  notes: PhraseNote[];
  /** How long the loop is in beats: every step, played or not. */
  beats: number;
  /** Where a Brownian walk stands at the end, for the next loop's `from`. */
  to: number;
  /** Which step played in each slot: what a playhead is drawn from. */
  order: number[];
  /** Where the mod lanes' values change: empty for a pattern with no lanes. See {@link ModChange}. */
  mods: ModChange[];
  /** In arp mode, the index of the arp's next note, for the next loop's `arp.from`. */
  arpTo: number;
}

/**
 * From `beat` of the loop on, the lanes set these controls (by id), and every other control is at the panel's value.
 * `null`: no lane sets anything, so the whole panel is at its own values.
 */
export type ModChange = [beat: number, set: ControlValues | null];

/** What a step's lanes set, of the pattern's lanes: `null` for nothing. */
export function stepMods(step: Step | undefined, lanes: readonly string[]): ControlValues | null {
  if (!step?.mod) return null;
  let set: ControlValues | null = null;
  for (const id of lanes) {
    // Own keys only: a lane named `constructor` must not read the object's prototype.
    if (!Object.hasOwn(step.mod, id)) continue;
    (set ??= {})[id] = step.mod[id];
  }
  return set;
}

const sameMods = (a: ControlValues | null, b: ControlValues | null): boolean => {
  if (a === null || b === null) return a === b;
  const ka = Object.keys(a);
  return (
    ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && a[k] === b[k])
  );
};

/** The note on the scale nearest to `note`, measured from `root`. A tie goes down. */
export function snapToScale(note: number, root: number, scale: ScaleName): number {
  const degrees: readonly number[] = SCALES[scale];
  if (degrees.length === 12) return note;
  for (let d = 0; d <= 6; d++) {
    if (degrees.includes(pitchClass(note - d, root))) return note - d;
    if (degrees.includes(pitchClass(note + d, root))) return note + d;
  }
  return note;
}

/**
 * The note on the scale nearest to `note` that MIDI can play. Clamping after the snap could land on a note off the
 * scale (127 is G, which C# major does not have), so a snap past either end takes the scale's last note inside it.
 */
export function placeNote(note: number, root: number, scale: ScaleName): number {
  const snapped = snapToScale(clampNote(note), root, scale);
  if (snapped > 127) return firstOnScale(127, -1, root, scale);
  if (snapped < 0) return firstOnScale(0, 1, root, scale);
  return snapped;
}

/** The first note on the scale from `from`, walking by `dir`. */
function firstOnScale(from: number, dir: 1 | -1, root: number, scale: ScaleName): number {
  const degrees: readonly number[] = SCALES[scale];
  let n = from;
  while (!degrees.includes(pitchClass(n, root))) n += dir;
  return n;
}

/** Whether a step's condition lets it play on loop `loop` (from 0). */
export function conditionPlays(c: StepCondition | undefined, loop: number, fill: boolean): boolean {
  if (!c) return true;
  switch (c.t) {
    case 'ab':
      return loop % c.b === c.a - 1;
    case 'first':
      return loop === 0;
    case 'notFirst':
      return loop > 0;
    case 'fill':
      return fill;
    case 'notFill':
      return !fill;
  }
}

/** Which step plays in each slot of the loop, and where a Brownian walk ends. */
export function stepOrder(p: Pattern, opts: LoopOptions): { order: number[]; to: number } {
  const len = patternLength(p);
  const slots = Array.from({ length: len }, (_, s) => s);
  switch (p.direction) {
    case 'forward':
      return { order: slots, to: len - 1 };
    case 'reverse':
      return { order: slots.map((s) => len - 1 - s), to: 0 };
    case 'pendulum':
      return opts.loop % 2 === 0
        ? { order: slots, to: len - 1 }
        : { order: slots.map((s) => len - 1 - s), to: 0 };
    case 'random':
      return { order: slots.map(() => Math.floor(opts.rng() * len)), to: 0 };
    case 'brownian': {
      // Half the time a step on, a quarter it stays, a quarter it steps back, wrapping at either end.
      let pos = opts.from ?? -1;
      const order = slots.map(() => {
        const r = opts.rng();
        pos = pos < 0 ? 0 : (pos + (r < 0.5 ? 1 : r < 0.75 ? 0 : -1) + len) % len;
        return pos;
      });
      return { order, to: pos };
    }
  }
}

/** Whether a step plays this pass. Probability draws from `rng` only for a step that has one below 1. */
function stepPlays(step: Step, opts: LoopOptions): boolean {
  if (!step.on || step.notes.length === 0) return false;
  if (!conditionPlays(step.condition, opts.loop, opts.fill ?? false)) return false;
  if (step.probability !== undefined && step.probability < 1) return opts.rng() < step.probability;
  return true;
}

/** The notes of loop `opts.loop`. */
export function compileLoop(p: Pattern, opts: LoopOptions): CompiledLoop {
  const perBeat = stepsPerBeat(p);
  const len = patternLength(p);
  const part = p.parts[p.chain[opts.loop % p.chain.length]] ?? p.parts[0];
  const { order, to } = stepOrder(p, opts);
  // Swing moves the second step of each pair later: at 50 not at all, at 75 by half a step.
  const swing = (p.swing / 100) * 2 - 1;
  const slotStart = (slot: number) => slot + (slot % 2 === 1 ? swing : 0);
  const notes: PhraseNote[] = [];
  const arp = opts.arp;
  let arpAt = arp?.from ?? 0;
  // A lane is a row of CV: it moves on every slot, whether the step plays or not, so it never draws from `rng`. The
  // first slot always says what it sets, which puts back what the loop before left set.
  const lanes = p.lanes ?? [];
  const mods: ModChange[] = [];
  order.forEach((index, slot) => {
    const step = part.steps[index];
    if (lanes.length > 0) {
      const set = stepMods(step, lanes);
      if (mods.length === 0 || !sameMods(mods[mods.length - 1][1], set))
        mods.push([slotStart(slot) / perBeat, set]);
    }
    if (!step || !stepPlays(step, opts)) return;
    // The arp's note. A random one is drawn after the step's own chance, so the arp changes no step's mind.
    let played = step.notes;
    if (arp) {
      if (arp.notes.length === 0) return;
      const k = arp.random ? Math.floor(opts.rng() * arp.notes.length) : arpAt++ % arp.notes.length;
      played = [{ ...step.notes[0], note: arp.notes[k] }];
    }
    const ratchet = step.ratchet ?? 1;
    const start = slotStart(slot);
    // Where the next slot starts, swung or not: a slide has to reach past it to overlap the note there.
    const next = slotStart(slot + 1);
    for (const n of played) {
      const note = placeNote(n.note + p.transpose, p.root, p.scale);
      const velocity = step.accent ? ACCENT_VELOCITY : n.velocity;
      for (let k = 0; k < ratchet; k++) {
        const offset = (k + (n.nudge ?? 0)) / ratchet;
        let gate = ratchet > 1 ? Math.min(n.gate, 1) / ratchet : n.gate;
        const at = start + offset;
        // A slide holds the step's last hit past the start of the next slot, so the two overlap.
        if (step.slide && k === ratchet - 1) gate = Math.max(gate, next - at + SLIDE_OVERLAP);
        const out: PhraseNote = [at / perBeat, note, gate / perBeat];
        if (velocity !== undefined) out.push(velocity);
        notes.push(out);
      }
    }
  });
  notes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const arpTo = arp && arp.notes.length > 0 ? arpAt % arp.notes.length : 0;
  return { notes, beats: len / perBeat, to, order, mods, arpTo };
}
