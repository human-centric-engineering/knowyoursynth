/**
 * Dreadbox Nymphes definition tests: the panel → engine mapping at init and for each switch, the pages the sliders
 * change with, the readouts and the maker's marks.
 *
 * The Nymphes has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except
 * its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip
 * shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/nymphes.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  ShowCondition,
  TextDecor,
} from '@/lib/app/synths/contract';
import nymphes, { waveMix } from '@/lib/app/synths/defs/nymphes';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}) => nymphes.toEngine({ ...nymphes.init, ...set }, CTX);

const control = (id: string): Control => {
  const c = nymphes.controls.find((x) => x.id === id);
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

/** Whether a control shows for this page and SHIFT state. */
const shows = (c: Control, page: string, shift: boolean): boolean => {
  const conds: ShowCondition[] = c.show ? (Array.isArray(c.show) ? c.show : [c.show]) : [];
  const values: ControlValues = { 'ui.page': page, 'ui.shift': shift };
  return conds.every((s) => ('eq' in s ? values[s.id] === s.eq : s.in.includes(values[s.id])));
};
/** The control showing on a slider (by its x) for a page and SHIFT state. */
const onSlider = (x: number, page: string, shift: boolean): string[] =>
  nymphes.controls
    .filter((c) => c.type === 'fader' && c.x === x && shows(c, page, shift))
    .map((c) => c.id);

describe('Nymphes toEngine at the init patch', () => {
  const p = run();

  it('sounds the oscillator’s sawtooth alone at full LVL, at the key’s pitch', () => {
    expect(p.osc).toHaveLength(1);
    expect(p.osc[0]).toMatchObject({
      mix: { saw: 1, pulse: 0, tri: 0 },
      pw: 0.5,
      semi: 0,
      kbd: true,
      syncTo: -1,
      subLevel: 0,
    });
    expect(p.osc[0].level).toBeCloseTo(0.5, 10);
    expect(p.noise).toEqual({ level: 0, color: 'white' });
  });

  it('opens the 24 dB ladder low-pass fully, with no resonance, envelope or tracking', () => {
    expect(p.filter).toMatchObject({
      type: 'ladder',
      mode: 'lp',
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    });
    expect(p.filter.cutoff).toBeCloseTo(16744, 6);
  });

  it('runs the VCA from the amp envelope at full sustain, the filter envelope beside it', () => {
    expect(p.vca).toEqual({ envSrc: 'env2', bias: 0 });
    expect(p.env2.a).toBeCloseTo(0.001, 10);
    expect(p.env2.s).toBe(1);
    expect(p.env1.s).toBe(0.5);
  });

  it('plays six voices one per note, with the high-pass out of the way and the reverb bypassed', () => {
    expect(p.poly).toEqual({ voices: 6, stack: 1, mono: false, detune: 0 });
    expect(p.post).toEqual({ hpf: 20, boost: false });
    expect(p.fx).toEqual({ mode: 'bypass' });
    expect(p.glide).toEqual({ time: 0, legato: false });
    expect(p.volume).toBeCloseTo(level(8, 1), 10);
  });

  it('routes nothing, with LFO 1 key-synced in each voice and LFO 2 shared', () => {
    expect(p.routes).toEqual([]);
    expect(p.lfo).toMatchObject({ mix: { tri: 1 }, keySync: true });
    expect(p.lfo.delay).toBeUndefined();
    expect(p.lfo.rate).toBeCloseTo(Math.sqrt(0.03 * 30), 8);
    expect(p.lfo2).toMatchObject({ mix: { tri: 1 }, common: true });
    expect(p.lfo2?.rate).toBeCloseTo(exp(0.4, 0.03, 30), 8);
  });

  it('needs no Default patch: init is already the plain sawtooth', () => {
    expect(nymphes.defaultPatch).toBeUndefined();
  });
});

