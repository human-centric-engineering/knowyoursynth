/**
 * Mod lanes as MIDI CCs (`f-midi-out` t-90): a lane's value across its control's travel as 0..127, and which lanes a
 * set of values sends.
 *
 * @see lib/app/midi/cc.ts
 */

import { describe, it, expect } from 'vitest';
import { LANE_CCS, MAX_LANE_CC, ccLookup, ccValue, validLaneCc } from '@/lib/app/midi/cc';
import type { Control, SynthDef } from '@/lib/app/synths/contract';

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
