/**
 * Performance wheels as mod lanes (`f-performance-wheels` t-307): what a synth declares, the lane it then offers, how a
 * lane's set reaches the voice, and the pattern shape that carries one.
 *
 * @see lib/app/synths/lib/performance.ts
 */

import { describe, it, expect } from 'vitest';

import {
  BEND,
  PITCH_BEND,
  isPerformanceId,
  shownBend,
  performanceControl,
  performanceInputs,
  shownWheel,
  splitPerformance,
} from '@/lib/app/synths/lib/performance';
import { laneControl, laneControls, resolveMods, stepOverrides } from '@/lib/app/sequencer/lanes';
import { PatternSchema, newPattern } from '@/lib/app/sequencer/pattern';
import { handProblems } from '@/lib/app/sequencer/hands';
import { getSynthDef, SYNTH_DEFS } from '@/lib/app/synths/defs';
import { getSynthRouting } from '@/lib/app/synths/routing';
import { WHEEL } from '@/lib/app/synths/lib/patch';
import type { RoutingLevel, SynthDef } from '@/lib/app/synths/contract';

const modelD = getSynthDef('model-d')!;
/** The Model D with its wheel undeclared: a synth with no wheel of its own. */
const noWheel: SynthDef = { ...modelD, performance: undefined };

describe('performanceInputs', () => {
  it('gives the Model D its mod wheel, sent as CC 1, then its pitch wheel, sent as pitch bend', () => {
    const [wheel, bend, ...rest] = performanceInputs(modelD);
    expect(rest).toEqual([]);
    expect(bend).toMatchObject({ key: 'bend', id: BEND, cc: PITCH_BEND });
    expect(bend.control).toMatchObject({ id: BEND, kind: 'cont', min: -1, max: 1, def: 0 });
    expect(wheel).toMatchObject({ key: 'wheel', id: WHEEL, cc: 1 });
    expect(wheel.control).toMatchObject({ id: WHEEL, kind: 'cont', min: 0, max: 1, def: 0 });
  });

  it('gives a synth that declares no wheel nothing', () => {
    expect(performanceInputs(noWheel)).toEqual([]);
    expect(performanceControl(noWheel, WHEEL)).toBeNull();
  });

  it('is the same array each time for the same definition', () => {
    expect(performanceInputs(modelD)).toBe(performanceInputs(modelD));
  });
});

describe('the wheel as a lane', () => {
  it('is offered first, before the panel controls, and only where it is declared', () => {
    expect(laneControls(modelD)[0].id).toBe(WHEEL);
    expect(laneControl(modelD, WHEEL)?.id).toBe(WHEEL);
    expect(laneControls(noWheel).some((c) => c.id === WHEEL)).toBe(false);
    expect(laneControl(noWheel, WHEEL)).toBeNull();
  });

  it('is never a panel control: no definition has a control with a reserved id', () => {
    for (const def of SYNTH_DEFS)
      expect(def.controls.filter((c) => isPerformanceId(c.id))).toEqual([]);
  });

  it('plays where the synth has a wheel, and is kept and silent where it has not', () => {
    const mods: [number, Record<string, number> | null][] = [
      [0, { [WHEEL]: 0.2 }],
      [1, { [WHEEL]: 2 }],
    ];
    // Kept inside the wheel's travel, as a knob's lane is.
    expect(resolveMods(modelD, mods)).toEqual([
      [0, { [WHEEL]: 0.2 }],
      [1, { [WHEEL]: 1 }],
    ]);
    expect(resolveMods(noWheel, mods)).toEqual([]);
    expect(stepOverrides(modelD, { [WHEEL]: 0.5 }, [WHEEL])).toEqual({ [WHEEL]: 0.5 });
    expect(stepOverrides(noWheel, { [WHEEL]: 0.5 }, [WHEEL])).toBeNull();
  });

  it('is held to the hand limits, as a knob is', () => {
    const p = newPattern();
    p.lanes = [WHEEL];
    // Down and all the way up on every step: no hand turns a wheel back on itself eight times a second.
    p.parts[0].steps = p.parts[0].steps.map((s, i) => ({ ...s, mod: { [WHEEL]: i % 2 } }));
    expect(handProblems(modelD, p, modelD.init).join('\n')).toMatch(/@wheel/);
  });
});

describe('splitPerformance', () => {
  it('takes the wheel out of the panel values and gives it to the voice', () => {
    expect(splitPerformance(modelD, { 'filter.cutoff': 4, [WHEEL]: 0.6 })).toEqual({
      values: { 'filter.cutoff': 4 },
      wheel: 0.6,
    });
    expect(splitPerformance(modelD, { [WHEEL]: 1.5 }).wheel).toBe(1);
  });

  it('leaves a set with no wheel as it is', () => {
    const set = { 'filter.cutoff': 4 };
    expect(splitPerformance(modelD, set)).toEqual({ values: set });
  });

  it('drops a wheel the synth has not got from both', () => {
    expect(splitPerformance(noWheel, { 'filter.cutoff': 4, [WHEEL]: 0.6 })).toEqual({
      values: { 'filter.cutoff': 4 },
    });
  });

  it('reads the wheel a lane shows, and nothing from a set without one', () => {
    expect(shownWheel({ [WHEEL]: 0.3 })).toBe(0.3);
    expect(shownWheel({ 'filter.cutoff': 3 })).toBeUndefined();
    expect(shownWheel(null)).toBeUndefined();
  });
});

