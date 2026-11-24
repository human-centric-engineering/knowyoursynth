/**
 * Mod lanes as MIDI CCs (`f-midi-out` t-90). A lane names one of the app's panel controls, which hardware doesn't
 * know, so a lane is sent only once the player gives it a CC number. The assignments are the hardware's, not the
 * music's: they are kept per synth in this browser (`kys.midiCc`), and a pattern stays synth-agnostic.
 *
 * A lane's value is sent across its control's travel as the lane draws it (`lanePos`): a knob by its taper (a log knob
 * by ratio), a choice by its place among the options the panel shows, a switch as 0 or 127.
 *
 * A performance wheel's lane (`@wheel`, `@bend`, `f-performance-wheels`) is the one exception: the hardware knows its
 * wheels, so the lane is sent as the message the synth declares for it, always, with nothing to assign: the mod wheel
 * as its CC, the pitch wheel as pitch bend (`PITCH_BEND`, which `ccMessage` turns into the bytes). It is sent only while
 * the loop being sent has the lane (its `lanes`, t-313), and a step it leaves alone sends the hand's wheel, as the
 * browser's voice plays it. The hand is read as each change is sent, so the lookup stays the same while it moves; the
 * lanes come with the loop, so they are the loop's own from its first step, whenever the page hears of them.
 */
import { lanePos, laneControl } from '@/lib/app/sequencer/lanes';
import { isPerformanceId, performanceInputs, PITCH_BEND } from '@/lib/app/synths/lib/performance';
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

/**
 * The CCs a set of lane values sends: `[cc, value]`, value 0..127, or for `PITCH_BEND` 0..16383. `lanes` are the lanes
 * of the loop the values are from: a wheel's is sent only when they include it.
 */
export interface CcLookup {
  (set: ControlValues, lanes?: readonly string[]): [cc: number, value: number][];
  /**
   * What a performance wheel goes back to when the run ends: the hand's wheel, on its CC. A lane leaves the hardware's
   * wheel where it put it otherwise, as the hardware has no hand of the app's to return to.
   */
  rest?: () => [cc: number, value: number][];
}

/** A control's value as a CC value, 0..127, across its travel. */
export const ccValue = (c: Control, v: ControlValue): number => {
  const t = lanePos(c, v);
  // A control with no travel (min = max) has no place on it.
  return Number.isFinite(t) ? Math.round(t * 127) : 0;
};

/** Pitch bend's centre, as a 14-bit value: the wheel at rest. */
export const BEND_CENTRE = 8192;

/** A pitch wheel's position, -1..1, as a 14-bit pitch-bend value: 0 all the way down, 8192 at rest, 16383 all the way up. */
export const bendValue = (v: ControlValue): number => {
  const b = typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0;
  return Math.round(BEND_CENTRE + b * (b > 0 ? BEND_CENTRE - 1 : BEND_CENTRE));
};

/**
 * A pitch-bend message's two data bytes (least significant first, as they come) as the wheel's position, -1..1: 8192
 * is the centre, 0 all the way down and 16383 all the way up, so either side of the centre reaches its end.
 */
export const bendFromMidi = (lsb: number, msb: number): number => {
  const v = ((msb & 0x7f) << 7) | (lsb & 0x7f);
  return v >= BEND_CENTRE ? (v - BEND_CENTRE) / (BEND_CENTRE - 1) : (v - BEND_CENTRE) / BEND_CENTRE;
};

/** The bytes that send `value` on `cc` on `channel`: a Control Change, or for `PITCH_BEND` a pitch-bend message. */
export const ccMessage = (channel: number, cc: number, value: number): number[] =>
  cc === PITCH_BEND
    ? [0xe0 | channel, value & 0x7f, (value >> 7) & 0x7f]
    : [0xb0 | channel, cc, value];

/** Where a performance wheel's lane gets the hand's position, by lane id. */
export interface LaneHand {
  at: (id: string) => number;
}

