/**
 * Arturia MicroFreak definition tests: the panel → engine mapping at init, for each switch and each oscillator model,
 * the matrix's sources, destinations and Assign columns, and the maker's mark.
 *
 * The MicroFreak has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering
 * except its own goldens. These tests pin each mapping with values worked by hand from the definition's ranges, so a
 * slip shows up with a name rather than as a changed golden.
 *
 * @see lib/app/synths/defs/microfreak.ts
 */
import { describe, expect, it } from 'vitest';
import type {
  ControlValues,
  EngineContext,
  EngineRoute,
  TextDecor,
} from '@/lib/app/synths/contract';
import microfreak from '@/lib/app/synths/defs/microfreak';
import { holds } from '@/lib/app/synths/lib/routing';
import { routing } from '@/lib/app/synths/routing/microfreak';

const run = (set: ControlValues = {}, bend?: number) =>
  microfreak.toEngine({ ...microfreak.init, ...set }, {
    wheel: 0,
    patched: {},
    ...(bend != null ? { bend } : {}),
  } satisfies EngineContext);
const routesTo = (routes: EngineRoute[] | undefined, dst: string) =>
  (routes || []).filter((r) => r.dst === dst);
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);

describe('MicroFreak toEngine at the init patch', () => {
  const p = run();

  it('plays one oscillator on BasicWaves at its sawtooth', () => {
    expect(p.osc).toEqual([
      { level: 0.6, semi: 0, pw: 0.5, syncTo: -1, mix: { pulse: 0, saw: 1, tmod: 0, sub: 0 } },
    ]);
    expect(p.oscAssign).toBeUndefined();
    expect(p.noise.level).toBe(0);
  });

  it('opens the 12 dB low-pass all the way, with the envelope off it', () => {
    expect(p.filter).toEqual({
      type: 'svf',
      mode: 'lp',
      cutoff: exp(1, 30, 16000),
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    });
  });

  it('opens the amplifier on the key gate, with nothing in the matrix', () => {
    expect(p.vca).toEqual({ envSrc: 'env3', bias: 0 });
    expect(p.env3).toEqual({ a: 0.002, d: 0.01, s: 1, r: 0.008 });
    expect(p.routes).toEqual([]);
    expect(p.normals).toEqual({});
  });

  it('sets the envelope and the cycling envelope in Env mode from their knobs', () => {
    const decay = exp(0.3, 0.003, 13);
    expect(p.env1).toEqual({ a: 0.001, d: decay, s: 1, r: decay });
    const fall = exp(0.5, 0.001, 10);
    expect(p.env2).toEqual({
      a: exp(0.3, 0.001, 10),
      d: fall,
      s: 0,
      r: fall,
      curve: { a: 0.5, d: 0.5, r: 0.5 },
    });
  });

  it('runs a sine LFO, the arpeggiator off, and the master volume', () => {
    expect(p.lfo).toEqual({ rate: exp(0.4, 0.06, 100), mix: { sine: 1 }, keySync: false });
    expect(p.arp).toEqual({ on: false, bpm: 120, gate: 0.45, mode: 'up', octaves: 1, hold: false });
    expect(p.poly).toEqual({ voices: 1, stack: 1, mono: true });
    expect(p.glide).toEqual({ time: 0, legato: false });
    expect(p.trig).toEqual({ retrig: true, drone: false, repeat: false });
    expect(p.volume).toBeCloseTo(Math.pow(0.8, 1.7), 10);
    expect(p.tune).toBe(0);
  });
});

