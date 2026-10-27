/**
 * Erica Synths SYNTRX II definition tests: the panel → engine mapping at the init patch and for each switch, the
 * matrix rows and columns, and the maker's mark.
 *
 * The SYNTRX II has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering
 * except its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a
 * slip shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/syntrx-ii.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  EngineRoute,
  InputJack,
  OutputJack,
  TextDecor,
} from '@/lib/app/synths/contract';
import syntrx from '@/lib/app/synths/defs/syntrx-ii';
import { cablesToEngine } from '@/lib/app/synths/lib/patch';

const CTX: EngineContext = { wheel: 0, patched: {} };
const values = (set: ControlValues = {}): ControlValues => ({ ...syntrx.init, ...set });
const run = (set: ControlValues = {}) => syntrx.toEngine(values(set), CTX);
const routes = (set: ControlValues = {}): EngineRoute[] => run(set).routes ?? [];
const route = (set: ControlValues, src: string, dst: string): EngineRoute | undefined =>
  routes(set).find((r) => r.src === src && r.dst === dst);

const control = (id: string): Control => {
  const c = syntrx.controls.find((x) => x.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};
const readout = (id: string, v: number): string => {
  const c = control(id);
  if (c.kind === 'cont' && c.fmt) return c.fmt(v);
  throw new Error(`${id} has no readout`);
};
const rowJack = (id: string): OutputJack => {
  const j = syntrx.jacks.find((x) => x.id === id);
  if (!j || j.dir !== 'out') throw new Error(`no row ${id}`);
  return j;
};
const colJack = (id: string): InputJack => {
  const j = syntrx.jacks.find((x) => x.id === id);
  if (!j || j.dir !== 'in') throw new Error(`no column ${id}`);
  return j;
};
const gain = (id: string, set: ControlValues = {}): number => {
  const g = rowJack(id).gain;
  return typeof g === 'function' ? g(values(set)) : (g ?? 1);
};
/** One matrix point as the engine gets it. */
const point = (from: string, to: string, set: ControlValues = {}) =>
  cablesToEngine(syntrx, [{ from, to }], values(set))[0];
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
/** A LEVEL knob: square law, `peak` at 10. */
const lvl = (v: number, peak: number) => peak * Math.pow(v / 10, 2);

