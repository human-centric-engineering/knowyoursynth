/**
 * GS Music e7 definition tests: the panel → engine mapping at the init patch and for each switch, the readouts, the
 * maker's marks and the SHIFT layer.
 *
 * The e7 has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except its
 * own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip shows
 * up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/e7.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  EngineRoute,
  FxSlot,
  TextDecor,
} from '@/lib/app/synths/contract';
import e7 from '@/lib/app/synths/defs/e7';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}, ctx: EngineContext = CTX) =>
  e7.toEngine({ ...e7.init, ...set }, ctx);
const routes = (set: ControlValues, ctx?: EngineContext): EngineRoute[] =>
  run(set, ctx).routes ?? [];

const control = (id: string): Control => {
  const c = e7.controls.find((x) => x.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};
const readout = (id: string, v: number | string): string => {
  const c = control(id);
  if (c.kind === 'cont' && c.fmt && typeof v === 'number') return c.fmt(v);
  if (c.kind === 'enum' && c.fmt) return c.fmt(v);
  throw new Error(`${id} has no readout`);
};
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
/** `level10` worked out: (v / 10)^1.7 × max. */
const level = (v: number, max: number) => Math.pow(v / 10, 1.7) * max;
const slots = (set: ControlValues): FxSlot[] => run(set).fx?.slots ?? [];
const params = (s: FxSlot | undefined): Record<string, number | string> =>
  s && s.alg !== null ? s.p : {};

describe('e7 toEngine at the init patch', () => {
  const p = run();

  it('sounds VCO 1 alone, a sawtooth at pitch with its pulse off', () => {
    expect(p.osc).toHaveLength(2);
    expect(p.osc[0]).toMatchObject({ mix: { saw: 1 }, pw: 0.5, semi: 0, kbd: true, syncTo: -1 });
    expect(p.osc[0].mix?.pulse).toBeUndefined();
    expect(p.osc[0].level).toBeCloseTo(0.35, 10);
    expect(p.osc[0].subLevel).toBe(0);
    expect(p.osc[1]).toMatchObject({ level: 0, subLevel: 0, syncTo: -1 });
    expect(p.noise.level).toBe(0);
  });

  it('opens the ladder from CUTOFF with no envelope, resonance or key tracking', () => {
    expect(p.filter).toMatchObject({ type: 'ladder', mode: 'lp', envSrc: 'env1', res: 0, kbd: 0 });
    expect(p.filter.envAmt).toBe(0);
    expect(p.filter.cutoff).toBeCloseTo(exp(0.7, 10, 25000), 6);
  });

  it('runs the VCA from EG 2 at full LEVEL', () => {
    expect(p.vca).toEqual({ envSrc: 'env2', bias: 0, gain: 1 });
    expect(p.env2).toMatchObject({ s: 1, kf: 0 });
    expect(p.env1.s).toBe(0.5);
  });

  it('runs LFO 2 as the engine’s first LFO and LFO 1 as its second, each per voice; LFO 3 is shared', () => {
    const hz = exp(0.5, 0.1, 100);
    expect(p.lfo).toEqual({ rate: hz, mix: { tri: 1 }, keySync: false, common: false });
    expect(p.lfo2).toEqual({ rate: hz, mix: { tri: 1 }, keySync: false, common: false });
    expect(p.lfo3).toEqual({ rate: hz, mix: { tri: 1 }, common: true });
  });

  it('plays seven voices with no glide, effects or routes', () => {
    expect(p.poly).toEqual({ voices: 7, stack: 1, mono: false, detune: 0 });
    expect(p.trig).toEqual({ retrig: true, drone: false, repeat: false });
    expect(p.glide).toEqual({ time: 0, legato: false });
    expect(p.fx).toEqual({ mode: 'bypass' });
    expect(p.routes).toEqual([]);
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
  });
});

