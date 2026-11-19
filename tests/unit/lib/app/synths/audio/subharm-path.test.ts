/**
 * The Moog Subharmonicon's sources and sequencers (t-283): EngineParams `subharm`, two VCOs with two subharmonic
 * oscillators each, four rhythm generators and two 4-step sequencers, mixed into the fixed voice's filter, envelopes
 * and VCA in place of its oscillators.
 *
 * Each test is written to fail with its feature taken out: a sub that does not divide plays its VCO's pitch, OR and
 * XOR that combine alike step the same number of times, an envelope gate that restarts in its attack rises once, and so on.
 *
 * @see lib/app/synths/audio/subharm-core.ts
 */

import { describe, it, expect } from 'vitest';

import type { EngineParams, SubharmParams } from '@/lib/app/synths/contract';
import {
  createSubharm,
  DIV_PER_VOLT,
  quantize,
  SCALES,
  SUBHARM_DESTS,
  SUBHARM_SIGNALS,
} from '@/lib/app/synths/audio/subharm-core';
import { allFinite, monoParams, render, rms } from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
const C4 = 261.6255653005986;

/** Everything off: both VCOs at C4 on saw, subs at /1, no rhythm on any sequencer, stopped, EG on. */
function subharm(over: Partial<SubharmParams> = {}): SubharmParams {
  const vco = (): SubharmParams['vco'][number] => ({
    freq: 0,
    wave: 'saw',
    div: [1, 1],
    level: [0, 0, 0],
  });
  const seq = (): SubharmParams['seq'][number] => ({
    steps: [0, 0, 0, 0],
    assign: [false, false, false],
  });
  const rhythm = (div: number): SubharmParams['rhythm'][number] => ({
    div,
    seq1: false,
    seq2: false,
  });
  return {
    vco: [vco(), vco()],
    seq: [seq(), seq()],
    rhythm: [rhythm(1), rhythm(2), rhythm(3), rhythm(4)],
    quantize: 'off',
    oct: 2,
    logic: 'or',
    tempo: 10,
    play: false,
    eg: 'on',
    ...over,
  };
}

/** The core on its own, with its signals readable and its inputs settable. */
function rig(p: SubharmParams, attack: [number, number] = [0.001, 0.001]) {
  const SI = Object.fromEntries(SUBHARM_SIGNALS.map((n, i) => [n, i]));
  const DI = Object.fromEntries(SUBHARM_DESTS.map((n, i) => [n, i]));
  const S = new Float64Array(SUBHARM_SIGNALS.length);
  const dv = new Float64Array(SUBHARM_DESTS.length);
  const cab = new Uint8Array(SUBHARM_DESTS.length);
  // each envelope's attack-rate multiplier (its env1Rate / env2Rate CV), settable
  const rate = [1, 1];
  const core = createSubharm(
    SR,
    S,
    SI,
    DI,
    (d) => dv[d],
    cab,
    (k) => attack[k] / rate[k]
  );
  core.set(p);
  /** Run `n` samples, recording the named signals. */
  const run = (n: number, names: string[], note = 60, keyGate = false) => {
    const rec: Record<string, Float64Array> = {};
    for (const nm of names) rec[nm] = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      core.step(note, keyGate, false);
      for (const nm of names) rec[nm][i] = S[SI[nm]];
    }
    return rec;
  };
  const input = (name: string, v: number, cabled = true) => {
    dv[DI[name]] = v;
    cab[DI[name]] = cabled ? 1 : 0;
  };
  return { core, S, SI, run, input, rate };
}

/** Where a wave falls sharply through zero: a saw's reset or a square's falling edge (smoothed over a sample or two). */
function falls(x: Float64Array): number[] {
  const at: number[] = [];
  for (let i = 2; i < x.length; i++)
    if (x[i - 1] >= 0 && x[i] < 0 && x[i - 2] - x[i] > 0.5) at.push(i);
  return at;
}

/** Frequency of a saw or square from its sharp falls. */
function sawHz(x: Float64Array): number {
  const jumps = falls(x);
  if (jumps.length < 2) return 0;
  return ((jumps.length - 1) * SR) / (jumps[jumps.length - 1] - jumps[0]);
}

