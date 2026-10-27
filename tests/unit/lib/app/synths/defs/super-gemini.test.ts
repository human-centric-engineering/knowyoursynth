/**
 * UDO Audio Super Gemini definition tests: the panel → engine mapping at the init patch and for each switch, the
 * keyboard modes, the readouts, the maker's marks and the controls that are drawn but not modelled.
 *
 * The Super Gemini has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering
 * except its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a
 * slip shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/super-gemini.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  EngineParams,
  EngineRoute,
  TextDecor,
} from '@/lib/app/synths/contract';
import sg from '@/lib/app/synths/defs/super-gemini';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}, ctx: EngineContext = CTX): EngineParams =>
  sg.toEngine({ ...sg.init, ...set }, ctx);
const control = (id: string): Control => {
  const c = sg.controls.find((x) => x.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};
const readout = (id: string, v: number): string => {
  const c = control(id);
  if (c.kind !== 'cont' || !c.fmt) throw new Error(`${id} has no continuous readout`);
  return c.fmt(v);
};
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number): number => min * Math.pow(max / min, t);
/** `level10` worked out: (v / 10)^1.7 × max. */
const level = (v: number, max: number): number => Math.pow(v / 10, 1.7) * max;
const envTime = (v: number): number => 0.001 * Math.pow(10000, v / 10);
const routes = (p: { routes?: EngineRoute[] }): EngineRoute[] => p.routes ?? [];
const routeTo = (
  p: { routes?: EngineRoute[] },
  src: string,
  dst: string
): EngineRoute | undefined => routes(p).find((r) => r.src === src && r.dst === dst);

describe('Super Gemini toEngine at the init patch', () => {
  const p = run();

  it('plays the upper layer alone (SINGLE), ten binaural notes, no unison', () => {
    expect(p.poly).toEqual({ voices: 10, stack: 1, mono: false, detune: 0 });
    expect(p.layer).toBeUndefined();
  });

  it('sounds DDS 1’s centre sawtooth at 8′, with the sisters, the third and DDS 2 silent', () => {
    expect(p.osc).toHaveLength(4);
    expect(p.osc[0]).toMatchObject({ mix: { saw: 1 }, semi: 0, kbd: true, syncTo: -1 });
    expect(p.osc[0].level).toBeCloseTo(0.42, 10);
    expect(p.osc[1].level).toBe(0);
    expect(p.osc[2].level).toBe(0);
    // MIX at DDS 1: DDS 2 is there but at sin(0) = 0
    expect(p.osc[3].level).toBe(0);
    expect(p.noise.level).toBe(0);
    expect(p.ext.level).toBe(0);
  });

  it('runs the HPF at the bottom into the LPF at 8, half keytracked, clean', () => {
    expect(p.hpf).toEqual({ cutoff: 10, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0, poles: 1 });
    expect(p.filter).toMatchObject({
      type: 'ladder',
      mode: 'lp',
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0.5,
    });
    expect(p.filter.cutoff).toBeCloseTo(exp(0.8, 20, 20000), 6);
    expect(p.filter.drive).toBe(0.8);
  });

  it('opens the VCA by envelope 2 at ENV LEVEL 8, with no velocity', () => {
    expect(p.vca.envSrc).toBe('env2');
    expect(p.vca.gain).toBeCloseTo(level(8, 1), 10);
    expect(p.env2).toMatchObject({ a: envTime(0), s: 1, hold: 0 });
    expect(p.env2.r).toBeCloseTo(envTime(3.5), 10);
    expect(p.env3).toBeUndefined();
  });

  it('keeps the arpeggiator, chorus and delay off, and routes nothing', () => {
    expect(p.arp).toMatchObject({ on: false, bpm: 120, mode: 'up', octaves: 1, hold: false });
    expect(p.chorus).toEqual({ on: false, mode: 0 });
    expect(p.delay).toEqual({ on: false });
    expect(routes(p)).toEqual([]);
    expect(p.tune).toBe(0);
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
  });
});