describe('e7 oscillators and mixer', () => {
  it('steps the main wave, and NONE leaves only the pulse', () => {
    expect(run({ 'osc1.wave': 'tri' }).osc[0].mix).toEqual({ tri: 1 });
    expect(run({ 'osc1.wave': 'shark' }).osc[0].mix).toEqual({ shark: 1 });
    expect(run({ 'osc2.wave': 'off' }).osc[1].mix).toEqual({});
    expect(run({ 'osc2.wave': 'off', 'osc2.pulse': true }).osc[1].mix).toEqual({ pulse: 1 });
  });

  it('mixes the pulse in at the main wave’s level, its width 10–50 %', () => {
    const o = run({ 'osc1.pulse': true, 'osc1.pw': 0 }).osc[0];
    expect(o.mix).toEqual({ saw: 1, pulse: 1 });
    expect(o.pw).toBeCloseTo(0.1, 10);
    expect(readout('osc1.pw', 0)).toBe('10 %');
    expect(readout('osc1.pw', 10)).toBe('50 %');
  });

  it('tunes by TRANSPOSE in semitones and TUNE up to half a semitone', () => {
    expect(run({ 'osc2.transpose': 7, 'osc2.tune': -5 }).osc[1].semi).toBeCloseTo(6.5, 10);
    expect(readout('osc1.tune', 2.5)).toBe('+25 cents');
  });

  it('hard-syncs VCO 2 to VCO 1', () => {
    expect(run({ 'osc2.sync': true }).osc[1].syncTo).toBe(0);
  });

  it('sets each sub on its own channel, and the noise', () => {
    const p = run({ 'mix.sub1': 10, 'mix.sub2': 5, 'mix.noise': 10 });
    expect(p.osc[0].subLevel).toBeCloseTo(0.5, 10);
    expect(p.osc[1].subLevel).toBeCloseTo(0.25, 10);
    expect(p.noise.level).toBeCloseTo(0.8, 10);
  });

  it('routes the pitch and pulse-width depths from EG 1 and the LFOs', () => {
    expect(
      routes({
        'osc1.lfo1': 5,
        'osc1.lfo2': 10,
        'osc1.eg1': 5,
        'osc2.eg1pwm': 10,
        'osc2.lfo1pwm': 5,
      })
    ).toEqual([
      { src: 'lfo2', dst: 'pitch1', amt: 3 },
      { src: 'lfo', dst: 'pitch1', amt: 12 },
      { src: 'env1', dst: 'pitch1', amt: 6 },
      { src: 'env1', dst: 'pw2', amt: 0.4 },
      { src: 'lfo2', dst: 'pw2', amt: 0.1 },
    ]);
  });
});

describe('e7 filter and VCA', () => {
  it('splits EG1 MOD between EG 1 and its velocity-scaled copy by VELOCITY EG1 MOD', () => {
    const p = run({ 'vcf.eg1': 5, 'vcf.vel': 2.5 });
    expect(p.filter.envAmt).toBeCloseTo(3, 10);
    expect(p.routes).toEqual([{ src: 'env1v', dst: 'cutoff', amt: 1 }]);
  });

  it('routes the LFOs and the mod wheel to the cutoff, and tracks the key', () => {
    const p = run({ 'vcf.lfo1': 5, 'vcf.lfo2': 10, 'vcf.wheel': 5, 'vcf.kbd': 10, 'vcf.res': 10 });
    expect(p.routes).toEqual([
      { src: 'lfo2', dst: 'cutoff', amt: 1 },
      { src: 'lfo', dst: 'cutoff', amt: 4 },
      { src: 'wheel', dst: 'cutoff', amt: 2 },
    ]);
    expect(p.filter.kbd).toBe(1);
    expect(p.filter.res).toBeCloseTo(1.1, 10);
  });

  it('with VELOCITY EG2 MOD, opens the VCA by routes from EG 2 and its velocity-scaled copy', () => {
    const p = run({ 'vca.vel': 2.5, 'vca.level': 5 });
    expect(p.vca).toEqual({ envSrc: 'none', bias: 0, gain: level(5, 1) });
    expect(p.routes).toEqual([
      { src: 'env2', dst: 'amp', amt: 0.75 },
      { src: 'env2v', dst: 'amp', amt: 0.25 },
    ]);
  });

  it('rides the tremolo and key tracking on EG 2, so a released voice stays shut', () => {
    expect(routes({ 'vca.lfo1': 10, 'vca.lfo2': 5, 'vca.kbd': 10 })).toEqual([
      { src: 'lfo2', dst: 'amp', amt: 0.5, by: 'env2' },
      { src: 'lfo', dst: 'amp', amt: 0.25, by: 'env2' },
      { src: 'kbd', dst: 'amp', amt: 0.15, by: 'env2' },
    ]);
  });
});