/** Rising edges of a 0/1 signal. */
function edges(x: Float64Array): number[] {
  const at: number[] = [];
  for (let i = 0; i < x.length; i++) if (x[i] > 0.5 && (i === 0 || x[i - 1] <= 0.5)) at.push(i);
  return at;
}

const withVco = (
  p: SubharmParams,
  k: 0 | 1,
  over: Partial<SubharmParams['vco'][number]>
): SubharmParams => {
  const vco = [...p.vco] as SubharmParams['vco'];
  vco[k] = { ...vco[k], ...over };
  return { ...p, vco };
};
const withSeq = (
  p: SubharmParams,
  k: 0 | 1,
  over: Partial<SubharmParams['seq'][number]>
): SubharmParams => {
  const seq = [...p.seq] as SubharmParams['seq'];
  seq[k] = { ...seq[k], ...over };
  return { ...p, seq };
};
const withRhythms = (
  p: SubharmParams,
  r: Partial<SubharmParams['rhythm'][number]>[]
): SubharmParams => ({
  ...p,
  rhythm: p.rhythm.map((x, i) => ({ ...x, ...(r[i] || {}) })) as SubharmParams['rhythm'],
});

describe('subharmonic oscillators', () => {
  it('plays each sub at its VCO’s frequency divided by its divisor', () => {
    const { run } = rig(withVco(subharm(), 0, { freq: 12, div: [3, 7] }));
    const r = run(SR, ['sbhVco1', 'sbhSub11', 'sbhSub12']);
    const f = C4 * 2;
    expect(sawHz(r.sbhVco1)).toBeCloseTo(f, 0);
    expect(sawHz(r.sbhSub11)).toBeCloseTo(f / 3, 0);
    expect(sawHz(r.sbhSub12)).toBeCloseTo(f / 7, 0);
  });

  it('keeps each sub locked in phase to its VCO: it restarts only when the VCO does', () => {
    const { run } = rig(withVco(subharm(), 1, { freq: 7, div: [5, 16] }));
    const r = run(SR / 2, ['sbhVco2', 'sbhSub21', 'sbhSub22']);
    const vcoWraps = falls(r.sbhVco2);
    for (const sub of [r.sbhSub21, r.sbhSub22]) {
      const subWraps = falls(sub);
      expect(subWraps.length).toBeGreaterThan(5);
      for (const i of subWraps) expect(vcoWraps.some((j) => Math.abs(j - i) <= 1)).toBe(true);
    }
  });

  it('rounds a divisor to a whole number and holds it to 1..16', () => {
    const { run } = rig(withVco(subharm(), 0, { div: [2.4, 40] }));
    const r = run(SR, ['sbhVco1', 'sbhSub11', 'sbhSub12']);
    expect(sawHz(r.sbhSub11)).toBeCloseTo(C4 / 2, 0);
    expect(sawHz(r.sbhSub12)).toBeCloseTo(C4 / 16, 0);
  });

  it('plays a key as an offset from C4 on both VCOs', () => {
    const { run } = rig(subharm());
    const r = run(SR, ['sbhVco1', 'sbhVco2'], 72);
    expect(sawHz(r.sbhVco1)).toBeCloseTo(C4 * 2, 0);
    expect(sawHz(r.sbhVco2)).toBeCloseTo(C4 * 2, 0);
  });

  it('normals VCO 1’s pitch input to VCO 2 until VCO 2’s is cabled', () => {
    const t = rig(subharm());
    t.input('sbhP1', 1);
    let r = t.run(SR, ['sbhVco1', 'sbhVco2']);
    expect(sawHz(r.sbhVco1)).toBeCloseTo(C4 * 2, 0);
    expect(sawHz(r.sbhVco2)).toBeCloseTo(C4 * 2, 0);
    t.input('sbhP2', 0);
    r = t.run(SR, ['sbhVco2']);
    expect(sawHz(r.sbhVco2)).toBeCloseTo(C4, 0);
  });

  it('moves both of a VCO’s divisors with its SUB input, a positive volt lowering them', () => {
    const t = rig(withVco(subharm(), 0, { div: [8, 12] }));
    t.input('sbhSub1', 2);
    const r = t.run(SR, ['sbhSub11', 'sbhSub12']);
    expect(sawHz(r.sbhSub11)).toBeCloseTo(C4 / (8 - 2 * DIV_PER_VOLT), 0);
    expect(sawHz(r.sbhSub12)).toBeCloseTo(C4 / (12 - 2 * DIV_PER_VOLT), 0);
  });

  it('gives square on all three with WAVE up, and saw subs under a pulse that SUB 1 moves in the middle', () => {
    const duty = (x: Float64Array) => x.filter((v) => v > 0).length / x.length;
    const sq = rig(withVco(subharm(), 0, { wave: 'square', div: [3, 1] })).run(SR, [
      'sbhVco1',
      'sbhSub11',
    ]);
    expect(duty(sq.sbhVco1)).toBeCloseTo(0.5, 1);
    expect(duty(sq.sbhSub11)).toBeCloseTo(0.5, 1);
    // a square sits at its two levels, where a saw passes through every value between
    expect(sq.sbhSub11.filter((v) => Math.abs(v) > 0.9).length / SR).toBeGreaterThan(0.95);

    const pwm = rig(withVco(subharm(), 0, { wave: 'pwm', div: [3, 1] })).run(SR, [
      'sbhVco1',
      'sbhSub11',
    ]);
    // the sub is a saw again; the VCO's width follows it, so its cycles are not all alike
    expect(sawHz(pwm.sbhSub11)).toBeCloseTo(C4 / 3, 0);
    expect(pwm.sbhSub11.filter((v) => Math.abs(v) > 0.9).length / SR).toBeLessThan(0.2);
    const widths: number[] = [];
    let hi = 0;
    for (let i = 1; i < pwm.sbhVco1.length; i++) {
      if (pwm.sbhVco1[i] > 0) hi++;
      if (pwm.sbhVco1[i - 1] <= 0 && pwm.sbhVco1[i] > 0) {
        widths.push(hi);
        hi = 0;
      }
    }
    expect(Math.max(...widths.slice(2)) - Math.min(...widths.slice(2))).toBeGreaterThan(20);
  });

  it('lets a cable in VCO PWM set the width of the squares, replacing SUB 1’s saw', () => {
    const t = rig(withVco(subharm(), 0, { wave: 'square' }));
    t.input('sbhPwm1', 2.5);
    const r = t.run(SR, ['sbhVco1', 'sbhSub11']);
    const duty = (x: Float64Array) => x.filter((v) => v > 0).length / x.length;
    expect(duty(r.sbhVco1)).toBeCloseTo(0.745, 1);
    expect(duty(r.sbhSub11)).toBeCloseTo(0.745, 1);
  });
});