/**
 * What a set of lane values sends on synth `def`, with `ccs` assigned: one `[cc, value]` per lane with a CC whose
 * control this synth has. A lane without a CC sends nothing. `null` when no lane has one, so nothing is looked up.
 */
export function ccLookup(
  def: SynthDef,
  ccs: LaneCcs,
  /** Where the hand has each wheel; left out, no wheel is ever sent. */
  hand?: LaneHand | null
): CcLookup | null {
  // A performance wheel is sent as the message the synth hears it as, with nothing to assign (`performance.ts`); a
  // CC the player gave another lane that is the same number is the wheel's, so it is not sent twice, lane or none.
  const inputs = performanceInputs(def);
  const taken = new Set(inputs.map((p) => p.cc));
  const own = hand
    ? inputs.map((p) => {
        const c = p.control;
        const send = p.cc === PITCH_BEND ? bendValue : (v: ControlValue) => ccValue(c, v);
        return { id: p.id, cc: p.cc, send };
      })
    : [];
  const given = Object.entries(ccs).flatMap(([id, cc]) => {
    if (isPerformanceId(id) || taken.has(cc)) return [];
    const c = laneControl(def, id);
    return c && validLaneCc(cc) ? [{ id, cc, c }] : [];
  });
  if (own.length === 0 && given.length === 0) return null;
  const look: CcLookup = (set, lanes) => {
    const out: [number, number][] = [];
    // A step the wheel lane leaves alone plays the hand's wheel.
    if (hand)
      for (const { id, cc, send } of own)
        if (lanes?.includes(id))
          out.push([cc, send(Object.hasOwn(set, id) ? set[id] : hand.at(id))]);
    for (const { id, cc, c } of given) {
      if (Object.hasOwn(set, id)) out.push([cc, ccValue(c, set[id])]);
    }
    return out;
  };
  // Whether or not the lane is still on: one taken off mid-run leaves the wheel where it put it otherwise.
  if (hand && own.length > 0)
    look.rest = () => own.map(({ id, cc, send }): [number, number] => [cc, send(hand.at(id))]);
  return look;
}

/**
 * How long after it is due a mod wheel or pitch-bend message sent out is still taken as the one coming back in: a DAW
 * echoing MIDI out to MIDI in returns it within a few ms; this allows for a slow round trip (t-310).
 */
export const ECHO_WINDOW_MS = 300;

/** The mod wheel (CC 1) and pitch bend sent out lately, to tell their echo coming back in from the hand (t-310). */
export interface EchoLog {
  /** `data` handed to the port at `now`, due at `at` (ms, `performance.now()`): kept if it is a wheel's. */
  sent(data: readonly number[], at: number, now: number): void;
  /** Whether the wheel's position `v` (mod wheel 0..1, pitch wheel -1..1) in from MIDI at `now` is one sent lately. */
  echoed(kind: 'wheel' | 'bend', v: number, now: number): boolean;
}

/** A wheel message as what it sets, whatever its channel: `w` and CC 1's value, or `b` and the 14-bit bend. */
const echoKey = (data: readonly number[]): string | null => {
  const [st = 0, d1 = 0, d2 = 0] = data;
  if ((st & 0xf0) === 0xb0 && d1 === 1 && data.length >= 3) return `w${d2}`;
  if ((st & 0xf0) === 0xe0 && data.length >= 3) return `b${((d2 & 0x7f) << 7) | (d1 & 0x7f)}`;
  return null;
};

export function createEchoLog(): EchoLog {
  /** Per wheel message, until when its echo is expected. */
  const until = new Map<string, number>();
  return {
    sent(data, at, now) {
      const key = echoKey(data);
      if (!key) return;
      for (const [k, t] of until) if (t < now) until.delete(k);
      until.set(key, Math.max(until.get(key) ?? 0, Math.max(at, now) + ECHO_WINDOW_MS));
    },
    echoed(kind, v, now) {
      const key =
        kind === 'wheel' ? `w${Math.round(Math.min(1, Math.max(0, v)) * 127)}` : `b${bendValue(v)}`;
      return (until.get(key) ?? -Infinity) >= now;
    },
  };
}
