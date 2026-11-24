/**
 * Mod lanes as MIDI CCs (`f-midi-out` t-90): a lane's value across its control's travel as 0..127, and which lanes a
 * set of values sends.
 *
 * @see lib/app/midi/cc.ts
 */

import { describe, it, expect } from 'vitest';
import {
  BEND_CENTRE,
  ECHO_WINDOW_MS,
  LANE_CCS,
  MAX_LANE_CC,
  bendFromMidi,
  bendValue,
  ccLookup,
  ccMessage,
  ccValue,
  createEchoLog,
  validLaneCc,
} from '@/lib/app/midi/cc';
import { PITCH_BEND } from '@/lib/app/synths/lib/performance';
import type { Control, SynthDef } from '@/lib/app/synths/contract';
import { getSynthDef } from '@/lib/app/synths/defs';

const at = { x: 0, y: 0, module: 'filter' as const, help: '' };
const knob = { ...at, type: 'knob' as const, r: 10, style: 'pro1' as const, kind: 'cont' as const };
const LEVEL: Control = { ...knob, id: 'level', min: 0, max: 10, def: 2 };
const CUTOFF: Control = { ...knob, id: 'cutoff', min: 20, max: 20000, def: 1000, taper: 'log' };
const TEMPO: Control = { ...knob, id: 'tempo', min: 40, max: 300, def: 120 };
const WAVE: Control = {
  ...at,
  id: 'wave',
  type: 'button',
  w: 10,
  h: 10,
  kind: 'enum',
  def: 'saw',
  options: [
    { v: 'saw', label: 'Saw' },
    { v: 'odd', label: 'Hidden', hide: true },
    { v: 'tri', label: 'Triangle' },
    { v: 'sq', label: 'Square' },
  ],
};
const SYNC: Control = { ...at, id: 'sync', type: 'button', w: 10, h: 10, kind: 'bool', def: false };

const DEF = {
  id: 'test',
  controls: [LEVEL, CUTOFF, WAVE, SYNC, TEMPO],
  tempo: 'tempo',
  init: { level: 2, cutoff: 1000, wave: 'saw', sync: false, tempo: 120 },
} as unknown as SynthDef;

describe('ccValue', () => {
  it('maps a linear knob straight across its travel, held inside it', () => {
    expect([0, 2.5, 5, 10].map((v) => ccValue(LEVEL, v))).toEqual([0, 32, 64, 127]);
    expect(ccValue(LEVEL, 25)).toBe(127);
    expect(ccValue(LEVEL, -3)).toBe(0);
  });

  it('maps a log knob by ratio, as its lane draws it', () => {
    // 20..20,000 is three decades: 200 is a third of the way, 2,000 two thirds, ~632 the middle.
    expect([20, 200, 2000, 20000].map((v) => ccValue(CUTOFF, v))).toEqual([0, 42, 85, 127]);
    expect(ccValue(CUTOFF, Math.sqrt(20 * 20000))).toBe(64);
    // Linear across the range, 200 would be 1.
    expect(ccValue(CUTOFF, 200)).not.toBe(1);
  });

  it('maps a choice by its place among the options the panel shows', () => {
    expect(['saw', 'tri', 'sq'].map((v) => ccValue(WAVE, v))).toEqual([0, 64, 127]);
  });

  it('maps a switch to 0 or 127', () => {
    expect([ccValue(SYNC, false), ccValue(SYNC, true)]).toEqual([0, 127]);
  });

  it('sends 0, not NaN, for a knob with no travel', () => {
    expect(ccValue({ ...LEVEL, min: 5, max: 5, def: 5 }, 5)).toBe(0);
  });
});

describe('validLaneCc', () => {
  it('takes 1 to 119, and none of the channel-mode messages above', () => {
    expect([1, 74, MAX_LANE_CC].every(validLaneCc)).toBe(true);
    expect([120, 123, 127, -1, 1.5, '74', null].some(validLaneCc)).toBe(false);
  });

  it('takes no Bank Select, Data Entry or (N)RPN CC, which would rewrite something other than a sound', () => {
    expect([0, 32, 6, 38, 96, 97, 98, 99, 100, 101].some(validLaneCc)).toBe(false);
    expect(LANE_CCS).toHaveLength(110);
    expect(LANE_CCS.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 7]);
  });
});

