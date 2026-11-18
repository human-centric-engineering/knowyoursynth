/**
 * Behringer ODYSSEY definition tests: the panel → engine mapping at init and for each switch, which key each VCO plays
 * and what LFO REPEAT does (rendered through the engine), the readouts and the maker's marks.
 *
 * The ODYSSEY has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except
 * its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip
 * shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/behringer-odyssey.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues, EngineContext, EngineParams } from '@/lib/app/synths/contract';
import odyssey from '@/lib/app/synths/defs/behringer-odyssey';
import { render, rms, type Timed } from '@/tests/unit/lib/app/synths/audio/render';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}, ctx: EngineContext = CTX): EngineParams =>
  odyssey.toEngine({ ...odyssey.init, ...set }, ctx);
const routeAmt = (p: EngineParams, src: string, dst: string): number | undefined =>
  p.routes?.find((r) => r.src === src && r.dst === dst)?.amt;
const readout = (id: string, v: number, values?: ControlValues): string => {
  const c = odyssey.controls.find((x) => x.id === id);
  if (!c || c.kind !== 'cont' || !c.fmt) throw new Error(`${id} has no continuous readout`);
  return c.fmt(v, values);
};
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
/** `level10` worked out: (v / 10)^1.7 × max. */
const level = (v: number, max: number) => Math.pow(v / 10, 1.7) * max;

describe('ODYSSEY toEngine at the init patch', () => {
  const p = run();

  it('sounds VCO-1’s sawtooth alone at middle C, VCO-2 silent and off the S/H', () => {
    expect(p.osc).toHaveLength(2);
    expect(p.osc[0]).toMatchObject({
      mix: { saw: 1 },
      pw: 0.5,
      kbd: true,
      fixedNote: 60,
      syncTo: -1,
    });
    expect(p.osc[0].level).toBeCloseTo(0.9, 10);
    expect(p.osc[0].semi).toBeCloseTo(0, 2);
    expect(p.osc[1]).toMatchObject({ level: 0, mix: { saw: 1 }, kbd: true, syncTo: -1 });
    expect(p.noise).toEqual({ level: 0, color: 'white' });
    expect(p.oscOuts).toBe(true);
  });

  it('plays duophonically: VCO-1 the lowest key, VCO-2 the highest', () => {
    expect(p).toMatchObject({ duo: true, paraphonic: true, note2Osc: 1, tune: 0 });
  });

  it('opens the 4075 filter fully with no resonance, envelope or tracking, the high-pass at 16 Hz', () => {
    expect(p.filter).toMatchObject({
      type: 'ladder',
      mode: 'lp',
      res: 0,
      envAmt: 0,
      kbd: 0,
      poles: 4,
    });
    expect(p.filter.cutoff).toBeCloseTo(16000, 6);
    expect(p.hpf).toEqual({ cutoff: 16, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0, poles: 1 });
    expect(p.od).toEqual({ on: false });
  });

  it('shapes the loudness with the AR at full, both envelopes on the keys, and no modulation routes', () => {
    expect(p.vca).toEqual({ envSrc: 'none', bias: 0 });
    expect(p.normals?.amp).toEqual(['env2', 1]);
    expect(p.env2).toEqual({ a: 0.005, d: 0.01, s: 1, r: exp(0.1, 0.01, 10) });
    expect(p.env1.s).toBeCloseTo(0.7, 10);
    expect(p.trig).toEqual({ retrig: true, drone: false, repeat: false, src: ['gate', 'gate'] });
    // KYBD CV at 0 drops the tracking route; every depth slider is down
    expect(p.routes).toEqual([]);
  });

  it('feeds the S/H mixer with the noise at full, read on the LFO at 2 Hz', () => {
    expect(p.normals?.sum1A).toEqual(['o1saw', 0]);
    expect(p.normals?.sum1B).toEqual(['noise', 1]);
    expect(p.normals?.shIn).toBe('sum1');
    expect(p.sh).toEqual({ rate: 2, glide: 0, clock: 'lfo' });
    expect(p.lfo).toEqual({ rate: 2, mix: { sine: 1 }, keySync: false });
  });
});