describe('Super Gemini KEYBOARD and LAYER', () => {
  it('SINGLE plays the layer LAYER picks', () => {
    const p = run({ 'layer.select': 'lower', 'lo.lpf': 3, 'up.lpf': 9 });
    expect(p.filter.cutoff).toBeCloseTo(exp(0.3, 20, 20000), 6);
    expect(p.layer).toBeUndefined();
  });

  it('DUAL plays the upper layer and the lower as `layer`, five notes each, each at 0.75', () => {
    const p = run({ 'kbd.mode': 'dual', 'lo.lpf': 3 });
    expect(p.poly?.voices).toBe(5);
    expect(p.layer?.filter.cutoff).toBeCloseTo(exp(0.3, 20, 20000), 6);
    expect(p.layer?.split).toBeUndefined();
    expect(p.vca.gain).toBeCloseTo(level(8, 1) * 0.75, 10);
    expect(p.layer?.vca.gain).toBeCloseTo(level(8, 1) * 0.75, 10);
  });

  it('SPLIT gives the lower layer the keys below C4, five notes a side', () => {
    const p = run({ 'kbd.mode': 'split' });
    expect(p.layer?.split).toBe(60);
    expect(p.poly?.voices).toBe(10);
  });

  it('doubles the notes with BINAURAL off', () => {
    expect(run({ 'voice.binaural': false }).poly?.voices).toBe(20);
    expect(run({ 'voice.binaural': false, 'kbd.mode': 'dual' }).poly?.voices).toBe(10);
  });

  it('tunes the lower layer alone by DETUNE, and both by PERF DETUNE and FINE ADJ', () => {
    const p = run({ 'kbd.mode': 'dual', 'perf.lowerDetune': 7, 'perf.detune': -2, 'kbd.fine': 50 });
    expect(p.tune).toBeCloseTo(-1.5, 10);
    expect(p.layer?.tune).toBeCloseTo(5.5, 10);
  });
});

