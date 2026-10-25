/**
 * Sequential Take 5 definition tests: the panel → engine mapping, the readouts, the maker's marks and the areas.
 *
 * The Take 5 has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering except
 * its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a slip
 * shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/take-5.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  Control,
  ControlValues,
  EngineContext,
  FxSlot,
  TextDecor,
} from '@/lib/app/synths/contract';
import take5 from '@/lib/app/synths/defs/take-5';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}) => take5.toEngine({ ...take5.init, ...set }, CTX);

const control = (id: string): Control => {
  const c = take5.controls.find((x) => x.id === id);
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
/** The loaded effects, by slot. */
const slots = (set: ControlValues): FxSlot[] => run(set).fx?.slots ?? [];
const params = (s: FxSlot | undefined): Record<string, number | string> =>
  s && s.alg !== null ? s.p : {};

describe('Take 5 toEngine at the init patch', () => {
  const p = run();

  it('sounds Oscillator 1 alone, a sawtooth at pitch', () => {
    expect(p.osc).toHaveLength(2);
    expect(p.osc[0]).toMatchObject({ mix: { saw: 1, pulse: 0 }, pw: 0.5, semi: 0, kbd: true });
    expect(p.osc[0].level).toBeCloseTo(0.42, 10);
    expect(p.osc[0]).toMatchObject({ syncTo: -1, subLevel: 0 });
    expect(p.osc[1]).toMatchObject({ level: 0, syncTo: -1 });
    expect(p.noise.level).toBe(0);
  });

  it('maps the filter from CUTOFF, RESONANCE, DRIVE and Envelope 1', () => {
    // CUTOFF 7 is 0.7 of the way up a 20 Hz–18 kHz log sweep; DRIVE 2 is 0.5 + 0.25 × 2.
    expect(p.filter).toMatchObject({
      type: 'ladder',
      mode: 'lp',
      envSrc: 'env1',
      kbd: 0.5,
      res: 0,
    });
    expect(p.filter.cutoff).toBeCloseTo(exp(0.7, 20, 18000), 6);
    expect(p.filter.drive).toBeCloseTo(1, 10);
    expect(p.filter.envAmt).toBe(0);
  });

  it('runs the VCA from Envelope 2 at full AMOUNT', () => {
    expect(p.vca).toEqual({ envSrc: 'env2', bias: 0, gain: 1 });
    expect(p.env2.s).toBe(1);
    expect(p.env1.s).toBe(0.5);
  });

  it('plays five voices with the arpeggiator, effects and overdrive off', () => {
    expect(p.poly).toEqual({ voices: 5, stack: 1, mono: false, detune: 0 });
    expect(p.arp).toMatchObject({ on: false, bpm: 120, mode: 'up', octaves: 1, hold: false });
    expect(p.fx).toEqual({ mode: 'bypass' });
    expect(p.od).toEqual({ on: false });
    expect(p.glide).toEqual({ time: 0, legato: false });
    expect(p.drift).toEqual({ depth: 0, rate: 1.2 });
  });

  it('sets VOLUME, and routes nothing while every AMOUNT is at 0', () => {
    expect(p.volume).toBeCloseTo(level(7, 1), 10);
    expect(p.routes).toEqual([]);
  });
});

describe('Take 5 oscillators and mixer', () => {
  it('tunes by OCTAVE and PITCH', () => {
    expect(run({ 'osc1.octave': '-2', 'osc1.pitch': 7 }).osc[0].semi).toBe(-17);
    expect(run({ 'osc2.octave': '+1', 'osc2.pitch': -3.5 }).osc[1].semi).toBe(8.5);
  });

  it('morphs SHAPE from sine through sawtooth and square to a narrow pulse', () => {
    expect(run({ 'osc1.shape': 0 }).osc[0]).toMatchObject({ mix: { sine: 1, saw: 0 } });
    expect(run({ 'osc1.shape': 2.5 }).osc[0]).toMatchObject({ mix: { sine: 0.5, saw: 0.5 } });
    expect(run({ 'osc1.shape': 7.5 }).osc[0]).toMatchObject({ mix: { pulse: 1 }, pw: 0.5 });
    expect(run({ 'osc1.shape': 6.25 }).osc[0]).toMatchObject({ mix: { saw: 0.5, pulse: 0.5 } });
    expect(run({ 'osc1.shape': 10 }).osc[0].pw).toBeCloseTo(0.05, 10);
  });

  it('syncs Oscillator 1 to Oscillator 2', () => {
    expect(run({ 'osc1.sync': true }).osc[0].syncTo).toBe(1);
  });

  it('mixes the sub-oscillator on its own channel', () => {
    expect(run({ 'mix.sub': 5 }).osc[0].subLevel).toBeCloseTo(0.3, 10);
  });

  it('hears Oscillator 2 by its knob, and with FM 2→1 turns the knob into FM depth', () => {
    expect(run({ 'mix.osc2': 10 }).osc[1].level).toBeCloseTo(0.6, 10);
    const fm = run({ 'mix.osc2': 5, 'osc.fm': true });
    expect(fm.osc[1].level).toBe(0);
    expect(fm.routes).toEqual([{ src: 'osc2', dst: 'pitch1', amt: 6 }]);
    expect(run({ 'mix.osc2': 0, 'osc.fm': true }).routes).toEqual([]);
  });

  it('turns NOISE left for pink and right for white', () => {
    expect(run({ 'mix.noise': -5 }).noise).toEqual({ level: 0.8, color: 'pink' });
    const w = run({ 'mix.noise': 2.5 }).noise;
    expect(w.color).toBe('white');
    expect(w.level).toBeCloseTo(level(5, 0.8), 10);
  });
});