describe('quantize', () => {
  it('snaps to the 12- and 8-note equal-tempered scales on C', () => {
    expect(quantize(4.4, '12-ET')).toBe(4);
    expect(quantize(5.6, '8-ET')).toBe(5);
    expect(quantize(6.2, '8-ET')).toBe(7);
    expect(quantize(-1.2, '8-ET')).toBe(-1);
    expect(quantize(11.8, '12-ET')).toBe(12);
    expect(quantize(5.6, 'off')).toBe(5.6);
  });

  it('snaps to just ratios over C', () => {
    expect(Math.pow(2, quantize(7.1, '12-JI') / 12)).toBeCloseTo(3 / 2, 6);
    expect(Math.pow(2, quantize(15.9, '8-JI') / 12)).toBeCloseTo(2 * (5 / 4), 6);
    expect(SCALES['8-JI']).toHaveLength(7);
  });

  it('steps the VCO’s FREQ to the scale', () => {
    const r = rig(withVco({ ...subharm(), quantize: '12-JI' }, 0, { freq: 7.2 })).run(SR, [
      'sbhVco1',
    ]);
    expect(sawHz(r.sbhVco1)).toBeCloseTo(C4 * 1.5, 0);
  });
});

describe('rhythm generators and sequencers', () => {
  const ticking = (p: SubharmParams) => ({ ...p, play: true, tempo: 50 });

  it('advances a sequencer on every n-th clock of the rhythm that drives it', () => {
    const steps = (div: number) =>
      edges(
        rig(withRhythms(ticking(subharm()), [{ div, seq1: true }])).run(SR - 100, ['sbhSeq1Clk'])
          .sbhSeq1Clk
      ).length;
    expect(steps(1)).toBe(50);
    expect(steps(5)).toBe(10);
  });

  it('does not move without a rhythm, nor while PLAY is off', () => {
    expect(edges(rig(ticking(subharm())).run(SR, ['sbhSeq1Clk']).sbhSeq1Clk)).toHaveLength(0);
    const stopped = withRhythms(subharm(), [{ seq1: true }]);
    expect(edges(rig(stopped).run(SR, ['sbhSeq1Clk', 'sbhClock']).sbhClock)).toHaveLength(0);
  });

  it('combines its rhythms by OR, or by XOR (exactly one firing)', () => {
    // rhythms /2 and /3 on Sequencer 1 over 12 clocks: OR at 0 2 3 4 6 8 9 10, XOR at 2 3 4 8 9 10
    const count = (logic: 'or' | 'xor') =>
      edges(
        rig(
          withRhythms({ ...ticking(subharm()), logic }, [
            {},
            { div: 2, seq1: true },
            { div: 3, seq1: true },
          ])
        ).run(Math.round((12 * SR) / 50) - 10, ['sbhSeq1Clk']).sbhSeq1Clk
      ).length;
    expect(count('or')).toBe(8);
    expect(count('xor')).toBe(6);
  });

  it('steps through four steps, playing step 1 first, and sends each as its SEQ out in octaves', () => {
    const p = withSeq(withRhythms(ticking(subharm()), [{ seq1: true }]), 0, {
      steps: [0, 0.5, -0.5, 1],
    });
    const r = rig(p).run(SR / 5, ['sbhSeq1']);
    const per = SR / 50;
    const at = (k: number) => r.sbhSeq1[Math.round(per * k + per / 2)];
    expect([0, 1, 2, 3, 4].map(at)).toEqual([0, 1, -1, 2, 0]);
  });

  it('moves the VCO’s pitch with ASSIGN OSC, and an assigned sub’s divisor with ASSIGN SUB', () => {
    const base = withRhythms(subharm(), [{ seq1: true }]);
    const p = withVco(withSeq(base, 0, { steps: [1, 0, 0, 0], assign: [true, false, true] }), 0, {
      div: [8, 8],
    });
    // stopped on step 1: +2 octaves on the VCO; SUB 2 is 2 V higher, so its divisor is 3 lower
    const r = rig(p).run(SR, ['sbhVco1', 'sbhSub11', 'sbhSub12']);
    expect(sawHz(r.sbhVco1)).toBeCloseTo(C4 * 4, -1);
    expect(sawHz(r.sbhSub11)).toBeCloseTo((C4 * 4) / 8, 0);
    expect(sawHz(r.sbhSub12)).toBeCloseTo((C4 * 4) / (8 - 2 * DIV_PER_VOLT), 0);
  });

  it('keeps an unassigned VCO where its FREQ knob is', () => {
    const p = withSeq(withRhythms(subharm(), [{ seq1: true }]), 0, { steps: [1, 0, 0, 0] });
    expect(sawHz(rig(p).run(SR, ['sbhVco1']).sbhVco1)).toBeCloseTo(C4, 0);
  });

  it('decouples the SEQ outputs: held QUANTIZE leaves them unquantised, held SEQ OCT spans ±5', () => {
    const p = withSeq({ ...subharm(), quantize: '12-ET', oct: 1 }, 0, {
      steps: [0.33, 0, 0, 0],
    });
    const out = (q: Partial<SubharmParams>) => rig({ ...p, ...q }).run(4, ['sbhSeq1']).sbhSeq1[3];
    expect(out({})).toBeCloseTo(4 / 12, 6);
    expect(out({ seqOutRaw: true })).toBeCloseTo(0.33, 6);
    expect(out({ seqOutRaw: true, seqOutFull: true })).toBeCloseTo(1.65, 6);
  });
});