describe('ccLookup', () => {
  it('sends each lane with a CC as that CC, and a lane without one nothing', () => {
    const look = ccLookup(DEF, { cutoff: 74, sync: 80 })!;
    expect(look({ cutoff: 200, level: 5, sync: true })).toEqual([
      [74, 42],
      [80, 127],
    ]);
    // A set without a lane's value sends nothing for it.
    expect(look({ level: 5 })).toEqual([]);
  });

  it('is nothing when no lane has a CC this synth can send', () => {
    expect(ccLookup(DEF, {})).toBeNull();
    // A control this synth has not got, its tempo knob (the pattern's tempo), and a channel-mode CC.
    expect(ccLookup(DEF, { gone: 74, tempo: 75, level: 123 })).toBeNull();
  });
});

describe('ccLookup: a performance wheel (`f-performance-wheels` t-307)', () => {
  const modelD = getSynthDef('model-d')!;
  // The mod wheel's lane only, the pitch wheel at rest with no lane of its own.
  const hand = (wheel: number, on = true) => ({
    on: (id: string) => on && id === '@wheel',
    at: (id: string) => (id === '@wheel' ? wheel : 0),
  });

  it('sends a wheel lane as the CC the synth declares, with nothing assigned', () => {
    const look = ccLookup(modelD, {}, hand(0))!;
    expect(look({ '@wheel': 1 })).toEqual([[1, 127]]);
    expect(look({ '@wheel': 0.5 })).toEqual([[1, 64]]);
  });

  it('sends the hand’s wheel on a step the lane leaves alone, and goes back to it when the run ends', () => {
    const look = ccLookup(modelD, {}, hand(0.5))!;
    expect(look({})).toEqual([[1, 64]]);
    expect(look.rest?.()).toEqual([
      [1, 64],
      [PITCH_BEND, BEND_CENTRE],
    ]);
  });

  it('sends no wheel while the pattern has no wheel lane, and keeps its CC off other lanes even so', () => {
    expect(ccLookup(modelD, {})).toBeNull();
    // Read as each change goes: the lane taken off sends no wheel, but the run's end still puts it back.
    const off = ccLookup(modelD, {}, hand(0.5, false))!;
    expect(off({ '@wheel': 1 })).toEqual([]);
    expect(off.rest?.()).toContainEqual([1, 64]);
    expect(ccLookup(modelD, { 'filter.cutoff': 1 })).toBeNull();
    expect(ccLookup(modelD, { 'filter.cutoff': 74 })?.rest).toBeUndefined();
  });

  it('keeps the wheel’s CC for the wheel: another lane given it is not sent on it too', () => {
    const look = ccLookup(modelD, { 'filter.cutoff': 1, '@wheel': 20 }, hand(0))!;
    expect(look({ '@wheel': 0, 'filter.cutoff': 10 })).toEqual([[1, 0]]);
  });

  it('sends nothing for a wheel on a synth that declares none', () => {
    expect(ccLookup(DEF, { '@wheel': 1 })).toBeNull();
  });
});