describe('Super Gemini oscillators', () => {
  it('sets DDS 1’s wave and footage on the centre oscillator and its sisters', () => {
    const p = run({ 'up.dds1Wave': 'square', 'up.dds1Range': '16' });
    expect(p.osc[0]).toMatchObject({ mix: { pulse: 1 }, pw: 0.5, semi: -12 });
    expect(run({ 'up.dds1Range': '64' }).osc[0].semi).toBe(-36);
    expect(run({ 'up.dds1Range': '2' }).osc[0].semi).toBe(24);
  });

  it('morphs DDS 1 towards the next wave by PW/WAVE at MANUAL, and not with LFO 1', () => {
    expect(run({ 'up.pwWave': 2.5 }).osc[0].mix).toEqual({ saw: 0.75, pulse: 0.25 });
    expect(run({ 'up.pwWave': 2.5, 'up.pwSrc': 'lfo1' }).osc[0].mix).toEqual({ saw: 1 });
  });

  it('crossfades triangle into noise, and plays the alternative waves as a sawtooth', () => {
    const p = run({ 'up.dds1Wave': 'tri', 'up.pwWave': 5 });
    expect(p.osc[0].mix).toEqual({ tri: 0.5 });
    expect(p.noise.level).toBeCloseTo(0.25, 10);
    expect(run({ 'up.dds1Wave': 'alt' }).osc[0].mix).toEqual({ saw: 1 });
  });

  it('brings in the sisters with SUPER, spread by PW/DETUNE, half as far at 1/2', () => {
    const on = run({ 'up.super': 'on', 'up.pwDetune': 5 });
    expect(on.osc[1].level).toBeCloseTo(0.3, 10);
    expect(on.osc[1].semi).toBeCloseTo(0.3, 10);
    expect(on.osc[2].semi).toBeCloseTo(-0.3, 10);
    expect(run({ 'up.super': 'half', 'up.pwDetune': 5 }).osc[1].semi).toBeCloseTo(0.15, 10);
    expect(run({ 'up.pwDetune': 5 }).osc[1].level).toBe(0);
  });

  it('blends DDS 2 by MIX with equal power, tuned by RANGE and TUNE', () => {
    const p = run({ 'up.mix': 5, 'up.dds2Range': '4', 'up.dds2Tune': -3 });
    expect(p.osc[0].level).toBeCloseTo(0.42 * Math.SQRT1_2, 10);
    expect(p.osc[3].level).toBeCloseTo(0.42 * Math.SQRT1_2, 10);
    expect(p.osc[3].semi).toBe(9);
  });

  it('narrows DDS 2’s pulse by PW/DETUNE, and keeps its square at 50 %', () => {
    expect(run({ 'up.dds2Wave': 'pulse', 'up.pwDetune': 10 }).osc[3].pw).toBeCloseTo(0.05, 10);
    expect(run({ 'up.dds2Wave': 'square', 'up.pwDetune': 10 }).osc[3].pw).toBe(0.5);
  });

  it('SYNC slaves DDS 2 to DDS 1 and turns CROSS MOD round', () => {
    const p = run({ 'up.dds2Mode': 'sync', 'up.xmod': 5 });
    expect(p.osc[3].syncTo).toBe(0);
    expect(routes(p)).toEqual([{ src: 'osc1', dst: 'pitch4', amt: 9 }]);
  });

  it('NORM sends CROSS MOD from DDS 2 to the pitch of DDS 1’s oscillators', () => {
    expect(routes(run({ 'up.xmod': 10 }))).toEqual([
      { src: 'osc4', dst: 'pitch1', amt: 36 },
      { src: 'osc4', dst: 'pitch2', amt: 36 },
      { src: 'osc4', dst: 'pitch3', amt: 36 },
    ]);
  });

  it('RING puts DDS 1 × DDS 2 in DDS 2’s channel, by MIX', () => {
    const p = run({ 'up.dds2Mode': 'ring', 'up.mix': 10 });
    expect(p.osc[3].level).toBe(0);
    expect(p.ext.level).toBeCloseTo(0.6, 10);
    expect(p.normals).toEqual({ extIn: 'ring', ringA: 'osc1', ringB: 'osc4' });
  });

  it('at LFO range takes DDS 2 out of the sound, at about 0.1–100 Hz by TUNE', () => {
    const p = run({ 'up.dds2Range': 'lfo', 'up.mix': 10, 'up.dds2Tune': 7 });
    expect(p.osc[3]).toMatchObject({ level: 0, kbd: false });
    // 100 Hz is MIDI note 69 + 12·log2(100/440)
    expect(p.osc[3].fixedNote).toBeCloseTo(69 + 12 * Math.log2(100 / 440), 8);
    expect(run({ 'up.dds2Range': 'lfo', 'up.dds2Tune': -7 }).osc[3].fixedNote).toBeCloseTo(
      69 + 12 * Math.log2(0.1 / 440),
      8
    );
  });

  it('at LFO range plays a square sub (middle) or a sine sub (top) an octave below DDS 1 on the third oscillator', () => {
    const sq = run({ 'up.dds2Range': 'lfo', 'up.dds2Mode': 'ring', 'up.mix': 10 });
    expect(sq.osc[2]).toMatchObject({ mix: { pulse: 1 }, semi: -12 });
    expect(sq.osc[2].level).toBeCloseTo(0.45, 10);
    expect(run({ 'up.dds2Range': 'lfo', 'up.dds2Mode': 'sync', 'up.mix': 10 }).osc[2].mix).toEqual({
      sine: 1,
    });
    expect(run({ 'up.dds2Range': 'lfo', 'up.mix': 10 }).osc[2].level).toBe(0);
    expect(run({ 'up.dds2Range': 'lfo', 'up.dds2Mode': 'sync', 'up.mix': 10 }).osc[3].syncTo).toBe(
      -1
    );
  });
});

