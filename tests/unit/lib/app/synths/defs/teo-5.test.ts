/**
 * Oberheim TEO-5 definition tests: the panel → engine mapping at init and for each switch, the readouts, the maker's
 * mark and the areas.
 *
 * The TEO-5 has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except
 * its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip
 * shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/teo-5.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  FxSlot,
  TextDecor,
} from '@/lib/app/synths/contract';
import teo5 from '@/lib/app/synths/defs/teo-5';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}) => teo5.toEngine({ ...teo5.init, ...set }, CTX);

const control = (id: string): Control => {
  const c = teo5.controls.find((x) => x.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};
const readout = (id: string, v: number, values?: ControlValues): string => {
  const c = control(id);
  if (c.kind !== 'cont' || !c.fmt) throw new Error(`${id} has no continuous readout`);
  return c.fmt(v, values);
};
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
/** `level10` worked out: (v / 10)^1.7 × max. */
const level = (v: number, max: number) => Math.pow(v / 10, 1.7) * max;
/** The loaded effects, by slot. */
const slots = (set: ControlValues): FxSlot[] => run(set).fx?.slots ?? [];
const params = (s: FxSlot | undefined): Record<string, number | string> =>
  s && s.alg !== null ? s.p : {};

describe('TEO-5 toEngine at the init patch', () => {
  const p = run();

  it('sounds Oscillator 1’s sawtooth alone, at the key’s pitch', () => {
    expect(p.osc).toHaveLength(2);
    expect(p.osc[0]).toMatchObject({ mix: { saw: 1 }, pw: 0.5, semi: 0, kbd: true });
    expect(p.osc[0].level).toBeCloseTo(0.6, 10);
    expect(p.osc[0]).toMatchObject({ syncTo: -1, subLevel: 0 });
    expect(p.osc[1]).toMatchObject({ level: 0, mix: {}, syncTo: -1 });
    expect(p.noise).toEqual({ level: 0, color: 'white' });
  });

  it('runs the state-variable filter as a low-pass, Envelope 1 on it at no depth', () => {
    expect(p.filter).toMatchObject({
      type: 'svf',
      mode: 'morph',
      morph: 0,
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0.5,
    });
    expect(p.filter.cutoff).toBeCloseTo(exp(0.7, 20, 18000), 6);
  });

  it('runs the VCA from Envelope 2 at full AMOUNT, with no delay or repeat', () => {
    expect(p.vca).toEqual({ envSrc: 'env2', bias: 0, gain: 1 });
    expect(p.env2.a).toBeCloseTo(0.001, 10);
    expect(p.env2.d).toBeCloseTo(0.3, 10);
    expect(p.env2.s).toBe(1);
    expect(p.env1.s).toBe(0.5);
    expect(p.env1.dly).toBeUndefined();
    expect(p.env1.loop).toBeUndefined();
  });

  it('shares LFO 1 across the voices and gives LFO 2 to each', () => {
    expect(p.lfo).toMatchObject({ mix: { tri: 1 }, keySync: false, common: true });
    expect(p.lfo.rate).toBeCloseTo(Math.sqrt(0.022 * 500), 8);
    expect(p.lfo2?.common).toBeUndefined();
  });

  it('plays five voices with the arpeggiator, effects and overdrive off, and routes nothing', () => {
    expect(p.poly).toEqual({ voices: 5, stack: 1, mono: false, detune: 0 });
    expect(p.arp).toMatchObject({ on: false, bpm: 120, mode: 'up', octaves: 1, hold: false });
    expect(p.fx).toEqual({ mode: 'bypass' });
    expect(p.ringMod).toBeUndefined();
    expect(p.od).toEqual({ on: false });
    expect(p.glide).toEqual({ time: 0, legato: false });
    expect(p.drift).toEqual({ depth: 0, rate: 1.2 });
    expect(p.routes).toEqual([]);
    expect(p.tune).toBe(0);
    expect(p.oscOuts).toBe(false);
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
  });

  it('has a Default patch that only opens the filter', () => {
    expect(teo5.defaultPatch?.values).toEqual({ 'vcf.cutoff': 10 });
    expect(teo5.defaultPatch?.cables).toBeUndefined();
  });
});

