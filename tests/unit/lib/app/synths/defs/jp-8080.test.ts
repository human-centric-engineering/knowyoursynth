/**
 * Roland JP-8080 definition tests: the panel → engine mapping at the init patch and for each switch, the key modes,
 * every OSC 1 waveform, the effects, the two parts sharing one panel, the maker's marks and the controls that are drawn
 * but not modelled.
 *
 * The JP-8080 has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except
 * its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip
 * shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/jp-8080.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineParams,
  EngineRoute,
  FxSlot,
  TextDecor,
} from '@/lib/app/synths/contract';
import jp from '@/lib/app/synths/defs/jp-8080';

const CTX = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}): EngineParams => jp.toEngine({ ...jp.init, ...set }, CTX);
const routes = (p: { routes?: EngineRoute[] }): EngineRoute[] => p.routes ?? [];
const routeTo = (
  p: { routes?: EngineRoute[] },
  src: string,
  dst: string
): EngineRoute | undefined =>
  routes(p).find((r) => r.src === src && r.dst === dst && r.by === undefined);
const control = (id: string): Control => {
  const c = jp.controls.find((x) => x.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number): number => min * Math.pow(max / min, t);
const envTime = (v: number): number => 0.002 * Math.pow(5000, v / 127);
const slots = (p: EngineParams): FxSlot[] => p.fx?.slots ?? [];
const algs = (p: EngineParams): (string | null)[] => slots(p).map((s) => s.alg);

describe('JP-8080 toEngine at the init patch', () => {
  const p = run();

  it('plays the Upper patch alone (SINGLE), ten voices, poly', () => {
    expect(p.poly).toEqual({ voices: 10, stack: 1, mono: false, detune: 0 });
    expect(p.layer).toBeUndefined();
  });

  it('sounds OSC 1’s sawtooth alone, OSC BALANCE fully left', () => {
    expect(p.osc).toHaveLength(2);
    expect(p.osc[0]).toMatchObject({ mix: { saw: 1 }, semi: 0, kbd: true, syncTo: -1 });
    expect(p.osc[0].level).toBeCloseTo(0.4, 10);
    expect(p.osc[1].level).toBeCloseTo(0, 10);
    expect(p.osc[1].mix).toEqual({ saw: 1 });
    expect(p.ext.level).toBe(0);
    expect(p.noise.level).toBe(0);
  });

  it('runs the -24 dB low-pass (the ladder) wide open with no envelope', () => {
    expect(p.filter).toMatchObject({ type: 'ladder', mode: 'lp', res: 0, envAmt: 0, kbd: 0 });
    expect(p.filter.cutoff).toBeCloseTo(20000, 6);
    expect(p.hpf).toBeUndefined();
  });

  it('gates the amp with full sustain, and keeps every effect and the arpeggiator off', () => {
    expect(p.vca.envSrc).toBe('env2');
    expect(p.env2.s).toBe(1);
    expect(p.env2.a).toBeCloseTo(envTime(0), 10);
    expect(p.env2.r).toBeCloseTo(envTime(30), 10);
    expect(p.fx).toEqual({ mode: 'bypass' });
    expect(p.arp?.on).toBe(false);
    expect(routes(p)).toEqual([]);
    expect(p.tune).toBe(0);
  });
});

describe('JP-8080 KEY MODE and PANEL SELECT', () => {
  it('SINGLE plays the part PANEL SELECT picks', () => {
    const p = run({ 'perf.panel': 'lower', 'lo.cutoff': 64, 'up.cutoff': 127 });
    expect(p.filter.cutoff).toBeCloseTo(exp(64 / 127, 20, 20000), 6);
    expect(p.layer).toBeUndefined();
  });

  it('DUAL plays the Upper patch with the Lower as `layer`, five notes, each part at 0.75', () => {
    const p = run({ 'perf.keyMode': 'dual', 'lo.cutoff': 64 });
    expect(p.poly?.voices).toBe(5);
    expect(p.layer?.filter.cutoff).toBeCloseTo(exp(64 / 127, 20, 20000), 6);
    expect(p.layer?.split).toBeUndefined();
    expect(p.vca.gain).toBeCloseTo((p.layer?.vca.gain ?? 0) * 1, 10);
    expect(p.vca.gain).toBeCloseTo(Math.pow(100 / 127, 1.7) * 0.75, 10);
  });

  it('DUAL plays the Upper patch whichever part PANEL SELECT shows', () => {
    const p = run({ 'perf.keyMode': 'dual', 'perf.panel': 'lower', 'up.cutoff': 30 });
    expect(p.filter.cutoff).toBeCloseTo(exp(30 / 127, 20, 20000), 6);
  });

  it('SPLIT gives the Lower patch the keys below C4, ten notes between the sides, at full level', () => {
    const p = run({ 'perf.keyMode': 'split' });
    expect(p.layer?.split).toBe(60);
    expect(p.poly?.voices).toBe(10);
    expect(p.vca.gain).toBeCloseTo(Math.pow(100 / 127, 1.7), 10);
  });
});

describe('JP-8080 OSC 1 waveforms', () => {
  const osc1 = (wave: string, c1 = 64, c2 = 32): EngineParams =>
    run({ 'up.osc1Wave': wave, 'up.osc1Ctl1': c1, 'up.osc1Ctl2': c2 });

  it('SUPER SAW: CONTROL 1 the spread, CONTROL 2 the side saws', () => {
    const p = osc1('superSaw', 127, 0);
    expect(p.osc[0].mix).toEqual({ ssaw: 1 });
    expect(p.osc[0].ssDetune).toBe(1);
    expect(p.osc[0].ssMix).toBe(0);
  });

  it('TRIANGLE MOD: CONTROL 1 the fold, CONTROL 2 how far LFO 1 moves it', () => {
    const p = osc1('triMod');
    expect(p.osc[0].mix).toEqual({ tfold: 1 });
    expect(p.osc[0].fold).toBeCloseTo(64 / 127, 10);
    expect(routeTo(p, 'lfo', 'pw1')?.amt).toBeCloseTo((0.5 * 32) / 127, 10);
  });

  it('NOISE: CONTROL 1 the cutoff in semitones from 64, CONTROL 2 the resonance, following the keys', () => {
    const p = osc1('noise', 76, 127);
    expect(p.osc[0].mix).toEqual({ fnoise: 1 });
    expect(p.osc[0].nCut).toBe(12);
    expect(p.osc[0].nRes).toBe(1);
    expect(p.osc[0].kbd).toBe(true);
  });

  it('FEEDBACK OSC: CONTROL 1 the harmonic, CONTROL 2 the amount, and the part goes MONO', () => {
    const p = osc1('feedback', 0, 127);
    expect(p.osc[0].mix).toEqual({ fbk: 1 });
    expect(p.osc[0].fbHarm).toBe(0);
    expect(p.osc[0].fbAmt).toBe(1);
    expect(p.poly).toMatchObject({ mono: true, stack: 1 });
    // and UNISON is blocked
    expect(run({ 'up.osc1Wave': 'feedback', 'up.unison': true }).poly).toMatchObject({ stack: 1 });
  });

  it('SQR (PWM): CONTROL 1 narrows the pulse, CONTROL 2 lets LFO 1 sweep it', () => {
    const p = osc1('square', 127, 127);
    expect(p.osc[0].mix).toEqual({ pulse: 1 });
    expect(p.osc[0].pw).toBeCloseTo(0.04, 10);
    expect(routeTo(p, 'lfo', 'pw1')?.amt).toBeCloseTo(0.45, 10);
  });

  it('SAW and TRIANGLE: plain waves, and CONTROL 1 and 2 (SHAPE) do nothing', () => {
    expect(osc1('saw').osc[0].mix).toEqual({ saw: 1 });
    expect(osc1('tri').osc[0].mix).toEqual({ tri: 1 });
    expect(routes(osc1('saw', 127, 127))).toEqual([]);
    expect(routes(osc1('tri', 127, 127))).toEqual([]);
  });
});

describe('JP-8080 OSC 2, sync, ring and cross mod', () => {
  it('OSC BALANCE crossfades at equal power, equal at the centre', () => {
    const p = run({ 'up.balance': 0 });
    const t = 64 / 127;
    expect(p.osc[0].level).toBeCloseTo(0.4 * Math.cos((t * Math.PI) / 2), 10);
    expect(p.osc[1].level).toBeCloseTo(0.4 * Math.sin((t * Math.PI) / 2), 10);
  });

  it('RANGE and FINE/WIDE set the semitones, and the WIDE ends sweep four octaves', () => {
    expect(run({ 'up.osc2Range': 7, 'up.osc2Fine': 25 }).osc[1].semi).toBeCloseTo(7.25, 10);
    expect(run({ 'up.osc2Range': 25, 'up.osc2Fine': 50 }).osc[1].semi).toBeCloseTo(48, 10);
    expect(run({ 'up.osc2Range': 25, 'up.osc2Fine': -50 }).osc[1].semi).toBeCloseTo(0, 10);
    expect(run({ 'up.osc2Range': -25, 'up.osc2Fine': -50 }).osc[1].semi).toBeCloseTo(-48, 10);
  });

  it('OSC 2 noise rings at C4 on every key: CONTROL 1 from 64, CONTROL 2 the resonance', () => {
    const p = run({ 'up.osc2Wave': 'noise', 'up.osc2Ctl1': 60, 'up.osc2Ctl2': 127 });
    expect(p.osc[1]).toMatchObject({
      mix: { fnoise: 1 },
      kbd: false,
      fixedNote: 60,
      semi: 0,
      nCut: -4,
      nRes: 1,
    });
  });

  it('SYNC resets OSC 2 from OSC 1, but not on noise or with EXT', () => {
    expect(run({ 'up.sync': true }).osc[1].syncTo).toBe(0);
    expect(run({ 'up.sync': true, 'up.osc2Wave': 'noise' }).osc[1].syncTo).toBe(-1);
    expect(run({ 'up.sync': true, 'up.osc2Ext': true }).osc[1].syncTo).toBe(-1);
  });

  it('EXT silences OSC 2 (there is no audio input)', () => {
    expect(run({ 'up.balance': 63, 'up.osc2Ext': true }).osc[1].level).toBe(0);
  });

  it('RING takes OSC 2’s side of the balance through the ring modulator', () => {
    const p = run({ 'up.ring': true, 'up.balance': 63 });
    expect(p.osc[1].level).toBe(0);
    expect(p.ext.level).toBeCloseTo(0.4, 10);
    expect(p.normals).toEqual({ extIn: 'ring', ringA: 'osc1', ringB: 'osc2' });
  });

  it('X-MOD DEPTH runs OSC 2 into OSC 1’s pitch, except on the super saw and noise', () => {
    expect(routeTo(run({ 'up.xmod': 127 }), 'osc2', 'pitch1')?.amt).toBeCloseTo(36, 10);
    expect(
      routeTo(run({ 'up.xmod': 127, 'up.osc1Wave': 'superSaw' }), 'osc2', 'pitch1')
    ).toBeUndefined();
    expect(
      routeTo(run({ 'up.xmod': 127, 'up.osc1Wave': 'noise' }), 'osc2', 'pitch1')
    ).toBeUndefined();
  });

  it('OSC SHIFT moves the patch by octaves', () => {
    expect(run({ 'up.shift': '-2' }).tune).toBe(-24);
    expect(run({ 'up.shift': '1' }).tune).toBe(12);
  });
});

describe('JP-8080 LFO 1 & ENV DESTINATION', () => {
  const set = { 'up.oscLfo': 63, 'up.pDepth': 63 };

  it('OSC 1+2 moves the pitch of both', () => {
    const p = run({ ...set, 'up.dest': 'osc12' });
    expect(routeTo(p, 'lfo', 'pitchAll')?.amt).toBeCloseTo(12, 10);
    expect(routeTo(p, 'env3', 'pitchAll')?.amt).toBeCloseTo(48, 10);
  });

  it('OSC 2 moves OSC 2 alone', () => {
    const p = run({ ...set, 'up.dest': 'osc2' });
    expect(routeTo(p, 'lfo', 'pitch2')?.amt).toBeCloseTo(12, 10);
    expect(routeTo(p, 'env3', 'pitch2')?.amt).toBeCloseTo(48, 10);
  });

  it('X-MOD moves the cross mod depth instead of the pitch', () => {
    const p = run({ ...set, 'up.dest': 'xmod' });
    expect(routes(p).find((r) => r.by === 'lfo')).toMatchObject({
      src: 'osc2',
      dst: 'pitch1',
      amt: 18,
    });
    expect(routes(p).find((r) => r.by === 'env3')).toMatchObject({
      src: 'osc2',
      dst: 'pitch1',
      amt: 36,
    });
    expect(routeTo(p, 'lfo', 'pitchAll')).toBeUndefined();
  });

  it('the pitch envelope is the third envelope, attack then decay to nothing', () => {
    const p = run({ 'up.pA': 0, 'up.pD': 127 });
    expect(p.env3).toEqual({ a: envTime(0), d: envTime(127), s: 0, r: envTime(127) });
  });
});

describe('JP-8080 filter', () => {
  it('-12 dB is the state-variable filter in each type', () => {
    for (const [type, mode] of [
      ['lpf', 'lp'],
      ['bpf', 'bp'],
      ['hpf', 'hp'],
    ] as const) {
      const p = run({ 'up.slope': false, 'up.vcfType': type });
      expect(p.filter).toMatchObject({ type: 'svf', mode });
      expect(p.hpf).toBeUndefined();
    }
  });

  it('-24 dB HPF is the series high-pass, with the main filter wide open', () => {
    const p = run({ 'up.vcfType': 'hpf', 'up.cutoff': 64, 'up.res': 127, 'up.vcfLfo': 63 });
    expect(p.hpf?.cutoff).toBeCloseTo(exp(64 / 127, 20, 20000), 6);
    expect(p.hpf?.res).toBeCloseTo(1.08, 10);
    expect(p.filter).toMatchObject({ type: 'svf', mode: 'lp', cutoff: 20000, res: 0 });
    expect(routeTo(p, 'lfo', 'cutoffHp')?.amt).toBeCloseTo(4, 10);
    expect(routeTo(p, 'lfo', 'cutoff')).toBeUndefined();
  });

  it('-24 dB BPF is the series high-pass into the ladder, both at the cutoff', () => {
    const p = run({ 'up.vcfType': 'bpf', 'up.cutoff': 64, 'up.res': 127 });
    expect(p.hpf?.cutoff).toBeCloseTo(exp(64 / 127, 20, 20000), 6);
    expect(p.hpf?.res).toBe(0);
    expect(p.filter).toMatchObject({ type: 'ladder', mode: 'lp' });
    expect(p.filter.res).toBeCloseTo(1.08, 10);
  });

  it('KEY FOLLOW: +32 about 100 %, +63 200 %, -64 the other way at 100 %', () => {
    expect(routeTo(run({ 'up.keyFollow': 63 }), 'kbd', 'cutoff')?.amt).toBeCloseTo(2, 10);
    expect(routeTo(run({ 'up.keyFollow': 32 }), 'kbd', 'cutoff')?.amt).toBeCloseTo(64 / 63, 10);
    expect(routeTo(run({ 'up.keyFollow': -64 }), 'kbd', 'cutoff')?.amt).toBeCloseTo(-1, 10);
  });

  it('the filter envelope is envelope 1, eight octaves either way at the ends', () => {
    expect(run({ 'up.fDepth': 63 }).filter.envAmt).toBeCloseTo(8, 10);
    expect(run({ 'up.fDepth': -64 }).filter.envAmt).toBeCloseTo(-8, 10);
    expect(run().filter.envSrc).toBe('env1');
  });
});

describe('JP-8080 amp and LFO 2', () => {
  it('PAN off: LFO 1 is a tremolo on the amp', () => {
    const p = run({ 'up.ampLfo': 63 });
    expect(routes(p).find((r) => r.src === 'lfo' && r.dst === 'amp')).toEqual({
      src: 'lfo',
      dst: 'amp',
      amt: 0.8,
      by: 'env2',
    });
  });

  it('PAN AUTO: LFO 1 pans on the effects engine instead', () => {
    const p = run({ 'up.ampLfo': 32, 'up.pan': 'auto' });
    expect(routes(p).find((r) => r.dst === 'amp')).toBeUndefined();
    expect(algs(p)).toEqual(['auto-pan', null, null, null]);
    expect(slots(p)[0]).toMatchObject({ p: { PHS: 180, DEP: Math.round((100 * 32) / 63) } });
  });

  it('PAN MANUAL: nothing (a fixed position is not modelled)', () => {
    const p = run({ 'up.ampLfo': 32, 'up.pan': 'manual' });
    expect(routes(p)).toEqual([]);
    expect(p.fx).toEqual({ mode: 'bypass' });
  });

  it('LFO 2 is a triangle brought in by the mod wheel on pitch, filter and amp', () => {
    const p = run({ 'up.lfo2Pitch': 63, 'up.lfo2Filter': -64, 'up.lfo2Amp': 63 });
    expect(p.lfo2?.mix).toEqual({ tri: 1 });
    const by = routes(p).filter((r) => r.by === 'wheel');
    expect(by).toEqual([
      { src: 'lfo2', dst: 'pitchAll', amt: 12, by: 'wheel' },
      { src: 'lfo2', dst: 'cutoff', amt: -4, by: 'wheel' },
      { src: 'lfo2', dst: 'amp', amt: 0.8, by: 'wheel' },
    ]);
  });
});

describe('JP-8080 SOLO SW and portamento', () => {
  it('MONO: one note at a time, each restarted', () => {
    const p = run({ 'up.mono': true });
    expect(p.poly).toMatchObject({ mono: true, stack: 1 });
    expect(p.trig.retrig).toBe(true);
  });

  it('LEGATO: one note at a time, overlapping notes slide on without restarting', () => {
    const p = run({ 'up.legato': true, 'up.porta': true, 'up.portaTime': 127 });
    expect(p.poly?.mono).toBe(true);
    expect(p.trig.retrig).toBe(false);
    expect(p.glide).toEqual({ time: 5, legato: true });
  });

  it('UNISON: every voice of the part on one note, 5 cents apart', () => {
    expect(run({ 'up.unison': true }).poly).toEqual({
      voices: 10,
      stack: 10,
      mono: true,
      detune: 0.025,
    });
    expect(run({ 'up.unison': true, 'perf.keyMode': 'dual' }).poly).toMatchObject({
      voices: 5,
      stack: 5,
    });
  });

  it('PORTAMENTO off glides nothing', () => {
    expect(run({ 'up.portaTime': 127 }).glide.time).toBe(0);
  });
});

describe('JP-8080 effects', () => {
  it('chains the tone control, the multi-effect and the delay, in that order', () => {
    const p = run({ 'up.bass': 63, 'up.treble': -64, 'up.mfxLevel': 127, 'up.dlyLevel': 127 });
    expect(p.fx).toMatchObject({ mode: 'insert', routing: 1 });
    expect(algs(p)).toEqual(['midaseq', 'chorus', 'delay', null]);
    expect(slots(p)[0]).toMatchObject({ p: { LSG: 12, HSG: -12 } });
  });

  it('maps the multi-effect types, and plays twisting and the freeze phases dry', () => {
    const type = (t: string): (string | null)[] =>
      algs(run({ 'up.mfxType': t, 'up.mfxLevel': 100 }));
    expect(type('chorusFast')).toEqual(['chorus', null, null, null]);
    expect(type('flangerDeep')).toEqual(['flanger', null, null, null]);
    expect(type('jetPhasing')).toEqual(['phaser', null, null, null]);
    expect(type('distortion')).toEqual(['rackamp', null, null, null]);
    for (const t of ['twisting', 'freeze1', 'freeze2'])
      expect(run({ 'up.mfxType': t, 'up.mfxLevel': 100 }).fx).toEqual({ mode: 'bypass' });
  });

  it('times the delay by its type and bounces the panning types', () => {
    const delay = (type: string): FxSlot | undefined =>
      slots(run({ 'up.dlyType': type, 'up.dlyTime': 127, 'up.dlyLevel': 127 }))[0];
    expect(delay('monoLong')).toMatchObject({ alg: 'delay', p: { TIM: 1250, MOD: 'M' } });
    expect(delay('panLR')).toMatchObject({ p: { TIM: 625, MOD: 'P-P' } });
    expect(delay('panShort')).toMatchObject({ p: { TIM: 156, MOD: 'P-P' } });
  });

  it('in DUAL the Upper patch’s effects serve both parts', () => {
    const p = run({ 'perf.keyMode': 'dual', 'lo.dlyLevel': 127 });
    expect(p.fx).toEqual({ mode: 'bypass' });
  });
});

describe('JP-8080 arpeggiator', () => {
  it('plays at TEMPO in sixteenths, over RANGE octaves', () => {
    const p = run({ 'arp.on': true, 'arp.mode': 'updown', 'arp.range': '3', 'arp.tempo': 138 });
    expect(p.arp).toEqual({
      on: true,
      bpm: 138,
      gate: 0.5,
      mode: 'updown',
      octaves: 3,
      hold: false,
    });
  });

  it('RPS is not modelled, so the arpeggiator stops', () => {
    expect(run({ 'arp.on': true, 'arp.mode': 'rps' }).arp?.on).toBe(false);
  });
});

describe('JP-8080 panel', () => {
  it('draws every patch control twice at one spot, the Upper and Lower, shown by PANEL SELECT', () => {
    const upper = jp.controls.filter((c) => c.id.startsWith('up.'));
    expect(upper.length).toBeGreaterThan(50);
    for (const u of upper) {
      const l = control(`lo.${u.id.slice(3)}`);
      expect([l.x, l.y, l.type]).toEqual([u.x, u.y, u.type]);
      expect([u.show].flat()[0]).toEqual({ id: 'perf.panel', eq: 'upper' });
      expect([l.show].flat()[0]).toEqual({ id: 'perf.panel', eq: 'lower' });
    }
  });

  it('ignores the controls that are drawn but not modelled', () => {
    const base = run();
    for (const c of jp.controls.filter((x) => x.ui)) {
      const v = c.kind === 'bool' ? !c.def : c.kind === 'cont' ? c.max : c.options[1]?.v;
      expect(run({ [c.id]: v ?? c.def })).toEqual(base);
    }
  });

  it('tags the Roland wordmark and the JP-8080 badge as maker’s marks, and nothing else', () => {
    const brand = jp.decor.filter((d) => d.brand).map((d) => (d as TextDecor).text);
    expect(brand).toEqual(['Roland', 'JP-8080']);
  });
});
