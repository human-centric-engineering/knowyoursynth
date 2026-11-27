/**
 * The Moog DFAM's control section (t-327): EngineParams `dfam`, a clock VCO, an 8-step pitch and velocity sequencer,
 * the trigger and velocity buses and three decay envelopes, beside the fixed voice's oscillators, filter and VCA. And
 * the fixed voice's linear FM (`OscParams.fmLin`), the DFAM's 1→2 FM.
 *
 * Each test is written to fail with its feature taken out: a sequencer that does not move reads one step's pitch, a
 * trigger that ignores velocity peaks every envelope alike, a cable that does not break its normal fires twice, and so on.
 *
 * @see lib/app/synths/audio/dfam-core.ts
 */

import { describe, it, expect } from 'vitest';

import type { DfamParams, EngineParams } from '@/lib/app/synths/contract';
import {
  createDfam,
  DFAM_DESTS,
  DFAM_SIGNALS,
  DFAM_STEPS,
  VEL_DECAY,
} from '@/lib/app/synths/audio/dfam-core';
import { CLOCK_PPQ } from '@/lib/app/synths/audio/subharm-core';
import { allFinite, monoParams, render, rms } from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;

const ENV = { decay: 0.5, min: 0.01, max: 10, attack: 0.001 };

/** Stopped, at 10 Hz, every step centred in pitch and at full velocity. */
function dfam(over: Partial<DfamParams> = {}): DfamParams {
  return {
    tempo: 10,
    pitch: Array(DFAM_STEPS).fill(0),
    vel: Array(DFAM_STEPS).fill(1),
    run: false,
    noise: 0,
    eg: [{ ...ENV }, { ...ENV }, { ...ENV }],
    ...over,
  };
}

/** The core on its own, with its signals readable and its inputs settable. */
function rig(p: DfamParams, follow = false) {
  // the voice's noise, which the NOISE / EXT channel reads, last
  const names = [...DFAM_SIGNALS, 'noise'];
  const SI = Object.fromEntries(names.map((n, i) => [n, i]));
  const DI = Object.fromEntries(DFAM_DESTS.map((n, i) => [n, i]));
  const S = new Float64Array(names.length);
  const dv = new Float64Array(DFAM_DESTS.length);
  const cab = new Uint8Array(DFAM_DESTS.length);
  const core = createDfam(SR, S, SI, DI, (d) => dv[d], cab);
  core.set(p, follow);
  /** Run `n` samples, recording the named signals; `key` strikes a key on the first sample at that velocity. */
  const run = (n: number, names: string[], key?: number) => {
    const rec: Record<string, Float64Array> = {};
    for (const nm of names) rec[nm] = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      core.step(key != null && i === 0, key ?? 0);
      for (const nm of names) rec[nm][i] = S[SI[nm]];
    }
    return rec;
  };
  const input = (name: string, v: number, cabled = true) => {
    dv[DI[name]] = v;
    cab[DI[name]] = cabled ? 1 : 0;
  };
  return { core, S, SI, run, input };
}

/** Rising edges of a 0/1 signal. */
function edges(x: Float64Array): number[] {
  const at: number[] = [];
  for (let i = 0; i < x.length; i++) if (x[i] > 0.5 && (i === 0 || x[i - 1] <= 0.5)) at.push(i);
  return at;
}

const max = (x: Float64Array): number => x.reduce((m, v) => (v > m ? v : m), 0);