describe('Super Gemini DDS modulator', () => {
  it('sends LFO 1 and ENV 1 to the pitch of the oscillators the switch picks', () => {
    expect(routes(run({ 'up.modLfo': 5, 'up.modDest': 'dds2' }))).toEqual([
      { src: 'lfo', dst: 'pitch4', amt: 3 },
    ]);
    expect(routes(run({ 'up.modEnv': 10, 'up.modDest': 'both' }))).toEqual([
      { src: 'env1', dst: 'pitchAll', amt: 24 },
    ]);
    expect(routes(run({ 'up.modLfo': 10 })).map((r) => r.dst)).toEqual([
      'pitch1',
      'pitch2',
      'pitch3',
    ]);
  });

  it('sweeps DDS 2’s pulse width by LFO 1 or ENV 1 through PW/WAVE', () => {
    expect(routeTo(run({ 'up.pwSrc': 'lfo1', 'up.pwWave': 5 }), 'lfo', 'pw2')?.amt).toBeCloseTo(
      0.2,
      10
    );
    expect(routeTo(run({ 'up.pwSrc': 'env1', 'up.pwWave': 10 }), 'env1', 'pw2')?.amt).toBeCloseTo(
      0.4,
      10
    );
  });

  it('turns ENV 1’s pitch and filter amounts upside down when inverted', () => {
    const p = run({ 'up.env1Mode': 'inv', 'up.modEnv': 10, 'up.vcfEnv': 10 });
    expect(routeTo(p, 'env1', 'pitch1')?.amt).toBe(-24);
    expect(p.filter.envAmt).toBe(-7);
  });

  it('wanders the pitch by DRIFT', () => {
    expect(run({ 'up.drift': 10 }).drift).toEqual({ depth: 0.5, rate: 0.8 });
  });
});

describe('Super Gemini VCF and VCA', () => {
  it('maps HPF, RES and the three DRIVE steps', () => {
    const p = run({ 'up.hpf': 10, 'up.res': 10, 'up.drive': '2' });
    expect(p.hpf?.cutoff).toBeCloseTo(5000, 6);
    expect(p.filter.res).toBeCloseTo(1.1, 10);
    expect(p.filter.drive).toBe(3.2);
    expect(run({ 'up.drive': '1' }).filter.drive).toBe(1.6);
  });

  it('sends ENV 1, ENV 2 or both to the cutoff by VCF ENV', () => {
    expect(run({ 'up.vcfEnv': 5, 'up.vcfSrc': 'env2' }).filter).toMatchObject({
      envSrc: 'env2',
      envAmt: 3.5,
    });
    const both = run({ 'up.vcfEnv': 10, 'up.vcfSrc': 'both' });
    expect(both.filter).toMatchObject({ envSrc: 'env1', envAmt: 7 });
    expect(routeTo(both, 'env2', 'cutoff')?.amt).toBe(7);
  });

  it('follows the keys by KEYTRACK, and LFO 1 and DDS 2 move the cutoff', () => {
    expect(run({ 'up.vcfKey': 'on' }).filter.kbd).toBe(1);
    expect(run({ 'up.vcfKey': 'off' }).filter.kbd).toBe(0);
    const p = run({ 'up.vcfLfo': 5, 'up.vcfDds2': 10 });
    expect(routeTo(p, 'lfo', 'cutoff')?.amt).toBe(2);
    expect(routeTo(p, 'osc4', 'cutoff')?.amt).toBe(4);
  });

  it('DYNAMICS scales the envelopes by velocity and opens the filter for a harder key', () => {
    const on = run({ 'up.dyn': 'on' });
    expect(on.vca.envSrc).toBe('env2v');
    expect(on.filter.envSrc).toBe('env1v');
    expect(routeTo(on, 'vel', 'cutoff')?.amt).toBe(2);
    expect(routeTo(run({ 'up.dyn': 'half' }), 'vel', 'cutoff')?.amt).toBe(1);
  });

  it('runs the VCA from a fixed gate, with a short fade on FIXED 2', () => {
    const f1 = run({ 'up.vcaMode': 'fixed1' });
    expect(f1.vca.envSrc).toBe('env3');
    expect(f1.env3).toEqual({ a: 0.001, d: 0.001, s: 1, r: 0.003 });
    expect(run({ 'up.vcaMode': 'fixed2' }).env3?.r).toBe(0.3);
  });

  it('moves the level by LFO 1 and DDS 2, scaled by the VCA’s envelope', () => {
    const p = run({ 'up.vcaLfo': 10, 'up.vcaDds2': 5 });
    expect(routeTo(p, 'lfo', 'amp')).toEqual({ src: 'lfo', dst: 'amp', amt: 0.8, by: 'env2' });
    expect(routeTo(p, 'osc4', 'amp')?.amt).toBeCloseTo(0.4, 10);
  });
});