describe('Nymphes oscillator and mixer', () => {
  it('morphs WAVE from sawtooth through square to triangle', () => {
    expect(waveMix(0)).toEqual({ saw: 1, pulse: 0, tri: 0 });
    expect(waveMix(2.5)).toEqual({ saw: 0.5, pulse: 0.5, tri: 0 });
    expect(waveMix(5)).toEqual({ saw: 0, pulse: 1, tri: 0 });
    expect(waveMix(7.5)).toEqual({ saw: 0, pulse: 0.5, tri: 0.5 });
    expect(waveMix(10)).toEqual({ saw: 0, pulse: 0, tri: 1 });
    expect(run({ 'osc.wave': 10 }).osc[0].mix).toEqual({ saw: 0, pulse: 0, tri: 1 });
  });

  it('narrows the pulse from square to 5 % with PW', () => {
    expect(run({ 'osc.pw': 10 }).osc[0].pw).toBeCloseTo(0.05, 10);
    expect(run({ 'osc.pw': 5 }).osc[0].pw).toBeCloseTo(0.275, 10);
  });

  it('mixes LVL, SUB and NOISE on their curves, each silent at zero', () => {
    const p = run({ 'osc.level': 5, 'osc.sub': 6, 'noise.level': 4 });
    expect(p.osc[0].level).toBeCloseTo(level(5, 0.5), 10);
    expect(p.osc[0].subLevel).toBeCloseTo(level(6, 0.5), 10);
    expect(p.noise.level).toBeCloseTo(level(4, 0.6), 10);
    expect(run({ 'osc.level': 0 }).osc[0].level).toBe(0);
  });

  it('sends LFO 1 and the filter envelope to the pitch, squared', () => {
    const p = run({ 'lfo1.pitch': 5, 'env1.pitch': 10 });
    expect(p.routes).toEqual([
      { src: 'lfo', dst: 'pitchAll', amt: 3 },
      { src: 'env1', dst: 'pitchAll', amt: 24 },
    ]);
  });
});

describe('Nymphes filters', () => {
  it('sweeps CUT from 32.7 Hz to 16.7 kHz and the high-pass from 20 Hz to 2 kHz', () => {
    expect(run({ 'vcf.cutoff': 0 }).filter.cutoff).toBeCloseTo(32.7, 6);
    expect(run({ 'vcf.cutoff': 5 }).filter.cutoff).toBeCloseTo(exp(0.5, 32.7, 16744), 6);
    expect(run({ 'hpf.cutoff': 10 }).post?.hpf).toBeCloseTo(2000, 6);
  });

  it('self-oscillates at full RES, tracks 1:1 at full TRACK and opens by EG in octaves', () => {
    const p = run({ 'vcf.res': 10, 'vcf.track': 10, 'vcf.env': 5 });
    expect(p.filter.res).toBeCloseTo(1.1, 10);
    expect(p.filter.kbd).toBe(1);
    expect(p.filter.envAmt).toBeCloseTo(3.5, 10);
  });

  it('sends LFO 1 to the cutoff by the shifted LFO slider', () => {
    expect(run({ 'vcf.lfo': 5 }).routes).toEqual([{ src: 'lfo', dst: 'cutoff', amt: 2 }]);
  });
});

describe('Nymphes envelopes', () => {
  it('maps both ADSRs’ times on the same curve and sustain as a fraction', () => {
    const p = run({
      'env1.attack': 5,
      'env1.decay': 2.5,
      'env1.release': 7.5,
      'env2.attack': 10,
      'env2.sustain': 3,
    });
    expect(p.env1.a).toBeCloseTo(0.3, 10);
    expect(p.env1.d).toBeCloseTo(0.03, 10);
    expect(p.env1.r).toBeCloseTo(2.5, 10);
    expect(p.env2.a).toBeCloseTo(15, 10);
    expect(p.env2.s).toBeCloseTo(0.3, 10);
  });
});