describe('dfam core: the sequencer', () => {
  it('plays the step it is on first, then moves on a step at each clock, with that step on PITCH and VELOCITY', () => {
    const pitch = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75];
    const vel = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const r = rig(dfam({ run: true, tempo: 100, pitch, vel }));
    // 100 Hz: a step every 480 samples; nine clocks wrap round to step 1
    const rec = r.run(480 * 9, ['dfmPitch', 'dfmVel', 'dfmTrig']);
    const at = edges(rec.dfmTrig);
    expect(at).toHaveLength(9);
    expect(at[0]).toBe(0);
    const steps = at.map((i) => rec.dfmPitch[i]);
    expect(steps).toEqual([...pitch, pitch[0]]);
    expect(at.map((i) => rec.dfmVel[i])).toEqual([...vel, vel[0]]);
    // about 480 samples apart
    for (let k = 1; k < at.length; k++)
      expect(Math.abs(at[k] - at[k - 1] - 480)).toBeLessThanOrEqual(1);
  });

  it('TRIGGER OUT is a 1 ms pulse', () => {
    const r = rig(dfam({ run: true, tempo: 10 }));
    const rec = r.run(2000, ['dfmTrig']);
    let hi = 0;
    for (const x of rec.dfmTrig) if (x > 0.5) hi++;
    expect(hi).toBe(Math.round(0.001 * SR));
  });

  it('the TEMPO input moves the clock 1 V an octave (full scale 5 V)', () => {
    const r = rig(dfam({ run: true, tempo: 10 }));
    // +1 V (0.2 of full scale): twice the rate
    r.input('dfmTempo', 0.2);
    const rec = r.run(SR, ['dfmTrig']);
    expect(edges(rec.dfmTrig)).toHaveLength(20);
  });

  it('stopped, it does not move or trigger; RUN / STOP lit starts it on the step it is on', () => {
    const r = rig(dfam({ tempo: 100, pitch: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] }));
    let rec = r.run(2000, ['dfmTrig', 'dfmPitch']);
    expect(edges(rec.dfmTrig)).toHaveLength(0);
    r.core.press('next');
    r.core.press('next');
    r.run(1, []);
    // ADVANCE twice (one sample each) moved it to step 3, without a trigger
    rec = r.run(1, ['dfmTrig', 'dfmPitch']);
    expect(r.core.stage()).toBe(1);
    r.core.press('next');
    rec = r.run(10, ['dfmTrig', 'dfmPitch']);
    expect(r.core.stage()).toBe(2);
    expect(edges(rec.dfmTrig)).toHaveLength(0);
    expect(rec.dfmPitch[0]).toBe(0.3);
    r.core.set(dfam({ run: true, tempo: 100, pitch: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] }));
    rec = r.run(500, ['dfmTrig', 'dfmPitch']);
    // starts on step 3, which plays first, then step 4
    const at = edges(rec.dfmTrig);
    expect(at[0]).toBe(0);
    expect(rec.dfmPitch[at[0]]).toBe(0.3);
    expect(rec.dfmPitch[at[1]]).toBe(0.4);
    // RUN / STOP unlit stops it where it is
    r.core.set(dfam({ run: false, tempo: 100, pitch: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] }));
    const st = r.core.stage();
    // past the last step's 1 ms pulse
    r.run(100, []);
    rec = r.run(2000, ['dfmTrig']);
    expect(edges(rec.dfmTrig)).toHaveLength(0);
    expect(r.core.stage()).toBe(st);
  });

  it('TRIGGER replays the step it is on without moving, only while stopped', () => {
    const r = rig(dfam({ vel: [0.2, 0.9, 0, 0, 0, 0, 0, 0] }));
    r.core.press('trigger');
    let rec = r.run(1000, ['dfmTrig', 'dfmEgVca']);
    expect(edges(rec.dfmTrig)).toEqual([0]);
    expect(r.core.stage()).toBe(0);
    // its peak is step 1's velocity
    expect(max(rec.dfmEgVca)).toBeCloseTo(0.2, 3);
    r.core.press('trigger');
    rec = r.run(10, ['dfmTrig']);
    expect(edges(rec.dfmTrig)).toEqual([0]);
    expect(r.core.stage()).toBe(0);
    // running, a press does nothing beyond the clock's own triggers
    const run = rig(dfam({ run: true, tempo: 1 }));
    // past the first step's 1 ms pulse
    run.run(100, []);
    run.core.press('trigger');
    run.core.press('next');
    rec = run.run(1000, ['dfmTrig']);
    expect(edges(rec.dfmTrig)).toHaveLength(0);
    expect(run.core.stage()).toBe(0);
  });

  it('ADV / CLOCK moves it a step at each rising edge, overriding TEMPO, and only while it runs', () => {
    const r = rig(dfam({ run: true, tempo: 600, pitch: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7] }));
    r.input('dfmAdv', 0);
    // a clock of four edges, 1000 samples apart; at 600 Hz TEMPO alone would tick 50 times
    const rec: number[] = [];
    let trig = 0;
    for (let i = 0; i < 4000; i++) {
      r.input('dfmAdv', i % 1000 < 500 ? 1 : 0);
      r.run(1, []);
      if (r.S[r.SI.dfmTrig] > 0.5 && trig <= 0.5) rec.push(r.S[r.SI.dfmPitch]);
      trig = r.S[r.SI.dfmTrig];
    }
    // the first edge plays the step it was on, the next three move on
    expect(rec).toEqual([0, 0.1, 0.2, 0.3]);
    // stopped, an edge does nothing
    r.core.set(dfam({ run: false, tempo: 600 }));
    const st = r.core.stage();
    for (let i = 0; i < 4000; i++) {
      r.input('dfmAdv', i % 1000 < 500 ? 1 : 0);
      r.run(1, []);
    }
    expect(r.core.stage()).toBe(st);
  });

  it('a cable in RUN / STOP takes over from the panel: high runs, low stops', () => {
    const r = rig(dfam({ run: false, tempo: 100 }));
    r.input('dfmRun', 1);
    let rec = r.run(1000, ['dfmTrig']);
    expect(edges(rec.dfmTrig).length).toBeGreaterThan(1);
    r.input('dfmRun', 0);
    const st = r.core.stage();
    // past the last step's 1 ms pulse
    r.run(100, []);
    rec = r.run(2000, ['dfmTrig']);
    expect(edges(rec.dfmTrig)).toHaveLength(0);
    expect(r.core.stage()).toBe(st);
  });

  it('unplugging RUN / STOP with the panel lit starts it again on the step it is on, at once', () => {
    const pitch = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const r = rig(dfam({ run: true, tempo: 10, pitch }));
    // a low cable stops it on step 1, after the one trigger it played on the first sample
    r.input('dfmRun', 0);
    r.run(2000, []);
    const st = r.core.stage();
    r.input('dfmRun', 0, false);
    const rec = r.run(100, ['dfmTrig', 'dfmPitch']);
    expect(edges(rec.dfmTrig)).toEqual([0]);
    expect(rec.dfmPitch[0]).toBe(pitch[st]);
  });
});

