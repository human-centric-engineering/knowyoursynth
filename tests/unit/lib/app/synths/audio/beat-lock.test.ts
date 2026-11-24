/**
 * Beat-locking (`f-own-sequencer`, t-291): the shared helper, and the System 55's 960 held to the app's clock by it.
 *
 * The 960 runs in a bare Moog core with nothing patched into it (every input 0 V), driven by `clock` start, pulse and
 * stop the way the pattern and riff players send them: a start, then a pulse every 1000 samples, which at 48 kHz is
 * 24 PPQ at 120 BPM (a beat is 24 000 samples, a sixteenth 6000).
 *
 * @see lib/app/synths/audio/beat-lock.ts
 * @see lib/app/synths/audio/moog-core.ts
 */
import { describe, expect, it } from 'vitest';
import { createBeatLock, snapStage, snapStep } from '@/lib/app/synths/audio/beat-lock';
import { createMoog, MOOG_DESTS, MOOG_SIGNALS } from '@/lib/app/synths/audio/moog-core';
import type { MeterEvent } from '@/lib/app/synths/audio/dsp-core';
import type { EngineParams, MoogParams } from '@/lib/app/synths/contract';
import system55 from '@/lib/app/synths/defs/system-55';
import { FOLLOW_960 } from '@/lib/app/synths/defs/moog900/modules';
import { render } from '@/tests/unit/lib/app/synths/audio/render';

const SR = 48000;
/** Samples a pulse at 120 BPM, 24 PPQ. */
const PULSE = 1000;
const BEAT = 24 * PULSE;

describe('snapping a free-running rate to the beat', () => {
  it('rounds to a whole number of steps a beat, so a near miss lands on the grid', () => {
    // 2 beats a second: 7.94 Hz is 3.97 steps a beat, 8.1 Hz 4.05; both become exactly four
    expect(snapStep(7.94, 2)).toBe(1 / 4);
    expect(snapStep(8.1, 2)).toBe(1 / 4);
    // the Berlin sequence's 5.55 steps a beat snaps to 6
    expect(snapStep(5.55, 1)).toBe(1 / 6);
  });

  it('rounds a rate slower than the beat to a whole number of beats, and never takes more than a step a pulse', () => {
    expect(snapStep(0.6, 2)).toBe(3);
    expect(snapStep(0.01, 2)).toBe(200);
    expect(snapStep(500, 1)).toBe(1 / 24);
  });

  it('snaps one stage of row C timing to whole pulses, keeping a gallop’s long and short stages apart', () => {
    // a stage of two thirds of a beat and one of a third, at 1 beat a second
    expect(snapStage(1.5, 1)).toBe(16 / 24);
    expect(snapStage(3, 1)).toBe(8 / 24);
    // slightly off, they tighten to the nearest pulse
    expect(snapStage(1.47, 1)).toBe(16 / 24);
    // never shorter than a pulse
    expect(snapStage(1000, 1)).toBe(1 / 24);
  });
});

describe('the beat lock’s view of the pulses', () => {
  const pulsed = (n: number) => {
    const l = createBeatLock(SR);
    const beats: number[] = [];
    l.clock('start');
    for (let i = 0; i < n; i++) {
      if (i % PULSE === 0) l.clock('pulse');
      l.step();
      beats.push(l.beat());
    }
    return { l, beats };
  };

  it('counts beats from the run’s first pulse, filling in between pulses at their rate', () => {
    const { l, beats } = pulsed(3 * BEAT);
    expect(beats[0]).toBe(0);
    expect(beats[BEAT]).toBeCloseTo(1, 9);
    expect(beats[BEAT + PULSE / 2]).toBeCloseTo(1 + 1 / 48, 9);
    expect(beats[2 * BEAT + 3 * PULSE]).toBeCloseTo(2 + 3 / 24, 9);
    expect(l.bps()).toBeCloseTo(2, 9);
    expect(l.running()).toBe(true);
  });

  it('reports a start and a stop once each, on the sample after they arrive, and ignores pulses outside a run', () => {
    const l = createBeatLock(SR);
    l.clock('pulse');
    expect(l.step()).toBe(null);
    expect(l.beat()).toBe(0);
    l.clock('start');
    l.clock('pulse');
    expect(l.step()).toBe('start');
    expect(l.step()).toBe(null);
    l.clock('stop');
    expect(l.step()).toBe('stop');
    expect(l.running()).toBe(false);
  });
});