describe('SYNTRX II toEngine at the init patch', () => {
  const p = run();

  it('runs three keyboard oscillators into the matrix only, and a silent super saw partner', () => {
    expect(p.oscOuts).toBe(true);
    expect(p.pwSplit).toBe(true);
    expect(p.osc).toHaveLength(4);
    expect(p.osc[0]).toMatchObject({
      level: 1,
      mix: {},
      semi: 0,
      kbd: true,
      syncTo: -1,
      sineShape: 0,
    });
    expect(p.osc[0].pw).toBeCloseTo(0.5, 10);
    expect(p.osc[1]).toMatchObject({ level: 1, mix: {}, semi: 0, kbd: true, syncTo: -1 });
    expect(p.osc[1].pw).toBeCloseTo(0.5, 10);
    expect(p.osc[3]).toMatchObject({ level: 0, mix: { saw: 1 }, kbd: true, syncTo: -1 });
  });

  it('runs Oscillator 3 free at its TUNE, a triangle and square', () => {
    const o = p.osc[2];
    const hz = exp(0.5, 0.05, 500);
    expect(o).toMatchObject({ level: 1, kbd: false, semi: 0, skew: 0.5, pw: 0.5 });
    expect(o.fixedNote).toBeCloseTo(69 + 12 * Math.log2(hz / 440), 10);
    expect(readout('osc3.tune', 5)).toBe('5.00 Hz');
  });

  it('wires nothing inside: no filter, VCA, effects or S&H input until a point is set', () => {
    expect(p.normals).toMatchObject({ vcfIn: null, vcaIn: null, delayIn: null, shIn: null });
    expect(p.normals?.sum1A).toEqual(['o2pulse', 0]);
    expect(p.normals?.sum1B).toEqual(['o2saw', 0]);
  });

  it('opens both filters, with no resonance', () => {
    expect(p.filter).toMatchObject({ type: 'ladder', mode: 'lp', res: 0, envAmt: 0, kbd: 0 });
    expect(p.filter.cutoff).toBeCloseTo(20000, 6);
    expect(p.hpf).toMatchObject({ cutoff: 10, res: 0, envAmt: 0, kbd: 0 });
  });

  it('waits for a key with the trapezoid, OFF being above 9', () => {
    expect(p.trap).toMatchObject({ auto: false, off: 0, hold: false });
    expect(p.trap?.a).toBeCloseTo(0.006, 10);
    expect(p.trap?.on).toBeCloseTo(1.5 * 0.09, 10);
    expect(p.trap?.d).toBeCloseTo(exp(0.4, 0.016, 2), 10);
    expect(p.vca).toEqual({ envSrc: 'env1', bias: 0 });
  });

  it('runs the delay wet only, 50 ms–0.5 s, with the reverb off', () => {
    expect(p.delay).toEqual({ on: true, time: exp(0.5, 0.05, 0.5), fb: 0.3 * 1.02, mix: 1 });
    expect(p.rev).toEqual({ on: false, mix: 0 });
    expect(p.normals?.att2In).toBe('out');
    expect(p.normals?.revIn).toBe('out');
  });

  it('plays two output channels at 70 %, flat and centred', () => {
    expect(p.outAmps).toEqual([
      { level: 0.7, tone: 0, pan: 0.5 },
      { level: 0.7, tone: 0, pan: 0.5 },
    ]);
    expect(p.joy).toEqual([0, 0]);
    expect(p.volume).toBe(1);
  });

  it('sends the two fanned-out columns through their buses, and the mod wheel to the low-pass', () => {
    expect(routes()).toEqual([
      { src: 'inv1', dst: 'pitch2', amt: -12 },
      { src: 'inv1', dst: 'pitch4', amt: -12 },
      { src: 'wheel', dst: 'cutoff', amt: 3 },
      { src: 'sum2', dst: 'pw1', amt: 0.09 },
      { src: 'invert', dst: 'cutoff', amt: -1 },
    ]);
  });

  it('is silent with no points, by design', () => {
    expect(syntrx.silentInit).toMatch(/no points it is silent/);
  });
});