describe('Nymphes LFOs', () => {
  it('picks each of the five shapes by WAVE', () => {
    expect([0, 1, 2, 3, 4].map((w) => run({ 'lfo1.wave': w }).lfo.mix)).toEqual([
      { tri: 1 },
      { rsaw: 1 },
      { saw: 1 },
      { sq: 1 },
      { sh: 1 },
    ]);
    expect(run({ 'lfo2.wave': 3 }).lfo2?.mix).toEqual({ sq: 1 });
  });

  it('runs LOW, TRACK and BPM on the low range and HIGH on the high one', () => {
    expect(run({ 'lfo1.rate': 10, 'lfo1.type': 0 }).lfo.rate).toBeCloseTo(30, 6);
    expect(run({ 'lfo1.rate': 10, 'lfo1.type': 1 }).lfo.rate).toBeCloseTo(1000, 6);
    expect(run({ 'lfo1.rate': 10, 'lfo1.type': 2 }).lfo.rate).toBeCloseTo(30, 6);
    expect(run({ 'lfo1.rate': 10, 'lfo1.type': 3 }).lfo.rate).toBeCloseTo(30, 6);
    expect(run({ 'lfo2.rate': 0, 'lfo2.type': 1 }).lfo2?.rate).toBeCloseTo(1, 6);
  });

  it('holds LFO 1 off after each note by DELAY, and frees it with KEY SYNC off', () => {
    expect(run({ 'lfo1.delay': 5 }).lfo.delay).toBeCloseTo(1.25, 10);
    expect(run({ 'lfo2.delay': 10 }).lfo2?.delay).toBeCloseTo(5, 10);
    expect(run({ 'lfo1.sync': 0 }).lfo.keySync).toBe(false);
  });

  it('sends LFO 2 to PW, LVL, NOISE, CUT and RES by their depths', () => {
    const p = run({
      'lfo2.pw': 10,
      'lfo2.level': 10,
      'lfo2.noise': 10,
      'lfo2.cutoff': 5,
      'lfo2.res': 5,
    });
    expect(p.routes).toEqual([
      { src: 'lfo2', dst: 'pw1', amt: 0.45 },
      { src: 'lfo2', dst: 'lvl1', amt: 0.5 },
      { src: 'lfo2', dst: 'noiseLvl', amt: 0.6 },
      { src: 'lfo2', dst: 'cutoff', amt: 2.5 },
      { src: 'lfo2', dst: 'res', amt: 0.5 },
    ]);
  });

  it('ignores FADE, which the engine has no stage for', () => {
    expect(run({ 'lfo1.fade': 10, 'lfo2.fade': 10 })).toEqual(run());
  });
});

describe('Nymphes play modes, glide and chords', () => {
  it('stacks the six voices per mode', () => {
    const shape = (mode: string) => {
      const p = run({ 'voice.mode': mode }).poly;
      return [p?.stack, p?.mono];
    };
    expect(shape('poly')).toEqual([1, false]);
    expect(shape('uniA')).toEqual([6, true]);
    expect(shape('uniB')).toEqual([4, true]);
    expect(shape('tri')).toEqual([2, false]);
    expect(shape('duo')).toEqual([3, false]);
    expect(shape('mono')).toEqual([1, true]);
  });

  it('spreads stacked voices by DTN and glides by GLD, legato with LEGATO on', () => {
    const p = run({ 'voice.detune': 5, 'glide.time': 5, 'glide.legato': 1 });
    expect(p.poly?.detune).toBeCloseTo(0.3, 10);
    expect(p.glide).toEqual({ time: 0.5, legato: true });
  });

  it('ignores CHORD, whose chords the spec does not give', () => {
    expect(run({ 'voice.chord': 10, 'voice.mode': 'uniA' })).toEqual(run({ 'voice.mode': 'uniA' }));
  });
});

