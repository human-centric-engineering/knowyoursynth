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

/** A CC number a lane can be given. */
export const validLaneCc = (cc: unknown): cc is number =>
  typeof cc === 'number' && Number.isInteger(cc) && cc >= 0 && cc <= MAX_LANE_CC;

/** Lane control id → CC number, for one synth. */
export type LaneCcs = Readonly<Record<string, number>>;

/** The CCs a set of lane values sends: `[cc, value]`, value 0..127. */
export type CcLookup = (set: ControlValues) => [cc: number, value: number][];

/** A control's value as a CC value, 0..127, across its travel. */
export const ccValue = (c: Control, v: ControlValue): number => Math.round(lanePos(c, v) * 127);

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