describe('ODYSSEY toEngine, control by control', () => {
  it('COARSE spans 20 Hz to 2 kHz at middle C; FINE a tone either way', () => {
    expect(run({ 'vco1.coarse': 0 }).osc[0].semi).toBeCloseTo(12 * Math.log2(20 / 261.6256), 4);
    expect(run({ 'vco2.coarse': 10 }).osc[1].semi).toBeCloseTo(12 * Math.log2(2000 / 261.6256), 4);
    expect(run({ 'vco1.fine': 10 }).osc[0].semi - run().osc[0].semi).toBeCloseTo(2, 10);
    expect(run({ 'vco2.fine': 0 }).osc[1].semi - run().osc[1].semi).toBeCloseTo(-2, 10);
  });

  it('LF KYBD OFF takes VCO-1 off the keys, a hundred times lower', () => {
    const o = run({ 'vco1.kybd': 'lf_kybd_off', 'vco1.coarse': 5 }).osc[0];
    expect(o.kbd).toBe(false);
    expect(o.semi).toBe(0);
    expect(o.fixedNote).toBeCloseTo(69 + 12 * Math.log2(2 / 440), 6);
  });

  it('SYNC hard-syncs VCO-2 to VCO-1', () => {
    expect(run({ 'vco2.sync': true }).osc[1].syncTo).toBe(0);
  });

  it('the mixer switches pick the pulse, and the first channel noise or the ring modulator', () => {
    const p = run({ 'mixer.vco1_src': 'pulse', 'mixer.vco2_src': 'pulse', 'mixer.vco2': 5 });
    expect(p.osc[0].mix).toEqual({ pulse: 1 });
    expect(p.osc[1].mix).toEqual({ pulse: 1 });
    expect(p.osc[1].level).toBeCloseTo(level(5, 0.9), 10);
    expect(run({ 'mixer.noise_ring': 10 }).noise.level).toBeCloseTo(0.9, 10);
    const ring = run({ 'mixer.noise_ring': 10, 'mixer.noise_ring_src': 'ring_mod' });
    expect(ring.noise.level).toBe(0);
    expect(routeAmt(ring, 'ring', 'vcfIn')).toBeCloseTo(0.9, 10);
    expect(ring.normals).toMatchObject({ ringA: 'o1pulse', ringB: 'o2pulse' });
    expect(run({ 'noise.colour': 'pink' }).noise.color).toBe('pink');
  });

  it('PULSE WIDTH narrows from 50% to 5%; MOD swings it from the LFO sine or the ADSR', () => {
    expect(run({ 'vco1.pw': 10 }).osc[0].pw).toBeCloseTo(0.05, 10);
    expect(routeAmt(run({ 'vco1.pwm': 10 }), 'lfoSine', 'pw1')).toBeCloseTo(0.45, 10);
    expect(routeAmt(run({ 'vco2.pwm': 5, 'vco2.pwm_src': 'adsr' }), 'env1', 'pw2')).toBeCloseTo(
      0.225,
      10
    );
  });

  it('the FM sliders are square law, on the source each switch picks', () => {
    expect(routeAmt(run({ 'vco1.fm1': 5 }), 'lfoSine', 'pitch1')).toBeCloseTo(3, 10);
    expect(routeAmt(run({ 'vco1.fm1': 10, 'vco1.fm1_src': 'lfo_square' }), 'lfoSq', 'pitch1')).toBe(
      12
    );
    expect(routeAmt(run({ 'vco1.fm2': 10 }), 'sh', 'pitch1')).toBe(24);
    expect(routeAmt(run({ 'vco2.fm2': 10, 'vco2.fm2_src': 'adsr' }), 'env1', 'pitch2')).toBe(48);
    expect(routeAmt(run({ 'vco2.fm1': 10, 'vco2.fm1_src': 'snh_mixer' }), 'sum1', 'pitch2')).toBe(
      24
    );
  });

  it('the mod wheel is the LFO pad: vibrato on both VCOs', () => {
    const p = run({}, { wheel: 1, patched: {} });
    expect(routeAmt(p, 'lfoSine', 'pitch1')).toBe(1);
    expect(routeAmt(p, 'lfoSine', 'pitch2')).toBe(1);
  });

  it('the S/H mixer switches and OUTPUT LAG', () => {
    const p = run({
      'snh.mix1': 5,
      'snh.mix1_src': 'vco1_pulse',
      'snh.mix2_src': 'vco2_pulse',
      'snh.lag': 10,
    });
    expect(p.normals?.sum1A).toEqual(['o1pulse', 0.5]);
    expect(p.normals?.sum1B).toEqual(['o2pulse', 1]);
    expect(p.sh?.glide).toBeCloseTo(1.5, 10);
    // KYBD TRIG is not modelled: the LFO still clocks it
    expect(run({ 'snh.trigger': 'kybd' }).sh?.clock).toBe('lfo');
  });

  it('VCF MODE: the 4023 at 2 poles, the 4035 and 4075 at 4, the 4075 driven harder', () => {
    expect(run({ 'vcf.mode': '4023' }).filter).toMatchObject({ poles: 2, drive: 0.8 });
    expect(run({ 'vcf.mode': '4035' }).filter).toMatchObject({ poles: 4, drive: 0.8 });
    expect(run({ 'vcf.mode': '4075' }).filter).toMatchObject({ poles: 4, drive: 1.1 });
  });

  it('the filter sliders: tracking from the top key, the S/H mixer, S/H or LFO, and either envelope', () => {
    expect(routeAmt(run({ 'vcf.mod1': 10 }), 'kbd2', 'cutoff')).toBe(1);
    expect(routeAmt(run({ 'vcf.mod1': 10, 'vcf.mod1_src': 'snh_mixer' }), 'sum1', 'cutoff')).toBe(
      3
    );
    expect(routeAmt(run({ 'vcf.mod2': 5 }), 'sh', 'cutoff')).toBe(1.5);
    expect(routeAmt(run({ 'vcf.mod2': 5, 'vcf.mod2_src': 'lfo_sine' }), 'lfoSine', 'cutoff')).toBe(
      1.5
    );
    expect(run({ 'vcf.env': 10 }).filter).toMatchObject({ envAmt: 8, envSrc: 'env1' });
    expect(run({ 'vcf.env': 5, 'vcf.env_src': 'ar' }).filter).toMatchObject({
      envAmt: 4,
      envSrc: 'env2',
    });
    expect(run({ 'vcf.resonance': 10 }).filter.res).toBeCloseTo(1.1, 10);
    expect(run({ 'hpf.cutoff': 10 }).hpf?.cutoff).toBeCloseTo(16000, 6);
  });

  it('DRIVE, VCA GAIN and the VCA envelope switch', () => {
    expect(run({ 'drive.on': true }).od).toEqual({ on: true, drive: 0.35, tone: 0.5, level: 0.8 });
    expect(run({ 'vca.gain': 5 }).vca.bias).toBe(0.5);
    expect(run({ 'vca.env_src': 'adsr', 'vca.env': 5 }).normals?.amp).toEqual(['env1', 0.5]);
  });

  it('the envelope times are the guide’s ranges', () => {
    const p = run({
      'adsr.attack': 10,
      'adsr.decay': 0,
      'adsr.sustain': 10,
      'adsr.release': 10,
      'ar.attack': 10,
      'ar.release': 0,
    });
    expect(p.env1).toEqual({ a: 5, d: 0.01, s: 1, r: 10 });
    expect(p.env2).toMatchObject({ a: 5, r: 0.01 });
  });

  it('LFO REPEAT moves an envelope onto the LFO square, gated by the key on KYBD REPEAT', () => {
    const kybd = run({ 'repeat.adsr': 'lfo_repeat' });
    expect(kybd.trig.src).toEqual(['sh', 'gate']);
    expect(kybd.routes).toContainEqual({ src: 'lfoSq', dst: 'envClk', amt: 1, by: 'gate' });
    const auto = run({ 'repeat.ar': 'lfo_repeat', 'repeat.mode': 'auto_repeat' });
    expect(auto.trig.src).toEqual(['gate', 'sh']);
    expect(auto.routes).toContainEqual({ src: 'lfoSq', dst: 'envClk', amt: 1 });
  });

  it('TRANSPOSE moves the keyboard two octaves; PORTAMENTO glides up to three seconds', () => {
    expect(run({ 'kbd.transpose': 'up_2' }).tune).toBe(24);
    expect(run({ 'kbd.transpose': 'down_2' }).tune).toBe(-24);
    expect(run({ 'kbd.portamento': 10 }).glide).toEqual({ time: 3, legato: false });
    expect(run({ 'kbd.portamento': 5 }).glide.time).toBeCloseTo(0.75, 10);
  });

  it('the effects, the sequencer and the portamento MODE do not change the sound', () => {
    expect(
      run({
        'fx.on': true,
        'fx.send': 10,
        'fx.program': 12,
        'kbd.porta_mode': true,
        'seq.tempo': 200,
      })
    ).toEqual(run());
  });
});

