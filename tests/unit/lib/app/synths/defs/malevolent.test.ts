/**
 * PWM Malevolent definition tests: the panel → engine mapping at init and for each switch, the printed normals that a
 * cable replaces, the readouts, the maker's marks and the areas.
 *
 * The Malevolent has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering
 * except its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a
 * slip shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/malevolent.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  EngineRoute,
  TextDecor,
} from '@/lib/app/synths/contract';
import malevolent from '@/lib/app/synths/defs/malevolent';

const run = (set: ControlValues = {}, patched: Record<string, boolean> = {}) =>
  malevolent.toEngine({ ...malevolent.init, ...set }, {
    wheel: 0,
    patched,
  } satisfies EngineContext);
const route = (routes: EngineRoute[] | undefined, src: string, dst: string) =>
  (routes || []).find((r) => r.src === src && r.dst === dst);

const control = (id: string): Control => {
  const c = malevolent.controls.find((x) => x.id === id);
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

describe('Malevolent toEngine at the init patch', () => {
  const p = run();

  it('sounds VCO 1’s saw at LEVEL 8, with VCO 2 lit nothing and down, both in tune at the keys', () => {
    expect(p.osc).toHaveLength(2);
    expect(p.osc[0]).toMatchObject({ mix: { saw: 0.8 }, pw: 0.5, semi: 0, kbd: true });
    expect(p.osc[0].level).toBeCloseTo(level(8, 1), 10);
    expect(p.osc[1]).toMatchObject({ level: 0, mix: {}, pw: 0.5, semi: 0, kbd: true });
    expect(p.oscOuts).toBe(false);
  });

  it('runs the SVF low-pass, the cutoff 0.7 of the way up 20 Hz–20 kHz, with no envelope of its own', () => {
    expect(p.filter).toMatchObject({ type: 'svf', mode: 'lp', res: 0, envAmt: 0, kbd: 0 });
    expect(p.filter.cutoff).toBeCloseTo(exp(0.7, 20, 20000), 6);
  });

  it('opens the VCA from Envelope 2 through AM 1 at full, with only the bend beside it', () => {
    expect(p.vca).toEqual({ envSrc: 'none', bias: 0 });
    expect(p.routes).toEqual([
      { src: 'env2', dst: 'amp', amt: 1 },
      { src: 'joyX', dst: 'pitchAll', amt: 2 },
    ]);
    expect(p.od).toEqual({ on: false });
  });

  it('maps the envelopes from their knobs', () => {
    expect(p.env1.a).toBeCloseTo(0.001, 10);
    expect(p.env1.d).toBeCloseTo(exp(0.5, 0.003, 10), 10);
    expect(p.env1.s).toBeCloseTo(0.7, 10);
    expect(p.env1.r).toBeCloseTo(exp(0.2, 0.003, 10), 10);
    expect(p.env2).toEqual(p.env1);
  });

  it('runs as a one-voice poly with the arpeggiator off, the LFO at its middle rate', () => {
    expect(p.poly).toEqual({ voices: 1, stack: 1, mono: true });
    expect(p.arp).toMatchObject({ on: false, mode: 'up', octaves: 1, hold: false });
    expect(p.arp?.bpm).toBeCloseTo(exp(0.5, 30, 300), 10);
    expect(p.lfo).toMatchObject({ mix: { tri: 1 }, keySync: false });
    expect(p.lfo.rate).toBeCloseTo(exp(0.5, 0.05, 100), 10);
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
    expect(p.glide.time).toBe(0);
  });
});

describe('Malevolent toEngine, control by control', () => {
  it('adds each lit wave button to its VCO’s mix', () => {
    expect(run({ 'vco1.saw': false, 'vco1.tri': true }).osc[0].mix).toEqual({ tri: 0.8 });
    expect(run({ 'vco1.pulse': true }).osc[0].mix).toEqual({ saw: 0.8, pulse: 0.8 });
    expect(run({ 'vco2.saw': true, 'vco2.tri': true, 'vco2.pulse': true }).osc[1].mix).toEqual({
      saw: 0.8,
      tri: 0.8,
      pulse: 0.8,
    });
    expect(run({ 'vco1.saw': false }).osc[0].mix).toEqual({});
  });

  it('tunes by COARSE (±4 octaves) and FINE (±1 semitone), and sets SHAPE as the pulse width', () => {
    expect(run({ 'vco1.coarse': 0 }).osc[0].semi).toBeCloseTo(-48, 10);
    expect(run({ 'vco2.coarse': 10, 'vco2.fine': 10 }).osc[1].semi).toBeCloseTo(49, 10);
    expect(run({ 'vco1.shape': 0 }).osc[0].pw).toBeCloseTo(0.05, 10);
    expect(run({ 'vco2.shape': 10 }).osc[1].pw).toBeCloseTo(0.95, 10);
    expect(readout('vco1.coarse', 6.25)).toBe('+12 st');
  });

  it('wires each VCO’s printed normals at their depth knobs', () => {
    const p = run({ 'vco1.shapeMod': 10, 'vco1.fm1': 5, 'vco2.fm2': 10 });
    expect(route(p.routes, 'lfoTri', 'pw1')?.amt).toBeCloseTo(0.45, 10);
    expect(route(p.routes, 'env1', 'pitch1')?.amt).toBeCloseTo(12, 10);
    expect(route(p.routes, 'lfoTri', 'pitch2')?.amt).toBeCloseTo(48, 10);
  });

  it('drops a normal while a cable is in its jack, and hands the jack the same depth', () => {
    const set = { 'vco1.fm1': 5, 'vcf.fm2': 5, 'vca.am1': 10 };
    const p = run(set, { 'j.vco1_fm1': true, 'j.vcf_fm2': true, 'j.vca_am1': true });
    expect(route(p.routes, 'env1', 'pitch1')).toBeUndefined();
    expect(route(p.routes, 'lfoTri', 'cutoff')).toBeUndefined();
    expect(route(p.routes, 'env2', 'amp')).toBeUndefined();
    const jack = malevolent.jacks.find((j) => j.id === 'j.vco1_fm1');
    expect(
      jack?.dir === 'in' && typeof jack.amt === 'function'
        ? jack.amt({ ...malevolent.init, ...set })
        : null
    ).toBeCloseTo(12, 10);
  });

  it('works out the separate wave outputs only while one of their jacks is patched', () => {
    expect(run({}, { 'j.vco2_pulse': true }).oscOuts).toBe(true);
    expect(run({}, { 'j.vco1_out': true }).oscOuts).toBe(false);
  });

  it('takes the keys away from a VCO while its 1V/OCT is patched', () => {
    const p = run({}, { 'j.vco2_voct': true });
    expect(p.osc[0].kbd).toBe(true);
    expect(p.osc[1]).toMatchObject({ kbd: false, fixedNote: 60 });
  });

  it('moves the cutoff from Envelope 1 and the LFO at the VCF’s FM knobs, in octaves', () => {
    const p = run({ 'vcf.fm1': 5, 'vcf.fm2': 10, 'vcf.res': 10 });
    expect(route(p.routes, 'env1', 'cutoff')?.amt).toBeCloseTo(4, 10);
    expect(route(p.routes, 'lfoTri', 'cutoff')?.amt).toBeCloseTo(8, 10);
    // 1.25 at full: the SVF rings on its own from 1, at RESONANCE 8
    expect(p.filter.res).toBeCloseTo(1.25, 10);
  });

  it('holds the VCA open on DRONE, adds the LFO at AM 2 and drives on DRIVE', () => {
    const p = run({ 'vca.mode': 'drone', 'vca.am2': 5, 'vca.drive': 5 });
    expect(p.vca).toEqual({ envSrc: 'none', bias: 1 });
    // held fully open, so Envelope 2 no longer opens it further
    expect(route(p.routes, 'env2', 'amp')).toBeUndefined();
    expect(route(p.routes, 'lfoUni', 'amp')?.amt).toBeCloseTo(0.5, 10);
    expect(p.od).toEqual({ on: true, drive: 0.5, tone: 0.5, level: 1 });
  });

  it('mixes the noise and sets AUX as its jack’s depth', () => {
    expect(run({ 'mix.noise': 10 }).noise).toEqual({ level: 0.7, color: 'white' });
    const aux = malevolent.jacks.find((j) => j.id === 'j.aux');
    expect(
      aux?.dir === 'in' && typeof aux.amt === 'function'
        ? aux.amt({ ...malevolent.init, 'mix.aux': 10 })
        : null
    ).toBe(1);
  });

  it('bends on the joystick’s X, glides on its Y, and with VIBRATO turns Y into vibrato', () => {
    const bent = run({ 'joy.x': 0.5 });
    expect(bent.joy).toEqual([0.5, 0]);
    expect(route(bent.routes, 'joyX', 'pitchAll')?.amt).toBe(2);
    expect(run({ 'joy.y': 1 }).glide.time).toBeCloseTo(2, 10);
    const vib = run({ 'keys.vibrato': true, 'joy.y': 0.5 });
    expect(vib.glide.time).toBe(0);
    expect(route(vib.routes, 'lfo2', 'pitchAll')?.amt).toBeCloseTo(0.5, 10);
    expect(vib.lfo2).toEqual({ rate: 5, mix: { sine: 1 } });
  });

  it('starts the arpeggiator on ARP and holds it on HOLD or the joystick pulled down', () => {
    expect(run({ 'keys.arp': true }).arp?.on).toBe(true);
    expect(run({ 'keys.hold': true }).arp?.hold).toBe(true);
    expect(run({ 'joy.y': -0.8 }).arp?.hold).toBe(true);
    expect(run({ 'joy.y': -0.3 }).arp?.hold).toBe(false);
  });

  it('leaves the engine alone on the OCTAVE buttons, which the on-screen keyboard does instead', () => {
    expect(run({ 'keys.octUp': true, 'keys.octDown': true })).toEqual(run());
  });
});

describe('Malevolent panel', () => {
  it('tags every maker’s mark and nothing else as brand', () => {
    const brand = malevolent.decor
      .filter((d): d is TextDecor => d.t === 'text' && !!d.brand)
      .map((d) => d.text);
    expect(brand).toEqual([
      'PWM',
      'Malevolent',
      'MODULAR SYNTHESISER',
      'FUTURE',
      'SOUND',
      'SYSTEMS',
    ]);
    expect(malevolent.decor.filter((d) => d.brand && d.t !== 'text')).toEqual([]);
  });

  it('has 19 inputs and 19 outputs, as the panel prints', () => {
    expect(malevolent.jacks.filter((j) => j.dir === 'in')).toHaveLength(19);
    expect(malevolent.jacks.filter((j) => j.dir === 'out')).toHaveLength(19);
  });

  it('puts the multimode filter’s three inputs on the engine’s three filter inputs', () => {
    const dest = (id: string) => {
      const j = malevolent.jacks.find((x) => x.id === id);
      return j && j.dir === 'in' ? j.dest : undefined;
    };
    expect([dest('j.vcf_lp'), dest('j.vcf_bp'), dest('j.vcf_hp')]).toEqual([
      'vcfIn',
      'vcfBpIn',
      'vcfHpIn',
    ]);
  });
});