describe('Super Gemini envelopes and LFOs', () => {
  it('maps both envelopes 1 ms–10 s, with the hold stages under SHIFT', () => {
    const p = run({ 'up.e1a': 10, 'up.e1ah': 5, 'up.e1dh': 0, 'up.e2dh': 10 });
    expect(p.env1.a).toBeCloseTo(10, 8);
    expect(p.env1.dly).toBeCloseTo(0.1, 10);
    expect(p.env1.hold).toBe(0);
    expect(p.env2.hold).toBeCloseTo(10, 8);
  });

  it('loops ENV 1 and shortens it up the keyboard by KEYTRACK', () => {
    const p = run({ 'up.env1Mode': 'loop', 'up.env1Key': 'half' });
    expect(p.env1).toMatchObject({ loop: true, kf: 0.5 });
  });

  it('sets LFO 1’s shape, speed, delay and restart; HF to 20 kHz, HF TRK following the keys', () => {
    const p = run({
      'up.lfoWave': 'sh',
      'up.lfoRate': 10,
      'up.lfoDelay': 10,
      'up.lfoMode': 'reset',
    });
    expect(p.lfo).toMatchObject({ mix: { sh: 1 }, keySync: true, delay: 10 });
    expect(p.lfo.rate).toBeCloseTo(50, 8);
    expect(run({ 'up.lfoWave': 'hf', 'up.lfoRate': 10 }).lfo).toMatchObject({
      mix: { sine: 1 },
      rate: 20000,
    });
    expect(routeTo(run({ 'up.lfoWave': 'hftrk' }), 'kbd', 'lfoRate')?.amt).toBe(1);
  });

  it('brings LFO 2 in by the mod wheel on TRIG, and always on ON', () => {
    const set = { 'lfo2.dds': 10, 'lfo2.vcf': 5, 'lfo2.vca': 10 };
    expect(routes(run(set))).toEqual([]);
    const half = run(set, { wheel: 0.5, patched: {} });
    expect(routeTo(half, 'lfo2', 'pitchAll')?.amt).toBe(6);
    expect(routeTo(half, 'lfo2', 'cutoff')?.amt).toBe(1);
    expect(routeTo(run({ ...set, 'lfo2.trig': 'on' }), 'lfo2', 'amp')).toEqual({
      src: 'lfo2',
      dst: 'amp',
      amt: 0.8,
      by: 'env2',
    });
  });

  it('speeds LFO 2 up by the push through LFO2 RATE', () => {
    const base = run().lfo2?.rate ?? 0;
    expect(run({ 'lfo2.rateMod': 10 }, { wheel: 1, patched: {} }).lfo2?.rate).toBeCloseTo(
      base * 4,
      8
    );
  });

  it('sends LFO 2 only to the layers the DEST switch names', () => {
    const p = run({
      'kbd.mode': 'dual',
      'lfo2.trig': 'on',
      'lfo2.dds': 10,
      'perf.modLayer': 'lower',
    });
    expect(routes(p)).toEqual([]);
    expect(routeTo(p.layer ?? {}, 'lfo2', 'pitchAll')?.amt).toBe(12);
  });
});

