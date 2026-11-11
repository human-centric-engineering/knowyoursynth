/**
 * Make Noise 0-COAST definition tests: the panel → engine mapping at init, for each switch and patched jack that
 * changes it, the default normals, and the maker's marks.
 *
 * The 0-COAST has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering
 * except its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a
 * slip shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/0-coast.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  ControlValues,
  EngineContext,
  EngineRoute,
  TextDecor,
} from '@/lib/app/synths/contract';
import zeroCoast from '@/lib/app/synths/defs/0-coast';

const run = (set: ControlValues = {}, patched: Record<string, boolean> = {}) =>
  zeroCoast.toEngine({ ...zeroCoast.init, ...set }, { wheel: 0, patched } satisfies EngineContext);
const route = (routes: EngineRoute[] | undefined, src: string, dst: string) =>
  (routes || []).find((r) => r.src === src && r.dst === dst);
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
/** `level10` worked out: (v / 10)^1.7 × max. */
const level = (v: number, max: number) => Math.pow(v / 10, 1.7) * max;

describe('0-COAST toEngine at the init patch', () => {
  const p = run();

  it('runs the triangle (FUND) and the overtone path (OVRTN) as two oscillators in step', () => {
    expect(p.osc).toHaveLength(2);
    expect(p.osc[0]).toEqual({ level: 1, mix: { tri: 0.8 }, pw: 0.5, semi: 0, syncTo: -1 });
    expect(p.osc[1]).toEqual({
      level: 0,
      mix: { ovt: 0.8 },
      pw: 0.5,
      semi: 0,
      syncTo: 0,
      ovt: 0,
      fold: 0,
    });
    expect(p.oscOuts).toBe(false);
    expect(p.noise.level).toBe(0);
    expect(p.ext.level).toBe(0);
  });

  it('crossfades BALANCE and opens DYNAMICS through the two attenuators', () => {
    expect(p.att).toEqual([0.8, 0.5]);
    expect(p.routes).toEqual([
      { src: 'att2', dst: 'lvl1', amt: -1 },
      { src: 'att2', dst: 'lvl2', amt: 1 },
      { src: 'att1', dst: 'amp', amt: 1 },
      { src: 'att1', dst: 'cutoff', amt: 9 },
    ]);
    expect(p.vca).toEqual({ envSrc: 'none', bias: 0 });
    expect(p.filter).toEqual({
      type: 'svf',
      mode: 'lp',
      cutoff: 50,
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    });
  });

  it('normals CONTOUR to DYNAMICS, the offset to BALANCE and Voltage MATH, and leaves SLOPE without a gate', () => {
    expect(p.normals).toEqual({
      att1In: 'env1',
      att2In: 'one',
      gate2: null,
      gateIn: 'gate',
      sum1B: ['one', 0],
      sum2A: ['sh', 0.5],
      sum2B: ['one', 0.5],
    });
    expect(p.trig).toEqual({ retrig: false, drone: false, repeat: false });
  });

  it('maps CONTOUR to Envelope 1, its DECAY also the release, linear at init', () => {
    expect(p.env1.a).toBeCloseTo(0.001, 10);
    expect(p.env1.d).toBeCloseTo(exp(0.4, 0.005, 12), 10);
    expect(p.env1.r).toBe(p.env1.d);
    expect(p.env1.s).toBe(0);
    expect(p.env1.curve).toEqual({ a: 0.5, d: 0.5, r: 0.5 });
  });

  it('maps SLOPE to a free Envelope 2 with no sustain, straight at its centre Vari-Response', () => {
    expect(p.env2.a).toBeCloseTo(exp(0.3, 0.0005, 12), 10);
    expect(p.env2.d).toBeCloseTo(exp(0.5, 0.0005, 12), 10);
    expect(p.env2.r).toBe(p.env2.d);
    expect(p.env2).toMatchObject({ s: 0, free: true, curve: { a: 0.5, d: 0.5, r: 0.5 } });
    expect(p.env2.loop).toBeUndefined();
  });

  it('runs the clock at 120 BPM, clocking the stepped random, and LEVEL as the volume', () => {
    expect(p.lfo).toEqual({ rate: 2, mix: { sq: 1 }, keySync: false });
    expect(p.sh).toEqual({ rate: 2, glide: 0, clock: 'lfo' });
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
    expect(p.glide.time).toBe(0);
  });
});