describe('SYNTRX II oscillators', () => {
  it('sets pitch by OCTAVE and a two-octave TUNE, in tune at 5', () => {
    expect(run({ 'osc1.octave': '-2', 'osc1.tune': 7.5 }).osc[0].semi).toBeCloseTo(-24 + 6, 10);
    expect(run({ 'osc2.octave': '3', 'osc2.tune': 0 }).osc[1].semi).toBeCloseTo(36 - 12, 10);
    expect(readout('osc1.tune', 5)).toBe('in tune');
  });

  it('shapes Oscillator 1’s pulse and sine together', () => {
    const o = run({ 'osc1.shape': -5 }).osc[0];
    expect(o.pw).toBeCloseTo(0.05, 10);
    expect(o.sineShape).toBe(-1);
    expect(run({ 'osc1.shape': 2.5 }).osc[0].sineShape).toBe(0.5);
  });

  it('narrows Oscillator 2’s pulse and brings in the detuned super saw partner with SHAPE', () => {
    const p = run({ 'osc2.shape': 10, 'osc2.saw': 10 });
    expect(p.osc[1].pw).toBeCloseTo(0.05, 10);
    expect(p.osc[3]).toMatchObject({ level: 1, mix: { saw: 1 } });
    expect(p.osc[3].semi).toBeCloseTo(0.35, 10);
    expect(p.routes).toContainEqual({ src: 'osc4', dst: 'sum1B', amt: 1 });
  });

  it('mixes the pulse and saw onto row 3 by their LEVEL knobs', () => {
    const p = run({ 'osc2.pulse': 5, 'osc2.saw': 10 });
    expect(p.normals?.sum1A).toEqual(['o2pulse', 0.25]);
    expect(p.normals?.sum1B).toEqual(['o2saw', 1]);
    expect(gain('r.osc2')).toBeCloseTo(1.85, 10);
  });

  it('SYNC hard-syncs Oscillator 2 and its partner to Oscillator 1', () => {
    const p = run({ 'osc2.sync': 'sync', 'osc2.shape': 5 });
    expect(p.osc[1].syncTo).toBe(0);
    expect(p.osc[3].syncTo).toBe(0);
  });

  it('KEY FOL plays Oscillator 3 from the keys, at its TUNE speed for middle C', () => {
    const o = run({ 'osc3.keyFol': 'key', 'osc3.tune': 10 }).osc[2];
    expect(o.kbd).toBe(true);
    expect(o.semi).toBeCloseTo(69 + 12 * Math.log2(500 / 440) - 60, 10);
  });

  it('leans Oscillator 3 into a ramp either way of 5', () => {
    expect(run({ 'osc3.shape': 0 }).osc[2]).toMatchObject({ skew: 0.005, pw: 0.03 });
    expect(run({ 'osc3.shape': 8 }).osc[2].skew).toBeCloseTo(0.8, 10);
  });

  it('sends the Oscillator Shape column to the pulse widths the switches choose', () => {
    expect(route({ 'osc1.shapeCv': 'pwm' }, 'sum2', 'pw1')).toBeDefined();
    expect(route({ 'osc1.shapeCv': 'both' }, 'sum2', 'pw1')).toBeDefined();
    expect(route({ 'osc1.shapeCv': 'sine' }, 'sum2', 'pw1')).toBeUndefined();
    expect(route({ 'osc2.shapeCv': 'pwm' }, 'sum2', 'pw2')).toEqual({
      src: 'sum2',
      dst: 'pw2',
      amt: 0.09,
    });
    expect(route({ 'osc2.shapeCv': 'none' }, 'sum2', 'pw2')).toBeUndefined();
    expect(route({ 'osc2.shapeCv': 'saw' }, 'sum2', 'pw2')).toBeUndefined();
  });
});

describe('SYNTRX II filter', () => {
  it('maps HPF 10 Hz–12 kHz and LPF 20 Hz–20 kHz', () => {
    expect(run({ 'vcf.hpf': 10 }).hpf?.cutoff).toBeCloseTo(12000, 6);
    expect(run({ 'vcf.lpf': 0 }).filter.cutoff).toBeCloseTo(20, 6);
    expect(run({ 'vcf.lpf': 5 }).filter.cutoff).toBeCloseTo(exp(0.5, 20, 20000), 6);
  });

  it('self-oscillates from RESONANCE 7', () => {
    expect(run({ 'vcf.res': 7 }).filter.res).toBeCloseTo(1, 10);
    expect(run({ 'vcf.res': 10 }).filter.res).toBeCloseTo(1.1, 10);
    expect(readout('vcf.res', 7)).toBe('oscillating');
  });

  it('sends the Filter Frequency column to the cut-offs the HPF / LPF switch chooses', () => {
    const at = (t: string) =>
      routes({ 'vcf.cvTarget': t })
        .filter((r) => r.src === 'invert')
        .map((r) => r.dst);
    expect(at('lpf')).toEqual(['cutoff']);
    expect(at('both')).toEqual(['cutoff', 'cutoffHp']);
    expect(at('hpf')).toEqual(['cutoffHp']);
  });
});

