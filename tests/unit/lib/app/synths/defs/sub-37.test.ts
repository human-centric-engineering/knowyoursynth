/**
 * Moog Sub 37 definition tests: the panel → engine mapping at init and for each switch that changes it, the mod buses
 * and their depth controllers, duo mode, the envelopes' KNOB SHIFT, LOOP and LATCH, the arpeggiator, and the maker's
 * marks.
 *
 * The Sub 37 has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except
 * its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip
 * shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/sub-37.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues, EngineContext, EngineRoute } from '@/lib/app/synths/contract';
import sub37 from '@/lib/app/synths/defs/sub-37';

const run = (set: ControlValues = {}, wheel = 0) =>
  sub37.toEngine({ ...sub37.init, ...set }, { wheel, patched: {} } satisfies EngineContext);
const route = (routes: EngineRoute[] | undefined, src: string, dst: string, by?: string) =>
  (routes || []).filter((r) => r.src === src && r.dst === dst && r.by === by);
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
/** `level10` worked out. */
const lvl = (v: number, max: number) => Math.pow(v / 10, 1.7) * max;

describe('Sub 37 toEngine at the init patch', () => {
  const p = run();

  it('plays Oscillator 1’s sawtooth alone at 8′, Oscillator 2 and the sub silent', () => {
    expect(p.osc).toHaveLength(3);
    expect(p.osc[0]).toEqual({ level: lvl(5, 1.2), morph: 0.5, semi: 0, kbd: true, syncTo: -1 });
    expect(p.osc[1]).toEqual({ level: 0, morph: 0.5, semi: 0, kbd: true, syncTo: -1 });
    expect(p.osc[2]).toEqual({
      level: 0,
      mix: { pulse: 1 },
      pw: 0.5,
      semi: -12,
      kbd: true,
      syncTo: -1,
    });
    expect(p.noise).toEqual({ level: 0, color: 'pink' });
    expect(p.ext).toEqual({ level: 0 });
    expect(p.normals).toEqual({ extIn: 'mixer' });
  });

  it('opens the 24 dB ladder fully, with no resonance, envelope sweep or key tracking', () => {
    expect(p.filter).toEqual({
      type: 'ladder',
      mode: 'lp',
      cutoff: 20000,
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
      drive: 0.8,
      poles: 4,
    });
    expect(p.od).toEqual({ on: false });
  });

  it('gives the loudness a full-sustain gate with a short release, and has no route', () => {
    expect(p.vca).toEqual({ envSrc: 'env2', bias: 0 });
    expect(p.env2.a).toBeCloseTo(0.001, 9);
    expect(p.env2.s).toBe(1);
    expect(p.env2.r).toBeCloseTo(exp(0.3, 0.001, 10), 9);
    expect(p.env2.dly).toBeUndefined();
    expect(p.env2.loop).toBeUndefined();
    expect(p.env1.dly).toBe(0);
    expect(p.routes).toEqual([]);
  });

  it('is one mono voice with the arpeggiator off, glide off and single triggering', () => {
    expect(p.poly).toEqual({ voices: 1, stack: 1, mono: true });
    expect(p.arp?.on).toBe(false);
    expect(p.duo).toBe(false);
    expect(p.paraphonic).toBe(false);
    expect(p.glide).toEqual({ time: 0, legato: false });
    expect(p.trig).toEqual({ retrig: false, drone: false, repeat: false });
    expect(p.tune).toBe(0);
    expect(p.volume).toBeCloseTo(lvl(7, 1), 12);
  });

  it('runs both LFOs freely at 3.2 Hz as triangles', () => {
    expect(p.lfo).toEqual({ rate: exp(0.5, 0.1, 100), mix: { tri: 1 }, keySync: false });
    expect(p.lfo2).toEqual({ rate: exp(0.5, 0.1, 100), mix: { tri: 1 }, keySync: false });
  });
});