describe('0-COAST toEngine, control by control', () => {
  it('tunes both oscillators together by PITCH (±2 octaves) and FINE (±1 semitone)', () => {
    const p = run({ 'osc.pitch': 10, 'osc.fine': 0 });
    expect(p.osc[0].semi).toBeCloseTo(23, 10);
    expect(p.osc[1].semi).toBe(p.osc[0].semi);
  });

  it('moves OVERTONE from odd to even by 8.5, then blends SLOPE in up to 10', () => {
    expect(run({ 'overtone.amount': 4.25 }).osc[1].ovt).toBeCloseTo(0.5, 10);
    const even = run({ 'overtone.amount': 8.5 });
    expect(even.osc[1].ovt).toBe(1);
    expect(route(even.routes, 'env2', 'ovtIn')).toBeUndefined();
    const full = run({ 'overtone.amount': 10 });
    expect(full.osc[1].ovt).toBe(1);
    expect(route(full.routes, 'env2', 'ovtIn')?.amt).toBeCloseTo(1, 10);
    expect(route(run({ 'overtone.amount': 9.25 }).routes, 'env2', 'ovtIn')?.amt).toBeCloseTo(
      0.5,
      10
    );
  });

  it('folds by MULTIPLY, and normals SLOPE into its CV through the attenuverter either way', () => {
    expect(run({ 'multiply.amount': 6 }).osc[1].fold).toBeCloseTo(0.6, 10);
    expect(route(run({ 'multiply.cv': 2.5 }).routes, 'env2', 'pw2')?.amt).toBeCloseTo(0.5, 10);
    expect(route(run({ 'multiply.cv': -5 }).routes, 'env2', 'pw2')?.amt).toBeCloseTo(-1, 10);
    expect(
      route(run({ 'multiply.cv': 5 }, { 'j.multiply_cv': true }).routes, 'env2', 'pw2')
    ).toBeUndefined();
  });

  it('cycles SLOPE with CYCLE lit, gated by a constant', () => {
    const p = run({ 'slope.cycle': true });
    expect(p.env2.loop).toBe(true);
    expect(p.normals?.gate2).toBe('one');
    expect(p.trig.src).toBeUndefined();
  });

  it('fires SLOPE once per trigger with SLOPE TRIG patched, cycling or not', () => {
    for (const cycle of [false, true]) {
      const p = run({ 'slope.cycle': cycle }, { 'j.slope_trig': true });
      expect(p.env2.loop).toBeUndefined();
      expect(p.normals?.gate2).toBeNull();
      expect(p.trig).toEqual({ retrig: false, drone: false, repeat: false, src: ['gate', 'trig'] });
    }
  });

  it('bends both Vari-Responses: SLOPE log to expo, CONTOUR linear to expo', () => {
    expect(run({ 'slope.response': 0 }).env2.curve).toEqual({ a: 0, d: 1, r: 1 });
    expect(run({ 'slope.response': 10 }).env2.curve).toEqual({ a: 1, d: 0, r: 0 });
    expect(run({ 'contour.response': 10 }).env1.curve).toEqual({ a: 1, d: 0, r: 0 });
  });

  it('sets the CONTOUR sustain and the DYNAMICS and BALANCE gains from their knobs', () => {
    const p = run({ 'contour.sustain': 10, 'dynamics.amount': 3, 'balance.amount': 10 });
    expect(p.env1.s).toBe(1);
    expect(p.att).toEqual([0.3, 1]);
  });

  it('sets the Voltage MATH offset from the CH2 attenuverter', () => {
    expect(run({ 'vmath.ch2': -2.5 }).normals?.sum1B).toEqual(['one', -0.5]);
  });

  it('works out the separate wave outputs only while TRIANGLE or SQUARE is patched', () => {
    expect(run({}, { 'j.tri': true }).oscOuts).toBe(true);
    expect(run({}, { 'j.square': true }).oscOuts).toBe(true);
  });

  it('feeds FUND from BALANCE IN while it is patched, at the knob’s FUND share', () => {
    const p = run({ 'balance.amount': 2.5 }, { 'j.balance_in': true });
    expect(p.osc[0].level).toBe(0);
    expect(p.ext.level).toBeCloseTo(0.6, 10);
    expect(route(p.routes, 'att2', 'lvl1')).toBeUndefined();
    expect(route(p.routes, 'att2', 'lvl2')?.amt).toBe(1);
    // with BALANCE CV patched too, the knob is the CV's depth and FUND stays at full
    expect(run({}, { 'j.balance_in': true, 'j.balance_cv': true }).ext.level).toBeCloseTo(0.8, 10);
  });
});

describe('0-COAST jacks and panel', () => {
  const jack = (id: string) => {
    const j = zeroCoast.jacks.find((x) => x.id === id);
    if (!j) throw new Error(`no jack ${id}`);
    return j;
  };
  const amt = (id: string, set: ControlValues) => {
    const j = jack(id);
    if (j.dir !== 'in' || typeof j.amt !== 'function') throw new Error(`${id} has no depth`);
    return j.amt({ ...zeroCoast.init, ...set });
  };

  it('scales each attenuated input by its knob', () => {
    expect(amt('j.overtone_cv', { 'overtone.cv': 10 })).toBeCloseTo(0.5, 10);
    expect(amt('j.multiply_cv', { 'multiply.cv': -5 })).toBeCloseTo(-1, 10);
    expect(amt('j.linfm', { 'osc.linfm': 5 })).toBeCloseTo(12, 10);
    expect(amt('j.vmath_ch2', { 'vmath.ch2': 5 })).toBeCloseTo(1, 10);
  });

  it('breaks the normals the spec prints and sums the rest', () => {
    const dest = (id: string) => {
      const j = jack(id);
      return j.dir === 'in' ? [j.dest, !!j.add] : null;
    };
    expect(dest('j.dynamics_cv')).toEqual(['att1In', false]);
    expect(dest('j.balance_cv')).toEqual(['att2In', false]);
    expect(dest('j.contour_gate')).toEqual(['gate1', false]);
    expect(dest('j.voct')).toEqual(['pitchAll', true]);
    expect(dest('j.slope_time')).toEqual(['env2Rate', true]);
    expect(dest('j.decay_cv')).toEqual(['env1DecRate', true]);
  });

  it('tags the MAKE NOISE wordmark and the 0-COAST name as the maker’s marks, and nothing else', () => {
    const marks = zeroCoast.decor.filter((d) => d.brand);
    expect(marks.map((d) => (d as TextDecor).text)).toEqual(['MAKE NOISE', '0-COAST']);
  });

  it('draws the program buttons as panel-only controls the engine ignores', () => {
    const ui = zeroCoast.controls.filter((c) => c.ui).map((c) => c.id);
    expect(ui).toEqual(['midi.pgmA', 'midi.pgmB']);
    expect(run({ 'midi.pgmA': true, 'midi.pgmB': true })).toEqual(run());
  });
});