describe('the Model D hears a lane’s wheel natively', () => {
  it('adds it to MOD DEPTH: with the knob at 0, the wheel alone sends the mod bus to the filter', () => {
    const values = { ...modelD.init, 'mod.depth': 0, 'mod.toFilter': true, 'mod.toOsc': false };
    const { values: panel, wheel } = splitPerformance(modelD, { ...values, [WHEEL]: 0.5 });
    const still = modelD.toEngine(panel, { wheel: 0, patched: {} });
    const pushed = modelD.toEngine(panel, { wheel: wheel!, patched: {} });
    expect(still.routes ?? []).toEqual([]);
    expect((pushed.routes ?? []).map((r) => r.dst)).toContain('cutoff');
  });
});

describe('the pattern carries a wheel lane', () => {
  it('accepts the reserved id as a lane and a step value, and still refuses a malformed one', () => {
    const p = newPattern();
    p.lanes = [WHEEL, 'filter.cutoff'];
    p.parts[0].steps[0] = { ...p.parts[0].steps[0], mod: { [WHEEL]: 0.4 } };
    expect(PatternSchema.safeParse(p).success).toBe(true);
    expect(PatternSchema.safeParse({ ...p, lanes: ['@Wheel'] }).success).toBe(false);
    expect(PatternSchema.safeParse({ ...p, lanes: ['@'] }).success).toBe(false);
  });
});

/** Whether a routing level reads the mod wheel, inside a sum or not. */
const readsWheel = (l: RoutingLevel): boolean =>
  typeof l === 'string' ? l === WHEEL : 'sum' in l ? l.sum.some(readsWheel) : l.id === WHEEL;

describe('the roll-out', () => {
  it('declares a wheel only on a synth whose routing carries one', () => {
    for (const def of SYNTH_DEFS.filter((d) => d.performance?.wheel)) {
      const routing = getSynthRouting(def);
      expect(
        routing?.edges.some((e) => (e.levels ?? []).some(readsWheel)),
        `${def.id} declares a wheel its routing does not carry`
      ).toBe(true);
    }
  });
});

describe('the pitch wheel (`f-performance-wheels` t-309)', () => {
  const range = modelD.performance?.bend?.range ?? 0;
  /** Oscillator 1's semitones on the Model D at `bend`, with OSC 3 on or off the keyboard. */
  const semi = (bend: number | undefined, kbd3 = true) =>
    modelD.toEngine({ ...modelD.init, 'osc3.kbd': kbd3 }, { wheel: 0, bend, patched: {} }).osc;

  it('is declared on the Model D with its range in semitones', () => {
    expect(range).toBeGreaterThan(0);
    expect(Number.isInteger(range)).toBe(true);
  });

  it('bends every oscillator on the keyboard by its range, all the way up or down, where TUNE does', () => {
    const rest = semi(0);
    const up = semi(1);
    const down = semi(-1);
    const half = semi(0.5);
    rest.forEach((o, i) => {
      expect(up[i].semi - o.semi).toBeCloseTo(range);
      expect(down[i].semi - o.semi).toBeCloseTo(-range);
      expect(half[i].semi - o.semi).toBeCloseTo(range / 2);
    });
    // TUNE and the wheel add: the wheel up with TUNE a semitone down is the range less one.
    const tuned = modelD.toEngine(
      { ...modelD.init, 'ctl.tune': -1 },
      { wheel: 0, bend: 1, patched: {} }
    ).osc;
    expect(tuned[0].semi - rest[0].semi).toBeCloseTo(range - 1);
  });

  it('springs back: at rest, or not given, the voice is as it was before there was a wheel', () => {
    expect(semi(undefined)).toEqual(semi(0));
    expect(semi(0).map((o) => o.semi)).toEqual(
      modelD.toEngine(modelD.init, { wheel: 0, patched: {} }).osc.map((o) => o.semi)
    );
  });

  it('leaves OSC 3 alone with its keyboard control off, as TUNE does', () => {
    expect(semi(1, false)[2].semi).toBe(semi(0, false)[2].semi);
    expect(semi(1, false)[0].semi).toBeCloseTo(semi(0, false)[0].semi + range);
  });

  it('stops at either end, past where a lane or a message could push it', () => {
    expect(semi(4)[0].semi).toBeCloseTo(semi(1)[0].semi);
    expect(semi(-4)[0].semi).toBeCloseTo(semi(-1)[0].semi);
  });

  it('is split out of a lane’s set for the voice, held to -1..1, and shown where the lane has it', () => {
    expect(splitPerformance(modelD, { 'filter.cutoff': 4, [BEND]: -0.4 })).toEqual({
      values: { 'filter.cutoff': 4 },
      bend: -0.4,
    });
    expect(splitPerformance(modelD, { [BEND]: -3 }).bend).toBe(-1);
    expect(splitPerformance(noWheel, { [BEND]: 0.5 })).toEqual({ values: {} });
    expect(shownBend({ [BEND]: 0.25 })).toBe(0.25);
    expect(shownBend({ [WHEEL]: 0.25 })).toBeUndefined();
  });

  it('is a lane, after the mod wheel, read in semitones', () => {
    expect(
      laneControls(modelD)
        .map((c) => c.id)
        .slice(0, 2)
    ).toEqual([WHEEL, BEND]);
    const c = laneControl(modelD, BEND);
    expect(c && 'fmt' in c ? c.fmt?.(0.5) : null).toBe(`+${range / 2} st`);
    expect(laneControl(noWheel, BEND)).toBeNull();
  });

  it('is carried by a pattern as a lane and a step value', () => {
    const p = newPattern();
    p.lanes = [BEND];
    p.parts[0].steps[0] = { ...p.parts[0].steps[0], mod: { [BEND]: -1 } };
    expect(PatternSchema.safeParse(p).success).toBe(true);
  });
});
