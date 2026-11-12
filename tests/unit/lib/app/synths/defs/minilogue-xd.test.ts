/**
 * Korg minilogue xd definition tests: the panel → engine mapping at init and for each switch that changes it, the
 * voice modes, the MULTI ENGINE, the effects, the joystick, and the maker's marks.
 *
 * The minilogue xd has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering
 * except its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a
 * slip shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/minilogue-xd.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  ControlValues,
  EngineContext,
  EngineRoute,
  TextDecor,
} from '@/lib/app/synths/contract';
import xd from '@/lib/app/synths/defs/minilogue-xd';

const run = (set: ControlValues = {}) =>
  xd.toEngine({ ...xd.init, ...set }, { wheel: 0, patched: {} } satisfies EngineContext);
const route = (routes: EngineRoute[] | undefined, src: string, dst: string, by?: string) =>
  (routes || []).filter((r) => r.src === src && r.dst === dst && r.by === by);
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);

describe('minilogue xd toEngine at the init patch', () => {
  const p = run();

  it('plays VCO 1’s sawtooth alone at 8′, with VCO 2 and the MULTI ENGINE silent', () => {
    expect(p.osc).toHaveLength(3);
    expect(p.osc[0]).toEqual({ level: 0.6, mix: { sfold: 1 }, fold: 0, semi: 0, kbd: true });
    expect(p.osc[1]).toMatchObject({ level: 0, syncTo: -1 });
    expect(p.osc[2]).toMatchObject({ level: 0, semi: 0, mix: { mnoise: 1 } });
    expect(p.osc[2].mnoise).toEqual({ type: 'hp', shape: 512 / 1023 });
    expect(p.noise.level).toBe(0);
    expect(p.pwSplit).toBe(true);
    expect(p.normals).toEqual({ ringA: 'osc1', ringB: 'osc2' });
  });

  it('opens the 12 dB filter fully, with no drive, key tracking or envelope', () => {
    expect(p.filter).toEqual({
      type: 'svf',
      mode: 'lp',
      cutoff: 20000,
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    });
    expect(p.od).toEqual({ on: false });
  });

  it('gives the loudness a full-sustain AMP EG and has no route', () => {
    expect(p.vca).toEqual({ envSrc: 'env2', bias: 0 });
    expect(p.env2.a).toBeCloseTo(0.0006, 6);
    expect(p.env2.s).toBe(1);
    expect(p.env1.s).toBe(0);
    expect(p.env1.r).toBe(p.env1.d);
    expect(p.routes).toEqual([]);
  });

  it('is four-voice polyphonic, with the arpeggiator, effects and glide off', () => {
    expect(p.poly).toEqual({ voices: 4, stack: 1, mono: false });
    expect(p.arp?.on).toBe(false);
    expect(p.fx).toEqual({ mode: 'bypass' });
    expect(p.glide).toEqual({ time: 0, legato: true });
    expect(p.trig).toEqual({ retrig: true, drone: false, repeat: false });
    expect(p.tune).toBe(0);
    expect(p.volume).toBeCloseTo(Math.pow(0.7, 1.7), 9);
  });

  it('runs the LFO freely at the middle of its range', () => {
    expect(p.lfo).toEqual({ rate: exp(512 / 1023, 0.05, 28), mix: { tri: 1 }, keySync: false });
  });
});

describe('minilogue xd VCOs', () => {
  it('narrows the square’s duty cycle from 50 % to 5 % with SHAPE', () => {
    const sq = run({ 'vco1.wave': 'sqr', 'vco1.shape': 1023 }).osc[0];
    expect(sq.mix).toEqual({ pulse: 1 });
    expect(sq.pw).toBeCloseTo(0.05, 12);
    expect(run({ 'vco1.wave': 'sqr' }).osc[0].pw).toBe(0.5);
  });

  it('folds the triangle and the sawtooth with SHAPE', () => {
    expect(run({ 'vco1.wave': 'tri', 'vco1.shape': 1023 }).osc[0]).toMatchObject({
      mix: { tfold: 1 },
      fold: 1,
    });
    expect(run({ 'vco2.shape': 512 }).osc[1]).toMatchObject({
      mix: { sfold: 1 },
      fold: 512 / 1023,
    });
  });

  it('sets the octave in feet and PITCH in cents', () => {
    expect(run({ 'vco1.octave': "16'", 'vco1.pitch': -50 }).osc[0].semi).toBe(-12.5);
    expect(run({ 'vco2.octave': "2'", 'vco2.pitch': 700 }).osc[1].semi).toBe(31);
    expect(run({ 'vco1.octave': "4'" }).osc[0].semi).toBe(12);
  });

  it('syncs VCO 2 to VCO 1', () => {
    expect(run({ 'vco2.sync': true }).osc[1].syncTo).toBe(0);
  });

  it('puts the ring modulator on VCO 2’s channel in place of VCO 2', () => {
    const p = run({ 'vco2.ring': true, 'mix.vco2': 1023 });
    expect(p.osc[1].level).toBe(0);
    expect(route(p.routes, 'ring', 'vcfIn')).toEqual([{ src: 'ring', dst: 'vcfIn', amt: 0.6 }]);
    expect(route(run({ 'mix.vco2': 1023 }).routes, 'ring', 'vcfIn')).toEqual([]);
  });

  it('frequency-modulates VCO 2 by VCO 1 with CROSS MOD DEPTH, squared', () => {
    const p = run({ 'vco2.xmod': 1023 });
    expect(route(p.routes, 'osc1', 'pitch2')).toEqual([{ src: 'osc1', dst: 'pitch2', amt: 36 }]);
    expect(route(run({ 'vco2.xmod': 0 }).routes, 'osc1', 'pitch2')).toEqual([]);
  });

  it('sets each mixer level linearly to 0.6', () => {
    const p = run({ 'mix.vco1': 0, 'mix.vco2': 1023, 'mix.multi': 1023 });
    expect(p.osc.map((o) => o.level)).toEqual([0, 0.6, 0.6]);
  });
});

describe('minilogue xd MULTI ENGINE', () => {
  it('passes each noise type, and Decim’s key track only on Decim', () => {
    expect(run({ 'multi.noise': 'peak' }).osc[2].mnoise?.type).toBe('peak');
    expect(run({ 'multi.noise': 'lp', 'multi.keytrack': 50 }).osc[2].mnoise).toEqual({
      type: 'lp',
      shape: 512 / 1023,
    });
    expect(run({ 'multi.noise': 'decim', 'multi.keytrack': 50 }).osc[2].mnoise).toEqual({
      type: 'decim',
      shape: 512 / 1023,
      keyTrack: 0.5,
    });
  });

  it('builds a VPM type from its settings, with SHAPE as the depth', () => {
    const p = run({ 'multi.engine': 'vpm', 'multi.vpm': 'fat1', 'multi.shape': 1023 });
    expect(p.osc[2].mix).toEqual({ vpm: 1 });
    expect(p.osc[2].mnoise).toBeUndefined();
    expect(p.osc[2].vpm).toEqual({
      ratio: 0.25,
      depth: 1,
      fb: 0.5,
      noise: 0,
      drive: 0.6,
      eg: { a: 0.002, d: 0.5, amt: 0 },
      keyTrack: 0.3,
    });
    expect(run({ 'multi.engine': 'vpm', 'multi.vpm': 'saw1' }).osc[2].vpm?.carrier).toBe('saw');
  });

  it('moves the VPM settings with the six offsets and RATIO OFFSET', () => {
    const vpm = run({
      'multi.engine': 'vpm',
      'multi.vpm': 'sin2',
      'multi.ratio': '2',
      'multi.feedback': 100,
      'multi.noiseDepth': 30,
      'multi.modInt': -40,
      'multi.modAttack': 100,
      'multi.modDecay': -100,
      'multi.modKey': -100,
    }).osc[2].vpm;
    expect(vpm?.ratio).toBe(2);
    expect(vpm?.fb).toBe(1);
    expect(vpm?.noise).toBe(0.3);
    expect(vpm?.eg).toEqual({ a: 0.016, d: 0.5 / 8, amt: -0.4 });
    expect(vpm?.keyTrack).toBe(0);
  });

  it('stills an enveloped type’s envelope at Shape Mod Int −100 %', () => {
    const at = (modInt: number) =>
      run({ 'multi.engine': 'vpm', 'multi.vpm': 'decay2', 'multi.modInt': modInt }).osc[2].vpm?.eg
        ?.amt;
    expect(at(0)).toBe(1);
    expect(at(-100)).toBe(0);
    expect(at(100)).toBe(1);
  });

  it('takes a part-depth envelope up to full at Shape Mod Int +100 %, in proportion on the way', () => {
    const at = (modInt: number) =>
      run({ 'multi.engine': 'vpm', 'multi.vpm': 'decay1', 'multi.modInt': modInt }).osc[2].vpm?.eg
        ?.amt;
    expect(at(0)).toBe(0.8);
    expect(at(50)).toBeCloseTo(0.9, 12);
    expect(at(100)).toBe(1);
    expect(at(-50)).toBeCloseTo(0.4, 12);
  });

  it('is silent with USR, which is not modelled', () => {
    const p = run({ 'multi.engine': 'usr', 'mix.multi': 1023, 'multi.routing': 'post' });
    expect(p.osc[2].mix).toEqual({});
    expect(route(p.routes, 'osc3', 'vcaIn')).toEqual([]);
  });

  it('takes the MULTI ENGINE past the filter at Post VCF', () => {
    const p = run({ 'mix.multi': 1023, 'multi.routing': 'post' });
    expect(p.osc[2].level).toBe(0);
    expect(route(p.routes, 'osc3', 'vcaIn')).toEqual([{ src: 'osc3', dst: 'vcaIn', amt: 0.6 }]);
  });

  it('sets the MULTI ENGINE’s octave from its menu', () => {
    expect(run({ 'multi.octave': "16'" }).osc[2].semi).toBe(-12);
  });
});

describe('minilogue xd filter', () => {
  it('maps CUTOFF exponentially and RESONANCE to just past 1', () => {
    expect(run({ 'vcf.cutoff': 0 }).filter.cutoff).toBe(20);
    expect(run({ 'vcf.cutoff': 512 }).filter.cutoff).toBeCloseTo(exp(512 / 1023, 20, 20000), 6);
    expect(run({ 'vcf.resonance': 1023 }).filter.res).toBeCloseTo(1.02, 9);
  });

  it('drives the voice after the filter at 50 % and 100 %', () => {
    expect(run({ 'vcf.drive': '50' }).od).toEqual({
      on: true,
      drive: 0.425,
      tone: 0.5,
      level: 0.85,
    });
    expect(run({ 'vcf.drive': '100' }).od).toMatchObject({ on: true, drive: 0.6 });
  });

  it('tracks the keyboard at 50 % and 100 %', () => {
    expect(run({ 'vcf.keytrack': '50' }).filter.kbd).toBe(0.5);
    expect(run({ 'vcf.keytrack': '100' }).filter.kbd).toBe(1);
  });
});

describe('minilogue xd EG and velocity', () => {
  it('sweeps the cutoff by EG INT, ±6 octaves', () => {
    expect(run({ 'eg.int': 50 }).filter.envAmt).toBe(3);
    expect(run({ 'eg.int': -100 }).filter.envAmt).toBe(-6);
  });

  it('sweeps every pitch or VCO 2’s alone, squared to ±48 semitones', () => {
    expect(route(run({ 'eg.target': 'pitch', 'eg.int': 50 }).routes, 'env1', 'pitchAll')).toEqual([
      { src: 'env1', dst: 'pitchAll', amt: 12 },
    ]);
    const p = run({ 'eg.target': 'pitch2', 'eg.int': -100 });
    expect(route(p.routes, 'env1', 'pitch2')).toEqual([{ src: 'env1', dst: 'pitch2', amt: -48 }]);
    expect(p.filter.envAmt).toBe(0);
  });

  it('lets velocity scale part of the cutoff sweep with EG Velocity', () => {
    const p = run({ 'eg.int': 50, 'eg.velocity': 127 });
    expect(route(p.routes, 'env1', 'cutoff')).toEqual([{ src: 'env1', dst: 'cutoff', amt: -3 }]);
    expect(route(p.routes, 'env1', 'cutoff', 'vel')).toEqual([
      { src: 'env1', dst: 'cutoff', amt: 3, by: 'vel' },
    ]);
    expect(route(run({ 'eg.velocity': 127 }).routes, 'env1', 'cutoff')).toEqual([]);
  });

  it('lets velocity scale part of the loudness with Amp Velocity', () => {
    const p = run({ 'amp.velocity': 127 });
    expect(route(p.routes, 'env2', 'amp')).toEqual([{ src: 'env2', dst: 'amp', amt: -1 }]);
    expect(route(p.routes, 'env2', 'amp', 'vel')).toEqual([
      { src: 'env2', dst: 'amp', amt: 1, by: 'vel' },
    ]);
  });
});

describe('minilogue xd LFO', () => {
  it('moves the cutoff, ±4 octaves at full INT, and inverts below 0', () => {
    expect(route(run({ 'lfo.target': 'cutoff', 'lfo.int': 511 }).routes, 'lfo', 'cutoff')).toEqual([
      { src: 'lfo', dst: 'cutoff', amt: 4 },
    ]);
    expect(
      route(run({ 'lfo.target': 'cutoff', 'lfo.int': -511 }).routes, 'lfo', 'cutoff')[0].amt
    ).toBe(-4);
  });

  it('reaches the oscillators LFO Target OSC names, for pitch and for shape', () => {
    const dsts = (set: ControlValues) =>
      (run({ 'lfo.int': 511, ...set }).routes || [])
        .filter((r) => r.src === 'lfo')
        .map((r) => [r.dst, r.amt]);
    expect(dsts({})).toEqual([
      ['pitch1', 12],
      ['pitch2', 12],
      ['pitch3', 12],
    ]);
    expect(dsts({ 'lfo.targetOsc': 'vco12' })).toEqual([
      ['pitch1', 12],
      ['pitch2', 12],
    ]);
    expect(dsts({ 'lfo.targetOsc': 'vco2', 'lfo.target': 'shape' })).toEqual([['pw2', 0.5]]);
    expect(dsts({ 'lfo.targetOsc': 'multi', 'lfo.target': 'shape' })).toEqual([['pw3', 0.5]]);
  });

  it('runs once per note in 1-SHOT, in step across voices with Voice Sync, and keyed with Key Sync', () => {
    expect(run({ 'lfo.mode': 'oneshot' }).lfo).toMatchObject({ oneShot: true });
    expect(run({ 'lfo.mode': 'oneshot', 'lfo.voiceSync': 'on' }).lfo.common).toBeUndefined();
    expect(run({ 'lfo.voiceSync': 'on' }).lfo).toMatchObject({ common: true });
    expect(run({ 'lfo.keySync': 'on' }).lfo.keySync).toBe(true);
  });

  it('follows the tempo in BPM mode, a cycle per note value', () => {
    expect(run({ 'lfo.mode': 'bpm', 'lfo.div': '1/4', 'seq.tempo': 120 }).lfo.rate).toBe(2);
    expect(run({ 'lfo.mode': 'bpm', 'lfo.div': '1', 'seq.tempo': 120 }).lfo.rate).toBe(0.5);
  });

  it('picks the wave', () => {
    expect(run({ 'lfo.wave': 'sqr' }).lfo.mix).toEqual({ sq: 1 });
    expect(run({ 'lfo.wave': 'saw' }).lfo.mix).toEqual({ saw: 1 });
  });
});

describe('minilogue xd voice modes', () => {
  it('stacks two detuned voices per key in DUO', () => {
    expect(run({ 'voice.duo': 1023 }).poly).toEqual({
      voices: 4,
      stack: 2,
      mono: false,
      detune: 0.3,
    });
  });

  it('stacks all four on one note in UNISON, detuned up to 50 cents', () => {
    expect(run({ 'voice.mode': 'unison', 'voice.detune': 1023 }).poly).toEqual({
      voices: 4,
      stack: 4,
      mono: true,
      detune: 0.5,
    });
  });

  it('plays the chosen chord on each key in CHORD, one chord at a time, or one note in Mono', () => {
    expect(run({ 'voice.mode': 'chord', 'voice.chord': 'm7' }).poly).toEqual({
      voices: 4,
      stack: 1,
      mono: true,
      chord: [0, 3, 7, 10],
    });
    expect(run({ 'voice.mode': 'chord', 'voice.chord': 'mono' }).poly).toEqual({
      voices: 4,
      stack: 1,
      mono: true,
    });
  });

  it('runs the arpeggiator in ARP/LATCH at the ARP Rate, and latches it', () => {
    const p = run({
      'voice.mode': 'arp',
      'voice.arp': 'fall2',
      'arp.rate': '8th',
      'arp.gate': 50,
      'seq.tempo': 100,
    });
    expect(p.arp).toEqual({ on: true, bpm: 50, gate: 0.5, mode: 'down', octaves: 2, hold: false });
    expect(run({ 'voice.mode': 'arp', 'arp.latch': true }).arp?.hold).toBe(true);
    expect(run({ 'arp.latch': true }).arp?.hold).toBe(false);
  });

  it('does not restart the envelopes on legato notes with EG Legato, in UNISON and CHORD only', () => {
    expect(run({ 'voice.mode': 'unison', 'eg.legato': 'on' }).trig.retrig).toBe(false);
    expect(run({ 'eg.legato': 'on' }).trig.retrig).toBe(true);
  });

  it('slides every note with Portamento Mode On, only overlapping ones with Auto', () => {
    expect(run({ 'glide.time': 127 }).glide).toEqual({ time: 4, legato: true });
    expect(run({ 'glide.time': 127, 'glide.mode': 'on' }).glide.legato).toBe(false);
  });
});

describe('minilogue xd effects', () => {
  it('runs the modulation effect, the delay and the reverb in that order', () => {
    const p = run({ 'mod.on': true, 'del.on': true, 'rev.on': true });
    expect(p.fx?.mode).toBe('insert');
    expect(p.fx?.routing).toBe(1);
    expect(p.fx?.slots?.map((s) => s.alg)).toEqual(['chorus', 'delay', 'hallrev', null]);
  });

  it('turns DELAY DEPTH into feedback and SHIFT + DEPTH into the mix', () => {
    const s = run({ 'del.on': true, 'del.depth': 100, 'del.mix': 100, 'del.time': 0 }).fx
      ?.slots?.[1];
    expect(s).toMatchObject({
      alg: 'delay',
      p: { MIX: 100, FBL: 95, FBR: 95, TIM: 10, MOD: 'ST' },
    });
  });

  it('times a BPM delay to the tempo', () => {
    const s = run({ 'del.on': true, 'del.type': 'stereobpm', 'del.time': 50, 'seq.tempo': 120 }).fx
      ?.slots?.[1];
    // TIME 50 % is the seventh of thirteen note values, two thirds of a beat: 333 ms at 120 BPM
    expect(s).toMatchObject({ p: { TIM: 333 } });
  });

  it('scales the reverb’s wet level by DEPTH', () => {
    const at = (depth: number) => run({ 'rev.on': true, 'rev.depth': depth }).fx?.slots?.[2];
    expect(at(50)).toMatchObject({ p: { MIX: 50 } });
    expect(at(0)).toMatchObject({ p: { MIX: 0 } });
  });

  it('passes the sound dry with a user modulation effect', () => {
    expect(run({ 'mod.on': true, 'mod.type': 'user' }).fx).toEqual({ mode: 'bypass' });
  });
});

describe('minilogue xd joystick, octave and level', () => {
  it('bends by each direction’s range', () => {
    expect(run({ 'joy.x': 1, 'joy.xPlus': '12' }).tune).toBe(12);
    expect(run({ 'joy.x': -0.5, 'joy.xMinus': '2' }).tune).toBe(-1);
  });

  it('moves the assigned control with Y, across its travel by the range', () => {
    // Y+ at CUTOFF +100 %: halfway up from 0 opens it halfway
    expect(run({ 'vcf.cutoff': 0, 'joy.y': 0.5 }).filter.cutoff).toBeCloseTo(
      exp(511.5 / 1023, 20, 20000),
      6
    );
    // Y− at LFO INT +100 %: fully down opens the LFO all the way
    expect(route(run({ 'joy.y': -1 }).routes, 'lfo', 'pitch1')).toEqual([
      { src: 'lfo', dst: 'pitch1', amt: 12 },
    ]);
  });

  it('transposes by OCTAVE', () => {
    expect(run({ 'kbd.octave': '-2' }).tune).toBe(-24);
  });

  it('sets the volume from MASTER and Program Level, at most 1', () => {
    expect(run({ 'out.master': 10, 'out.level': -6 }).volume).toBeCloseTo(Math.pow(10, -6 / 20), 9);
    expect(run({ 'out.master': 10, 'out.level': 6 }).volume).toBe(1);
  });
});

describe('minilogue xd panel', () => {
  it('ignores its ui controls', () => {
    const base = run();
    const ui = xd.controls.filter((c) => c.ui);
    expect(ui.length).toBeGreaterThan(20);
    for (const c of ui) {
      const other =
        c.kind === 'enum' ? c.options[c.options.length - 1].v : c.kind === 'bool' ? !c.def : c.max;
      expect(run({ [c.id]: other })).toEqual(base);
    }
  });

  it('carries no maker’s marks: the logo strip they are on is cropped out of the view', () => {
    expect(xd.decor.filter((d) => d.brand)).toEqual([]);
    const lettering = xd.decor.filter((d): d is TextDecor => d.t === 'text');
    for (const d of lettering) expect(d.y, d.text).toBeLessThan(xd.view.h);
  });
});