describe('dfam core: the buses and envelopes', () => {
  it('fires all three envelopes with their peak at the step velocity; velocity 0 is silent', () => {
    const r = rig(dfam({ run: true, tempo: 100, vel: [0.5, 0, 1, 0, 0, 0, 0, 0] }));
    const rec = r.run(480 * 3, ['dfmEgVco', 'dfmEgVcf', 'dfmEgVca']);
    for (const nm of ['dfmEgVco', 'dfmEgVcf', 'dfmEgVca']) {
      const x = rec[nm];
      expect(max(x.subarray(0, 480))).toBeCloseTo(0.5, 3);
      // step 2 at velocity 0 does not lift it: it only goes on falling
      for (let i = 481; i < 960; i++) expect(x[i]).toBeLessThanOrEqual(x[i - 1] + 1e-12);
      expect(max(x.subarray(960))).toBeCloseTo(1, 3);
    }
  });

  it('rises over the attack, then falls away to −60 dB at the decay time, lengthened a little by velocity', () => {
    const eg = { decay: 0, min: 0.1, max: 10, attack: 0.001 };
    const at = (v: number) => {
      const r = rig(dfam({ vel: Array(8).fill(v), eg: [eg, eg, { ...eg, attack: 0.1 }] }));
      r.core.press('trigger');
      return r.run(SR, ['dfmEgVco', 'dfmEgVca']);
    };
    const full = at(1);
    // the 1 ms attack reaches the peak in 48 samples, the 100 ms one in 4800
    expect(full.dfmEgVco[46]).toBeLessThan(1);
    expect(full.dfmEgVco[49]).toBeCloseTo(1, 2);
    expect(full.dfmEgVca[2400]).toBeCloseTo(0.5, 2);
    expect(full.dfmEgVca[4801]).toBeCloseTo(1, 2);
    // at velocity 1 the 0.1 s decay lasts 1 + VEL_DECAY / 2 of it
    const t = 0.1 * (1 + VEL_DECAY * 0.5);
    const i = Math.round((0.001 + t) * SR);
    expect(full.dfmEgVco[i]).toBeGreaterThan(0.0009);
    expect(full.dfmEgVco[i]).toBeLessThan(0.0011);
    // at velocity 0.5 it lasts its own time, so it is lower by then
    const half = at(0.5);
    expect(half.dfmEgVco[i]).toBeLessThan(0.5 * full.dfmEgVco[i]);
  });

  it('a decay CV adds to the knob, ±5 V across its whole turn from the centre', () => {
    const eg = { decay: 0.5, min: 0.01, max: 10, attack: 0.001 };
    const level = (cv: number) => {
      const r = rig(dfam({ eg: [eg, eg, eg] }));
      r.input('dfmDecVca', cv);
      r.core.press('trigger');
      return r.run(SR / 2, ['dfmEgVca']).dfmEgVca[SR / 4];
    };
    // −5 V: the 10 ms end; +5 V: the 10 s end, a quarter of a second in −60 dB × 0.25 / 11.5
    expect(level(-1)).toBe(0);
    expect(level(1)).toBeCloseTo(
      Math.exp((Math.log(0.001) * 0.25) / (10 * (1 + VEL_DECAY * 0.5))),
      2
    );
    expect(level(0)).toBeGreaterThan(level(-0.2));
  });

  it('a cable in TRIGGER breaks the sequencer’s normal and fires on its own edges without moving the step', () => {
    const r = rig(dfam({ run: true, tempo: 100 }));
    r.input('dfmTrigIn', 0);
    const fired: number[] = [];
    let prev = 0;
    for (let i = 0; i < 4800; i++) {
      // edges every 1500 samples
      r.input('dfmTrigIn', i % 1500 < 10 ? 1 : 0);
      r.run(1, []);
      const t = r.S[r.SI.dfmTrig];
      if (t > 0.5 && prev <= 0.5) fired.push(i);
      prev = t;
    }
    expect(fired).toEqual([0, 1500, 3000, 4500]);
    // the sequencer still moved: ten clocks at 100 Hz, the first playing step 1, nine moving on
    expect(r.core.stage()).toBe(9 % DFAM_STEPS);
  });

  it('a cable in VELOCITY breaks the step velocity’s normal', () => {
    const r = rig(dfam({ vel: Array(8).fill(1) }));
    r.input('dfmVelIn', 0.3);
    r.core.press('trigger');
    const rec = r.run(500, ['dfmEgVcf', 'dfmVel']);
    expect(max(rec.dfmEgVcf)).toBeCloseTo(0.3, 3);
    // VELOCITY OUT is still the step's
    expect(rec.dfmVel[10]).toBe(1);
  });

  it('a key fires the bus at its velocity while stopped, and only transposes while it runs', () => {
    const r = rig(dfam());
    let rec = r.run(500, ['dfmEgVca', 'dfmVel', 'dfmTrig'], 0.6);
    expect(edges(rec.dfmTrig)).toEqual([0]);
    expect(max(rec.dfmEgVca)).toBeCloseTo(0.6, 3);
    // VELOCITY OUT follows the key until the step moves
    expect(rec.dfmVel[10]).toBeCloseTo(0.6, 6);
    const run = rig(dfam({ run: true, tempo: 1 }));
    run.run(100, []);
    rec = run.run(500, ['dfmTrig'], 0.6);
    expect(edges(rec.dfmTrig)).toHaveLength(0);
  });

  it('VELOCITY OUT goes back to the step’s once anything but a key fires the bus', () => {
    const r = rig(dfam({ vel: Array(8).fill(0.2) }));
    r.run(10, [], 0.9);
    r.core.press('trigger');
    const rec = r.run(10, ['dfmVel', 'dfmEgVca']);
    expect(rec.dfmVel[0]).toBe(0.2);
    // and RUN / STOP lit plays the step it is on at the step's velocity, shown as the step's
    const k = rig(dfam({ vel: Array(8).fill(0.2) }));
    k.run(10, [], 0.9);
    k.core.set(dfam({ vel: Array(8).fill(0.2), run: true }));
    expect(k.run(10, ['dfmVel']).dfmVel[0]).toBe(0.2);
  });

  it('a decay range with no bottom (min 0) still decays, and stays finite', () => {
    const z = { decay: 0.5, min: 0, max: 10, attack: 0.001 };
    const r = rig(dfam({ eg: [z, z, z] }));
    r.core.press('trigger');
    const rec = r.run(SR, ['dfmEgVca']);
    expect(rec.dfmEgVca.every(Number.isFinite)).toBe(true);
    expect(max(rec.dfmEgVca)).toBeGreaterThan(0.9);
  });
});