describe('ODYSSEY through the engine', () => {
  const SR = 48000;
  const hz = (b: Float32Array, from: number, to: number): number => {
    const ups: number[] = [];
    for (let i = from + 1; i < to; i++) if (b[i - 1] < 0 && b[i] >= 0) ups.push(i);
    return ((ups.length - 1) * SR) / (ups[ups.length - 1] - ups[0]);
  };
  const midiHz = (n: number) => 440 * 2 ** ((n - 69) / 12);
  const on = (at: number, n: number): Timed => [at, { type: 'noteOn', n, v: 0.8 }];
  const C3 = 48,
    G3 = 55;
  const twoKeys = { len: 14400, events: [on(0, C3), on(4800, G3)] };
  // one VCO heard at a time, through the open filter
  const alone = (n: 1 | 2): EngineParams =>
    run({ 'mixer.vco1': n === 1 ? 10 : 0, 'mixer.vco2': n === 2 ? 10 : 0 });

  it('with two keys held, VCO-1 plays the lower and VCO-2 the higher', () => {
    expect(hz(render(alone(1), twoKeys).out, 7200, 14400)).toBeCloseTo(midiHz(C3), -1);
    expect(hz(render(alone(2), twoKeys).out, 7200, 14400)).toBeCloseTo(midiHz(G3), -1);
  });

  it('AUTO REPEAT sounds the AR with no key held; KYBD REPEAT stays silent', () => {
    const quiet = { len: 24000, events: [] };
    const auto = run({ 'repeat.ar': 'lfo_repeat', 'repeat.mode': 'auto_repeat', 'lfo.freq': 10 });
    const kybd = run({ 'repeat.ar': 'lfo_repeat', 'lfo.freq': 10 });
    expect(rms(render(auto, quiet).out)).toBeGreaterThan(0.01);
    expect(rms(render(kybd, quiet).out)).toBe(0);
  });
});

