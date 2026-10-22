/**
 * Mod lanes (`f-step-sequencer` t-82): the pattern's shape for them, where `compileLoop` says their values change,
 * how a synth reads them (`lanes.ts`), and the edits that add, move and clear them (`tools.ts`).
 *
 * @see lib/app/sequencer/lanes.ts
 */

import { describe, it, expect, vi } from 'vitest';

import { compileLoop, seededRng, stepMods } from '@/lib/app/sequencer/compile';
import {
  laneControl,
  laneControls,
  lanePos,
  laneValue,
  laneValueAt,
  resolveMods,
  stepOverrides,
} from '@/lib/app/sequencer/lanes';
import {
  MAX_LANES,
  PatternSchema,
  newPattern,
  type Pattern,
  type Step,
} from '@/lib/app/sequencer/pattern';
import {
  addLane,
  keepMods,
  removeLane,
  retargetLane,
  reverseSteps,
  rotateSteps,
  setLaneStep,
} from '@/lib/app/sequencer/tools';
import type { Control, SynthDef } from '@/lib/app/synths/contract';

const at = { x: 0, y: 0, module: 'filter' as const, help: '' };
const CUTOFF: Control = {
  ...at,
  id: 'cutoff',
  type: 'knob',
  r: 10,
  style: 'pro1',
  kind: 'cont',
  min: 20,
  max: 20000,
  def: 1000,
  taper: 'log',
};
const RES: Control = {
  ...at,
  id: 'res',
  type: 'knob',
  r: 10,
  style: 'pro1',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 2,
  step: 1,
};
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
    { v: 'sq', label: 'Square' },
    { v: 'odd', label: 'Hidden', hide: true },
  ],
};
const ACCENT: Control = {
  ...at,
  id: 'acc',
  type: 'button',
  w: 10,
  h: 10,
  kind: 'bool',
  def: false,
};
const TEMPO: Control = {
  ...at,
  id: 'tempo',
  type: 'knob',
  r: 10,
  style: 'pro1',
  kind: 'cont',
  min: 40,
  max: 300,
  def: 120,
};

/** The parts of a synth the lanes read: its controls and which one is its tempo. */
const DEF = {
  id: 'test',
  controls: [CUTOFF, RES, WAVE, ACCENT, TEMPO],
  tempo: 'tempo',
  init: { cutoff: 1000, res: 2, wave: 'saw', acc: false, tempo: 120 },
} as unknown as SynthDef;

/** Four sixteenths with a lane on cutoff: values on steps 0 and 2, nothing on 1 and 3. */
function laned(): Pattern {
  const p = newPattern(4);
  p.lanes = ['cutoff'];
  p.parts[0].steps[0] = { on: true, notes: [{ note: 48, gate: 1 }], mod: { cutoff: 500 } };
  p.parts[0].steps[2] = { on: true, notes: [], mod: { cutoff: 4000 } };
  return p;
}

describe('the pattern shape', () => {
  it('takes lanes and the values steps set for them, and a pattern without lanes as before', () => {
    expect(PatternSchema.safeParse(laned()).success).toBe(true);
    expect(PatternSchema.safeParse(newPattern(16)).success).toBe(true);
  });

  it('refuses a step value for a control the pattern has no lane for', () => {
    const p = laned();
    p.parts[0].steps[1] = { on: true, notes: [], mod: { res: 3 } };
    const r = PatternSchema.safeParse(p);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(['parts', 0, 'steps', 1, 'mod', 'res']);
  });

  it('refuses two lanes for one control, too many lanes, and an id that is not a control id', () => {
    expect(PatternSchema.safeParse({ ...laned(), lanes: ['cutoff', 'cutoff'] }).success).toBe(
      false
    );
    const many = Array.from({ length: MAX_LANES + 1 }, (_, i) => `c${i}`);
    expect(PatternSchema.safeParse({ ...newPattern(4), lanes: many }).success).toBe(false);
    expect(PatternSchema.safeParse({ ...newPattern(4), lanes: ['no spaces'] }).success).toBe(false);
  });

  it('keeps a lane for a control no synth here has, and its values, through a save and a read', () => {
    const p = laned();
    p.lanes = ['cutoff', 'notOnAnySynth'];
    p.parts[0].steps[1] = { on: true, notes: [], mod: { notOnAnySynth: 7 } };
    const read = PatternSchema.parse(JSON.parse(JSON.stringify(p)));
    expect(read).toEqual(p);
  });
});

