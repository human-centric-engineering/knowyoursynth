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
 * Travel is how far the knob turns, so a knob with a log taper is measured by ratio, as it is dragged.
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

/** Where a step of the song is, for a problem's text: `A7` is part A's seventh step, on whichever pass. */
const placeOf = (p: Pattern, i: number): string => {
  const len = p.parts[0].steps.length;
  const loop = Math.floor(i / len) % p.chain.length;
  return `${'AB'[p.chain[loop]] ?? `part ${p.chain[loop] + 1} `}${(i % len) + 1}`;
};

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
  const stepS = 60 / pattern.bpm / stepsPerBeat(pattern);
  const song = pattern.chain.flatMap((k) => pattern.parts[k].steps);
  const n = song.length;
  const problems: string[] = [];
  for (const id of pattern.lanes ?? []) {
    const c = laneControl(def, id);
    if (!c) continue;
    const at = (i: number): ControlValue | null =>
      laneValue(c, song[i % n].mod?.[id]) ?? laneValue(c, panel[id]);
    if (c.kind === 'cont') {
      const pos = Array.from({ length: n }, (_, i) => {
        const v = at(i);
        return typeof v === 'number' ? travel(c, v) : 0;
      });
      // Speed: the move from each step to the next, the song's last back to its first.
      const most = stepS / limits.sweepS;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(pos[(i + 1) % n] - pos[i]);
        if (d > most + 1e-9) {
          problems.push(
            `${id}: moves ${Math.round(d * 100)}% of its travel into ${placeOf(pattern, i + 1)} in ${round(stepS)} s, a full sweep in ${round(stepS / d)} s (a hand's fastest is ${limits.sweepS} s)`
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
      const window = 1 / stepS;
      for (let k = 0; k < turns.length; k++) {
        if (turns[k] < n) continue;
        if (turns[k] >= 2 * n) break;
        let count = 0;
        while (k + count < turns.length && turns[k + count] - turns[k] < window) count++;
        if (count > limits.turnsPerS) {
          problems.push(
            `${id}: turns back ${count} times in the second from ${placeOf(pattern, turns[k] % n)} (a hand turns at most ${limits.turnsPerS})`
          );
          break;
        }
      }
    } else {
      // A switch or selector: the steps where it changes, and the gap back to the last one.
      const changes: number[] = [];
      for (let i = 0; i < n; i++) if (at(i) !== at((i + n - 1) % n)) changes.push(i);
      const least = limits.flipS / stepS;
      for (let k = 0; k < changes.length; k++) {
        const prev = changes[(k + changes.length - 1) % changes.length];
        const gap = changes.length === 1 ? n : (changes[k] - prev + n) % n;
        if (gap < least - 1e-9) {
          problems.push(
            `${id}: changes again at ${placeOf(pattern, changes[k])}, ${round(gap * stepS)} s after its last change (a hand needs ${limits.flipS} s)`
          );
          break;
        }
      }
    }
  }
  return problems;
}