describe('MicroFreak voices', () => {
  it('plays four oscillators, one a note with its own loudness envelope, with Paraphonic lit', () => {
    const p = run({ 'voice.paraphonic': true });
    expect(p.osc).toHaveLength(4);
    expect(new Set(p.osc.map((o) => JSON.stringify(o))).size).toBe(1);
    expect(p.oscAssign).toEqual({ mode: 'poly', env: true });
  });

  it('plays the chord on four oscillators on Chords, and ignores Paraphonic', () => {
    // Wave 40 is the fifth chord type (m7), Timbre 0 no inversion, Shape 0 the saw
    const p = run({ 'osc.type': 'chords', 'osc.wave': 40, 'voice.paraphonic': true });
    expect(p.oscAssign).toBeUndefined();
    expect(p.osc.map((o) => o.semi)).toEqual([0, 3, 7, 10]);
    expect(p.osc.every((o) => o.level === 0.3)).toBe(true);
    expect(p.osc[0].mix).toEqual({ saw: 1, pulse: 0, tri: 0 });
  });

  it('turns the chord over on Timbre: each step takes the lowest note up an octave', () => {
    // Wave 100 is M; Timbre 25 is two turns
    const p = run({ 'osc.type': 'chords', 'osc.wave': 100, 'osc.timbre': 25 });
    expect(p.osc.map((o) => o.semi)).toEqual([12, 16, 7, 12]);
  });

  it('bends the pitch 12 semitones each way from the pitch wheel (the strip’s Bend)', () => {
    expect(run({}, 1).tune).toBe(12);
    expect(run({}, -0.5).tune).toBe(-6);
    expect(microfreak.performance).toEqual({ bend: { range: 12 } });
  });
});

describe('MicroFreak oscillator models', () => {
  const osc = (type: string, wave: number, timbre: number, shape: number) =>
    run({ 'osc.type': type, 'osc.wave': wave, 'osc.timbre': timbre, 'osc.shape': shape }).osc[0];

  it('plays the six macro models with Wave, Timbre and Shape as they are', () => {
    for (const [type, model] of [
      ['wavetable', 'wavetable'],
      ['harmo', 'harmo'],
      ['karplusstr', 'pluck'],
      ['formant', 'formant'],
      ['speech', 'speech'],
      ['modal', 'modal'],
    ])
      expect(osc(type, 20, 40, 60)).toEqual({
        level: 0.6,
        semi: 0,
        pw: 0.5,
        syncTo: -1,
        mix: { macro: 1 },
        macro: { model, wave: 0.2, timbre: 0.4, shape: 0.6 },
      });
  });

  it('morphs BasicWaves from square to saw to two saws, with the width and the sub', () => {
    expect(osc('basicwaves', 0, 100, 50)).toMatchObject({
      mix: { pulse: 1, saw: 0, tmod: 0, sub: 0.4 },
      pw: 0.95,
    });
    expect(osc('basicwaves', 75, 0, 0).mix).toEqual({ pulse: 0, saw: 0.5, tmod: 0.5, sub: 0 });
  });

  it('multiplies only the saw on SuperWave', () => {
    expect(osc('superwave', 0, 30, 70)).toMatchObject({
      mix: { ssaw: 1 },
      ssDetune: 0.3,
      ssMix: 0.7,
    });
    expect(osc('superwave', 30, 30, 70).mix).toEqual({ pulse: 1 });
    expect(osc('superwave', 60, 30, 70).mix).toEqual({ tri: 1 });
    expect(osc('superwave', 100, 30, 70).mix).toEqual({ sine: 1 });
  });

  it('narrows the pulse on V.Analog’s Timbre and turns its triangle into a saw on Shape', () => {
    const o = osc('v_analog', 0, 25, 100);
    expect(o.pw).toBeCloseTo(0.275, 10);
    expect(o.mix).toEqual({ pulse: 0.5, tri: 0, saw: 0.5 });
  });

  it('folds the triangle into the saw on Waveshaper', () => {
    expect(osc('waveshaper', 25, 60, 100)).toMatchObject({
      mix: { tfold: 0.75, sfold: 0.25 },
      fold: 0.6,
      skew: 0.95,
    });
  });

  it('steps the ratio on Two Op.FM’s Wave, with the index and feedback', () => {
    expect(osc('two_op_fm', 50, 40, 20)).toMatchObject({
      mix: { vpm: 1 },
      vpm: { carrier: 'sine', ratio: 3, depth: 0.4, fb: 0.2 },
    });
  });
});