describe('Super Gemini performance controls, voice assign and effects', () => {
  it('glides and moves the octave of the layers the switch names', () => {
    const p = run({
      'kbd.mode': 'dual',
      'perf.porta': 10,
      'perf.octave': '+1',
      'perf.portaLayer': 'upper',
    });
    expect(p.glide.time).toBe(10);
    expect(p.tune).toBe(12);
    expect(p.layer?.glide.time).toBe(0);
    expect(p.layer?.tune).toBe(0);
  });

  it('plays one note for SOLO, without restarting the envelopes for LEGATO', () => {
    expect(run({ 'voice.mode': 'solo' }).poly?.mono).toBe(true);
    const leg = run({ 'voice.mode': 'legato' });
    expect(leg.poly?.mono).toBe(true);
    expect(leg.trig.retrig).toBe(false);
  });

  it('stacks two voices a note for UNISON in poly, every voice in SOLO', () => {
    expect(run({ 'voice.unison': true }).poly).toEqual({
      voices: 10,
      stack: 2,
      mono: false,
      detune: 0.15,
    });
    expect(run({ 'voice.unison': true, 'voice.mode': 'solo' }).poly?.stack).toBe(10);
  });

  it('runs the arpeggiator at the CLK DIV’s note value, stopping for SEQ', () => {
    const p = run({
      'arp.on': true,
      'arp.div': '1/8',
      'arp.tempo': 100,
      'arp.range': '3',
      'arp.mode': 'random',
    });
    expect(p.arp).toMatchObject({ on: true, bpm: 50, mode: 'random', octaves: 3 });
    expect(run({ 'arp.on': true, 'arp.mode': 'seq' }).arp?.on).toBe(false);
    expect(run({ 'hold.lower': true }).arp?.hold).toBe(true);
  });

  it('sets the chorus mode from I and II, and each layer’s delay by its SEND', () => {
    expect(run({ 'chorus.i': true, 'chorus.ii': true }).chorus).toEqual({ on: true, mode: 3 });
    expect(run({ 'chorus.ii': true }).chorus).toEqual({ on: true, mode: 2 });
    const d = run({ 'up.send': 10, 'dly.time': 10, 'dly.feedback': 10 }).delay;
    expect(d).toMatchObject({ on: true, mix: 0.7, fb: 0.95 });
    expect(d?.time).toBeCloseTo(1, 10);
  });
});

describe('Super Gemini controls that are not modelled', () => {
  it('marks them as panel-only and leaves the sound unchanged', () => {
    const ids = [
      'up.lfoPhase',
      'ui.modAmount',
      'ui.modAssign',
      'ui.sync',
      'ui.seqRec',
      'ui.track',
      'ui.perf',
      'ui.patch',
      'ui.wave',
      'ui.bendDds',
      'ui.bendVcf',
    ];
    const base = run();
    for (const id of ids) {
      const c = control(id);
      expect(c.ui).toBe(true);
      const v =
        c.kind === 'cont' ? c.max : c.kind === 'bool' ? true : c.options[c.options.length - 1].v;
      expect(run({ [id]: v })).toEqual(base);
    }
  });
});

describe('Super Gemini readouts and marks', () => {
  it('reads the envelope, filter, tuning and delay controls in units', () => {
    expect(readout('up.e1d', 5)).toBe('100 ms');
    expect(readout('up.lpf', 10)).toBe('20 kHz');
    expect(readout('up.dds2Tune', 7)).toBe('+7 st');
    expect(readout('up.mix', 3)).toBe('70 : 30');
    expect(readout('dly.time', 0)).toBe('1 ms');
    expect(readout('arp.tempo', 120)).toBe('120 BPM');
  });

  it('tags the UDO marks, the SUPER GEMINI wordmark, its strapline and the rule between them as brand, and nothing else', () => {
    const brand = sg.decor
      .filter((d): d is TextDecor => d.t === 'text' && d.brand === true)
      .map((d) => d.text);
    expect(brand).toEqual([
      'U·D·O',
      'U·D·O',
      'SUPER GEMINI',
      '20 VOICE DUAL LAYER POLYPHONIC BINAURAL ANALOG-HYBRID',
      'SYNTHESIZER WITH SUPER-WAVE TECHNOLOGY',
    ]);
    expect(sg.decor.filter((d) => d.brand === true)).toHaveLength(6);
  });

  it('puts every control in exactly one area', () => {
    for (const c of sg.controls) {
      const n = sg.areas.filter((a) =>
        a.rects.some((r) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h)
      );
      expect(
        n.map((a) => a.id),
        c.id
      ).toHaveLength(1);
    }
  });
});