describe('Sub 37 oscillators', () => {
  it('sweeps WAVE from triangle through saw and square to a narrow pulse', () => {
    expect(run({ 'osc1.wave': 0 }).osc[0].morph).toBe(0);
    expect(run({ 'osc1.wave': 20 / 3 }).osc[0].morph).toBeCloseTo(2 / 3, 12);
    expect(run({ 'osc2.wave': 10 }).osc[1].morph).toBe(1);
  });

  it('sets the octave in feet, and the sub follows Oscillator 1 an octave down', () => {
    const p = run({ 'osc1.octave': "16'", 'osc2.octave': "2'" });
    expect(p.osc[0].semi).toBe(-12);
    expect(p.osc[2].semi).toBe(-24);
    expect(p.osc[1].semi).toBe(24);
  });

  it('tunes Oscillator 2 by FREQUENCY in semitones and BEAT FREQ in hertz at middle C', () => {
    expect(run({ 'osc2.frequency': 7 }).osc[1].semi).toBe(7);
    expect(run({ 'osc2.beat': 3.5 }).osc[1].semi).toBeCloseTo(12 * Math.log2(1 + 3.5 / 261.63), 12);
  });

  it('hard-syncs Oscillator 2 to Oscillator 1', () => {
    expect(run({ 'osc2.hardSync': true }).osc[1].syncTo).toBe(0);
  });

  it('FINE TUNE and TRANSPOSE move the whole synth', () => {
    expect(run({ 'osc.fineTune': -50 }).tune).toBe(-0.5);
    expect(run({ 'kbd.transpose': 7 }).tune).toBe(7);
  });
});

describe('Sub 37 duo mode', () => {
  it('gives Oscillator 2 the highest key with KB CTRL HI', () => {
    const p = run({ 'osc.duo': true });
    expect(p.duo).toBe(true);
    expect(p.paraphonic).toBe(true);
    expect(p.note2Osc).toBe(1);
  });

  it('gives Oscillator 1 the highest key with KB CTRL LO', () => {
    expect(run({ 'osc.duo': true, 'osc2.kbCtrl': 'lo' }).note2Osc).toBe(0);
  });

  it('drones Oscillator 2 at middle C with KB CTRL OFF, FREQUENCY reaching three octaves', () => {
    const p = run({ 'osc.duo': true, 'osc2.kbCtrl': 'off', 'osc2.frequency': 7 });
    expect(p.duo).toBe(false);
    expect(p.paraphonic).toBe(false);
    expect(p.osc[1]).toMatchObject({ kbd: false, fixedNote: 60, semi: 36 });
  });

  it('ignores KB CTRL OFF without DUO MODE', () => {
    expect(run({ 'osc2.kbCtrl': 'off', 'osc2.frequency': 7 }).osc[1]).toMatchObject({
      kbd: true,
      semi: 7,
    });
  });
});

describe('Sub 37 mixer', () => {
  it('switches each channel off with its button, keeping its level', () => {
    expect(run({ 'mixer.osc1On': false }).osc[0].level).toBe(0);
    expect(run({ 'mixer.sub': 10 }).osc[2].level).toBeCloseTo(1.2, 12);
    expect(run({ 'mixer.noise': 10, 'mixer.noiseOn': false }).noise.level).toBe(0);
  });

  it('feeds the mixer back into itself, kept under unity gain', () => {
    expect(run({ 'mixer.fbext': 10 }).ext.level).toBeCloseTo(0.7, 12);
    expect(run({ 'mixer.fbext': 10, 'mixer.fbextOn': false }).ext.level).toBe(0);
  });

  it('drives the filter’s input harder for each channel past 5', () => {
    expect(run({ 'mixer.osc1': 10 }).filter.drive).toBeCloseTo(1.7, 12);
    expect(run({ 'mixer.osc1': 10, 'mixer.osc2': 7.5 }).filter.drive).toBeCloseTo(2.15, 12);
  });
});

