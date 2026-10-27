/**
 * Pearl Syncussion SY-1 definition tests: the panel → engine mapping (the voice in `syncussion-kit.ts`, which the
 * Behringer shares), the readouts, the maker's marks and the areas.
 *
 * The Syncussion has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering
 * except its own goldens. These tests pin each mapping with values worked by hand from the kit's ranges, so a slip
 * shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/pearl-syncussion.ts
 * @see lib/app/synths/defs/syncussion-kit.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  EngineRoute,
  TextDecor,
} from '@/lib/app/synths/contract';
import pearl from '@/lib/app/synths/defs/pearl-syncussion';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}) => pearl.toEngine({ ...pearl.init, ...set }, CTX);
/** Channel 2's voice. */
const run2 = (set: ControlValues = {}) => {
  const b = run(set).dual?.b;
  if (!b) throw new Error('no second channel');
  return b;
};

const control = (id: string): Control => {
  const c = pearl.controls.find((x) => x.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};
const readout = (id: string, v: number): string => {
  const c = control(id);
  if (c.kind !== 'cont' || !c.fmt) throw new Error(`${id} has no continuous readout`);
  return c.fmt(v);
};
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
/** `level10` worked out: (v / 10)^1.7 × max. */
const level = (v: number, max: number) => Math.pow(v / 10, 1.7) * max;
/** MIDI note → Hz. */
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const OSC2 = 12 * Math.log2(450 / 440);
const to = (routes: EngineRoute[] | undefined, src: string) =>
  (routes ?? []).filter((r) => r.src === src).map((r) => [r.dst, r.amt]);

describe('Pearl Syncussion toEngine at the init patch', () => {
  const p = run();

  it('plays the two channels as two voices split at middle C, mixed by OUTPUT', () => {
    expect(p.dual).toMatchObject({ assign: 'split', split: 60, pan: [0, 0] });
    expect(p.dual?.level[0]).toBeCloseTo(level(8, 1.6), 10);
    expect(p.dual?.level[1]).toBeCloseTo(level(8, 1.6), 10);
    expect(p.volume).toBe(0.8);
  });

  it('sounds oscillator 1 alone (mode A) at the TUNE pitch, with oscillator 2 a 440:450 step above', () => {
    // TUNE 3 is note 28 + 21.6; SWEEP DOWN at RANGE 4 leaves both oscillators 14.4 semitones below it
    const note = 28 + 7.2 * 3;
    const range = -0.4 * 36;
    expect(p.osc).toHaveLength(2);
    expect(p.osc[0]).toMatchObject({ level: 1, mix: { tri: 1 }, kbd: false });
    expect(p.osc[1]).toMatchObject({ level: 0, mix: { tri: 1 }, kbd: false });
    expect(p.osc[0].fixedNote).toBeCloseTo(note, 10);
    expect(p.osc[1].fixedNote).toBeCloseTo(note, 10);
    expect(p.osc[0].semi).toBeCloseTo(range, 10);
    expect(p.osc[1].semi).toBeCloseTo(OSC2 + range, 10);
    expect(p.noise).toEqual({ level: 0, color: 'white' });
  });

  it('sweeps the pitch down from the struck note by SWEEP RANGE, at SWEEP SPEED', () => {
    // the oscillators sit RANGE below and the sweep envelope lifts them back to the struck pitch at the strike
    expect(to(p.routes, 'env2')).toEqual([
      ['pitch1', 14.4],
      ['pitch2', 14.4],
    ]);
    expect(p.env2.d).toBeCloseTo(exp(0.5, 0.02, 2.5), 10);
    expect(p.env2).toMatchObject({ a: 0.001, s: 0 });
  });

  it('runs the VCA and the filter from one decay, scaled by how hard the key is struck', () => {
    const decay = exp(0.3, 0.006, 2.5);
    expect(p.env1).toMatchObject({ a: 0.001, s: 0 });
    expect(p.env1.d).toBeCloseTo(decay, 10);
    expect(p.env1.r).toBeCloseTo(decay, 10);
    expect(p.vca).toEqual({ envSrc: 'env1v', bias: 0 });
    expect(p.filter).toMatchObject({ type: 'svf', mode: 'lp', res: 0, envSrc: 'env1v', kbd: 0 });
  });

  it('strikes on every new key but never on a key let go (no retrigger)', () => {
    expect(p.trig).toEqual({ retrig: false, drone: false, repeat: false });
  });

  it('puts the filter an octave above TUNE and opens it by WIDTH', () => {
    expect(p.filter.cutoff).toBeCloseTo(hz(28 + 7.2 * 3) * 2, 6);
    expect(p.filter.envAmt).toBeCloseTo(2.4, 10);
  });

  it('leaves the LFO and the sample and hold off the pitch', () => {
    expect(p.lfo.mix).toEqual({});
    expect(to(p.routes, 'lfo')).toEqual([]);
    expect(to(p.routes, 'sh')).toEqual([]);
    expect(p.lfo.rate).toBeCloseTo(exp(0.5, 0.4, 50), 10);
    expect(p.sh?.rate).toBeCloseTo(exp(0.5, 0.4, 50), 10);
  });

  it('gives channel 2 the same voice from its own controls', () => {
    const b = run2({ 'ch2.tune': 10, 'ch2.mode': 'F' });
    expect(b.osc[0].fixedNote).toBeCloseTo(100, 10);
    expect(b.noise.level).toBe(1);
    expect(run().osc[0].fixedNote).toBeCloseTo(49.6, 10);
  });
});

describe('Pearl Syncussion OSC MODE', () => {
  const mix = (mode: string) => {
    const p = run({ 'ch1.mode': mode });
    return [p.osc[0].level, p.osc[1].level, p.noise.level];
  };

  it('mixes the oscillators and noise as each mode says', () => {
    expect(mix('A')).toEqual([1, 0, 0]);
    expect(mix('B')).toEqual([0, 1, 0]);
    expect(mix('C')).toEqual([0.6, 1, 0]);
    expect(mix('D')).toEqual([0.6, 1, 0]);
    expect(mix('E')).toEqual([0, 1, 0.5]);
    expect(mix('F')).toEqual([0, 0, 1]);
  });

  it('frequency-modulates oscillator 2 from oscillator 1 in B and E only', () => {
    for (const m of ['B', 'E'])
      expect(to(run({ 'ch1.mode': m }).routes, 'osc1')).toEqual([['pitch2', 24]]);
    for (const m of ['A', 'C', 'D', 'F'])
      expect(to(run({ 'ch1.mode': m }).routes, 'osc1')).toEqual([]);
  });

  it('replaces the sweep in D with the strike on oscillator 1 and the decay on oscillator 2', () => {
    const p = run({ 'ch1.mode': 'D', 'ch1.sweep': 'up', 'ch1.sweepRange': 10 });
    expect(to(p.routes, 'env2')).toEqual([]);
    expect(to(p.routes, 'env1v')).toEqual([['pitch1', -24]]);
    expect(to(p.routes, 'env1')).toEqual([['pitch2', -12]]);
    expect(p.osc[0].semi).toBe(0);
    expect(p.osc[1].semi).toBeCloseTo(OSC2, 10);
  });
});

describe('Pearl Syncussion switches', () => {
  it('sweeps up: the oscillators sit RANGE above and start at the struck pitch', () => {
    const p = run({ 'ch1.sweep': 'up', 'ch1.sweepRange': 10 });
    expect(p.osc[0].semi).toBeCloseTo(36, 10);
    expect(to(p.routes, 'env2')).toEqual([
      ['pitch1', -36],
      ['pitch2', -36],
    ]);
  });

  it('holds the tuned pitch with SWEEP off', () => {
    const p = run({ 'ch1.sweep': 'off' });
    expect(p.osc[0].semi).toBe(0);
    expect(to(p.routes, 'env2')).toEqual([]);
  });

  it('puts the square or the triangle LFO on both oscillators, by LFO DEPTH', () => {
    const sq = run({ 'ch1.lfoWave': 'square', 'ch1.lfoDepth': 10 });
    expect(sq.lfo.mix).toEqual({ sq: 1 });
    expect(to(sq.routes, 'lfo')).toEqual([
      ['pitch1', 12],
      ['pitch2', 12],
    ]);
    const tri = run({ 'ch1.lfoWave': 'triangle', 'ch1.lfoDepth': 5 });
    expect(tri.lfo.mix).toEqual({ tri: 1 });
    expect(to(tri.routes, 'lfo')).toEqual([
      ['pitch1', 3],
      ['pitch2', 3],
    ]);
  });

  it('adds the sample and hold by LFO DEPTH, with the LFO wave off', () => {
    const p = run({ 'ch1.sh': true, 'ch1.lfoDepth': 10, 'ch1.lfoSpeed': 10 });
    expect(to(p.routes, 'sh')).toEqual([
      ['pitch1', 12],
      ['pitch2', 12],
    ]);
    expect(to(p.routes, 'lfo')).toEqual([]);
    expect(p.sh?.rate).toBeCloseTo(50, 10);
  });

  it('silences everything with POWER off', () => {
    expect(run({ 'sys.power': false }).volume).toBe(0);
  });
});

describe('Pearl Syncussion readouts', () => {
  it('reads TUNE, DECAY, WIDTH, the sweep and the LFO in units', () => {
    expect(readout('ch1.tune', 0)).toBe('41 Hz');
    expect(readout('ch1.decay', 0)).toBe('6 ms');
    expect(readout('ch1.decay', 10)).toBe('2.5 s');
    expect(readout('ch1.width', 10)).toBe('6.0 oct');
    expect(readout('ch1.sweepRange', 10)).toBe('+36 st');
    expect(readout('ch1.lfoSpeed', 0)).toBe('0.40 Hz');
    expect(readout('ch1.lfoSpeed', 10)).toBe('50 Hz');
  });
});

describe('Pearl Syncussion panel', () => {
  it('tags the printed SYNCUSSION and SY-1 as brand, and nothing else', () => {
    const brand = pearl.decor.filter((d) => d.brand);
    expect(brand.map((d) => (d.t === 'text' ? d.text : d.t))).toEqual(['SYNCUSSION', 'SY-1']);
    const unbranded = pearl.decor.filter(
      (d): d is TextDecor => d.t === 'text' && !d.brand && /syncussion|pearl/i.test(d.text)
    );
    expect(unbranded).toEqual([]);
  });

  it('draws two channels of the same twelve controls, and POWER', () => {
    for (const ch of [1, 2])
      expect(pearl.controls.filter((c) => c.id.startsWith(`ch${ch}.`))).toHaveLength(12);
    expect(pearl.controls.map((c) => c.id)).toContain('sys.power');
    expect(pearl.jacks).toEqual([]);
  });

  it('puts every control in exactly one area, inside the view', () => {
    expect(pearl.controls.length).toBeGreaterThan(20);
    for (const c of pearl.controls) {
      const at = pearl.areas.filter((a) =>
        a.rects.some((r) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h)
      );
      expect(
        at.map((a) => a.id),
        c.id
      ).toHaveLength(1);
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(pearl.view.w);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(pearl.view.h);
    }
  });

  it('starts every control at its default', () => {
    for (const c of pearl.controls) expect(pearl.init[c.id], c.id).toBe(c.def);
  });
});