describe('dfam core: the NOISE / EXT channel', () => {
  it('is the noise at the knob plus NOISE LEVEL, and EXT AUDIO replaces the noise once cabled', () => {
    const r = rig(dfam({ noise: 0.5 }));
    r.S[r.SI.noise] = 0.8;
    r.run(1, []);
    expect(r.S[r.SI.dfmNz]).toBeCloseTo(0.4, 9);
    // NOISE LEVEL adds to the knob, even from 0
    r.core.set(dfam({ noise: 0 }));
    r.input('dfmNzLvl', 0.25);
    r.run(1, []);
    expect(r.S[r.SI.dfmNz]).toBeCloseTo(0.2, 9);
    r.input('dfmExt', -0.5);
    r.run(1, []);
    expect(r.S[r.SI.dfmNz]).toBeCloseTo(-0.125, 9);
  });
});

describe('dfam core: following the app’s clock', () => {
  /** Drive `r` with the app's clock at `bpm` for `beats`, a start first; returns the trigger edges. */
  function clocked(r: ReturnType<typeof rig>, bpm: number, beats: number): number[] {
    const per = (60 / bpm / CLOCK_PPQ) * SR;
    const n = Math.round(beats * CLOCK_PPQ * per);
    r.core.clock('start');
    let next = 0,
      pulse = 0,
      prev = 0;
    const at: number[] = [];
    for (let i = 0; i < n; i++) {
      while (Math.round(next) <= i) {
        r.core.clock('pulse');
        pulse++;
        next = pulse * per;
      }
      r.run(1, []);
      const t = r.S[r.SI.dfmTrig];
      if (t > 0.5 && prev <= 0.5) at.push(i);
      prev = t;
    }
    return at;
  }

  it('waits for the clock’s start, plays step 1 on its first beat, and locks its steps to the beat', () => {
    // 7.3 Hz at 120 BPM (2 beats a second) is 3.65 steps a beat: locked to 4
    const r = rig(dfam({ run: true, tempo: 7.3 }), true);
    expect(edges(r.run(4800, ['dfmTrig']).dfmTrig)).toHaveLength(0);
    // ADVANCE while waiting moves it; the start puts it back on step 1
    r.core.press('next');
    r.run(1, []);
    const at = clocked(r, 120, 2);
    expect(at[0]).toBe(0);
    expect(at).toHaveLength(8);
    // a step is an eighth of a second, 6000 samples, to within a sample
    for (let k = 1; k < at.length; k++)
      expect(Math.abs(at[k] - at[k - 1] - 6000)).toBeLessThanOrEqual(1);
    r.core.clock('stop');
    expect(edges(r.run(SR, ['dfmTrig']).dfmTrig)).toHaveLength(0);
  });

  it('on the EDGE’s MIDI or USB clock (perBeat), a step is that share of the beat whatever TEMPO says', () => {
    // 1/16T: six steps a beat; TEMPO at 100 Hz would otherwise run free
    const r = rig(dfam({ run: true, tempo: 100, perBeat: 6 }), true);
    const at = clocked(r, 120, 2);
    expect(at).toHaveLength(12);
    for (let k = 1; k < at.length; k++)
      expect(Math.abs(at[k] - at[k - 1] - 4000)).toBeLessThanOrEqual(1);
    // and without the clock it stands still
    const still = rig(dfam({ run: true, tempo: 100, perBeat: 6 }));
    expect(edges(still.run(SR, ['dfmTrig']).dfmTrig)).toHaveLength(0);
  });

  it('a lit RUN / STOP follows a change of clock source: waits for the transport on it, runs free off it', () => {
    const r = rig(dfam({ run: true, tempo: 10 }));
    expect(edges(r.run(SR / 2, ['dfmTrig']).dfmTrig).length).toBeGreaterThan(3);
    // following, with no transport running, it stops and waits
    r.core.set(dfam({ run: true, tempo: 10 }), true);
    r.run(100, []);
    expect(edges(r.run(SR / 2, ['dfmTrig']).dfmTrig)).toHaveLength(0);
    // and back to free, it starts again at once
    r.core.set(dfam({ run: true, tempo: 10 }), false);
    expect(edges(r.run(100, ['dfmTrig']).dfmTrig)).toEqual([0]);
  });

  it('hears the transport stop while the voice is another synth’s, so on its return it is not stuck running', () => {
    const r = rig(dfam({ run: true, tempo: 7.3 }), true);
    clocked(r, 120, 1);
    r.core.off();
    r.core.clock('stop');
    r.core.set(dfam({ run: true, tempo: 7.3 }), true);
    r.run(100, []);
    expect(r.core.busy()).toBe(false);
    // stopped, a key fires the bus
    expect(edges(r.run(100, ['dfmTrig'], 0.8).dfmTrig)).toEqual([0]);
  });

  it('handed from the lock to TEMPO mid-run, it carries on from where the step is rather than ticking at once', () => {
    // 2 Hz at 120 BPM: a step a beat, locked; then TEMPO up to 100 Hz, free
    const r = rig(dfam({ run: true, tempo: 2 }), true);
    // a quarter of the way into the second step
    clocked(r, 120, 1.25);
    r.core.set(dfam({ run: true, tempo: 100 }), true);
    const at = edges(r.run(2000, ['dfmTrig']).dfmTrig);
    // the rest of the step at 100 Hz: three quarters of 480 samples, not on the first sample
    expect(at[0]).toBeGreaterThan(300);
    expect(at[0]).toBeLessThan(420);
  });

  it('on perBeat without following, a lit RUN / STOP waits, so the voice can go idle', () => {
    const r = rig(dfam({ run: true, tempo: 10, perBeat: 4 }));
    expect(edges(r.run(SR / 2, ['dfmTrig']).dfmTrig)).toHaveLength(0);
    expect(r.core.busy()).toBe(false);
    // and a key still fires the bus
    expect(edges(r.run(100, ['dfmTrig'], 0.8).dfmTrig)).toEqual([0]);
  });

  it('runs free above 20 Hz, within the run', () => {
    const r = rig(dfam({ run: true, tempo: 100 }), true);
    const at = clocked(r, 120, 1);
    // 100 Hz for half a second: 50 steps, not a whole division of the beat
    expect(at.length).toBeGreaterThanOrEqual(49);
    expect(at.length).toBeLessThanOrEqual(51);
  });
});