describe('Sub 37 filter', () => {
  it('maps CUTOFF from 20 Hz to 20 kHz exponentially', () => {
    expect(run({ 'vcf.cutoff': 0 }).filter.cutoff).toBeCloseTo(20, 9);
    expect(run({ 'vcf.cutoff': 4 }).filter.cutoff).toBeCloseTo(exp(0.4, 20, 20000), 9);
  });

  it('self-oscillates from 7 on RESONANCE', () => {
    expect(run({ 'vcf.resonance': 7 }).filter.res).toBe(1);
    expect(run({ 'vcf.resonance': 10 }).filter.res).toBeCloseTo(1.1, 12);
  });

  it('takes SLOPE as the ladder’s poles', () => {
    expect(run({ 'vcf.slope': '-6' }).filter.poles).toBe(1);
    expect(run({ 'vcf.slope': '-12' }).filter.poles).toBe(2);
    expect(run({ 'vcf.slope': '-18' }).filter.poles).toBe(3);
  });

  it('sweeps EG AMT either way and tracks the keys 1:1 at half', () => {
    expect(run({ 'vcf.egAmt': -5 }).filter.envAmt).toBe(-8);
    expect(run({ 'vcf.kbTrack': 5 }).filter.kbd).toBe(1);
  });

  it('switches MULTIDRIVE’s overdrive in after the filter', () => {
    expect(run({ 'drive.amount': 10 }).od).toEqual({
      on: true,
      drive: 0.65,
      tone: 0.55,
      level: 0.95,
    });
  });
});

describe('Sub 37 envelopes', () => {
  it('reads DELAY and HOLD from the KNOB SHIFT knobs, the amp DELAY only with LOOP', () => {
    const p = run({ 'envF.delay': 5, 'envA.delay': 5, 'envA.hold': 5 });
    expect(p.env1.dly).toBeCloseTo(0.1, 9);
    expect(p.env2.dly).toBeUndefined();
    expect(p.env2.hold).toBeCloseTo(0.1, 9);
    expect(run({ 'envA.delay': 5, 'envA.loop': true }).env2.dly).toBeCloseTo(0.1, 9);
  });

  it('loops every stage with LOOP', () => {
    expect(run({ 'envF.loop': true }).env1).toMatchObject({ loop: true, loopAll: true });
  });

  it('shortens the times on higher keys with KB TRACK', () => {
    expect(run({ 'envA.kbTrack': 10 }).env2.kf).toBeCloseTo(1.2, 12);
  });

  it('retriggers on every key with either MULTI TRIG', () => {
    expect(run({ 'envF.multiTrig': true }).trig.retrig).toBe(true);
    expect(run({ 'envA.multiTrig': true }).trig.retrig).toBe(true);
  });

  it('splits the filter sweep between a fixed part and a velocity part with VEL AMT', () => {
    const p = run({ 'vcf.egAmt': 5, 'envF.velAmt': 5 });
    expect(p.filter.envAmt).toBe(4);
    expect(route(p.routes, 'env1', 'cutoff', 'vel')).toEqual([
      { src: 'env1', dst: 'cutoff', amt: 4, by: 'vel' },
    ]);
  });

  it('scales the loudness by velocity with the amp VEL AMT', () => {
    const p = run({ 'envA.velAmt': 10 });
    expect(route(p.routes, 'env2', 'amp')).toEqual([{ src: 'env2', dst: 'amp', amt: -1 }]);
    expect(route(p.routes, 'env2', 'amp', 'vel')).toEqual([
      { src: 'env2', dst: 'amp', amt: 1, by: 'vel' },
    ]);
  });

  it('holds the amp envelope at SUSTAIN with LATCH ON, so the VCA stays open', () => {
    expect(run({ 'envA.latch': true, 'envA.sustain': 8 }).vca).toEqual({
      envSrc: 'none',
      bias: 0.8,
    });
  });

  it('turns the filter envelope into a steady lift of the cutoff with LATCH ON', () => {
    const p = run({ 'envF.latch': true, 'vcf.cutoff': 5, 'vcf.egAmt': 2.5, 'envF.sustain': 5 });
    expect(p.filter.envAmt).toBe(0);
    expect(p.filter.cutoff).toBeCloseTo(exp(0.5, 20, 20000) * Math.pow(2, 4 * 0.5), 6);
  });
});