describe('transport', () => {
  const p = withSeq(
    withRhythms({ ...subharm(), tempo: 50, play: true }, [{ seq1: true, seq2: true }]),
    0,
    { steps: [0, 0.25, 0.5, 0.75] }
  );

  it('RESET returns both sequencers to step 1, played on the next clock', () => {
    const t = rig(p);
    t.run(Math.round(SR * 0.05), []);
    expect(t.core.stages()[0]).toBe(2);
    t.core.press('reset');
    t.run(1, []);
    expect(t.core.stages()).toEqual([0, 0]);
    // the next clock plays step 1 again rather than leaving it
    t.run(Math.round(SR * 0.02), []);
    expect(t.core.stages()).toEqual([0, 0]);
  });

  it('NEXT advances both without triggering the envelopes', () => {
    const stopped = { ...p, play: false };
    const t = rig(stopped);
    t.run(10, []);
    t.core.press('next');
    const r = t.run(100, ['sbhTrig']);
    expect(t.core.stages()).toEqual([1, 1]);
    expect(edges(r.sbhTrig)).toHaveLength(0);
  });

  it('presses only on press(): a new patch with the same buttons, or any settings, presses nothing', () => {
    const stopped = { ...p, play: false, eg: 'off' as const };
    const t = rig(stopped);
    t.run(10, []);
    // a sound loads, a lane moves a knob: settings alone never press
    t.core.set({ ...stopped, tempo: 3 });
    t.core.set({ ...stopped, tempo: 4 });
    const r = t.run(100, ['sbhTrig']);
    expect(t.core.stages()).toEqual([0, 0]);
    expect(edges(r.sbhTrig)).toHaveLength(0);
    // one click is one press, taken once
    t.core.press('next');
    t.run(10, []);
    t.run(10, []);
    expect(t.core.stages()).toEqual([1, 1]);
  });

  it('a gate at RESET holds step 1 while the rhythms still trigger the envelopes', () => {
    const t = rig(p);
    t.input('sbhReset', 1);
    const r = t.run(SR / 5, ['sbhTrig']);
    expect(t.core.stages()).toEqual([0, 0]);
    expect(edges(r.sbhTrig).length).toBeGreaterThanOrEqual(9);
  });

  it('a gate at PLAY starts the clock on its rising edge and stops it on its falling edge', () => {
    const t = rig({ ...p, play: false });
    t.input('sbhPlay', 0);
    expect(edges(t.run(SR / 10, ['sbhClock']).sbhClock)).toHaveLength(0);
    t.input('sbhPlay', 1);
    expect(edges(t.run(SR / 10, ['sbhClock']).sbhClock)).toHaveLength(5);
    t.input('sbhPlay', 0);
    expect(edges(t.run(SR / 10, ['sbhClock']).sbhClock)).toHaveLength(0);
  });

  it('ignores the panel PLAY while a cable is in PLAY', () => {
    const t = rig({ ...p, play: false });
    t.input('sbhPlay', 0);
    t.run(10, []);
    t.core.set({ ...p, play: true });
    expect(edges(t.run(SR / 10, ['sbhClock']).sbhClock)).toHaveLength(0);
  });

  it('hands the transport back to the panel PLAY when the cable is pulled', () => {
    // the cable started the clock with PLAY unlit; pulling it stops the clock
    const t = rig({ ...p, play: false });
    t.input('sbhPlay', 1);
    expect(edges(t.run(SR / 10, ['sbhClock']).sbhClock)).toHaveLength(5);
    t.input('sbhPlay', 1, false);
    expect(edges(t.run(SR / 10, ['sbhClock']).sbhClock)).toHaveLength(0);
    // plugged in again already high, it starts the clock
    t.input('sbhPlay', 1);
    expect(edges(t.run(SR / 10, ['sbhClock']).sbhClock)).toHaveLength(5);
  });

  it('a cable plugged into PLAY low stops a clock the panel PLAY started', () => {
    const t = rig(p);
    expect(edges(t.run(SR / 10, ['sbhClock']).sbhClock)).toHaveLength(5);
    t.input('sbhPlay', 0);
    expect(edges(t.run(SR / 10, ['sbhClock']).sbhClock)).toHaveLength(0);
    expect(t.core.running()).toBe(false);
  });

  it('off() starts the sequencers again from step 1', () => {
    const t = rig(p);
    t.run(Math.round(SR * 0.05), []);
    expect(t.core.stages()[0]).toBe(2);
    t.core.off();
    t.core.set(p);
    t.run(1, []);
    expect(t.core.stages()).toEqual([0, 0]);
  });

  it('takes a new cable at CLOCK’s first edge even if the old one was left high', () => {
    const t = rig(p);
    t.input('sbhClkIn', 1);
    t.run(100, []);
    t.input('sbhClkIn', 0, false);
    t.run(10, []);
    // a new cable, high from its first sample: that is an edge, so a step
    t.input('sbhClkIn', 1);
    expect(edges(t.run(100, ['sbhSeq1Clk']).sbhSeq1Clk)).toHaveLength(1);
  });

  it('drops a press made while the Subharmonicon is off, and one pending when it goes', () => {
    const t = rig({ ...p, play: false });
    t.run(10, []);
    t.core.press('next');
    t.core.off();
    t.core.press('trigger');
    t.core.set({ ...p, play: false });
    const r = t.run(100, ['sbhTrig']);
    // still on step 1, and no TRIGGER fired from before the set
    expect(t.core.stages()).toEqual([0, 0]);
    expect(edges(r.sbhTrig)).toHaveLength(0);
  });

  it('sizes the SEQ CLK pulse to half an incoming clock faster than TEMPO', () => {
    // TEMPO 0.5 Hz would give the 10 ms cap; the CLOCK input runs every 200 samples
    const t = rig({ ...p, tempo: 0.5 });
    const hi: number[] = [];
    for (let i = 0; i < 2000; i++) {
      t.input('sbhClkIn', i % 200 < 20 ? 1 : 0);
      t.core.step(60, false, false);
      hi.push(t.S[t.SI.sbhSeq1Clk]);
    }
    // after the first two edges give a period: 100-sample pulses, low between them
    const pulse = hi.slice(1000, 1200);
    expect(pulse.filter((x) => x > 0).length).toBe(100);
    expect(edges(Float64Array.from(hi.slice(400)))).toHaveLength(8);
  });

  it('follows the CLOCK input in place of TEMPO', () => {
    const t = rig(p);
    // seven pulses in 0.2 s, where TEMPO alone would step ten times
    let steps = 0,
      prev = 0;
    for (let i = 0; i < SR / 5; i++) {
      t.input('sbhClkIn', i % 1300 < 200 && i < 7 * 1300 ? 1 : 0);
      t.core.step(60, false, false);
      const c = t.S[t.SI.sbhSeq1Clk];
      if (c > 0.5 && prev <= 0.5) steps++;
      prev = c;
    }
    expect(steps).toBe(7);
  });
});

