/**
 * Mod lanes as MIDI CCs (`f-midi-out` t-90). A lane names one of the app's panel controls, which hardware doesn't
 * know, so a lane is sent only once the player gives it a CC number. The assignments are the hardware's, not the
 * music's: they are kept per synth in this browser (`kys.midiCc`), and a pattern stays synth-agnostic.
 *
 * A lane's value is sent across its control's travel as the lane draws it (`lanePos`): a knob by its taper (a log knob
 * by ratio), a choice by its place among the options the panel shows, a switch as 0 or 127.
 */
import { lanePos, laneControl } from '@/lib/app/sequencer/lanes';
import type { Control, ControlValue, ControlValues, SynthDef } from '@/lib/app/synths/contract';

/** The highest CC a lane can send: 120–127 are the channel-mode messages (All Notes Off among them). */
export const MAX_LANE_CC = 119;

/**
 * CCs that aren't a sound parameter, which a lane moving every step would turn into something else: Bank Select (0,
 * 32) changes the bank the next program change loads, and Data Entry (6, 38), Data Increment and Decrement (96, 97)
 * and the NRPN and RPN numbers (98–101) rewrite whichever parameter was last chosen, pitch-bend range among them.
 */
export const NOT_LANE_CCS: ReadonlySet<number> = new Set([0, 6, 32, 38, 96, 97, 98, 99, 100, 101]);

/** A CC number a lane can be given. */
export const validLaneCc = (cc: unknown): cc is number =>
  typeof cc === 'number' &&
  Number.isInteger(cc) &&
  cc >= 0 &&
  cc <= MAX_LANE_CC &&
  !NOT_LANE_CCS.has(cc);

/** The CC numbers a lane can be given, in order. */
export const LANE_CCS: readonly number[] = Array.from(
  { length: MAX_LANE_CC + 1 },
  (_, n) => n
).filter(validLaneCc);

/** Lane control id → CC number, for one synth. */
export type LaneCcs = Readonly<Record<string, number>>;

/** The CCs a set of lane values sends: `[cc, value]`, value 0..127. */
export type CcLookup = (set: ControlValues) => [cc: number, value: number][];

/** A control's value as a CC value, 0..127, across its travel. */
export const ccValue = (c: Control, v: ControlValue): number => {
  const t = lanePos(c, v);
  // A control with no travel (min = max) has no place on it.
  return Number.isFinite(t) ? Math.round(t * 127) : 0;
};

/**
 * What a set of lane values sends on synth `def`, with `ccs` assigned: one `[cc, value]` per lane with a CC whose
 * control this synth has. A lane without a CC sends nothing. `null` when no lane has one, so nothing is looked up.
 */
export function ccLookup(def: SynthDef, ccs: LaneCcs): CcLookup | null {
  const live = Object.entries(ccs).flatMap(([id, cc]) => {
    const c = laneControl(def, id);
    return c && validLaneCc(cc) ? [{ id, cc, c }] : [];
  });
  if (live.length === 0) return null;
  return (set) => {
    const out: [number, number][] = [];
    for (const { id, cc, c } of live) {
      if (Object.hasOwn(set, id)) out.push([cc, ccValue(c, set[id])]);
    }
    return out;
  };
}