describe('compileLoop and the lanes', () => {
  it('says where the values change, with the first slot always and an empty step as null', () => {
    const c = compileLoop(laned(), { loop: 0, rng: seededRng(1) });
    expect(c.mods).toEqual([
      [0, { cutoff: 500 }],
      [0.25, null],
      [0.5, { cutoff: 4000 }],
      [0.75, null],
    ]);
  });

  it('gives no changes for a pattern without lanes, and leaves out values for no lane', () => {
    expect(compileLoop(newPattern(4), { loop: 0, rng: seededRng(1) }).mods).toEqual([]);
    const s: Step = { on: true, notes: [], mod: { cutoff: 1 } };
    expect(stepMods(s, [])).toBeNull();
  });

  it('does not repeat a value two steps share', () => {
    const p = laned();
    p.parts[0].steps[1] = { on: true, notes: [], mod: { cutoff: 500 } };
    const c = compileLoop(p, { loop: 0, rng: seededRng(1) });
    expect(c.mods.map(([b]) => b)).toEqual([0, 0.5, 0.75]);
  });

  it('moves on every slot, played or not: a muted step, a rest, a step that lost its chance', () => {
    const p = laned();
    p.parts[0].steps[0] = { ...p.parts[0].steps[0], on: false };
    p.parts[0].steps[2] = {
      on: true,
      notes: [{ note: 50, gate: 1 }],
      probability: 0,
      mod: { cutoff: 4000 },
    };
    const c = compileLoop(p, { loop: 0, rng: seededRng(1) });
    expect(c.notes).toEqual([]);
    expect(c.mods.filter(([, s]) => s)).toEqual([
      [0, { cutoff: 500 }],
      [0.5, { cutoff: 4000 }],
    ]);
  });

  it('draws nothing from rng, so a pattern with lanes plays the same draws as one without', () => {
    const p = laned();
    const rng = vi.fn(seededRng(5));
    compileLoop(p, { loop: 0, rng });
    expect(rng).not.toHaveBeenCalled();
  });

  it('follows the step order and the swing, and the part the chain plays', () => {
    const p = { ...laned(), direction: 'reverse' as const, swing: 75 };
    const c = compileLoop(p, { loop: 0, rng: seededRng(1) });
    // Reverse: slot 0 is step 3 (nothing), slot 1 step 2 (4000) swung half a step late, slot 3 step 0 (500), swung
    expect(c.mods).toEqual([
      [0, null],
      [0.375, { cutoff: 4000 }],
      [0.5, null],
      [0.875, { cutoff: 500 }],
    ]);
    const ab = laned();
    ab.parts.push({ steps: newPattern(4).parts[0].steps });
    ab.chain = [0, 1];
    expect(compileLoop(ab, { loop: 1, rng: seededRng(1) }).mods).toEqual([[0, null]]);
  });

  it('reads only a step’s own values: a lane named after an object member finds nothing', () => {
    const s: Step = { on: true, notes: [], mod: {} };
    expect(stepMods(s, ['constructor', 'toString'])).toBeNull();
  });
});

describe('a synth reading the lanes', () => {
  it('finds a lane’s control, but not the tempo knob or a control it does not have', () => {
    expect(laneControl(DEF, 'cutoff')).toBe(CUTOFF);
    expect(laneControl(DEF, 'tempo')).toBeNull();
    expect(laneControl(DEF, 'nope')).toBeNull();
    expect(laneControl(DEF, 'constructor')).toBeNull();
    expect(laneControls(DEF).map((c) => c.id)).toEqual(['cutoff', 'res', 'wave', 'acc']);
  });

  it('keeps a number inside the travel, and ignores what the control cannot take', () => {
    expect(laneValue(CUTOFF, 50000)).toBe(20000);
    expect(laneValue(CUTOFF, 5)).toBe(20);
    expect(laneValue(CUTOFF, 'saw')).toBeNull();
    expect(laneValue(WAVE, 'sq')).toBe('sq');
    expect(laneValue(WAVE, 'tri')).toBeNull();
    expect(laneValue(WAVE, 3)).toBeNull();
    expect(laneValue(ACCENT, true)).toBe(true);
    expect(laneValue(ACCENT, 1)).toBeNull();
  });

  it('gives no changes at all for lanes this synth has no control for, so nothing is sent', () => {
    const p = laned();
    p.lanes = ['nope'];
    p.parts[0].steps[0].mod = { nope: 3 };
    p.parts[0].steps[2].mod = { nope: 9 };
    const c = compileLoop(p, { loop: 0, rng: seededRng(1) });
    expect(c.mods.length).toBeGreaterThan(0);
    expect(resolveMods(DEF, c.mods)).toEqual([]);
  });

  it('plays the lanes it has, drops a change a dropped lane made, and clamps', () => {
    const resolved = resolveMods(DEF, [
      [0, { cutoff: 50000, nope: 1 }],
      [0.25, { cutoff: 50000, nope: 2 }],
      [0.5, { wave: 'tri' }],
      [0.75, { wave: 'sq' }],
    ]);
    expect(resolved).toEqual([
      [0, { cutoff: 20000 }],
      [0.5, null],
      [0.75, { wave: 'sq' }],
    ]);
  });

  it('shows the panel a step’s values as the synth plays them', () => {
    expect(stepOverrides(DEF, { cutoff: 1e6, nope: 1 }, ['cutoff', 'nope'])).toEqual({
      cutoff: 20000,
    });
    expect(stepOverrides(DEF, { nope: 1 }, ['nope'])).toBeNull();
    expect(stepOverrides(DEF, undefined, ['cutoff'])).toBeNull();
  });

  it('draws a value at its height on the travel, and reads it back', () => {
    // Log taper: the middle of 20..20,000 by ratio is about 632
    expect(laneValueAt(CUTOFF, 0.5)).toBeCloseTo(632.456, 2);
    expect(lanePos(CUTOFF, laneValueAt(CUTOFF, 0.3))).toBeCloseTo(0.3, 3);
    expect(laneValueAt(RES, 0.47)).toBe(5);
    // A choice: the options the panel draws, a hidden one left out
    expect(laneValueAt(WAVE, 0)).toBe('saw');
    expect(laneValueAt(WAVE, 1)).toBe('sq');
    expect(lanePos(WAVE, 'sq')).toBe(1);
    expect(laneValueAt(ACCENT, 0.6)).toBe(true);
    expect(laneValueAt(ACCENT, 0.4)).toBe(false);
  });
});