describe('Sub 37 mod buses', () => {
  it('sends MOD 1’s LFO to pitch only as far as the mod wheel goes, by default', () => {
    expect(run({ 'mod1.pitchAmt': 5 }).routes).toEqual([]);
    expect(run({ 'mod1.pitchAmt': 5 }, 0.5).routes).toEqual([
      { src: 'lfo', dst: 'pitchAll', amt: 12 },
    ]);
  });

  it('sends MOD 2 at its full amounts, with no controller set', () => {
    expect(route(run({ 'mod2.filterAmt': -5 }).routes, 'lfo2', 'cutoff')).toEqual([
      { src: 'lfo2', dst: 'cutoff', amt: -5 },
    ]);
  });

  it('splits the depth between the wheel, velocity, aftertouch and CTRL4', () => {
    const p = run(
      {
        'mod2.filterAmt': 5,
        'mod2.velDepth': 50,
        'mod2.atDepth': 25,
        'mod2.ctrl4Depth': 25,
        'mod2.ctrl4Src': 'amp_eg',
      },
      1
    );
    expect(route(p.routes, 'lfo2', 'cutoff')).toEqual([]);
    expect(route(p.routes, 'lfo2', 'cutoff', 'vel')).toEqual([
      { src: 'lfo2', dst: 'cutoff', amt: 2.5, by: 'vel' },
    ]);
    expect(route(p.routes, 'lfo2', 'cutoff', 'press')).toEqual([
      { src: 'lfo2', dst: 'cutoff', amt: 1.25, by: 'press' },
    ]);
    expect(route(p.routes, 'lfo2', 'cutoff', 'env2')).toEqual([
      { src: 'lfo2', dst: 'cutoff', amt: 1.25, by: 'env2' },
    ]);
  });

  it('gives the breath controller no share, as the app has none', () => {
    const p = run({ 'mod2.filterAmt': 5, 'mod2.ctrl4Depth': 100 });
    expect(p.routes).toEqual([{ src: 'lfo2', dst: 'cutoff', amt: 5 }]);
  });

  it('chooses the LFO’s wave by SOURCE, and the programmable source at F.EG/PGM', () => {
    expect(run({ 'mod1.source': 'sample_hold' }).lfo.mix).toEqual({ sh: 1 });
    expect(run({ 'mod2.source': 'saw' }).lfo2?.mix).toEqual({ rsaw: 1 });
    expect(run({ 'mod2.source': 'ramp' }).lfo2?.mix).toEqual({ saw: 1 });
    expect(run({ 'mod2.source': 'feg_pgm', 'mod2.filterAmt': 5 }).routes).toEqual([
      { src: 'env1', dst: 'cutoff', amt: 5 },
    ]);
    expect(
      run({ 'mod2.source': 'feg_pgm', 'mod2.pgmSrc': 'pressure', 'mod2.filterAmt': 5 }).routes
    ).toEqual([{ src: 'press', dst: 'cutoff', amt: 5 }]);
  });

  it('reaches one oscillator’s pitch with OSC, the sub following Oscillator 1', () => {
    expect(run({ 'mod2.pitchAmt': -5, 'mod2.pitchOsc': 'osc2' }).routes).toEqual([
      { src: 'lfo2', dst: 'pitch2', amt: -24 },
    ]);
    expect(run({ 'mod2.pitchAmt': 2.5, 'mod2.pitchOsc': 'osc1' }).routes).toEqual([
      { src: 'lfo2', dst: 'pitch1', amt: 6 },
      { src: 'lfo2', dst: 'pitch3', amt: 6 },
    ]);
  });

  it('sends MOD AMT to the destination DEST chooses', () => {
    const to = (dest: string, extra: ControlValues = {}) =>
      run({ 'mod2.modAmt': 5, 'mod2.dest': dest, ...extra }).routes;
    expect(to('lfo_rate')).toEqual([{ src: 'lfo2', dst: 'lfoRate', amt: 4 }]);
    expect(to('vca_level')).toEqual([{ src: 'lfo2', dst: 'amp', amt: 1 }]);
    expect(to('osc1_osc2_wave')).toEqual([
      { src: 'lfo2', dst: 'wave1', amt: 0.6 },
      { src: 'lfo2', dst: 'wave2', amt: 0.6 },
    ]);
    expect(to('osc2_wave')).toEqual([{ src: 'lfo2', dst: 'wave2', amt: 0.6 }]);
    expect(to('noise_level')).toEqual([{ src: 'lfo2', dst: 'noiseLvl', amt: 0.9 }]);
    expect(to('eg_time_pgm')).toEqual([
      { src: 'lfo2', dst: 'env1Rate', amt: -3 },
      { src: 'lfo2', dst: 'env2Rate', amt: -3 },
    ]);
    expect(to('eg_time_pgm', { 'mod2.pgmDst': 'filter_res' })).toEqual([
      { src: 'lfo2', dst: 'res', amt: 0.6 },
    ]);
    expect(to('eg_time_pgm', { 'mod2.pgmDst': 'osc_levels' })).toEqual([
      { src: 'lfo2', dst: 'lvl1', amt: 0.9 },
      { src: 'lfo2', dst: 'lvl2', amt: 0.9 },
    ]);
  });

  it('takes MOD 1’s LFO RATE destination to LFO 2', () => {
    expect(run({ 'mod1.modAmt': -5, 'mod1.dest': 'lfo_rate' }, 1).routes).toEqual([
      { src: 'lfo', dst: 'lfo2Rate', amt: -4 },
    ]);
  });

  it('multiplies the rate by ten with HI RANGE, restarts it with KB RESET, and tracks the keys', () => {
    const p = run({ 'lfo1.hiRange': true, 'lfo2.kbReset': true, 'lfo2.kbTrack': 100 });
    expect(p.lfo.rate).toBeCloseTo(exp(0.5, 0.1, 100) * 10, 9);
    expect(p.lfo2?.keySync).toBe(true);
    expect(route(p.routes, 'kbd', 'lfo2Rate')).toEqual([{ src: 'kbd', dst: 'lfo2Rate', amt: 1 }]);
  });
});

