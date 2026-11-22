/**
 * Whether a person could play a pattern's mod lanes by hand (`f-lane-sounds` t-301): the playability rule for sounds
 * played by their lanes, on any synth. The design and the rulings behind the limits are `.context/app/lane-sounds.md`.
 *
 * A lane is a hand on a control while the sequencer plays the notes: two lanes are two hands. Each is read over the
 * whole song as it loops (the chain, then back to its start), with a step that sets nothing back at the panel's value:
 * - **A knob** may not move faster than a full sweep of its travel in `sweepS`, from one step to the next, and may not
 *   turn back on itself more than `turnsPerS` times in any second. A wobble smaller than `jitter` of its travel is no
 *   turn: a hand holding a knob still is that unsteady anyway.
 * - **A switch or selector** may not change again within `flipS` of its last change.
 *
 * Travel is how far the knob turns, so a knob with a log taper is measured by ratio, as it is dragged. Time is the
 * song's own, as the compiler plays it: each part a loop, its steps forward or in reverse, and swing starting every
 * second slot of a loop late, so a move into a late slot has longer and one out of it less.
 */
import type { Control, ControlValue, ControlValues, SynthDef } from '@/lib/app/synths/contract';
import { laneControl, laneValue } from '@/lib/app/sequencer/lanes';
import { stepsPerBeat, type Pattern } from '@/lib/app/sequencer/pattern';

export interface HandLimits {
  /** The fastest full sweep of a knob's travel, in seconds. */
  sweepS: number;
  /** The most times a knob turns back on itself in any one second. */
  turnsPerS: number;
  /** The least time between two changes of a switch or selector, in seconds. */
  flipS: number;
  /** The share of a knob's travel a move must reach to count as a turn. */
  jitter: number;
}

/** The owner's ruling, 2026-11-21: a quick, practised player's hands (`lane-sounds.md`, The hand limits). */
export const HAND_LIMITS: HandLimits = { sweepS: 0.3, turnsPerS: 3, flipS: 0.2, jitter: 0.03 };

/** One slot of the song as it plays: the step, where it is in its part, and when it starts in the song. */
interface Slot {
  step: Pattern['parts'][number]['steps'][number];
  /** For a problem's text: `A7` is part A's seventh step, on whichever pass. */
  place: string;
  at: number;
}

/**
 * The song as the compiler plays it (`compileLoop`): a loop a part in the chain's order, its steps forward or in
 * reverse, and swing counted from each loop's first slot, every second slot starting late. A default plays forward or
 * in reverse (`riffProblem`); any other direction is read forward.
 */
function songOf(p: Pattern): { slots: Slot[]; length: number } {
  const stepS = 60 / p.bpm / stepsPerBeat(p);
  const len = p.parts[0].steps.length;
  const push = p.swing / 50 - 1;
  const slots = p.chain.flatMap((k, loop) =>
    Array.from({ length: len }, (_, slot) => {
      const index = p.direction === 'reverse' ? len - 1 - slot : slot;
      return {
        step: p.parts[k].steps[index],
        place: `${'AB'[k] ?? `part ${k + 1} `}${index + 1}`,
        at: (loop * len + slot + (slot % 2 === 1 ? push : 0)) * stepS,
      };
    })
  );
  return { slots, length: p.chain.length * len * stepS };
}

/** A knob's position along its travel, 0 to 1. */
function travel(c: Extract<Control, { kind: 'cont' }>, v: number): number {
  if (c.taper === 'log' && c.min > 0) return Math.log(v / c.min) / Math.log(c.max / c.min);
  return (v - c.min) / (c.max - c.min);
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * What no hand could play in the pattern's lanes, against the panel the sound sets (`panel`): one line a problem, none
 * when every lane is playable. A lane for a control the synth has none of is silent, so it is not read.
 */
export function handProblems(
  def: SynthDef,
  pattern: Pattern,
  panel: ControlValues,
  limits: HandLimits = HAND_LIMITS
): string[] {
  const { slots, length } = songOf(pattern);
  const n = slots.length;
  // When slot `i`, counted on through later passes of the song, starts: a move into a late slot has longer, and one
  // out of it less.
  const time = (i: number) => Math.floor(i / n) * length + slots[i % n].at;
  const place = (i: number) => slots[i % n].place;
  const problems: string[] = [];
  for (const id of pattern.lanes ?? []) {
    const c = laneControl(def, id);
    if (!c) continue;
    // A step the lane leaves alone plays at the panel's value, or the control's own where the panel has none.
    const at = (i: number): ControlValue | null =>
      laneValue(c, slots[i % n].step.mod?.[id]) ?? laneValue(c, panel[id] ?? c.def);
    if (c.kind === 'cont') {
      const pos = Array.from({ length: n }, (_, i) => {
        const v = at(i);
        return typeof v === 'number' ? travel(c, v) : 0;
      });
      // Speed: the move from each step to the next, the song's last back to its first.
      for (let i = 0; i < n; i++) {
        const d = Math.abs(pos[(i + 1) % n] - pos[i]);
        const gap = time(i + 1) - time(i);
        if (d > gap / limits.sweepS + 1e-9) {
          problems.push(
            `${id}: moves ${Math.round(d * 100)}% of its travel into ${place(i + 1)} in ${round(gap)} s, a full sweep in ${round(gap / d)} s (a hand's fastest is ${limits.sweepS} s)`
          );
          break;
        }
      }
      // Turns: where the knob sets off back the way it came by more than the jitter. Read over three passes, and
      // counted from the middle one, so a turn at the loop's seam is seen and the first pass only finds a direction.
      const turns: number[] = [];
      let dir = 0;
      let peak = pos[0];
      for (let i = 1; i < 3 * n; i++) {
        const v = pos[i % n];
        if (dir === 0) {
          if (Math.abs(v - peak) >= limits.jitter) [dir, peak] = [Math.sign(v - peak), v];
        } else if ((v - peak) * dir > 0) peak = v;
        else if (Math.abs(v - peak) >= limits.jitter) {
          turns.push(i);
          [dir, peak] = [-dir, v];
        }
      }
      for (let k = 0; k < turns.length; k++) {
        if (turns[k] < n) continue;
        if (turns[k] >= 2 * n) break;
        let count = 0;
        while (k + count < turns.length && time(turns[k + count]) - time(turns[k]) < 1 - 1e-9)
          count++;
        if (count > limits.turnsPerS) {
          problems.push(
            `${id}: turns back ${count} times in the second from ${place(turns[k])} (a hand turns at most ${limits.turnsPerS})`
          );
          break;
        }
      }
    } else {
      // A switch or selector: the steps where it changes, and the gap back to the last one.
      const changes: number[] = [];
      for (let i = 0; i < n; i++) if (at(i) !== at((i + n - 1) % n)) changes.push(i);
      for (let k = 0; k < changes.length; k++) {
        const prev = changes[(k + changes.length - 1) % changes.length];
        // The last change before this one, a pass earlier where it is the song's first.
        const from = prev < changes[k] ? prev : prev - n;
        // A song that changes a switch changes it back, so there are always two changes at least.
        const gap = time(changes[k] + n) - time(from + n);
        if (gap < limits.flipS - 1e-9) {
          problems.push(
            `${id}: changes again at ${place(changes[k])}, ${round(gap)} s after its last change (a hand needs ${limits.flipS} s)`
          );
          break;
        }
      }
    }
  }
  return problems;
}