describe('MicroFreak switches', () => {
  it('steps the filter through low-, band- and high-pass', () => {
    expect(run({ 'vcf.type': 'bpf' }).filter.mode).toBe('bp');
    expect(run({ 'vcf.type': 'hpf' }).filter.mode).toBe('hp');
  });

  it('lets the envelope shape the loudness with Amp Mod lit', () => {
    expect(run({ 'env.amp_mod': true }).vca.envSrc).toBe('env1');
  });

  it('sends the envelope to the cutoff on Filter Amt, either way', () => {
    expect(run({ 'env.filter_amt': 50 }).filter.envAmt).toBe(3.5);
    expect(run({ 'env.filter_amt': -100 }).filter.envAmt).toBe(-7);
  });

  it('cycles the cycling envelope in Run, freely, and in Loop, from each note, with its gate held open', () => {
    const r = run({ 'cyc.mode': 'run', 'cyc.hold': 50 });
    expect(r.env2).toEqual({
      a: exp(0.3, 0.001, 10),
      hold: exp(0.5, 0.001, 10),
      d: exp(0.5, 0.001, 10),
      s: 0,
      r: 0.001,
      loop: true,
      loopAll: true,
      free: true,
    });
    expect(r.normals).toEqual({ gate2: 'one' });
    const l = run({ 'cyc.mode': 'loop' });
    expect(l.env2.free).toBeUndefined();
    expect(l.env2.hold).toBe(0);
    expect(l.normals).toEqual({ gate2: 'one' });
  });

  it('curves the rise and fall in Env mode from their Shapes', () => {
    const c = run({ 'cyc.rise_shape': -50, 'cyc.fall_shape': 25 }).env2.curve;
    expect(c?.a).toBeCloseTo(0.08, 10);
    expect(c?.d).toBeCloseTo(0.71, 10);
    expect(c?.r).toBe(c?.d);
  });

  it('plays each LFO shape, and a synced rate as a division of the tempo', () => {
    expect(run({ 'lfo.shape': 'sh' }).lfo.mix).toEqual({ sh: 1 });
    expect(run({ 'lfo.shape': 'shg' }).lfo.mix).toEqual({ shg: 1 });
    expect(run({ 'lfo.shape': 'saw' }).lfo.mix).toEqual({ saw: 1 });
    // Rate 50 is 1/4, a cycle a beat, at the free arpeggiator's tempo: 120 BPM at its Rate 50, 220 at 100
    expect(run({ 'lfo.sync': true, 'lfo.rate': 50 }).lfo.rate).toBeCloseTo(2, 10);
    expect(run({ 'lfo.sync': true, 'lfo.rate': 50, 'arp.rate': 100 }).lfo.rate).toBeCloseTo(
      220 / 60,
      10
    );
    // with the arpeggiator synced too, the tempo is the default 120 BPM
    expect(
      run({ 'lfo.sync': true, 'lfo.rate': 50, 'arp.rate': 100, 'arp.sync': true }).lfo.rate
    ).toBeCloseTo(2, 10);
  });

  it('runs the arpeggiator in each order, through its octaves, free or synced', () => {
    expect(run({ 'arp.mode': 'arp', 'arp.pattern': 'order', 'arp.octave': 3 }).arp).toMatchObject({
      on: true,
      mode: 'played',
      octaves: 3,
    });
    expect(run({ 'arp.mode': 'arp', 'arp.pattern': 'pattern' }).arp?.mode).toBe('random');
    expect(run({ 'arp.mode': 'seq' }).arp?.on).toBe(false);
    expect(run({ 'arp.rate': 0 }).arp?.bpm).toBe(20);
    // synced, Rate 30 is 1/4: a step a beat at 120 BPM, which is 30 in the engine's sixteenth notes
    expect(run({ 'arp.sync': true, 'arp.rate': 30 }).arp?.bpm).toBeCloseTo(30, 10);
  });

  it('sets the glide time from Glide, off at 0', () => {
    expect(run({ 'glide.amount': 100 }).glide.time).toBeCloseTo(10, 10);
  });
});