describe('TEO-5 oscillators', () => {
  it('tunes by FREQUENCY in semitones from step 24, and Oscillator 2 by DETUNE in cents', () => {
    expect(run({ 'osc1.freq': 36 }).osc[0].semi).toBe(12);
    expect(run({ 'osc1.freq': 0 }).osc[0].semi).toBe(-24);
    expect(run({ 'osc2.freq': 31 }).osc[1].semi).toBe(7);
    expect(run({ 'osc2.detune': 5 }).osc[1].semi).toBeCloseTo(0.492, 10);
    expect(run({ 'osc2.detune': -2.5 }).osc[1].semi).toBeCloseTo(-0.246, 10);
  });

  it('sums whichever wave buttons are on, and is silent with none', () => {
    expect(run({ 'osc1.tri': true, 'osc1.pulse': true }).osc[0].mix).toEqual({
      tri: 1,
      saw: 1,
      pulse: 1,
    });
    expect(run({ 'osc1.saw': false }).osc[0].mix).toEqual({});
    expect(run({ 'osc2.pulse': true }).osc[1].mix).toEqual({ pulse: 1 });
  });

  it('narrows both pulses together with PULSE WIDTH', () => {
    const p = run({ 'osc.pw': 10 });
    expect(p.osc[0].pw).toBeCloseTo(0.03, 10);
    expect(p.osc[1].pw).toBeCloseTo(0.03, 10);
    expect(run({ 'osc.pw': 5 }).osc[0].pw).toBeCloseTo(0.265, 10);
  });

  it('holds an oscillator at one pitch with its Key On off', () => {
    expect(run({ 'osc2.key': 'off' }).osc[1]).toMatchObject({ kbd: false, fixedNote: 60 });
    expect(run({ 'osc1.key': 'off' }).osc[0]).toMatchObject({ kbd: false, fixedNote: 60 });
  });

  it('syncs Oscillator 1 to Oscillator 2', () => {
    expect(run({ 'osc1.sync': true }).osc[0].syncTo).toBe(1);
  });

  it('sends Oscillator 2’s triangle to Oscillator 1’s pitch with X-MOD, squared', () => {
    expect(run({ 'osc.xmod': 5 }).routes).toEqual([{ src: 'o2tri', dst: 'pitch1', amt: 6 }]);
    expect(run({ 'osc.xmod': 10 }).routes).toEqual([{ src: 'o2tri', dst: 'pitch1', amt: 24 }]);
    // the separate waveform outputs are filled only while X-MOD reads one of them
    expect(run({ 'osc.xmod': 5 }).oscOuts).toBe(true);
  });
});

describe('TEO-5 mixer', () => {
  it('hears each channel only while its button is on, at its level on the display', () => {
    expect(run({ 'mix.osc1': false }).osc[0].level).toBe(0);
    expect(run({ 'mix.osc1Lvl': 5 }).osc[0].level).toBeCloseTo(0.3, 10);
    expect(run({ 'mix.osc2Lvl': 5 }).osc[1].level).toBe(0);
    expect(run({ 'mix.osc2': true }).osc[1].level).toBeCloseTo(0.6, 10);
    expect(run({ 'mix.sub': true, 'mix.subLvl': 5 }).osc[0].subLevel).toBeCloseTo(0.3, 10);
  });

  it('mixes white or pink noise', () => {
    expect(run({ 'mix.noise': true, 'noise.type': 'pink' }).noise).toEqual({
      level: 0.6,
      color: 'pink',
    });
    expect(run({ 'mix.noise': true, 'mix.noiseLvl': 2.5 }).noise.level).toBeCloseTo(0.15, 10);
  });

  it('sends Oscillator 2 past the filter to the VCA with Filter Bypass on', () => {
    const p = run({ 'mix.osc2': true, 'osc2.bypass': 'on' });
    expect(p.osc[1].level).toBe(0);
    expect(p.routes).toEqual([{ src: 'osc2', dst: 'vcaIn', amt: 0.6 }]);
    expect(run({ 'osc2.bypass': 'on' }).routes).toEqual([]);
  });
});

