/**
 * Mod lanes as MIDI CCs (`f-midi-out` t-90). A lane names one of the app's panel controls, which hardware doesn't
 * know, so a lane is sent only once the player gives it a CC number. The assignments are the hardware's, not the
 * music's: they are kept per synth in this browser (`kys.midiCc`), and a pattern stays synth-agnostic.
 *
 * A lane's value is sent across its control's travel as the lane draws it (`lanePos`): a knob by its taper (a log knob
 * by ratio), a choice by its place among the options the panel shows, a switch as 0 or 127.
 *
 * A performance wheel's lane (`@wheel`, `f-performance-wheels`) is the one exception: the hardware knows its wheel, so
 * the lane is sent as the CC the synth declares for it, always, with nothing to assign. It is sent only while the
 * pattern has the lane (`hand`), and a step it leaves alone sends the hand's wheel, as the browser's voice plays it.
 */
import { lanePos, laneControl } from '@/lib/app/sequencer/lanes';
import { isPerformanceId, performanceInputs } from '@/lib/app/synths/lib/performance';
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
export interface CcLookup {
  (set: ControlValues): [cc: number, value: number][];
  /**
   * What a performance wheel goes back to when the run ends: the hand's wheel, on its CC. A lane leaves the hardware's
   * wheel where it put it otherwise, as the hardware has no hand of the app's to return to.
   */
  rest?: [cc: number, value: number][];
}

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
export function ccLookup(
  def: SynthDef,
  ccs: LaneCcs,
  /** The hand's wheel, 0..1, while the pattern has a wheel lane; left out, no wheel lane is sent. */
  hand?: { wheel: number } | null
): CcLookup | null {
  // A performance wheel is sent as the message the synth hears it as, with nothing to assign (`performance.ts`); a
  // CC the player gave another lane that is the same number is the wheel's, so it is not sent twice, lane or none.
  const inputs = performanceInputs(def);
  const taken = new Set(inputs.map((p) => p.cc));
  const own = hand
    ? inputs.map((p) => ({
        id: p.id,
        cc: p.cc,
        c: p.control,
        rest: ccValue(p.control, hand.wheel),
      }))
    : [];
  const given = Object.entries(ccs).flatMap(([id, cc]) => {
    if (isPerformanceId(id) || taken.has(cc)) return [];
    const c = laneControl(def, id);
    return c && validLaneCc(cc) ? [{ id, cc, c }] : [];
  });
  if (own.length === 0 && given.length === 0) return null;
  const look: CcLookup = (set) => {
    const out: [number, number][] = [];
    // A step the wheel lane leaves alone plays the hand's wheel.
    for (const { id, cc, c, rest } of own)
      out.push([cc, Object.hasOwn(set, id) ? ccValue(c, set[id]) : rest]);
    for (const { id, cc, c } of given) {
      if (Object.hasOwn(set, id)) out.push([cc, ccValue(c, set[id])]);
    }
    return out;
  };
  if (own.length > 0) look.rest = own.map(({ cc, rest }): [number, number] => [cc, rest]);
  return look;
}