describe('e7 LFO 3 and the mod wheel', () => {
  it('routes nothing from LFO 3 while its MOD WHEEL knob is at 0', () => {
    expect(
      routes({ 'osc1.lfo3': 10, 'vcf.lfo3': 10, 'vca.lfo3': 10 }, { wheel: 1, patched: {} })
    ).toEqual([]);
  });

  it('brings LFO 3 in by the wheel: pitch and cutoff through `by`, the VCA by the wheel’s position on EG 2', () => {
    const set = { 'lfo3.wheel': 10, 'osc2.lfo3': 5, 'vcf.lfo3': 10, 'vca.lfo3': 10 };
    expect(routes(set, { wheel: 0.5, patched: {} })).toEqual([
      { src: 'lfo3', dst: 'pitch2', amt: 3, by: 'wheel' },
      { src: 'lfo3', dst: 'cutoff', amt: 4, by: 'wheel' },
      { src: 'lfo3', dst: 'amp', amt: 0.25, by: 'env2' },
    ]);
  });

  it('takes LFO 3’s shape and rate, always shared by the voices', () => {
    expect(run({ 'lfo3.shape': 'sq', 'lfo3.rate': 10 }).lfo3).toEqual({
      rate: 100,
      mix: { sq: 1 },
      common: true,
    });
  });
});

describe('e7 LFO modes', () => {
  it('Monophonic shares one wave; Polyphonic runs one per voice', () => {
    expect(run({ 'lfo1.mode': 'mono' }).lfo2).toMatchObject({ common: true, keySync: false });
    expect(run({ 'lfo1.mode': 'poly' }).lfo2).toMatchObject({ common: false, keySync: false });
  });

  it('KB Sync restarts each voice’s LFO at its key', () => {
    expect(run({ 'lfo2.mode': 'kbsync' }).lfo).toMatchObject({ common: false, keySync: true });
  });

  it('the clock modes run at a note value of 120 BPM', () => {
    expect(run({ 'lfo2.mode': 'clock', 'lfo2.div': '1/8' }).lfo).toMatchObject({
      rate: 4,
      common: true,
      keySync: false,
    });
    expect(run({ 'lfo1.mode': 'kbclock', 'lfo1.div': '1/2.' }).lfo2).toMatchObject({
      rate: 2 / 3,
      common: false,
      keySync: true,
    });
    expect(readout('lfo1.div', '1/16T')).toBe('1/16 triplet');
  });

  it('KB Tracking follows the key on LFO 2’s rate', () => {
    expect(routes({ 'lfo2.mode': 'kbtrack' })).toEqual([{ src: 'kbd', dst: 'lfoRate', amt: 1 }]);
  });

  it('EG1 MOD moves LFO 2’s rate except in Monophonic and Clock Sync', () => {
    expect(routes({ 'lfo2.eg1': 5 })).toEqual([{ src: 'env1', dst: 'lfoRate', amt: 2 }]);
    expect(routes({ 'lfo2.eg1': 5, 'lfo2.mode': 'mono' })).toEqual([]);
    expect(routes({ 'lfo2.eg1': 5, 'lfo2.mode': 'clock' })).toEqual([]);
  });
});