describe('TEO-5 filter', () => {
  it('sweeps STATE from low-pass through the notch to high-pass', () => {
    expect(run({ 'vcf.state': 5 }).filter).toMatchObject({ mode: 'morph', morph: 0.5 });
    expect(run({ 'vcf.state': 10 }).filter).toMatchObject({ mode: 'morph', morph: 1 });
  });

  it('steps STATE through low-pass, band-pass and high-pass with Bandpass on', () => {
    const at = (s: number) => run({ 'vcf.bp': 'on', 'vcf.state': s }).filter;
    expect(at(2).mode).toBe('lp');
    expect(at(5).mode).toBe('bp');
    expect(at(8).mode).toBe('hp');
    expect(at(5).morph).toBeUndefined();
  });

  it('stops RESONANCE short of self-oscillation, and tracks the keys by Key Amt', () => {
    expect(run({ 'vcf.resonance': 10 }).filter.res).toBeCloseTo(0.95, 10);
    expect(run({ 'vcf.key': 10 }).filter.kbd).toBe(1);
    expect(run({ 'vcf.key': 0 }).filter.kbd).toBe(0);
  });
});

describe('TEO-5 envelopes', () => {
  it('first routing: Envelope 1 to the filter by its AMOUNT, Envelope 2 to the VCA', () => {
    const p = run({ 'env1.amount': -2.5, 'env1.vel': true, 'env2.vel': true });
    expect(p.filter).toMatchObject({ envSrc: 'env1v', envAmt: -3.5 });
    expect(p.vca).toEqual({ envSrc: 'env2v', bias: 0, gain: 1 });
  });

  it('second: Envelope 2 to the filter and the VCA, Envelope 1 to its Aux destination', () => {
    const p = run({
      'env.routing': 'aux-filteramp',
      'env1.amount': 5,
      'env1.dest': 'cutoff',
      'env2.amount': 2.5,
    });
    expect(p.filter).toMatchObject({ envSrc: 'env2', envAmt: 3.5 });
    expect(p.vca).toEqual({ envSrc: 'env2', bias: 0, gain: 0.5 });
    expect(p.routes).toEqual([{ src: 'env1', dst: 'cutoff', amt: 5 }]);
    expect(run({ 'env1.amount': 5, 'env1.dest': 'cutoff' }).routes).toEqual([]);
  });

  it('third: the VCA opens on the gate, and Envelope 2 has only the filter', () => {
    const p = run({ 'env.routing': 'aux-filtergate', 'env2.amount': -5 });
    expect(p.vca).toEqual({ envSrc: 'none', bias: 0 });
    expect(p.routes).toEqual([{ src: 'gate', dst: 'amp', amt: 1 }]);
    expect(p.filter.envAmt).toBe(-7);
  });

  it('keeps the VCA shut below the centre of Envelope 2 AMOUNT', () => {
    expect(run({ 'env2.amount': -3 }).vca.gain).toBe(0);
  });

  it('waits by each envelope’s delay, and loops the ones Repeat names', () => {
    const p = run({ 'env1.delay': 5, 'env.repeat': 'env2' });
    expect(p.env1.dly).toBeCloseTo(0.3, 10);
    expect(p.env1.loop).toBeUndefined();
    expect(p.env2.loop).toBe(true);
    const both = run({ 'env.repeat': 'both' });
    expect([both.env1.loop, both.env2.loop]).toEqual([true, true]);
  });
});

describe('TEO-5 LFOs', () => {
  it('sends LFO 1 and LFO 2 to their destinations by AMOUNT, either way', () => {
    const p = run({ 'lfo1.amt': 2.5, 'lfo1.dest': 'osc-all', 'lfo2.amt': -5, 'lfo2.dest': 'res' });
    // pitch is ±12 semitones at full, squared: half way is 3
    expect(p.routes).toEqual([
      { src: 'lfo', dst: 'pitch1', amt: 3 },
      { src: 'lfo', dst: 'pitch2', amt: 3 },
      { src: 'lfo2', dst: 'res', amt: -0.6 },
    ]);
    expect(run({ 'lfo2.amt': 5, 'lfo2.dest': 'pw-all' }).routes).toEqual([
      { src: 'lfo2', dst: 'pw1', amt: 0.45 },
      { src: 'lfo2', dst: 'pw2', amt: 0.45 },
    ]);
    expect(run({ 'lfo2.amt': 5 }).routes).toEqual([{ src: 'lfo2', dst: 'cutoff', amt: 5 }]);
    expect(run({ 'lfo1.amt': 5, 'lfo1.dest': 'none' }).routes).toEqual([]);
  });

  it('sets each LFO’s speed, 0.022 to 500 Hz, and shape', () => {
    const p = run({ 'lfo1.freq': 10, 'lfo1.shape': 'sh', 'lfo2.freq': 0, 'lfo2.shape': 'rsaw' });
    expect(p.lfo.rate).toBeCloseTo(500, 6);
    expect(p.lfo.mix).toEqual({ sh: 1 });
    expect(p.lfo2?.rate).toBeCloseTo(0.022, 10);
    expect(p.lfo2?.mix).toEqual({ rsaw: 1 });
  });
});