/** A bare Moog core with the 960 read by a cable (row A), and its stage recorded each sample. */
function rig(s960: Partial<NonNullable<MoogParams['s960']>>, follow: boolean) {
  const SI = Object.fromEntries(MOOG_SIGNALS.map((n, i) => [n, i]));
  const DI = Object.fromEntries(MOOG_DESTS.map((n, i) => [n, i]));
  const S = new Float64Array(MOOG_SIGNALS.length);
  const m = createMoog(SR, S, SI, DI, () => 0, new Uint8Array(MOOG_DESTS.length));
  const q: NonNullable<MoogParams['s960']> = {
    hz: 7.94, // 3.97 steps a beat at 120 BPM: a near miss that drifts free
    timing: false,
    rows: [0, 1, 2].map(() => [0, 0, 0, 0, 0, 0, 0, 0]),
    range: [2, 2, 2],
    mode: Array(8).fill('normal'),
    btn: { on: false, off: false, shift: false, set: Array(8).fill(false) },
    ...s960,
  };
  m.set({ vco: [], s960: q }, new Set(['s960a', 's960clk']), follow);
  /** Run `n` samples; with `pulses`, a pulse every PULSE samples counted from this call's first. */
  const run = (n: number, o: { start?: boolean; stop?: boolean; pulses?: boolean } = {}) => {
    const stage: number[] = [];
    const clk: number[] = [];
    if (o.stop) m.clock('stop');
    if (o.start) m.clock('start');
    for (let i = 0; i < n; i++) {
      if (o.pulses && i % PULSE === 0) m.clock('pulse');
      m.step(60, false);
      stage.push(m.seqState()!.stage);
      clk.push(S[SI.s960clk]);
    }
    return { stage, clk };
  };
  /** The samples the stage changed on. */
  const moves = (stage: number[]) =>
    stage.flatMap((s, i) => (i > 0 && s !== stage[i - 1] ? [i] : []));
  return { m, run, moves };
}

describe('the 960 locked to the app’s clock', () => {
  it('stands still on stage 1 until the clock starts it', () => {
    const t = rig({}, true);
    const { stage, clk } = t.run(SR);
    expect(new Set(stage)).toEqual(new Set([0]));
    // and sends no clock pulses, so nothing it fires sounds
    expect(Math.max(...clk)).toBe(0);
  });

  it('starts on stage 1 on the first beat and moves on exactly every sixteenth, without drifting', () => {
    const t = rig({}, true);
    const { stage, clk } = t.run(8 * BEAT, { start: true, pulses: true });
    expect(stage[0]).toBe(0);
    expect(clk[0]).toBe(5);
    // 3.97 steps a beat snaps to 4: over eight beats, 32 steps, each exactly 6000 samples after the last
    const at = t.moves(stage);
    expect(at).toEqual(Array.from({ length: 31 }, (_, k) => (k + 1) * 6000));
    expect(stage[8 * BEAT - 1]).toBe(31 % 8);
  });

  it('starts again from stage 1 on each start, wherever it was', () => {
    const t = rig({}, true);
    t.run(BEAT + 3 * PULSE, { start: true, pulses: true });
    expect(t.m.seqState()!.stage).toBe(4);
    const again = t.run(PULSE, { start: true, pulses: true });
    expect(again.stage[0]).toBe(0);
  });

  it('holds where it is on Stop, and its clock output goes quiet', () => {
    const t = rig({}, true);
    t.run(BEAT + 3 * PULSE, { start: true, pulses: true });
    const held = t.run(SR, { stop: true });
    expect(new Set(held.stage)).toEqual(new Set([4]));
    expect(Math.max(...held.clk)).toBe(0);
  });

  it('holds on a STOP stage until the next start, keeping time so the start finds the beat', () => {
    const t = rig(
      { mode: ['normal', 'normal', 'stop', 'normal', 'normal', 'normal', 'normal', 'normal'] },
      true
    );
    const a = t.run(2 * BEAT, { start: true, pulses: true });
    expect(t.moves(a.stage)).toEqual([6000, 12000]);
    expect(a.stage[2 * BEAT - 1]).toBe(2);
    const b = t.run(BEAT, { start: true, pulses: true });
    expect(b.stage[0]).toBe(0);
    expect(t.moves(b.stage)).toEqual([6000, 12000]);
  });

  it('with row C timing, gives each stage a whole number of pulses: its own length, exact', () => {
    // 4 Hz is two steps a beat (half a beat); row C at full on X1 (2 V) on stage 1 makes it four times as fast, an
    // eighth of a beat
    const rows = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [10, 0, 0, 0, 0, 0, 0, 0],
    ];
    const t = rig({ hz: 4, timing: true, rows }, true);
    const { stage } = t.run(5 * BEAT, { start: true, pulses: true });
    const at = t.moves(stage);
    // stage 1 lasts 3 pulses, each stage after it 12; the cycle repeats every 3 + 7 × 12 pulses
    expect(at.slice(0, 4)).toEqual([3000, 15000, 27000, 39000]);
    expect(at[7]).toBe(87000);
    expect(at[8]).toBe(90000);
  });

  it('runs free when it is fast enough to be an oscillator, with or without the clock', () => {
    const t = rig({ hz: 100 }, true);
    const { stage } = t.run(SR / 10);
    // a step every 480 samples, as before locking existed
    expect(t.moves(stage)[0]).toBe(480);
  });

  it('runs free on its own clock when the sound does not follow, ignoring the app’s', () => {
    const t = rig({}, false);
    const { stage } = t.run(2 * BEAT, { start: true, pulses: true });
    // 7.94 Hz: a step every 6045 samples, not the sixteenth's 6000, and no start sends it back to stage 1
    const at = t.moves(stage);
    expect(Math.abs(at[0] - SR / 7.94)).toBeLessThan(1);
    expect(Math.abs(at[3] - (4 * SR) / 7.94)).toBeLessThan(1);
  });
});

