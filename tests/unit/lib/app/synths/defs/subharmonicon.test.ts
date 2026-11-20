/**
 * Moog Subharmonicon definition tests: the panel → engine mapping at init, for each switch and button, the knob
 * ranges worked by hand from the spec, the jacks' volts, and the maker's marks.
 *
 * The Subharmonicon has no prototype version (`scripts/native-synths.ts`), so nothing holds it to an earlier rendering
 * except its own goldens. These tests pin each mapping with values worked by hand, so a slip shows up with a name
 * rather than as a changed golden.
 *
 * @see lib/app/synths/defs/subharmonicon.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues, EngineContext, Jack, TextDecor } from '@/lib/app/synths/contract';
import subharmonicon from '@/lib/app/synths/defs/subharmonicon';

const run = (set: ControlValues = {}) =>
  subharmonicon.toEngine({ ...subharmonicon.init, ...set }, {
    wheel: 0,
    patched: {},
  } satisfies EngineContext);
const sh = (set: ControlValues = {}) => {
  const p = run(set).subharm;
  if (!p) throw new Error('no subharm params');
  return p;
};
/** `expMap` worked out: min × (max / min)^t. */
const exp = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
const jack = (id: string): Jack => {
  const j = subharmonicon.jacks.find((x) => x.id === id);
  if (!j) throw new Error(`no jack ${id}`);
  return j;
};

describe('Subharmonicon toEngine at the init patch', () => {
  const p = run();

  it('replaces the oscillators with the subharm path and gates the envelopes from it', () => {
    expect(p.osc).toEqual([]);
    expect(p.normals).toEqual({ gate1: 'sbhEg1', gate2: 'sbhEg2' });
    expect(p.env1.free).toBe(true);
    expect(p.env2.free).toBe(true);
    expect(p.vca).toEqual({ envSrc: 'env2', bias: 0 });
    expect(p.trig).toEqual({ retrig: false, drone: false, repeat: false });
  });

  it('is VCO 1 alone on its sawtooth at C4, with SUB 1 at /2 and SUB 2 at /3', () => {
    expect(p.subharm?.vco).toEqual([
      { freq: 0, wave: 'saw', div: [2, 3], level: [0.7, 0, 0] },
      { freq: 0, wave: 'saw', div: [2, 3], level: [0, 0, 0] },
    ]);
  });

  it('has quiet sequencers, the rhythms at /1 to /4 on neither sequencer, and the transport stopped with EG on', () => {
    const s = sh();
    expect(s.seq).toEqual([
      { steps: [0, 0, 0, 0], assign: [false, false, false] },
      { steps: [0, 0, 0, 0], assign: [false, false, false] },
    ]);
    expect(s.rhythm).toEqual([1, 2, 3, 4].map((div) => ({ div, seq1: false, seq2: false })));
    expect(s).toMatchObject({
      quantize: 'off',
      oct: 2,
      logic: 'or',
      play: false,
      eg: 'on',
    });
    // TEMPO opens at the app's 120 BPM (6.34 to a hundredth of a turn): 480 clocks a minute, near enough 8 Hz
    expect(s.tempo).toBeCloseTo(exp(0.634, 0.333, 50), 9);
    expect(subharmonicon.tempoMap!.toBpm(6.34)).toBe(120);
  });

  it('opens the ladder filter fully with no envelope on it, and plays the VCA EG as attack then decay', () => {
    expect(p.filter).toEqual({
      type: 'ladder',
      mode: 'lp',
      cutoff: 20000,
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    });
    expect(p.env2.a).toBeCloseTo(0.001, 12);
    expect(p.env2.d).toBeCloseTo(exp(0.2, 0.005, 10), 12);
    // a gate held past the attack holds the peak; the decay runs once it falls
    expect(p.env2.s).toBe(1);
    expect(p.env2.r).toBe(p.env2.d);
    expect(p.env1.d).toBeCloseTo(exp(0.3, 0.005, 10), 12);
    expect(p.volume).toBeCloseTo(Math.pow(0.7, 1.7), 12);
  });
});