describe('pitch bend (`f-performance-wheels` t-309)', () => {
  const modelD = getSynthDef('model-d')!;
  const hand = (bend: number, on = true) => ({
    on: (id: string) => on && id === '@bend',
    at: (id: string) => (id === '@bend' ? bend : 0),
  });

  it('turns the wheel’s position into 14 bits: 0 all the way down, 8192 at rest, 16383 all the way up', () => {
    expect(bendValue(-1)).toBe(0);
    expect(bendValue(0)).toBe(8192);
    expect(bendValue(1)).toBe(16383);
    expect(bendValue(0.5)).toBe(12288);
    expect(bendValue(-0.5)).toBe(4096);
    // Past either end it stops there; not a number is at rest.
    expect(bendValue(3)).toBe(16383);
    expect(bendValue(-3)).toBe(0);
    expect(bendValue('up')).toBe(8192);
  });

  it('reads a pitch-bend message’s two bytes, least significant first, back into -1..1', () => {
    expect(bendFromMidi(0x00, 0x40)).toBe(0); // 8192
    expect(bendFromMidi(0x7f, 0x7f)).toBe(1); // 16383
    expect(bendFromMidi(0x00, 0x00)).toBe(-1); // 0
    expect(bendFromMidi(0x00, 0x60)).toBeCloseTo(0.5, 3); // 12288
    expect(bendFromMidi(0x00, 0x20)).toBe(-0.5); // 4096
    // The LSB counts: one step above the centre is just above it.
    expect(bendFromMidi(0x01, 0x40)).toBeGreaterThan(0);
    // A status bit leaking into a data byte is not read.
    expect(bendFromMidi(0x80, 0xc0)).toBe(0);
  });

  it('round-trips: what is sent is what a synth reading it hears', () => {
    for (const v of [-1, -0.25, 0, 0.3, 1]) {
      const b = bendValue(v);
      expect(bendFromMidi(b & 0x7f, b >> 7)).toBeCloseTo(v, 3);
    }
  });

  it('sends pitch bend as a pitch-bend message on the channel, and a CC as a Control Change', () => {
    expect(ccMessage(2, PITCH_BEND, 12288)).toEqual([0xe2, 0x00, 0x60]);
    expect(ccMessage(0, PITCH_BEND, 16383)).toEqual([0xe0, 0x7f, 0x7f]);
    expect(ccMessage(2, 74, 100)).toEqual([0xb2, 74, 100]);
  });

  it('sends a bend lane as pitch bend, and a step it leaves alone as where the hand has the wheel', () => {
    const look = ccLookup(modelD, {}, hand(-0.5))!;
    expect(look({ '@bend': 1 })).toEqual([[PITCH_BEND, 16383]]);
    expect(look({})).toEqual([[PITCH_BEND, 4096]]);
    expect(look.rest?.()).toContainEqual([PITCH_BEND, 4096]);
  });

  it('sends no bend while the pattern has no bend lane, nor on a synth without a pitch wheel', () => {
    expect(ccLookup(modelD, {}, hand(0, false))!({ '@bend': 1 })).toEqual([]);
    expect(ccLookup(DEF, { '@bend': 1 }, hand(0))).toBeNull();
  });
});

describe('createEchoLog (t-310)', () => {
  it('takes a mod wheel or pitch bend sent lately, on any channel, as its echo coming back', () => {
    const log = createEchoLog();
    log.sent([0xb3, 1, 76], 1100, 1000);
    log.sent(ccMessage(0, PITCH_BEND, bendValue(-0.5)), 1000, 1000);
    // in before it is due (the look-ahead) and until the window after it runs out
    expect(log.echoed('wheel', 76 / 127, 1001)).toBe(true);
    expect(log.echoed('wheel', 76 / 127, 1100 + ECHO_WINDOW_MS)).toBe(true);
    expect(log.echoed('wheel', 76 / 127, 1101 + ECHO_WINDOW_MS)).toBe(false);
    expect(log.echoed('bend', -0.5, 1200)).toBe(true);
  });

  it('takes anything else as the hand: another value, another CC, its centre unsent', () => {
    const log = createEchoLog();
    log.sent([0xb0, 1, 64], 1000, 1000);
    log.sent([0xb0, 74, 65], 1000, 1000);
    log.sent([0x90, 60, 100], 1000, 1000);
    // a CC cut short is not the wheel at 0
    log.sent([0xb0, 1], 1000, 1000);
    expect(log.echoed('wheel', 0, 1010)).toBe(false);
    expect(log.echoed('wheel', 65 / 127, 1010)).toBe(false);
    expect(log.echoed('bend', 0, 1010)).toBe(false);
    expect(log.echoed('wheel', 64 / 127, 1010)).toBe(true);
  });
});