describe('ODYSSEY readouts', () => {
  it('reads the scales the panel prints', () => {
    expect(readout('vco2.coarse', 5)).toBe('200 Hz (G3 at C4)');
    expect(readout('vco1.coarse', 5, { 'vco1.kybd': 'lf_kybd_off' })).toBe('2.00 Hz (LF)');
    expect(readout('lfo.freq', 0)).toBe('0.20 Hz');
    expect(readout('vcf.freq', 0)).toBe('16 Hz');
    expect(readout('vco1.pw', 10)).toBe('5%');
    expect(readout('vco1.fine', 10)).toBe('+2 st');
    expect(readout('kbd.portamento', 0)).toBe('off');
    expect(readout('adsr.release', 0)).toBe('15 ms');
  });
});

describe('ODYSSEY panel', () => {
  it('tags the maker’s marks as brand', () => {
    const marks = odyssey.decor.filter(
      (d) => (d.t === 'text' && /KLARK|POWERED/.test(d.text)) || d.t === 'logo'
    );
    expect(marks.length).toBe(3);
    expect(marks.every((d) => d.brand === true)).toBe(true);
  });

  it('gives the sequencer’s buttons to the app’s sequencer', () => {
    expect(odyssey.seqButtons).toMatchObject({
      'seq.play_stop': 'run',
      'seq.rec': 'record',
      'seq.arp': 'arp',
      'seq.hold_rest': 'hold',
      'seq.reset_accent': 'accent',
      'seq.kybd': 'back',
      'seq.step': 'next',
      'seq.step1': { step: 0 },
      'seq.step8': { step: 7 },
    });
    expect(odyssey.tempo).toBe('seq.tempo');
  });
});