/** The fixed voice around the core, as a definition sets it up: triangle VCOs, the core's envelopes routed. */
function voice(over: Partial<DfamParams> = {}, more: Partial<EngineParams> = {}): EngineParams {
  return monoParams({
    osc: [
      { level: 0.8, mix: { tri: 1 }, semi: -12 },
      { level: 0, mix: { tri: 1 }, semi: 0 },
    ],
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 18000,
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    },
    vca: { envSrc: 'none', bias: 0 },
    routes: [
      { src: 'dfmPitch', dst: 'pitch1', amt: 60 },
      { src: 'dfmEgVca', dst: 'amp', amt: 1 },
    ],
    dfam: dfam({ run: true, tempo: 8, ...over }),
    ...more,
  });
}

describe('dfam in the voice', () => {
  it('sounds on each step with no key held, and is silent at velocity 0', () => {
    const on = render(voice(), { len: SR, events: [] });
    expect(allFinite(on.out)).toBe(true);
    expect(rms(on.out)).toBeGreaterThan(0.01);
    const off = render(voice({ vel: Array(8).fill(0) }), { len: SR, events: [] });
    expect(rms(off.out)).toBe(0);
  });

  it('meters the step it is on', () => {
    const { events } = render(voice({ tempo: 4 }), { len: SR, events: [] });
    const seqs = new Set(
      events.flatMap((e) => (e.type === 'meter' && e.seq != null ? [e.seq] : []))
    );
    expect(seqs.size).toBeGreaterThanOrEqual(3);
  });

  it('every key fires the bus while stopped, a legato one too', () => {
    const short = { decay: 0, min: 0.005, max: 10, attack: 0.001 };
    const p = voice(
      { run: false, eg: [short, short, short] },
      {
        trig: { retrig: false, drone: false, repeat: false },
      }
    );
    const { out } = render(p, {
      len: 9600,
      events: [
        [0, { type: 'noteOn', n: 60, v: 0.9 }],
        [4864, { type: 'noteOn', n: 64, v: 0.9 }],
      ],
    });
    expect(rms(out, 0, 1000)).toBeGreaterThan(0.01);
    // the first hit has died away by the second key, which strikes it again
    expect(rms(out, 4000, 4864)).toBeLessThan(1e-4);
    expect(rms(out, 4864, 6000)).toBeGreaterThan(0.01);
  });

  it('ADVANCE and TRIGGER reach the core through press messages', () => {
    const p = voice({ run: false });
    const quiet = render(p, { len: 9600, events: [] });
    expect(rms(quiet.out)).toBe(0);
    const hit = render(p, { len: 9600, events: [[0, { type: 'press', name: 'trigger' }]] });
    expect(rms(hit.out)).toBeGreaterThan(0.01);
  });
});