describe('the clock reaching the System 55’s 960 from the voice’s riff player', () => {
  /** The 960's own clock: 3.8 steps a beat at 120 BPM, a step every 6316 samples free, which snaps to the sixteenth. */
  const HZ = 7.6;
  /** The System 55 at init with the 960 read (row A on a 995). */
  const params = (follow: boolean): EngineParams => {
    const v = {
      ...system55.init,
      'm960.freq_range': 5,
      'm960.vernier': (10 * Math.log(HZ / 0.7)) / Math.log(8 / 0.7),
      [FOLLOW_960]: follow,
    };
    return {
      ...system55.toEngine(v, { wheel: 0, patched: {} }),
      cables: [{ src: 's960a', dst: 'q0In', amt: 1, add: false }],
    };
  };
  /** The 960's stage at each meter reading over two seconds of a one-bar riff, and the sample it was read at. */
  const stages = (p: EngineParams) => {
    const { events } = render(p, {
      len: 2 * SR,
      events: [[0, { type: 'phrase', phrase: { bpm: 120, loop: true, steps: [[0, 60, 4]] } }]],
    });
    return events
      .filter((e): e is MeterEvent => e.type === 'meter')
      .map((e, i) => ({ t: (i + 1) * 2048, seq: e.seq }));
  };
  /** Readings at least a block clear of a step at `len` samples a step, so where a meter falls cannot tip them. */
  const clear = (len: number) => (r: { t: number }) => Math.min(r.t % len, len - (r.t % len)) > 256;

  it('sets follow from the 960 CLOCK switch, which starts at FREE, as the hardware runs', () => {
    expect(params(true).follow).toBe(true);
    expect(params(false).follow).toBeUndefined();
    expect(system55.init[FOLLOW_960]).toBe(false);
    expect(system55.ownSequencer?.run).toBe(FOLLOW_960);
  });

  it('following, the riff’s clock moves the 960 on every sixteenth from its first beat', () => {
    const on = stages(params(true)).filter(clear(6000));
    expect(on.length).toBeGreaterThan(20);
    for (const r of on) expect(r.seq).toBe(Math.floor(r.t / 6000) % 8);
  });

  it('at FREE, the 960 keeps its own rate and drifts off the sixteenths', () => {
    const len = SR / HZ;
    const off = stages(params(false)).filter(clear(len));
    for (const r of off) expect(r.seq).toBe(Math.floor(r.t / len) % 8);
    // by two seconds it is a step and more behind the locked one
    expect(off[off.length - 1].seq).not.toBe(Math.floor(off[off.length - 1].t / 6000) % 8);
  });
});