describe('TEO-5 voices, clock and arpeggiator', () => {
  it('stacks the unison voices with their detune', () => {
    expect(run({ 'voice.unison': true }).poly).toEqual({
      voices: 5,
      stack: 5,
      mono: true,
      detune: 0.08,
    });
    expect(
      run({ 'voice.unison': true, 'voice.uniVoices': '3', 'voice.uniDetune': '0' }).poly
    ).toEqual({ voices: 5, stack: 3, mono: true, detune: 0 });
  });

  it('glides by RATE only while PORTAMENTO is on', () => {
    expect(run({ 'glide.time': 5 }).glide.time).toBe(0);
    expect(run({ 'glide.on': true, 'glide.time': 5 }).glide.time).toBeCloseTo(1, 10);
  });

  it('moves the keyboard by OCTAVE', () => {
    expect(run({ 'kbd.octave': '+2' }).tune).toBe(24);
    expect(run({ 'kbd.octave': '-1' }).tune).toBe(-12);
  });

  it('steps the arpeggiator at the CLK DIVIDE note value', () => {
    expect(run({ 'arp.on': true, 'clock.bpm': 100, 'clock.div': '1/8' }).arp).toMatchObject({
      on: true,
      bpm: 50,
    });
    expect(run({ 'clock.bpm': 90, 'clock.div': '1/16T' }).arp?.bpm).toBeCloseTo(135, 10);
    expect(run({ 'arp.mode': 'assign', 'arp.octave': '3' }).arp).toMatchObject({
      mode: 'played',
      octaves: 3,
    });
  });

  it('lets VINTAGE drift the voices and OVERDRIVE drive them', () => {
    expect(run({ 'voice.vintage': 10 }).drift).toEqual({ depth: 0.3, rate: 1.2 });
    expect(run({ 'drive.amount': 6 }).od).toEqual({ on: true, drive: 0.6, tone: 0.5, level: 0.8 });
  });
});

describe('TEO-5 effect and reverb', () => {
  it('loads the effect in slot 1 and the reverb in slot 2, in a row', () => {
    expect(run({ 'fx.on': true, 'rev.on': true }).fx).toMatchObject({ mode: 'insert', routing: 1 });
    expect(slots({ 'fx.on': true, 'rev.on': true }).map((s) => s.alg)).toEqual([
      'delay',
      'platerev',
      null,
      null,
    ]);
    expect(slots({ 'rev.on': true }).map((s) => s.alg)).toEqual([null, 'platerev', null, null]);
  });

  it('maps a delay’s TIME, DEPTH/MIX and FBACK/MISC, darker for the BBD', () => {
    const set = { 'fx.on': true, 'fx.time': 10, 'fx.mix': 5, 'fx.misc': 10 };
    expect(params(slots({ ...set, 'fx.type': 'delay' })[0])).toMatchObject({
      TIM: 1000,
      MIX: 50,
      FBL: 90,
      FBR: 90,
      HC: 12000,
    });
    expect(params(slots({ ...set, 'fx.type': 'bbd' })[0])).toMatchObject({ TIM: 800, HC: 4000 });
  });

  it('takes the nearest algorithm for each other effect', () => {
    const at = (type: string) =>
      slots({ 'fx.on': true, 'fx.type': type, 'fx.time': 10, 'fx.mix': 10, 'fx.misc': 0 })[0];
    expect(at('tape2')).toMatchObject({ alg: 't-raydelay', p: { DLY: 100, WOB: 60, SUS: 0 } });
    expect(at('chorus')).toMatchObject({ alg: 'chorus', p: { SPD: 5, WDL: 100, HC: 1500 } });
    expect(at('flanger')).toMatchObject({ alg: 'flanger', p: { FD: 0 } });
    expect(at('phaser')).toMatchObject({ alg: 'phaser', p: { DEP: 100, RES: 0 } });
    expect(at('hpf')).toMatchObject({ alg: 'moodfilter', p: { TYP: 'HP', FRQ: 8000, DEP: 0 } });
    expect(at('dist')).toMatchObject({ alg: 'mulbnddist', p: { IPG: 24, OPG: 0, HBL: -12 } });
    expect(at('rotary')).toMatchObject({ alg: 'rotaryspkr', p: { SPD: 'FAST', DIS: 0 } });
    expect(at('lofi')).toMatchObject({
      alg: 'decimdelay',
      p: { TIM: 1, FBL: 0, MIX: 100, DSM: 100, BRC: 24 },
    });
  });

  it('runs the ring modulator on the voice sum, not in an effects slot', () => {
    const p = run({ 'fx.on': true, 'fx.type': 'ring', 'fx.time': 5, 'fx.mix': 10 });
    expect(p.fx).toEqual({ mode: 'bypass' });
    expect(p.ringMod?.hz).toBeCloseTo(200, 8);
    expect(p.ringMod?.depth).toBe(1);
    expect(p.ringMod?.env.amt).toBe(0);
    expect(run({ 'fx.type': 'ring' }).ringMod).toBeUndefined();
  });

  it('maps the reverb’s knobs, with TONE cutting treble one way and bass the other', () => {
    const p = params(
      slots({
        'rev.on': true,
        'rev.mix': 10,
        'rev.size': 10,
        'rev.predelay': 5,
        'rev.decay': 10,
        'rev.tone': -5,
      })[1]
    );
    expect(p).toMatchObject({ MIX: 100, SIZ: 200, PD: 100, DCY: 10, HC: 1500, LC: 10 });
    expect(params(slots({ 'rev.on': true, 'rev.tone': 5 })[1])).toMatchObject({
      HC: 20000,
      LC: 500,
    });
  });
});