describe('envelope gates', () => {
  const p = withRhythms({ ...subharm(), tempo: 50, play: true }, [{ seq1: true }]);

  it('EG on: each step opens both gates; EG off: steps do not', () => {
    expect(edges(rig(p).run(SR / 5 - 100, ['sbhEg1']).sbhEg1)).toHaveLength(10);
    expect(edges(rig({ ...p, eg: 'off' }).run(SR / 5, ['sbhEg1']).sbhEg1)).toHaveLength(0);
  });

  it('EG held keeps both gates open, and TRIGGER then does nothing', () => {
    const t = rig({ ...p, eg: 'held', play: false });
    const r = t.run(100, ['sbhEg1', 'sbhEg2']);
    expect(r.sbhEg1.every((x) => x === 1) && r.sbhEg2.every((x) => x === 1)).toBe(true);
    t.core.press('trigger');
    expect(edges(t.run(100, ['sbhTrig']).sbhTrig)).toHaveLength(0);
  });

  it('TRIGGER opens the gates with EG off, and sends a 1 ms pulse at TRIGGER OUT', () => {
    const q = { ...p, eg: 'off' as const, play: false };
    const t = rig(q);
    t.run(10, []);
    t.core.press('trigger');
    const r = t.run(SR / 10, ['sbhEg1', 'sbhTrig']);
    expect(edges(r.sbhEg1)).toHaveLength(1);
    expect(r.sbhTrig.filter((x) => x > 0).length).toBe(Math.round(0.001 * SR));
  });

  it('ignores a trigger while its envelope’s attack runs, and takes the next one after', () => {
    // steps every 20 ms against a 100 ms attack: gates at 0, 120 ms and 240 ms
    const r = rig(p, [0.1, 0.001]).run(Math.round(SR * 0.3), ['sbhEg1', 'sbhEg2']);
    const e1 = edges(r.sbhEg1).map((i) => Math.round((i / SR) * 1000));
    expect(e1).toEqual([0, 120, 240]);
    expect(edges(r.sbhEg2)).toHaveLength(15);
  });

  it('ignores a trigger only for the attack as its rate CV runs it', () => {
    // a 100 ms attack at twice the rate lasts 50 ms: gates at 0, 60, 120, 180 and 240 ms
    const t = rig(p, [0.1, 0.001]);
    t.rate[0] = 2;
    const r = t.run(Math.round(SR * 0.3), ['sbhEg1']);
    expect(edges(r.sbhEg1).map((i) => Math.round((i / SR) * 1000))).toEqual([0, 60, 120, 180, 240]);
  });

  it('holds both gates while a key is held', () => {
    const r = rig({ ...p, play: false }).run(1000, ['sbhEg1', 'sbhEg2'], 60, true);
    expect(r.sbhEg1.every((x) => x === 1)).toBe(true);
  });
});