describe('linear FM (fmLin)', () => {
  /**
   * Oscillator 2's triangle alone at 220 Hz, FM'd by oscillator 1 at 110 Hz at `depth`, plus `cv` at fmLinAmt. Depth 1
   * swings it by 220 Hz, a modulation index of 2.
   */
  function fm(depth: number, cv = 0) {
    return render(
      monoParams({
        osc: [
          { level: 0, mix: { tri: 1 }, semi: 0, kbd: false, fixedNote: 45 },
          {
            level: 0.8,
            mix: { tri: 1 },
            semi: 0,
            kbd: false,
            fixedNote: 57,
            fmLin: { from: 0, depth },
          },
        ],
        filter: {
          type: 'ladder',
          mode: 'lp',
          cutoff: 18000,
          res: 0,
          envAmt: 0,
          envSrc: 'env1',
          kbd: 0,
        },
        vca: { envSrc: 'none', bias: 1 },
        routes: cv ? [{ src: 'one', dst: 'fmLinAmt', amt: cv }] : [],
      }),
      { len: SR / 2, events: [] }
    ).out;
  }
  /** Share of the signal's energy away from its fundamental (220 Hz), by a crude DFT around it. */
  function sidebandShare(x: Float32Array): number {
    const from = 4800,
      n = 19200;
    const bin = (hz: number) => {
      let re = 0,
        im = 0;
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * hz * i) / SR;
        re += x[from + i] * Math.cos(a);
        im += x[from + i] * Math.sin(a);
      }
      return (re * re + im * im) / (n * n);
    };
    const total = rms(x, from, from + n) ** 2 / 2;
    return 1 - bin(220) / total;
  }

  it('widens the spectrum around a steady pitch, and its CV adds depth', () => {
    // the carrier keeps about J0(β)² of the power; the triangle modulator's fundamental is 0.81 of its peak, so depth
    // 0.5 is β ≈ 0.8 (J0² ≈ 0.72), depth 1 β ≈ 1.6 (J0² ≈ 0.20)
    const none = sidebandShare(fm(0));
    const some = sidebandShare(fm(0.5));
    const more = sidebandShare(fm(0.5, 0.5));
    expect(none).toBeLessThan(0.05);
    expect(some).toBeGreaterThan(0.2);
    expect(some).toBeLessThan(0.4);
    expect(more).toBeGreaterThan(0.7);
    expect(allFinite(fm(2))).toBe(true);
  });

  it('ignores a source oscillator the voice does not have', () => {
    const out = (from: number) =>
      render(
        monoParams({
          osc: [
            { level: 0, mix: { tri: 1 }, semi: 0, kbd: false, fixedNote: 45 },
            {
              level: 0.8,
              mix: { tri: 1 },
              semi: 0,
              kbd: false,
              fixedNote: 57,
              fmLin: { from, depth: 1 },
            },
          ],
          vca: { envSrc: 'none', bias: 1 },
        }),
        { len: SR / 10, events: [] }
      ).out;
    const plain = out(1);
    for (const from of [2, 4, -1]) {
      const x = out(from);
      expect(allFinite(x)).toBe(true);
      expect(Array.from(x)).toEqual(Array.from(plain));
    }
  });
});