describe('SYNTRX II trapezoid', () => {
  it('loops at OFF 9 and below, and waits above', () => {
    const loop = run({ 'trap.off': 9 }).trap;
    expect(loop?.auto).toBe(true);
    expect(loop?.off).toBeCloseTo(1.3, 10);
    expect(run({ 'trap.off': 0 }).trap?.off).toBeCloseTo(0.014, 10);
    expect(run({ 'trap.off': 9.1 }).trap).toMatchObject({ auto: false, off: 0 });
  });

  it('reaches its longest stages at 10', () => {
    const t = run({ 'trap.attack': 10, 'trap.on': 10, 'trap.decay': 10 }).trap;
    expect(t?.a).toBeCloseTo(0.85, 10);
    expect(t?.on).toBeCloseTo(1.5, 10);
    expect(t?.d).toBeCloseTo(2, 10);
  });

  it('fires by hand with GATE', () => {
    expect(run({ 'trap.gate': true }).trap?.hold).toBe(true);
  });
});

describe('SYNTRX II switches elsewhere', () => {
  it('OSC 3 / S&H puts Oscillator 3’s pulse or the S&H on row 5, at the chosen LEVEL', () => {
    expect(run().normals?.att1In).toBe('o3pulse');
    expect(run({ 'snh.select': 'snh' }).normals?.att1In).toBe('sh');
    expect(gain('r.osc3sh', { 'osc3.pulse': 10, 'snh.level': 5 })).toBeCloseTo(1.85, 10);
    expect(gain('r.osc3sh', { 'snh.select': 'snh', 'osc3.pulse': 10, 'snh.level': 5 })).toBeCloseTo(
      0.5,
      10
    );
  });

  it('runs the S&H on its own clock, whatever FREE / GATE says', () => {
    const hz = exp(0.5, 0.2, 200);
    expect(run().sh).toEqual({ rate: hz, glide: 0 });
    expect(run({ 'snh.clock': 'gate' }).sh).toEqual({ rate: hz, glide: 0 });
  });

  it('REVERB switches the effects row to the reverb, fed through the bypassed delay', () => {
    const p = run({ 'fx.type': 'reverb', 'fx.time': 5, 'fx.feedback': 4 });
    expect(p.delay).toEqual({ on: false });
    expect(p.rev).toMatchObject({ on: true, unit: false, mix: 0 });
    expect(p.rev?.decay).toBeCloseTo(0.5 + 0.1 + 0.1, 10);
    expect(p.normals?.att2In).toBe('rev');
    expect(p.normals?.revIn).toBe('out');
  });

  it('loops the reverb at full FEEDBACK', () => {
    expect(run({ 'fx.type': 'reverb', 'fx.feedback': 10 }).rev?.decay).toBe(0.995);
  });

  it('chooses the ring modulator’s B inside, with nothing at SIGN', () => {
    const b = (pos: string) => run({ 'ring.sourceB': pos }).normals?.ringB;
    expect(['osc2', 'osc3', 'in1', 'in2', 'noise', 'vcf', 'sign'].map(b)).toEqual([
      'sum1',
      'o3tri',
      'mult',
      'preamp',
      'noise',
      'vcf1',
      null,
    ]);
    expect(run().ring).toEqual({ ac: false, acB: false });
  });

  it('drives Input 2 harder at MIC, and INVERT turns its row over', () => {
    expect(run({ 'in2.level': 10 }).preamp?.gain).toBeCloseTo(2, 10);
    expect(run({ 'in2.level': 10, 'in2.gain': 'mic' }).preamp?.gain).toBeCloseTo(12, 10);
    expect(run().preamp?.gain).toBe(0);
    expect(gain('r.in2')).toBeCloseTo(1.85, 10);
    expect(gain('r.in2', { 'in2.polarity': 'invert' })).toBeCloseTo(-1.85, 10);
  });

  it('feeds both inputs and the envelope follower from the Scope column', () => {
    const p = run({ 'in1.level': 10 });
    expect(colJack('c.scope').dest).toBe('multIn');
    expect(rowJack('r.in1').signal).toBe('mult');
    expect(p.normals?.preampIn).toBe('mult');
    expect(p.normals?.envfIn).toEqual(['mult', 1.5]);
    expect(gain('r.ef', { 'in1.ef': -5 })).toBeCloseTo(-3, 10);
  });

  it('changes nothing from TO GATE, THRESH, the follower’s DECAY or the meter switch', () => {
    const base = run();
    expect(run({ 'in1.toGate': 'on', 'in1.thresh': 9, 'in1.decay': 9 })).toEqual(base);
    expect(control('scope.mode').ui).toBe(true);
  });

  it('pans and tones each output channel', () => {
    const p = run({
      'out1.pan': -5,
      'out2.pan': 5,
      'out1.filter': 0,
      'out2.filter': 10,
      'out2.level': 10,
    });
    expect(p.outAmps).toEqual([
      { level: 0.7, tone: -1, pan: 0 },
      { level: 1, tone: 1, pan: 1 },
    ]);
  });
});