describe('MicroFreak matrix', () => {
  it('draws a Wave, Timbre or Shape edge live on exactly the models whose engine takes the route', () => {
    const typeCtl = microfreak.controls.find((c) => c.id === 'osc.type');
    const models = (typeCtl?.options || []).map((o) => o.v);
    expect(models).toHaveLength(12);
    const edge = (id: string) => routing.edges.find((e) => e.id === id);
    // LFO > Wave (c041), LFO > Timbre (c042), and Assign 1 on Shape (c059), each with SuperWave on its saw
    const cases: [string, ControlValues][] = [
      ['c041', { 'mx.lfo.wave': 80 }],
      ['c042', { 'mx.lfo.timbre': 80 }],
      ['c059', { 'mx.assign1': 'osc_shape', 'mx.lfo.assign1': 80 }],
    ];
    for (const [id, set] of cases) {
      const when = edge(id)?.when;
      expect(when, id).toBeDefined();
      for (const model of models) {
        const values = { ...microfreak.init, 'osc.type': model, 'osc.wave': 0, ...set };
        const routed = (run(values).routes || []).some((r) => r.src === 'lfo');
        expect(when && holds(when, values), `${id} on ${String(model)}`).toBe(routed);
      }
    }
  });

  it('draws the arpeggiator into the voice only while it is on', () => {
    const when = routing.edges.find((e) => e.id === 'c008')?.when;
    expect(when && holds(when, { ...microfreak.init, 'arp.mode': 'arp' })).toBe(true);
    expect(when && holds(when, { ...microfreak.init, 'arp.mode': 'off' })).toBe(false);
  });

  it('sends each source to the pitch, two octaves at full', () => {
    const p = run({
      'mx.cycenv.pitch': 50,
      'mx.env.pitch': -25,
      'mx.lfo.pitch': 50,
      'mx.press.pitch': 100,
      'mx.key.pitch': 100,
    });
    expect(routesTo(p.routes, 'pitchAll')).toEqual([
      { src: 'env2', dst: 'pitchAll', amt: 12 },
      { src: 'env1', dst: 'pitchAll', amt: -6 },
      { src: 'lfo', dst: 'pitchAll', amt: 12 },
      { src: 'vel', dst: 'pitchAll', amt: 24 },
      // Key/Arp adds an octave per octave to the built-in tracking at 100
      { src: 'kbd', dst: 'pitchAll', amt: 12 },
    ]);
  });

  it('scales the cycling envelope’s points by its Amount', () => {
    const p = run({ 'mx.cycenv.pitch': 50, 'cyc.amount': 50 });
    expect(p.routes).toEqual([{ src: 'env2', dst: 'pitchAll', amt: 6 }]);
    expect(run({ 'mx.cycenv.pitch': 50, 'cyc.amount': 0 }).routes).toEqual([]);
  });

  it('sends Cutoff over the whole range, and Key/Arp an octave per octave', () => {
    const p = run({ 'mx.lfo.cutoff': -50, 'mx.key.cutoff': 100 });
    expect(p.routes).toEqual([
      { src: 'lfo', dst: 'cutoff', amt: -4.5 },
      { src: 'kbd', dst: 'cutoff', amt: 1 },
    ]);
  });

  it('sends Wave and Timbre to the macro oscillator’s own destinations', () => {
    const p = run({
      'osc.type': 'wavetable',
      'mx.lfo.wave': 50,
      'mx.env.timbre': -20,
      'mx.key.wave': 100,
    });
    expect(p.routes).toEqual([
      { src: 'env1', dst: 'mTimbre', amt: -0.2 },
      { src: 'lfo', dst: 'mWave', amt: 0.5 },
      { src: 'kbd', dst: 'mWave', amt: 0.5 },
    ]);
  });

  it('sends Timbre to the pulse-width destination where the model’s Timbre rides it, to every oscillator', () => {
    expect(run({ 'mx.lfo.timbre': 100 }).routes).toEqual([{ src: 'lfo', dst: 'pw1', amt: 0.45 }]);
    expect(run({ 'mx.lfo.timbre': 100, 'voice.paraphonic': true }).routes).toEqual([
      { src: 'lfo', dst: 'pw1', amt: 0.45 },
      { src: 'lfo', dst: 'pw2', amt: 0.45 },
    ]);
    expect(run({ 'osc.type': 'two_op_fm', 'mx.env.timbre': 50 }).routes).toEqual([
      { src: 'env1', dst: 'pw1', amt: 0.5 },
    ]);
  });

  it('drops a route the model has nothing to move for', () => {
    expect(run({ 'mx.lfo.wave': 100 }).routes).toEqual([]);
    expect(run({ 'osc.type': 'chords', 'mx.lfo.timbre': 100 }).routes).toEqual([]);
    expect(run({ 'osc.type': 'superwave', 'osc.wave': 30, 'mx.lfo.timbre': 100 }).routes).toEqual(
      []
    );
  });

  it('sends each Assign column wherever its button points', () => {
    const p = run({
      'mx.assign1': 'resonance',
      'mx.lfo.assign1': 50,
      'mx.assign2': 'lfo_rate',
      'mx.cycenv.assign2': 100,
      'mx.assign3': 'env_decay',
      'mx.press.assign3': 50,
    });
    expect(p.routes).toEqual([
      { src: 'env2', dst: 'lfoRate', amt: 5 },
      { src: 'lfo', dst: 'res', amt: 0.525 },
      // a positive amount lengthens Decay/Rel, so the engine's rate goes down
      { src: 'vel', dst: 'env1DecRate', amt: -2 },
    ]);
    const q = run({ 'osc.type': 'modal', 'mx.assign1': 'osc_shape', 'mx.env.assign1': 100 });
    expect(q.routes).toEqual([{ src: 'env1', dst: 'mShape', amt: 1 }]);
  });

  it('leaves an Assign column on None, and a point at 0, out', () => {
    expect(run({ 'mx.lfo.assign1': 100 }).routes).toEqual([]);
    expect(run({ 'mx.assign1': 'cutoff' }).routes).toEqual([]);
  });

  it('has no Env > Cutoff point: Filter Amt is it', () => {
    expect(microfreak.controls.some((c) => c.id === 'mx.env.cutoff')).toBe(false);
    expect(
      microfreak.controls.filter((c) => c.id.startsWith('mx.') && c.type === 'knob')
    ).toHaveLength(34);
  });
});

describe('MicroFreak panel', () => {
  it('tags the ARTURIA wordmark, its only maker’s mark, as a brand mark', () => {
    const brand = microfreak.decor.filter((d) => d.brand);
    expect(brand.map((d) => (d as TextDecor).text)).toEqual(['ARTURIA']);
  });

  it('hands Hold to the app’s keyboard', () => {
    expect(microfreak.seqButtons).toEqual({ 'kbd.hold': 'hold' });
  });

  it('shows the Shift layer’s curves in place of Rise and Fall while Shift is lit', () => {
    const byId = (id: string) => microfreak.controls.find((c) => c.id === id);
    expect(byId('cyc.rise')?.show).toEqual({ id: 'ui.shift', eq: false });
    expect(byId('cyc.rise_shape')?.show).toEqual({ id: 'ui.shift', eq: true });
    expect(byId('ui.shift')?.ui).toBe(true);
  });
});