describe('Subharmonicon knob ranges', () => {
  it('spans FREQ over four octaves from C4', () => {
    expect(sh({ 'vco1.freq': 10 }).vco[0].freq).toBe(48);
    expect(sh({ 'vco2.freq': 2.5 }).vco[1].freq).toBe(12);
  });

  it('reads a SUB FREQ or RHYTHM knob as its divisor, 16 fully left to 1 fully right', () => {
    const c = subharmonicon.controls.find((x) => x.id === 'sub11.div');
    expect(c?.kind === 'enum' && c.options.map((o) => o.v)).toEqual([
      16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(sh({ 'sub22.div': 7 }).vco[1].div).toEqual([2, 7]);
    expect(sh({ 'rhythm3.div': 11 }).rhythm[2].div).toBe(11);
  });

  it('turns a STEP knob into its share of SEQ OCT, −1 to 1', () => {
    expect(sh({ 'seq1.step2': 2.5, 'seq2.step4': -5 }).seq).toEqual([
      { steps: [0, 0.5, 0, 0], assign: [false, false, false] },
      { steps: [0, 0, 0, -1], assign: [false, false, false] },
    ]);
  });

  it('reads a STEP as its pitch, or as the divisor change with only the subs assigned', () => {
    const c = subharmonicon.controls.find((x) => x.id === 'seq1.step2');
    if (!c || c.kind !== 'cont' || !c.fmt) throw new Error('no STEP readout');
    const at = (over: ControlValues) => c.fmt?.(2.5, { ...subharmonicon.init, ...over });
    // half a turn at ±2 is an octave
    expect(at({})).toBe('+12 st');
    expect(at({ 'seq1.assign_osc': true, 'seq1.assign_sub1': true })).toBe('+12 st');
    // an octave of step lowers a sub's divisor by 1.5
    expect(at({ 'seq1.assign_sub1': true })).toBe('divisor −1.5');
    // QUANTIZE snaps the step before it moves a divisor: a quarter of a semitone is no step at all
    expect(
      c.fmt(0.1, {
        ...subharmonicon.init,
        'seq1.assign_sub1': true,
        'seq.oct': 1,
        'vco.quantize': '8-ET',
      })
    ).toBe('divisor ±0');
    expect(c.fmt(-5, { ...subharmonicon.init, 'seq1.assign_sub2': true, 'seq.oct': 1 })).toBe(
      'divisor +1.5'
    );
  });

  it('maps CUTOFF, ATTACK, DECAY and TEMPO onto the spec’s ranges', () => {
    expect(run({ 'vcf.cutoff': 0 }).filter.cutoff).toBeCloseTo(20, 9);
    expect(run({ 'vcf.cutoff': 5 }).filter.cutoff).toBeCloseTo(exp(0.5, 20, 20000), 9);
    expect(run({ 'vcf_eg.attack': 10 }).env1.a).toBeCloseTo(10, 9);
    expect(run({ 'vca_eg.decay': 0 }).env2.d).toBeCloseTo(0.005, 12);
    expect(sh({ 'clock.tempo': 0 }).tempo).toBeCloseTo(0.333, 9);
    expect(sh({ 'clock.tempo': 10 }).tempo).toBeCloseTo(50, 9);
  });

  it('sends VCF EG AMT eight octaves either way at full, and resonance just past self-oscillation at full', () => {
    expect(run({ 'vcf_eg.amount': 5 }).filter.envAmt).toBe(8);
    expect(run({ 'vcf_eg.amount': -2.5 }).filter.envAmt).toBe(-4);
    expect(run({ 'vcf.resonance': 10 }).filter.res).toBeCloseTo(1.05, 12);
  });

  it('takes each mixer level straight, 0 to 1', () => {
    expect(
      sh({ 'mix.sub12': 4, 'mix.vco2': 10, 'mix.sub21': 2.5 }).vco.map((v) => v.level)
    ).toEqual([
      [0.7, 0, 0.4],
      [1, 0.25, 0],
    ]);
  });
});

describe('Subharmonicon switches and buttons', () => {
  it.each([
    ['square', 'square'],
    ['pwm', 'pwm'],
    ['saw', 'saw'],
  ] as const)('VCO WAVE %s is wave %s on that VCO only', (set, wave) => {
    const s = sh({ 'vco2.wave': set });
    expect(s.vco[1].wave).toBe(wave);
    expect(s.vco[0].wave).toBe('saw');
  });

  it.each(['off', '12-ET', '8-ET', '12-JI', '8-JI'])('QUANTIZE %s', (q) => {
    expect(sh({ 'vco.quantize': q }).quantize).toBe(q);
  });

  it.each([5, 2, 1])('SEQ OCT ±%s', (o) => {
    expect(sh({ 'seq.oct': o }).oct).toBe(o);
  });

  it.each(['off', 'on', 'held'])('EG %s', (eg) => {
    expect(sh({ 'transport.eg': eg }).eg).toBe(eg);
  });

  it('lights each ASSIGN button on its own sequencer', () => {
    expect(
      sh({ 'seq1.assign_sub2': true, 'seq2.assign_osc': true }).seq.map((s) => s.assign)
    ).toEqual([
      [false, false, true],
      [true, false, false],
    ]);
  });

  it('lights each rhythm’s SEQ 1 and SEQ 2 buttons on that rhythm only', () => {
    const r = sh({ 'rhythm2.seq1': true, 'rhythm4.seq2': true }).rhythm;
    expect(r.map((x) => [x.seq1, x.seq2])).toEqual([
      [false, false],
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it('runs the transport with PLAY lit', () => {
    expect(sh({ 'transport.play': true }).play).toBe(true);
  });

  it('makes RESET, NEXT and TRIGGER momentary: each sends a press and holds no setting', () => {
    const presses = subharmonicon.controls.flatMap((c) =>
      c.type === 'button' && c.press ? [[c.id, c.press, c.ui]] : []
    );
    expect(presses).toEqual([
      ['transport.reset', 'reset', true],
      ['transport.next', 'next', true],
      ['transport.trigger', 'trigger', true],
    ]);
    // nothing about them reaches the engine's settings, so a patch can never press one
    expect(
      run({ 'transport.reset': true, 'transport.next': true, 'transport.trigger': true })
    ).toEqual(run());
  });
});

describe('Subharmonicon jacks', () => {
  it('sends the VCOs and subs at 10 Vpp, the envelopes at 0 to 8 V and the sequencers in volts', () => {
    expect(jack('j.sub21_out')).toMatchObject({ signal: 'sbhSub21', gain: 5 });
    expect(jack('j.vcf_eg_out')).toMatchObject({ signal: 'env1', gain: 8 });
    expect(jack('j.vca_eg_out')).toMatchObject({ signal: 'env2', gain: 8 });
    expect(jack('j.seq2_out')).toMatchObject({ signal: 'sbhSeq2', gain: 1 });
    expect(jack('j.clock_out')).toMatchObject({ signal: 'sbhClock', gain: 10 });
  });

  it('reads the pitch, divisor and rhythm inputs in volts, the VCA from 0 to 8 V and CUTOFF a volt an octave', () => {
    expect(jack('j.vco2_in')).toMatchObject({ dest: 'sbhP2', amt: 1 });
    expect(jack('j.vco1_sub_in')).toMatchObject({ dest: 'sbhSub1', amt: 1 });
    expect(jack('j.rhythm4_in')).toMatchObject({ dest: 'sbhR4', amt: 1 });
    expect(jack('j.vca_in')).toMatchObject({ dest: 'amp', amt: 1 / 8 });
    expect(jack('j.cutoff_in')).toMatchObject({ dest: 'cutoff', amt: 1, add: true });
    expect(jack('j.midi_in')).toMatchObject({ dest: null });
  });
});

describe('Subharmonicon panel', () => {
  it('lights Sequencer 1’s step lamps from its stage and Sequencer 2’s from its own', () => {
    const lamps = subharmonicon.decor.flatMap((d) =>
      d.t === 'led' && d.litWhen && typeof d.litWhen === 'object' && !('id' in d.litWhen)
        ? [d.litWhen]
        : []
    );
    expect(lamps).toEqual([
      { seq: 0 },
      { seq: 1 },
      { seq: 2 },
      { seq: 3 },
      { seq2: 0 },
      { seq2: 1 },
      { seq2: 2 },
      { seq2: 3 },
    ]);
  });

  it('tags the maker’s marks as brand', () => {
    const marks = subharmonicon.decor
      .filter((d): d is TextDecor => d.t === 'text' && d.brand === true)
      .map((d) => d.text);
    expect(marks).toEqual([
      'SUBHARMONICON',
      'SEMI-MODULAR ANALOG',
      'POLYRHYTHMIC SYNTHESIZER',
      'moog',
    ]);
  });
});

describe('Subharmonicon on the app’s clock (f-own-sequencer)', () => {
  it('follows the app’s clock, and names PLAY as its sequencer’s run control', () => {
    expect(run().follow).toBe(true);
    expect(run({ 'transport.play': true }).follow).toBe(true);
    expect(subharmonicon.ownSequencer).toEqual({ run: 'transport.play', ppq: 4 });
    expect(subharmonicon.controls.some((c) => c.id === subharmonicon.ownSequencer?.run)).toBe(true);
  });

  it('makes TEMPO the app’s tempo at four clocks a beat, both ways', () => {
    const map = subharmonicon.tempoMap;
    if (!map) throw new Error('no tempoMap');
    expect(subharmonicon.tempo).toBe('clock.tempo');
    // fully left 20 clocks a minute, fully right 3,000: a quarter of each is 5 and 750, held to the app's 20 to 300
    expect(map.toBpm(0)).toBe(20);
    expect(map.toBpm(10)).toBe(300);
    expect(map.toBpm(map.fromBpm(19))).toBe(20);
    expect(map.toBpm(map.fromBpm(301))).toBe(300);
    // a riff's BPM comes back whole, from the knob stored to a hundredth as the page stores it
    for (const bpm of [20, 61, 120, 300]) {
      expect(map.toBpm(map.fromBpm(bpm))).toBe(bpm);
      expect(map.toBpm(Math.round(map.fromBpm(bpm) * 100) / 100)).toBe(bpm);
    }
    // 120 BPM in the app is 480 of the Subharmonicon's clocks a minute: 8 Hz
    expect(sh({ 'clock.tempo': map.fromBpm(120) }).tempo).toBeCloseTo(8, 9);
  });

  it('reads TEMPO in its own clocks and in the app’s BPM', () => {
    const tempo = subharmonicon.controls.find((c) => c.id === 'clock.tempo');
    if (!tempo || tempo.type !== 'knob' || !('fmt' in tempo) || !tempo.fmt)
      throw new Error('no TEMPO');
    const at = subharmonicon.tempoMap!.fromBpm(120);
    expect(tempo.fmt(at)).toBe('480 BPM · ♩ = 120');
    // past the app's tempos the clock still reads its own rate, and ♩ stays at the end of the range
    expect(tempo.fmt(10)).toBe('3000 BPM · ♩ = 300');
  });
});