describe('Sub 37 glide and arpeggiator', () => {
  it('glides over TIME only while GLIDE is ON, legato with LEGATO', () => {
    expect(run({ 'glide.on': true }).glide).toEqual({ time: 5 * 0.09, legato: false });
    expect(run({ 'glide.on': true, 'glide.legato': true }).glide.legato).toBe(true);
  });

  it('plays the held keys at RATE in sixteenths', () => {
    const p = run({ 'arp.on': true });
    expect(p.arp).toEqual({
      on: true,
      bpm: expect.closeTo(120, 6),
      gate: 0.5,
      mode: 'up',
      octaves: 1,
      hold: false,
    });
    expect(run({ 'arp.on': true, 'arp.clockDiv': '1/8' }).arp?.bpm).toBeCloseTo(60, 6);
  });

  it('takes PATTERN, BACK/FORTH and LATCH, and leaves SEQ and REC to the app’s sequencer', () => {
    expect(run({ 'arp.on': true, 'arp.pattern': 'order' }).arp?.mode).toBe('played');
    expect(run({ 'arp.on': true, 'arp.pattern': 'down', 'arp.backForth': true }).arp?.mode).toBe(
      'downup'
    );
    expect(run({ 'arp.on': true, 'arp.latch': true }).arp?.hold).toBe(true);
    expect(run({ 'arp.on': true, 'arp.pattern': 'seq' }).arp?.on).toBe(false);
  });

  it('spans the octaves of RANGE, climbing from below for a range under the keys', () => {
    expect(run({ 'arp.on': true, 'arp.range': '+2' }).arp?.octaves).toBe(3);
    const down = run({ 'arp.on': true, 'arp.range': '-1' });
    expect(down.arp?.octaves).toBe(2);
    expect(down.tune).toBe(-12);
    expect(run({ 'arp.range': '-1' }).tune).toBe(0);
  });
});

describe('Sub 37 output and panel modes', () => {
  it('silences the output with MUTE', () => {
    expect(run({ 'out.mute': true }).volume).toBe(0);
  });

  it('ignores the panel-mode controls', () => {
    expect(
      run({ 'ui.page': 'm2p', 'env.knobShift': true, 'ui.controllers1': true, 'seq.step3': true })
    ).toEqual(run());
  });

  it('shows each envelope knob’s shifted control only with KNOB SHIFT', () => {
    const attack = sub37.controls.find((c) => c.id === 'envF.attack');
    const delay = sub37.controls.find((c) => c.id === 'envF.delay');
    expect(attack?.show).toEqual({ id: 'env.knobShift', eq: false });
    expect(delay?.show).toEqual({ id: 'env.knobShift', eq: true });
    expect([attack?.x, attack?.y]).toEqual([delay?.x, delay?.y]);
  });

  it('makes the 16 PRESET buttons the sequencer’s steps', () => {
    expect(Object.keys(sub37.seqButtons ?? {})).toHaveLength(16);
    expect(sub37.seqButtons?.['seq.step16']).toEqual({ step: 15 });
  });
});