describe('Nymphes reverb', () => {
  it('loads the hall in slot 1 once MIX is up, with SIZE, DEC, FILT and MIX mapped', () => {
    const fx = run({ 'rev.mix': 4, 'rev.size': 10, 'rev.decay': 10, 'rev.filter': 10 }).fx;
    expect(fx?.mode).toBe('insert');
    const slot = fx?.slots?.[0];
    expect(slot?.alg).toBe('hallrev');
    expect(slot && slot.alg !== null ? slot.p : {}).toMatchObject({
      MIX: 40,
      SIZ: 200,
      DCY: 4.9,
      HC: 800,
    });
    expect(fx?.slots?.slice(1)).toEqual([{ alg: null }, { alg: null }, { alg: null }]);
  });
});

describe('Nymphes panel modes', () => {
  it('ignores SHIFT, MENU, the rotary switch and SAVE / LOAD', () => {
    expect(
      run({ 'ui.shift': true, 'ui.page': 'reverb', 'ui.preset': '5', 'ui.save': true })
    ).toEqual(run());
    for (const id of ['ui.shift', 'ui.page', 'ui.preset', 'ui.save'])
      expect(control(id).ui).toBe(true);
  });

  it('shows one control per slider for each page and SHIFT state, or none where a page leaves it idle', () => {
    const SLIDER_1 = control('osc.wave').x;
    const SLIDER_2 = control('osc.level').x;
    const SLIDER_9 = control('env1.attack').x;
    const SLIDER_13 = control('lfo1.rate').x;
    expect(onSlider(SLIDER_1, 'none', false)).toEqual(['osc.wave']);
    expect(onSlider(SLIDER_1, 'none', true)).toEqual(['osc.pw']);
    expect(onSlider(SLIDER_1, 'lfo2', true)).toEqual(['lfo2.pw']);
    expect(onSlider(SLIDER_1, 'lfo2', false)).toEqual([]);
    expect(onSlider(SLIDER_1, 'reverb', false)).toEqual([]);
    expect(onSlider(SLIDER_2, 'mode', true)).toEqual(['glide.legato']);
    expect(onSlider(SLIDER_9, 'none', true)).toEqual(['env2.attack']);
    expect(onSlider(SLIDER_9, 'reverb', true)).toEqual(['rev.size']);
    expect(onSlider(SLIDER_13, 'none', false)).toEqual(['lfo1.rate']);
    expect(onSlider(SLIDER_13, 'lfo2', true)).toEqual(['lfo2.delay']);
    expect(onSlider(SLIDER_13, 'mode', true)).toEqual(['lfo2.type']);
  });

  it('shows the play mode only on the MODE page', () => {
    expect(shows(control('voice.mode'), 'mode', false)).toBe(true);
    expect(shows(control('voice.mode'), 'none', false)).toBe(false);
  });
});

describe('Nymphes readouts', () => {
  it('reads the wave, the cutoff, the LFO rate by its type and the switches', () => {
    expect(readout('osc.wave', 0)).toBe('sawtooth');
    expect(readout('osc.wave', 5)).toBe('square');
    expect(readout('osc.wave', 7)).toBe('square → triangle');
    expect(readout('vcf.cutoff', 0)).toBe('33 Hz');
    expect(readout('lfo1.wave', 4)).toBe('random');
    expect(readout('lfo1.type', 1)).toBe('HIGH');
    expect(readout('lfo1.rate', 10, { ...nymphes.init, 'lfo1.type': 1 })).toBe('1.0 kHz');
    expect(readout('glide.legato', 1)).toBe('on');
    expect(readout('voice.chord', 0)).toBe('off');
    expect(readout('voice.chord', 10)).toBe('chord 7');
  });
});

describe('Nymphes panel', () => {
  it('tags the NYMPHES wordmark and the dre:adbox logo as the maker’s marks, and nothing else', () => {
    const marks = nymphes.decor
      .filter((d): d is TextDecor => d.t === 'text' && d.brand === true)
      .map((d) => d.text);
    expect(marks).toEqual(['NYMPHES', 'dre:adbox']);
    expect(nymphes.decor.filter((d) => d.brand).length).toBe(2);
  });
});
