/**
 * PWM Mantis definition tests: the panel → engine mapping at init and for each switch, the mod routes, the readouts, the
 * maker's marks and the areas.
 *
 * The Mantis has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except
 * its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip
 * shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/mantis.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  EngineRoute,
  TextDecor,
} from '@/lib/app/synths/contract';
import mantis from '@/lib/app/synths/defs/mantis';

const run = (set: ControlValues = {}) =>
  mantis.toEngine({ ...mantis.init, ...set }, { wheel: 0, patched: {} } satisfies EngineContext);
const routesTo = (routes: EngineRoute[] | undefined, dst: string) =>
  (routes || []).filter((r) => r.dst === dst);

const control = (id: string): Control => {
  const c = mantis.controls.find((x) => x.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};
const options = (id: string): (string | number)[] => {
  const c = control(id);
  if (c.kind !== 'enum') throw new Error(`${id} is not an enum`);
  return c.options.map((o) => o.v);
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

describe('Mantis toEngine at the init patch', () => {
  const p = run();

  it('is the INIT patch: Oscillator 1’s saw alone, the sub, density copy and Oscillator 2 silent', () => {
    expect(p.osc).toHaveLength(4);
    expect(p.osc[0]).toEqual({ level: 0.55, semi: 0, mix: { saw: 1 } });
    expect(p.osc.slice(1).map((o) => o.level)).toEqual([0, 0, 0]);
    expect(p.osc[3].semi).toBe(-12);
    expect(p.noise.level).toBe(0);
  });

  it('runs the 12 dB SVF low-pass wide open, with no high-pass in front', () => {
    expect(p.filter).toMatchObject({ type: 'svf', mode: 'lp', cutoff: 20000, res: 0, kbd: 0 });
    expect(p.filter.drive).toBeCloseTo(0.8, 10);
    expect(p.hpf).toBeUndefined();
  });

  it('opens the VCA from Envelope 1 alone, an organ gate, with only the bend beside it', () => {
    expect(p.vca).toEqual({ envSrc: 'none', bias: 0 });
    expect(p.routes).toEqual([
      { src: 'env1', dst: 'amp', amt: 1 },
      { src: 'joyX', dst: 'pitchAll', amt: 2 },
    ]);
    expect(p.env1).toMatchObject({ a: 0.001, s: 1 });
    expect(p.env1.r).toBeCloseTo(exp(0.2, 0.003, 10), 10);
    expect(p.env1.loop).toBeUndefined();
  });

  it('plays four voices, the arpeggiator off at sixteenths of the middle tempo, the effects bypassed', () => {
    expect(p.poly).toEqual({ voices: 4, stack: 1, mono: false });
    expect(p.arp).toMatchObject({ on: false, mode: 'up', octaves: 1, hold: false });
    expect(p.arp?.bpm).toBeCloseTo(exp(0.5, 40, 240), 10);
    expect(p.fx).toEqual({ mode: 'bypass' });
    expect(p.trig).toEqual({ retrig: true, drone: false, repeat: false });
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
  });
});

describe('Mantis oscillators', () => {
  it('maps each wave, and SHAPE onto what that wave has', () => {
    const at = (wave: string, shape = 5) => run({ 'osc1.wave': wave, 'osc1.shape': shape }).osc[0];
    expect(at('sine', 10)).toMatchObject({ mix: { sine: 1 }, sineShape: 0.8 });
    expect(at('organ', 0)).toMatchObject({ mix: { sine: 1 }, sineShape: 0.35 });
    expect(at('triangle', 10)).toMatchObject({ morph: 0.5 });
    expect(at('saw')).toMatchObject({ mix: { saw: 1 } });
    expect(at('pulse', 10).pw).toBeCloseTo(0.95, 10);
    expect(at('pulse', 5).pw).toBeCloseTo(0.5, 10);
    expect(at('wavetable', 3)).toMatchObject({ morph: 0.3 });
  });

  it('gives the sub Oscillator 1’s wave an octave down, and the density copy Oscillator 2’s, detuned', () => {
    const p = run({
      'osc1.wave': 'pulse',
      'osc1.octave': '-1',
      'osc2.wave': 'triangle',
      'osc2.octave': '+1',
      'osc2.semitone': 7,
      'osc2.cent': 2,
      'osc2.densityRate': 10,
    });
    expect(p.osc[3]).toMatchObject({ semi: -24, mix: { pulse: 1 } });
    expect(p.osc[1].semi).toBeCloseTo(12 + 7 + 0.2, 10);
    expect(p.osc[2].semi).toBeCloseTo(12 + 7 + 0.2 + 0.5, 10);
    expect(p.osc[2].morph).toBe(p.osc[1].morph);
  });

  it('balances Oscillator 1 (and sub) against 2 (and density), then against noise and the ring modulator', () => {
    const mid = run({ 'mix.osc': 0, 'sub.level': 10, 'osc2.density': 10 });
    const h = 0.55 * Math.SQRT1_2;
    expect(mid.osc.map((o) => o.level)).toEqual([
      expect.closeTo(h, 10),
      expect.closeTo(h, 10),
      expect.closeTo(h, 10),
      expect.closeTo(h, 10),
    ]);
    const noise = run({ 'mix.noise': 10 });
    expect(noise.osc[0].level).toBe(0);
    expect(noise.noise.level).toBeCloseTo(0.55, 10);
    const ring = run({ 'mix.ring': 10 });
    expect(ring.osc[0].level).toBe(0);
    expect(routesTo(ring.routes, 'ringA')).toEqual([{ src: 'osc1', dst: 'ringA', amt: 1 }]);
    expect(routesTo(ring.routes, 'ringB')).toEqual([{ src: 'osc2', dst: 'ringB', amt: 1 }]);
    expect(routesTo(ring.routes, 'vcfIn')[0].amt).toBeCloseTo(0.55 * 1.6, 10);
    expect(routesTo(run().routes, 'ringA')).toEqual([]);
  });

  it('drifts, tunes and glides from their knobs', () => {
    const p = run({ 'drift.amount': 10, 'out.tune': -5, 'kbd.glide': 10, 'kbd.glideAuto': true });
    expect(p.drift?.depth).toBeCloseTo(0.33, 10);
    expect(p.tune).toBe(-1);
    expect(p.glide).toEqual({ time: 3, legato: true });
  });
});

describe('Mantis dual filter', () => {
  const f = exp(0.5, 20, 20000);
  const at = (mode: string, set: ControlValues = {}) =>
    run({ 'vcf.mode': mode, 'vcf.cutoff': 5, 'vcf.res': 10, 'vcf.width': 5, ...set });

  it('has the spec’s eight types', () => {
    expect(options('vcf.mode')).toEqual([
      'LP12',
      'BP12',
      'HP12',
      'LP24',
      'BP24',
      'HP24',
      'wide_band',
      'wide_notch',
    ]);
  });

  it('runs the 12 dB types on the SVF alone', () => {
    for (const [mode, m] of [
      ['LP12', 'lp'],
      ['BP12', 'bp'],
      ['HP12', 'hp'],
    ] as const) {
      const p = at(mode);
      expect(p.filter).toMatchObject({ type: 'svf', mode: m, res: 1.05 });
      expect(p.filter.cutoff).toBeCloseTo(f, 6);
      expect(p.hpf).toBeUndefined();
    }
  });

  it('runs LP24 on the ladder, BP24 as a high-pass then the ladder, HP24 as the high-pass alone', () => {
    expect(at('LP24').filter).toMatchObject({ type: 'ladder', mode: 'lp', res: 1.1 });
    expect(at('LP24').hpf).toBeUndefined();
    const bp = at('BP24');
    expect(bp.filter).toMatchObject({ type: 'ladder', mode: 'lp', res: 0.9 });
    expect(bp.hpf?.cutoff).toBeCloseTo(f, 6);
    expect(bp.hpf?.res).toBeCloseTo(0.5, 10);
    const hp = at('HP24');
    expect(hp.filter).toMatchObject({ type: 'svf', mode: 'lp', cutoff: 20000, res: 0 });
    expect(hp.hpf).toMatchObject({ res: 1.05 });
    expect(hp.hpf?.cutoff).toBeCloseTo(f, 6);
  });

  it('sets Wide Band’s low-pass and high-pass WIDTH apart round FREQUENCY, and Wide Notch on the SVF’s notch', () => {
    const wb = at('wide_band');
    // WIDTH 5 is two octaves: one either side
    expect(wb.filter).toMatchObject({ type: 'svf', mode: 'lp' });
    expect(wb.filter.cutoff).toBeCloseTo(f * 2, 6);
    expect(wb.hpf?.cutoff).toBeCloseTo(f / 2, 6);
    expect(at('wide_notch').filter).toMatchObject({ type: 'svf', mode: 'morph', morph: 0.5 });
  });

  it('maps KEY TRACK and DRIVE', () => {
    const p = at('LP12', { 'vcf.keytrack': 10, 'vcf.drive': 10 });
    expect(p.filter.kbd).toBe(1);
    expect(p.filter.drive).toBeCloseTo(4, 10);
  });
});

describe('Mantis mod routes', () => {
  it('has six routes, each with the spec’s six sources and six scales', () => {
    expect(options('route.edit')).toHaveLength(6);
    for (const r of ['osc1Shape', 'osc2Shape', 'osc1Pitch', 'osc2Pitch', 'cutoff', 'width']) {
      expect(options(`route.${r}.source`)).toEqual([
        'env1',
        'lfo1',
        'note',
        'env2',
        'lfo2',
        'full_on',
      ]);
      expect(options(`route.${r}.scale`)).toEqual([
        'joy_x',
        'joy_y',
        'aftertouch',
        'velocity',
        'pedal',
        'full_on',
      ]);
      expect(control(`route.${r}.source`).show).toEqual({ id: 'route.edit', eq: r });
    }
  });

  it('routes nothing while a MOD knob is at its centre', () => {
    expect(routesTo(run().routes, 'cutoff')).toEqual([]);
    expect(routesTo(run().routes, 'pitch1')).toEqual([]);
  });

  it('sends the cutoff route’s source at FREQ MOD’s depth, multiplied by its SCALE', () => {
    const p = run({
      'vcf.cutoffMod': 5,
      'route.cutoff.source': 'lfo2',
      'route.cutoff.scale': 'joy_y',
    });
    expect(routesTo(p.routes, 'cutoff')).toEqual([
      { src: 'lfo2', dst: 'cutoff', amt: 6, by: 'joyY' },
    ]);
  });

  it('maps each source and scale to its engine signal; aftertouch and pedal are the mod wheel', () => {
    const src = (s: string) =>
      routesTo(run({ 'vcf.cutoffMod': 5, 'route.cutoff.source': s }).routes, 'cutoff')[0].src;
    expect(['lfo1', 'note', 'lfo2', 'full_on'].map(src)).toEqual(['lfo', 'kbd', 'lfo2', 'one']);
    const by = (s: string) =>
      routesTo(run({ 'vcf.cutoffMod': 5, 'route.cutoff.scale': s }).routes, 'cutoff')[0].by;
    expect(['joy_x', 'aftertouch', 'velocity', 'pedal', 'full_on'].map(by)).toEqual([
      'joyX',
      'wheel',
      'vel',
      'wheel',
      undefined,
    ]);
  });

  it('splits an envelope source by its VELOCITY knob, either way', () => {
    const up = run({ 'vcf.cutoffMod': -5, 'route.cutoff.source': 'env2', 'env2.velocity': 2.5 });
    expect(routesTo(up.routes, 'cutoff')).toEqual([
      { src: 'env2', dst: 'cutoff', amt: -3 },
      { src: 'env2v', dst: 'cutoff', amt: -3 },
    ]);
    const down = run({ 'vcf.cutoffMod': 5, 'route.cutoff.source': 'env2', 'env2.velocity': -5 });
    expect(routesTo(down.routes, 'cutoff')).toEqual([
      { src: 'env2', dst: 'cutoff', amt: 6 },
      { src: 'env2v', dst: 'cutoff', amt: -6 },
    ]);
    // Envelope 1 is the loudness: harder notes louder with VELOCITY right
    expect(routesTo(run({ 'env1.velocity': 5 }).routes, 'amp')).toEqual([
      { src: 'env1v', dst: 'amp', amt: 1 },
    ]);
  });

  it('sends a pitch route to the oscillator and its copy, squared from PITCH MOD', () => {
    const p = run({ 'osc1.pitchMod': 2.5, 'osc2.pitchMod': -5 });
    expect(routesTo(p.routes, 'pitch1')).toEqual([{ src: 'lfo', dst: 'pitch1', amt: 6 }]);
    expect(routesTo(p.routes, 'pitch4')).toEqual([{ src: 'lfo', dst: 'pitch4', amt: 6 }]);
    expect(routesTo(p.routes, 'pitch2')).toEqual([{ src: 'lfo', dst: 'pitch2', amt: -24 }]);
    expect(routesTo(p.routes, 'pitch3')).toEqual([{ src: 'lfo', dst: 'pitch3', amt: -24 }]);
  });

  it('sends a shape route to the pulse width, the triangle’s or wavetable’s morph, and nowhere for the others', () => {
    const shape = (wave: string) => run({ 'osc1.wave': wave, 'osc1.shapeMod': 5 }).routes;
    expect(routesTo(shape('pulse'), 'pw1')).toEqual([{ src: 'lfo', dst: 'pw1', amt: 0.45 }]);
    expect(routesTo(shape('triangle'), 'wave1')).toEqual([{ src: 'lfo', dst: 'wave1', amt: 0.25 }]);
    expect(routesTo(shape('wavetable'), 'wave1')).toEqual([{ src: 'lfo', dst: 'wave1', amt: 0.5 }]);
    for (const w of ['sine', 'organ', 'saw'])
      expect((shape(w) || []).filter((r) => r.dst === 'pw1' || r.dst === 'wave1')).toEqual([]);
  });

  it('moves the high-pass with the cutoff route where there is one, and widens Wide Band with the width route', () => {
    const bp = run({ 'vcf.mode': 'BP24', 'vcf.cutoffMod': 5, 'route.cutoff.source': 'env1' });
    expect(routesTo(bp.routes, 'cutoff')).toEqual([{ src: 'env1', dst: 'cutoff', amt: 6 }]);
    expect(routesTo(bp.routes, 'cutoffHp')).toEqual([{ src: 'env1', dst: 'cutoffHp', amt: 6 }]);
    const hp = run({ 'vcf.mode': 'HP24', 'vcf.cutoffMod': 5, 'route.cutoff.source': 'env1' });
    expect(routesTo(hp.routes, 'cutoff')).toEqual([]);
    expect(routesTo(hp.routes, 'cutoffHp')).toEqual([{ src: 'env1', dst: 'cutoffHp', amt: 6 }]);
    const wb = run({ 'vcf.mode': 'wide_band', 'vcf.widthMod': 5 });
    expect(routesTo(wb.routes, 'cutoff')).toEqual([{ src: 'lfo2', dst: 'cutoff', amt: 2 }]);
    expect(routesTo(wb.routes, 'cutoffHp')).toEqual([{ src: 'lfo2', dst: 'cutoffHp', amt: -2 }]);
    expect(routesTo(run({ 'vcf.widthMod': 5 }).routes, 'cutoff')).toEqual([]);
  });
});

describe('Mantis switches', () => {
  it('loops each envelope with its REPEAT', () => {
    const p = run({ 'env1.repeat': true, 'env2.repeat': true });
    expect(p.env1.loop).toBe(true);
    expect(p.env2.loop).toBe(true);
    expect(run({ 'env2.repeat': true }).env1.loop).toBeUndefined();
  });

  it('stops retriggering with ENV 1 LEGATO, and key-syncs each LFO with its KEYTRIG', () => {
    expect(run({ 'env1.legato': true }).trig.retrig).toBe(false);
    expect(run({ 'env2.legato': true }).trig.retrig).toBe(true);
    const p = run({ 'lfo1.keytrig': true, 'lfo2.keytrig': true });
    expect(p.lfo.keySync).toBe(true);
    expect(p.lfo2?.keySync).toBe(true);
  });

  it('maps each LFO wave', () => {
    const mix = (w: string) => run({ 'lfo1.wave': w, 'lfo2.wave': w });
    expect(mix('sine').lfo.mix).toEqual({ sine: 1 });
    expect(mix('saw_down').lfo2?.mix).toEqual({ rsaw: 1 });
    expect(mix('saw_up').lfo.mix).toEqual({ saw: 1 });
    expect(mix('square').lfo.mix).toEqual({ sq: 1 });
    expect(mix('sample_hold').lfo2?.mix).toEqual({ sh: 1 });
  });

  it('runs an LFO free, synced to a division of BPM, and treats one shot as free', () => {
    expect(run({ 'lfo1.rate': 10 }).lfo.rate).toBeCloseTo(50, 10);
    // RATE 10 synced is a 32nd: an eighth of a beat
    const bpm = exp(0.5, 40, 240);
    expect(run({ 'lfo1.sync': 'sync', 'lfo1.rate': 10 }).lfo.rate).toBeCloseTo(
      bpm / 60 / 0.125,
      10
    );
    expect(run({ 'lfo2.sync': 'one_shot' }).lfo2?.rate).toBeCloseTo(run().lfo2!.rate, 10);
  });

  it('fades an LFO in from FADE turned towards IN, and not at all towards OUT', () => {
    expect(run({ 'lfo1.fade': -5 }).lfo.delay).toBeCloseTo(8, 10);
    expect(run({ 'lfo1.fade': 5 }).lfo.delay).toBeUndefined();
  });

  it('plays Mono, Duophonic or Quad', () => {
    expect(run({ 'kbd.voicing': 'mono' }).poly).toEqual({ voices: 1, stack: 1, mono: true });
    expect(run({ 'kbd.voicing': 'duo' }).poly).toEqual({ voices: 2, stack: 1, mono: false });
  });

  it('runs the arpeggiator in each order, its range, its SYNC division and HOLD', () => {
    const mode = (m: string) => run({ 'arp.mode': m }).arp?.mode;
    expect(['up', 'down', 'updown1', 'updown2', 'play', 'random'].map(mode)).toEqual([
      'up',
      'down',
      'updown',
      'updown',
      'played',
      'random',
    ]);
    const p = run({ 'arp.on': true, 'arp.octaves': '6', 'arp.sync': 0, 'kbd.hold': true });
    expect(p.arp).toMatchObject({ on: true, octaves: 6, hold: true });
    // a half note per step is an eighth of the sixteenths' tempo
    expect(p.arp?.bpm).toBeCloseTo(exp(0.5, 40, 240) / 8, 10);
  });

  it('adds vibrato from the joystick pushed up', () => {
    expect(routesTo(run({ 'joy.y': 1 }).routes, 'pitchAll')).toEqual([
      { src: 'joyX', dst: 'pitchAll', amt: 2 },
      { src: 'lfo3', dst: 'pitchAll', amt: 0.5 },
    ]);
    expect(run({ 'joy.x': -0.5 }).joy).toEqual([-0.5, 0]);
  });

  it('runs the chorus then the reverb, by their levels, type and filters', () => {
    const p = run({
      'fx.chorusLevel': 10,
      'fx.chorusType': '4',
      'fx.reverbLevel': 10,
      'fx.reverbLpf': true,
      'fx.reverbHpf': true,
    });
    if (p.fx?.mode !== 'insert') throw new Error('expected the effects in');
    expect(p.fx.routing).toBe(1);
    const [chorus, reverb, ...rest] = p.fx.slots ?? [];
    expect(chorus).toMatchObject({ alg: 'chorus', p: { SPD: 3, WDL: 70, MIX: 60 } });
    expect(reverb).toMatchObject({
      alg: 'chamberrev',
      p: { MIX: 60, HC: 3500, LC: 400, DMP: 3000 },
    });
    expect(rest).toEqual([{ alg: null }, { alg: null }]);
    const dry = run({ 'fx.reverbLevel': 3 });
    if (dry.fx?.mode !== 'insert') throw new Error('expected the effects in');
    expect(dry.fx.slots?.[0]).toEqual({ alg: null });
    expect(dry.fx.slots?.[1]).toMatchObject({ p: { HC: 16000, LC: 40 } });
  });
});

describe('Mantis readouts', () => {
  it('prints the ranges the knobs set', () => {
    expect(readout('kbd.glide', 0)).toBe('off');
    expect(readout('arp.sync', 0)).toBe('1/2');
    expect(readout('arp.sync', 10)).toBe('1/32');
    expect(readout('vcf.width', 10)).toBe('4.0 oct');
    expect(readout('osc2.densityRate', 10)).toBe('50 cents');
    expect(readout('lfo1.fade', 0)).toBe('none');
    expect(readout('lfo1.fade', 5)).toBe('out');
  });
});

describe('Mantis panel', () => {
  it('tags every maker’s mark as the brand', () => {
    const marks = mantis.decor.filter(
      (d): d is TextDecor =>
        d.t === 'text' && ['PWM', 'MANTIS', 'HYBRID-ANALOGUE SYNTHESISER'].includes(d.text)
    );
    expect(marks).toHaveLength(3);
    for (const m of marks) expect(m.brand).toBe(true);
    expect(mantis.decor.filter((d) => d.t === 'text' && d.brand)).toHaveLength(3);
  });

  it('keeps every control inside the view and in an area', () => {
    const { w, h } = mantis.view;
    for (const c of mantis.controls) {
      expect(c.x, c.id).toBeGreaterThan(0);
      expect(c.x, c.id).toBeLessThan(w);
      expect(c.y, c.id).toBeGreaterThan(0);
      expect(c.y, c.id).toBeLessThan(h);
      const inArea = mantis.areas.some((a) =>
        (a.rects ?? []).some(
          (r) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h
        )
      );
      expect(inArea, c.id).toBe(true);
    }
  });
});