describe('Take 5 envelope routing', () => {
  it('first: Envelope 1 to the filter by its AMOUNT, Envelope 2 to the VCA', () => {
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

  it('leaves Envelope 1 idle as Aux with no destination', () => {
    expect(run({ 'env.routing': 'aux-filteramp', 'env1.amount': 5 }).routes).toEqual([]);
  });
});

describe('Take 5 LFOs', () => {
  it('sends LFO 1 and LFO 2 to their destinations by AMOUNT, either way', () => {
    const p = run({
      'lfo1.amt': 2.5,
      'lfo1.dest': 'osc-all',
      'lfo2.amt': -5,
      'lfo2.dest': 'res',
    });
    // pitch is ±12 semitones at full, squared: half way is 3
    expect(p.routes).toEqual([
      { src: 'lfo', dst: 'pitch1', amt: 3 },
      { src: 'lfo', dst: 'pitch2', amt: 3 },
      { src: 'lfo2', dst: 'res', amt: -0.6 },
    ]);
    expect(run({ 'lfo1.amt': 5, 'lfo1.dest': 'osc2' }).routes).toEqual([
      { src: 'lfo', dst: 'pitch2', amt: 12 },
    ]);
    expect(run({ 'lfo2.amt': 5, 'lfo2.dest': 'none' }).routes).toEqual([]);
  });

  it('sets each LFO’s speed and shape', () => {
    const p = run({ 'lfo1.freq': 10, 'lfo1.shape': 'sh', 'lfo2.freq': 0, 'lfo2.shape': 'rsaw' });
    expect(p.lfo.rate).toBeCloseTo(50, 8);
    expect(p.lfo.mix).toEqual({ sh: 1 });
    expect(p.lfo2?.rate).toBeCloseTo(0.05, 10);
    expect(p.lfo2?.mix).toEqual({ rsaw: 1 });
  });
});

describe('Take 5 voices, clock and arpeggiator', () => {
  it('stacks all five voices for UNISON', () => {
    expect(run({ 'voice.unison': true }).poly).toEqual({
      voices: 5,
      stack: 5,
      mono: true,
      detune: 0.12,
    });
  });

  it('glides by the GLIDE knob only while GLIDE is on', () => {
    expect(run({ 'glide.time': 5 }).glide.time).toBe(0);
    expect(run({ 'glide.on': true, 'glide.time': 5 }).glide.time).toBeCloseTo(1, 10);
  });

  it('steps the arpeggiator at the CLK DIV note value', () => {
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
    expect(run({ 'drive.amount': 6 }).od).toEqual({
      on: true,
      drive: 0.6,
      tone: 0.5,
      level: 0.8,
    });
  });
});

describe('Take 5 effect and reverb', () => {
  it('loads the effect in slot 1 and the reverb in slot 2, in a row', () => {
    const p = run({ 'fx.on': true, 'rev.on': true });
    expect(p.fx).toMatchObject({ mode: 'insert', routing: 1 });
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

  it('takes the nearest algorithm for each other effect, with the rest at its defaults', () => {
    const at = (type: string) =>
      slots({ 'fx.on': true, 'fx.type': type, 'fx.time': 10, 'fx.mix': 10, 'fx.misc': 0 })[0];
    expect(at('tape2')).toMatchObject({ alg: 't-raydelay', p: { DLY: 100, WOB: 60, SUS: 0 } });
    expect(at('chorus')).toMatchObject({ alg: 'chorus', p: { SPD: 5, WDL: 100, HC: 1500 } });
    expect(at('flanger')).toMatchObject({ alg: 'flanger', p: { FD: 0, DLL: 2 } });
    expect(at('phaser')).toMatchObject({ alg: 'phaser', p: { DEP: 100, RES: 0, STG: 6 } });
    expect(at('hpf')).toMatchObject({ alg: 'moodfilter', p: { TYP: 'HP', FRQ: 8000, DEP: 0 } });
    expect(at('dist')).toMatchObject({ alg: 'mulbnddist', p: { IPG: 24, OPG: 0, HBL: -12 } });
    expect(at('rotary')).toMatchObject({ alg: 'rotaryspkr', p: { SPD: 'FAST', DIS: 0 } });
  });

  it('passes the sound dry for the ring modulator, which it does not model', () => {
    expect(slots({ 'fx.on': true, 'fx.type': 'ring' })[0]).toEqual({ alg: null });
  });

  it('maps the reverb’s knobs, with TONE cutting treble one way and bass the other', () => {
    const p = params(
      slots({
        'rev.on': true,
        'rev.mix': 10,
        'rev.damping': 10,
        'rev.predelay': 5,
        'rev.decay': 10,
        'rev.tone': -5,
      })[1]
    );
    expect(p).toMatchObject({ MIX: 100, DMP: 1500, PD: 100, DCY: 10, HC: 1500, LC: 10 });
    expect(params(slots({ 'rev.on': true, 'rev.tone': 5 })[1])).toMatchObject({
      HC: 20000,
      LC: 500,
    });
  });
});

describe('Take 5 panel modes', () => {
  it('ignores the controls that only change what the panel shows, or are not modelled', () => {
    const base = run();
    const modes = take5.controls.filter((c) => c.ui);
    expect(modes.length).toBeGreaterThan(15);
    const flipped: ControlValues = {};
    for (const c of modes)
      flipped[c.id] =
        c.kind === 'bool' ? true : c.kind === 'cont' ? c.max : c.options[c.options.length - 1].v;
    expect(run(flipped)).toEqual(base);
  });

  it('hands HOLD, RECORD and PLAY to the page', () => {
    expect(take5.seqButtons).toEqual({
      'seq.record': 'record',
      'seq.play': 'run',
      'kbd.hold': 'hold',
    });
    expect(take5.tempo).toBe('clock.bpm');
  });

  it('shows one LFO’s controls at a time, by the LFO button', () => {
    for (const n of [1, 2]) {
      const own = take5.controls.filter((c) => c.id.startsWith(`lfo${n}.`));
      expect(own.map((c) => c.id).sort()).toEqual(
        [`lfo${n}.amt`, `lfo${n}.dest`, `lfo${n}.freq`, `lfo${n}.shape`, `lfo${n}.sync`].sort()
      );
      for (const c of own) expect(c.show, c.id).toEqual({ id: 'lfo.select', eq: String(n) });
    }
  });
});

describe('Take 5 readouts', () => {
  it('reads CUTOFF, the envelope times, SHAPE and NOISE in words and units', () => {
    expect(readout('vcf.cutoff', 0)).toMatch(/20 ?Hz/);
    expect(readout('env1.attack', 0)).toMatch(/1 ?ms/);
    expect(readout('env1.release', 10)).toMatch(/20 ?s/);
    expect(readout('osc1.shape', 0)).toBe('sine');
    expect(readout('osc1.shape', 5)).toBe('sawtooth');
    expect(readout('osc1.shape', 7.5)).toBe('square');
    expect(readout('mix.noise', -5)).toBe('pink 100 %');
    expect(readout('mix.noise', 0)).toBe('off');
  });
});

describe('Take 5 panel', () => {
  it('tags every maker’s mark as brand, and nothing else', () => {
    const brand = take5.decor.filter((d) => d.brand);
    const texts = brand.filter((d): d is TextDecor => d.t === 'text').map((d) => d.text);
    expect(texts).toEqual(['SEQUENTIAL', 'TAKE 5', 'TAKE 5']);
    expect(brand).toHaveLength(3);
    const unbranded = take5.decor.filter(
      (d): d is TextDecor => d.t === 'text' && !d.brand && /sequential|take 5/i.test(d.text)
    );
    expect(unbranded).toEqual([]);
  });

  it('puts every control in exactly one area, inside the view', () => {
    expect(take5.controls.length).toBeGreaterThan(70);
    for (const p of take5.controls) {
      const at = (take5.areas ?? []).filter((a) =>
        a.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
      );
      expect(
        at.map((a) => a.id),
        p.id
      ).toHaveLength(1);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(take5.view.w);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(take5.view.h);
    }
  });

  it('starts every control at its default', () => {
    for (const c of take5.controls) expect(take5.init[c.id], c.id).toBe(c.def);
  });
});