describe('in the voice', () => {
  const params = (s: SubharmParams): EngineParams =>
    monoParams({
      osc: [],
      subharm: s,
      normals: { gate1: 'sbhEg1', gate2: 'sbhEg2' },
      filter: {
        type: 'ladder',
        mode: 'lp',
        cutoff: 8000,
        res: 0,
        envAmt: 0,
        envSrc: 'env1',
        kbd: 0,
      },
      env1: { a: 0.002, d: 0.1, s: 1, r: 0.1, free: true },
      env2: { a: 0.002, d: 0.1, s: 1, r: 0.1, free: true },
    });
  const sounding = withVco(subharm(), 0, { level: [0.8, 0.5, 0], div: [1, 2] });

  it('plays its sequence through the voice’s filter and VCA with no key held', () => {
    const p = withRhythms({ ...sounding, play: true, tempo: 2 }, [{ seq1: true }]);
    const out = render(params(p), { events: [], len: SR / 2 }).out;
    expect(allFinite(out)).toBe(true);
    expect(rms(out, 0, SR / 20)).toBeGreaterThan(0.05);
    // the decay after the first step's short gate
    expect(rms(out, SR / 4, SR / 2)).toBeLessThan(rms(out, 0, SR / 20) / 10);
  });

  it('follows the voice’s tune (and so its bend and transpose) on both VCOs', () => {
    const one = withVco(withVco({ ...subharm(), eg: 'held' }, 0, { level: [0.8, 0, 0] }), 1, {
      level: [0, 0, 0],
    });
    const up = (x: Float32Array) => {
      let n = 0;
      for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
      return n;
    };
    const at = (tune: number) =>
      up(render({ ...params(one), tune }, { events: [], len: SR }).out.slice(SR / 10));
    const ratio = at(12) / at(0);
    expect(ratio).toBeGreaterThan(1.95);
    expect(ratio).toBeLessThan(2.05);
  });

  it('takes a press message from the page: TRIGGER fires the envelopes with no key', () => {
    const quiet = render(params(sounding), { events: [], len: SR / 10 }).out;
    expect(rms(quiet)).toBe(0);
    const pressed = render(params(sounding), {
      events: [[100, { type: 'press', name: 'trigger' }]],
      len: SR / 10,
    }).out;
    expect(rms(pressed, 0, SR / 20)).toBeGreaterThan(0.05);
  });

  it('is silent until a key is played while stopped, then sounds the key', () => {
    const quiet = render(params(sounding), { events: [], len: SR / 10 }).out;
    expect(rms(quiet)).toBe(0);
    const played = render(params(sounding), { len: SR / 5 }).out;
    expect(rms(played, 0, SR / 10)).toBeGreaterThan(0.05);
  });
});