describe('TEO-5 panel modes', () => {
  it('ignores the controls that only change what the panel shows, or are not modelled', () => {
    const base = run();
    const modes = teo5.controls.filter((c) => c.ui);
    expect(modes.length).toBeGreaterThan(20);
    const flipped: ControlValues = {};
    for (const c of modes)
      flipped[c.id] =
        c.kind === 'bool' ? true : c.kind === 'cont' ? c.max : c.options[c.options.length - 1].v;
    expect(run(flipped)).toEqual(base);
  });

  it('hands HOLD, RECORD and PLAY to the page', () => {
    expect(teo5.seqButtons).toEqual({
      'seq.record': 'record',
      'seq.play': 'run',
      'kbd.hold': 'hold',
    });
    expect(teo5.tempo).toBe('clock.bpm');
  });

  it('puts every display row on a page PROGRAM steps to', () => {
    const page = control('ui.page');
    if (page.kind !== 'enum') throw new Error('ui.page is not an enum');
    const pages = page.options.map((o) => o.v);
    const menus = teo5.controls.filter((c) => c.type === 'menu');
    expect(menus.length).toBeGreaterThan(15);
    for (const m of menus) {
      expect(m.show && 'eq' in m.show ? m.show.id : null, m.id).toBe('ui.page');
      expect(pages, m.id).toContain(m.show && 'eq' in m.show ? m.show.eq : null);
    }
  });
});

describe('TEO-5 readouts', () => {
  it('reads FREQUENCY, DETUNE, PULSE WIDTH, STATE and the envelope times', () => {
    expect(readout('osc1.freq', 24)).toBe('0 st');
    expect(readout('osc1.freq', 36)).toBe('+12 st');
    expect(readout('osc2.detune', 5)).toBe('+49.2 cents');
    expect(readout('osc2.detune', 0)).toBe('0.0 cents');
    expect(readout('osc.pw', 0)).toBe('50 %');
    expect(readout('osc.pw', 10)).toBe('97 %');
    expect(readout('vcf.state', 0)).toBe('low-pass');
    expect(readout('vcf.state', 5)).toBe('notch');
    expect(readout('vcf.state', 10)).toBe('high-pass');
    // with Bandpass on, the readout names filterMode()'s three steps
    const bp: ControlValues = { 'vcf.bp': 'on' };
    expect(readout('vcf.state', 2, bp)).toBe('low-pass');
    expect(readout('vcf.state', 5, bp)).toBe('band-pass');
    expect(readout('vcf.state', 8, bp)).toBe('high-pass');
    expect(readout('vcf.cutoff', 0)).toMatch(/20 ?Hz/);
    expect(readout('env1.attack', 0)).toMatch(/1 ?ms/);
    expect(readout('env1.release', 10)).toMatch(/20 ?s/);
    expect(readout('lfo1.freq', 10)).toBe('500 Hz');
  });
});