describe('editing lanes', () => {
  it('adds a lane once, and no more than the most', () => {
    const p = addLane(newPattern(4), 'cutoff');
    expect(p.lanes).toEqual(['cutoff']);
    expect(addLane(p, 'cutoff')).toBe(p);
    let full = newPattern(4);
    for (let i = 0; i < MAX_LANES; i++) full = addLane(full, `c${i}`);
    expect(addLane(full, 'more')).toBe(full);
  });

  it('sets and clears a step’s value, leaving a step with none without `mod`', () => {
    const p = setLaneStep(addLane(newPattern(4), 'cutoff'), 0, 1, 'cutoff', 800);
    expect(p.parts[0].steps[1].mod).toEqual({ cutoff: 800 });
    const cleared = setLaneStep(p, 0, 1, 'cutoff', null);
    expect(cleared.parts[0].steps[1]).toEqual({ on: true, notes: [] });
    expect(PatternSchema.safeParse(cleared).success).toBe(true);
    // A control with no lane is not set
    expect(setLaneStep(p, 0, 1, 'res', 3)).toBe(p);
  });

  it('removes a lane and its values from every part, and the field with the last lane', () => {
    const p = laned();
    p.lanes = ['cutoff', 'res'];
    p.parts[0].steps[0].mod = { cutoff: 500, res: 4 };
    p.parts.push(structuredClone(p.parts[0]));
    p.chain = [0, 1];
    const one = removeLane(p, 'cutoff');
    expect(one.lanes).toEqual(['res']);
    expect(one.parts.map((pt) => pt.steps[0].mod)).toEqual([{ res: 4 }, { res: 4 }]);
    expect(one.parts[0].steps[2].mod).toBeUndefined();
    expect(PatternSchema.safeParse(one).success).toBe(true);
    const none = removeLane(one, 'res');
    expect('lanes' in none).toBe(false);
    expect(none.parts[0].steps.every((s) => !('mod' in s))).toBe(true);
  });

  it('moves a lane to another control in its place, without the old values', () => {
    const p = { ...laned(), lanes: ['cutoff', 'wave'] };
    const moved = retargetLane(p, 'cutoff', 'res');
    expect(moved.lanes).toEqual(['res', 'wave']);
    expect(moved.parts[0].steps[0].mod).toBeUndefined();
    expect(retargetLane(p, 'cutoff', 'wave')).toBe(p);
  });

  it('carries the values with their steps through rotate and reverse, and through Randomise', () => {
    const steps = laned().parts[0].steps;
    expect(rotateSteps(steps, 1)[1].mod).toEqual({ cutoff: 500 });
    expect(reverseSteps(steps)[1].mod).toEqual({ cutoff: 4000 });
    const fresh: Step[] = steps.map(() => ({ on: true, notes: [] }));
    const kept = keepMods(steps, fresh);
    expect(kept.map((s) => s.mod)).toEqual([
      { cutoff: 500 },
      undefined,
      { cutoff: 4000 },
      undefined,
    ]);
    expect(kept[0].mod).not.toBe(steps[0].mod);
  });
});