describe('e7 voice modes and envelopes', () => {
  it('mono single trigger holds the envelopes over legato notes; multi trigger restarts them', () => {
    const st = run({ 'kbd.mode': 'mono-st' });
    expect(st.poly).toEqual({ voices: 7, stack: 1, mono: true, detune: 0 });
    expect(st.trig.retrig).toBe(false);
    expect(run({ 'kbd.mode': 'mono-mt' }).trig.retrig).toBe(true);
  });

  it('unison stacks all seven voices, detuned', () => {
    const p = run({ 'kbd.mode': 'uni-mt' });
    expect(p.poly).toEqual({ voices: 7, stack: 7, mono: true, detune: 0.15 });
    expect(p.trig.retrig).toBe(true);
    expect(run({ 'kbd.mode': 'uni-st' }).trig.retrig).toBe(false);
  });

  it('glides by PORTAMENTO TIME, up to five seconds', () => {
    expect(run({ 'kbd.porta': 10 }).glide).toEqual({ time: 5, legato: false });
    expect(readout('kbd.porta', 0)).toBe('off');
  });

  it('shortens the envelopes for higher notes by KEYBOARD TRACKING', () => {
    expect(run({ 'env1.kbd': 10 }).env1.kf).toBe(1);
  });
});

describe('e7 effects', () => {
  it('Basic is one chorus, Ensemble two, then the delay, all in a row', () => {
    const basic = slots({ 'chorus.mix': 5, 'chorus.depth': 5 });
    expect(run({ 'chorus.mix': 5 }).fx).toMatchObject({ mode: 'insert', routing: 1 });
    expect(basic.map((s) => s.alg)).toEqual(['chorus', null, null, null]);
    expect(params(basic[0])).toMatchObject({ MIX: 50, WDL: 50, WDR: 50 });
    const ens = slots({ 'chorus.mix': 5, 'chorus.type': 'ensemble', 'delay.mix': 5 });
    expect(ens.map((s) => s.alg)).toEqual(['chorus', 'chorus', 'delay', null]);
  });

  it('sets the delay free, 50 ms–1.35 s, or as a note value of 120 BPM, stereo or ping-pong', () => {
    expect(params(slots({ 'delay.mix': 10, 'delay.time': 0 })[2])).toMatchObject({
      TIM: 50,
      MOD: 'ST',
      MIX: 100,
    });
    expect(params(slots({ 'delay.mix': 10, 'delay.time': 10 })[2]).TIM).toBe(1350);
    expect(
      params(slots({ 'delay.mix': 5, 'delay.type': 'pingpong-sync', 'delay.div': '1/8.' })[2])
    ).toMatchObject({ TIM: 375, MOD: 'P-P' });
    expect(
      params(slots({ 'delay.mix': 5, 'delay.type': 'stereo-sync', 'delay.div': '1' })[2]).TIM
    ).toBe(1500);
  });

  it('turns each effect off with its MIX at 0', () => {
    expect(run({ 'chorus.depth': 10, 'delay.fb': 10 }).fx).toEqual({ mode: 'bypass' });
  });
});

describe('e7 panel', () => {
  it('tags every maker’s mark as brand', () => {
    const texts = e7.decor.filter((d): d is TextDecor => d.t === 'text');
    for (const t of ['e', '7', 'GS|MUSIC']) {
      const mark = texts.find((d) => d.text === t);
      expect(mark?.brand).toBe(true);
    }
    expect(texts.filter((d) => d.brand).map((d) => d.text)).toEqual(['e', '7', 'GS|MUSIC']);
  });

  it('puts each SHIFT function at its first function’s spot, shown only with SHIFT', () => {
    const pairs: [string, string][] = [
      ['osc1.tune', 'osc1.transpose'],
      ['vcf.eg1', 'vcf.vel'],
      ['vca.lfo1', 'vca.level'],
      ['env2.attack', 'env2.velA'],
      ['chorus.rate', 'chorus.type'],
      ['lfo3.wheel', 'lfo3.at'],
    ];
    for (const [first, second] of pairs) {
      const a = control(first);
      const b = control(second);
      expect([b.x, b.y]).toEqual([a.x, a.y]);
      expect(b.show).toEqual({ id: 'ui.shift', eq: true });
    }
  });

  it('marks the controls the app does not model as ui', () => {
    for (const id of [
      'vcf.at',
      'lfo3.at',
      'stereo.spread',
      'stereo.motion',
      'env1.velA',
      'kbd.bend',
    ]) {
      expect(control(id).ui).toBe(true);
    }
    for (const id of ['vcf.vel', 'vca.vel', 'env1.kbd', 'osc2.sync']) {
      expect(control(id).ui).toBeUndefined();
    }
  });
});