describe('TEO-5 panel', () => {
  it('tags the maker’s mark as brand, and nothing else', () => {
    const brand = teo5.decor.filter((d) => d.brand);
    const texts = brand.filter((d): d is TextDecor => d.t === 'text').map((d) => d.text);
    expect(texts).toEqual(['TEO-5']);
    expect(brand).toHaveLength(1);
    const unbranded = teo5.decor.filter(
      (d): d is TextDecor => d.t === 'text' && !d.brand && /oberheim|teo-5/i.test(d.text)
    );
    expect(unbranded).toEqual([]);
  });

  it('puts every control in exactly one area, inside the view', () => {
    expect(teo5.controls.length).toBeGreaterThan(90);
    for (const p of teo5.controls) {
      const at = (teo5.areas ?? []).filter((a) =>
        a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
      );
      expect(
        at.map((a) => a.id),
        p.id
      ).toHaveLength(1);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(teo5.view.w);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(teo5.view.h);
    }
  });

  it('starts every control at its default', () => {
    for (const c of teo5.controls) expect(teo5.init[c.id], c.id).toBe(c.def);
  });
});

describe('TEO-5 cases the init patch does not reach', () => {
  const enumReadout = (id: string, v: string): string => {
    const c = control(id);
    if (c.kind !== 'enum' || !c.fmt) throw new Error(`${id} has no enum readout`);
    return c.fmt(v);
  };

  it('reads the enum knobs in words', () => {
    expect(enumReadout('arp.octave', '1')).toBe('1 octave');
    expect(enumReadout('arp.octave', '3')).toBe('3 octaves');
    expect(enumReadout('arp.mode', 'updown')).toBe('Up+Down');
    expect(enumReadout('arp.repeat', '0')).toBe('off');
    expect(enumReadout('arp.repeat', '2')).toBe('×3');
    expect(enumReadout('fx.type', 'lofi')).toBe('Lo-fi');
    expect(enumReadout('clock.div', '1/8T')).toBe('1/8T');
  });

  it('sends Envelope 1 as Aux with velocity, and Envelope 2 with velocity to the filter', () => {
    const p = run({
      'env.routing': 'aux-filteramp',
      'env1.vel': true,
      'env2.vel': true,
      'env1.amount': 5,
      'env1.dest': 'osc2',
    });
    expect(p.routes).toEqual([{ src: 'env1v', dst: 'pitch2', amt: 12 }]);
    expect(p.filter.envSrc).toBe('env2v');
    expect(run({ 'lfo1.amt': 5, 'lfo1.dest': 'osc1' }).routes).toEqual([
      { src: 'lfo', dst: 'pitch1', amt: 12 },
    ]);
  });

  it('colours the tape delays apart and slows the rotor below half TIME', () => {
    const tape1 = slots({ 'fx.on': true, 'fx.type': 'tape1' })[0];
    expect(tape1).toMatchObject({ alg: 't-raydelay', p: { WOB: 25, TON: 60 } });
    const slow = slots({ 'fx.on': true, 'fx.type': 'rotary', 'fx.time': 2 })[0];
    expect(slow).toMatchObject({ alg: 'rotaryspkr', p: { SPD: 'SLOW' } });
  });

  it('falls back to its defaults for values a sound could not hold', () => {
    const p = teo5.toEngine(
      {
        ...teo5.init,
        'voice.unison': true,
        'voice.uniVoices': 'x',
        'clock.div': 'x',
        'lfo1.shape': 'x',
        'lfo2.shape': 'x',
        'arp.mode': 'x',
        'arp.octave': 'x',
        'kbd.octave': 'x',
      },
      CTX
    );
    expect(p.poly?.stack).toBe(5);
    expect(p.arp).toMatchObject({ bpm: 120, mode: 'up', octaves: 1 });
    expect(p.lfo.mix).toEqual({ tri: 1 });
    expect(p.lfo2?.mix).toEqual({ tri: 1 });
    const { 'kbd.octave': _drop, ...rest } = teo5.init;
    expect(teo5.toEngine(rest, CTX).tune).toBe(0);
  });
});