describe('SYNTRX II matrix', () => {
  it('has 16 rows and 16 columns, drawn as lamps', () => {
    expect(syntrx.matrix?.rows).toHaveLength(16);
    expect(syntrx.matrix?.cols).toHaveLength(16);
    expect(syntrx.matrix?.look).toBe('led');
  });

  it('orders the columns as the manual’s panel drawing does', () => {
    expect(syntrx.matrix?.cols.map((id) => colJack(id).label)).toEqual([
      'Ch1 Output',
      'Scope',
      'Ch2 Output',
      'Envelope Signal',
      'Ringmod A',
      'Effects',
      'Filter',
      'Oscillator frequency 1',
      'Oscillator frequency 2',
      'Oscillator frequency 3',
      'Oscillator Shape',
      'Decay',
      'S&H Input',
      'Filter Frequency',
      'Output ch. level 1',
      'Output ch. level 2',
    ]);
  });

  it('scales an audio row by its LEVEL knob, square law to 1.85 V', () => {
    expect(point('r.osc1pulse', 'c.out1', { 'osc1.pulse': 10 })).toEqual({
      src: 'o1pulse',
      dst: 'out1In',
      amt: 1.85,
      add: true,
    });
    expect(point('r.osc1sine', 'c.vcf', { 'osc1.sine': 5 }).amt).toBeCloseTo(lvl(5, 1.85), 10);
  });

  it('plays the pitch columns at 1 V per octave', () => {
    expect(point('r.trap', 'c.osc1', { 'trap.level': 10 })).toMatchObject({
      dst: 'pitch1',
      amt: 60,
    });
    expect(point('r.joyy', 'c.osc3', { 'joy.yLevel': 10 })).toMatchObject({
      dst: 'pitch3',
      amt: 60,
    });
    // Oscillator 2 goes through `inv1`, so a +1 V point arrives as +12 semitones on it and its partner
    expect(point('r.joyx', 'c.osc2', { 'joy.xLevel': 2 })).toMatchObject({ dst: 'inv1In', amt: 1 });
  });

  it('tells a row with its LEVEL at 0 apart from one that is up', () => {
    expect(rowJack('r.noise').check?.(values())).toMatch(/Noise LEVEL is at 0/);
    expect(rowJack('r.noise').check?.(values({ 'noise.level': 3 }))).toBeNull();
    expect(rowJack('r.osc2').check?.(values({ 'osc2.saw': 1 }))).toBeNull();
  });
});

describe('SYNTRX II panel', () => {
  it('tags the SYNTRX II wordmark, and nothing else, as brand', () => {
    const texts = syntrx.decor.filter((d): d is TextDecor => d.t === 'text');
    expect(texts.filter((d) => d.brand).map((d) => d.text)).toEqual(['SYNTRX II']);
  });

  it('keeps the patch memory and encoders as panel modes that never reach the engine', () => {
    for (const id of [
      'ui.recall',
      'ui.save',
      'ui.shift',
      'ui.patchPrev',
      'ui.patchNext',
      'ui.rec',
      'ui.encX',
      'ui.encY',
    ])
      expect(control(id).ui).toBe(true);
  });
});