describe('Sub 37 readouts', () => {
  const fmt = (id: string, v: number | string) => {
    const c = sub37.controls.find((x) => x.id === id);
    if (!c || !('fmt' in c) || !c.fmt) throw new Error(`no readout for ${id}`);
    return (c.fmt as (x: number | string) => string)(v);
  };

  it('reads the ranges the manual gives at the ends of their knobs', () => {
    expect(fmt('vcf.cutoff', 0)).toBe('20 Hz');
    expect(fmt('vcf.cutoff', 10)).toBe('20 kHz');
    expect(fmt('lfo1.rate', 0)).toBe('0.10 Hz');
    expect(fmt('lfo2.rate', 10)).toBe('100 Hz');
    expect(fmt('envF.attack', 0)).toBe('1 ms');
    expect(fmt('envA.release', 10)).toBe('10 s');
    expect(fmt('arp.rate', 0)).toBe('2 BPM');
    expect(fmt('arp.rate', 10)).toBe('280 BPM');
  });

  it('reads DELAY and HOLD as 0 at the bottom, and times above it', () => {
    expect(fmt('envA.delay', 0)).toBe('0');
    expect(fmt('envF.hold', 5)).toBe('100 ms');
  });

  it('signs the bipolar and offset controls', () => {
    expect(fmt('mod1.pitchAmt', -2.5)).toBe('−2.5');
    expect(fmt('vcf.egAmt', 0)).toBe('0.0');
    expect(fmt('osc.fineTune', 50)).toBe('+50 cents');
    expect(fmt('osc2.frequency', -7)).toBe('−7.00 st');
    expect(fmt('osc2.beat', 3.5)).toBe('+3.50 Hz');
    expect(fmt('mod2.wheelDepth', -40)).toBe('−40 %');
    expect(fmt('kbd.transpose', 12)).toBe('+12 st');
  });

  it('names the wave between the shapes', () => {
    expect(
      ['triangle', 'tri → saw', 'sawtooth', 'saw → square', 'square', 'narrowing pulse'].map(
        (_, i) => fmt('osc1.wave', [0, 2, 3.33, 5, 6.67, 9][i])
      )
    ).toEqual(['triangle', 'tri → saw', 'sawtooth', 'saw → square', 'square', 'narrowing pulse']);
  });

  it('reads glide as a time, the source by name and the percentages whole', () => {
    expect(fmt('glide.time', 10)).toBe('5.0 s');
    expect(fmt('mod1.source', 'feg_pgm')).toBe('F.EG/PGM');
    expect(fmt('mod1.source', 'other')).toBe('other');
    expect(fmt('lfo1.kbTrack', 100)).toBe('100 %');
    expect(fmt('arp.gateLen', 50)).toBe('50 %');
    expect(fmt('mixer.osc1', 7)).toBe('7.0');
  });
});

describe('Sub 37 maker’s marks', () => {
  it('tags the badge, the strapline and the logo as brand, and nothing else', () => {
    const brand = sub37.decor.filter((d) => d.brand);
    const texts = brand.flatMap((d) => (d.t === 'text' ? [d.text] : []));
    expect(texts).toEqual([
      'SUB 37',
      'Bob Moog',
      'TRIBUTE',
      'PARAPHONIC ANALOG SYNTHESIZER',
      'Designed & Handcrafted By Moog Music In Asheville, NC',
      'm',
    ]);
    expect(brand.filter((d) => d.t === 'circle')).toHaveLength(1);
    const plain = sub37.decor.flatMap((d) => (d.t === 'text' && !d.brand ? [d.text] : []));
    expect(plain.some((t) => /moog|sub 37/i.test(t))).toBe(false);
  });
});
