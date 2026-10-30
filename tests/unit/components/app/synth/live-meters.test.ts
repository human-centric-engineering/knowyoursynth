/**
 * What the live views read from the engine once a frame (`createMeterReader()`): the meters from `meterStore` and the
 * output's level from the analyser, silent with the power off, and steady for a visitor who asks for less motion.
 *
 * @see components/app/synth/live-meters.ts
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createMeterReader, type LiveSource } from '@/components/app/synth/live-meters';
import { meterStore } from '@/components/app/synth/stores';
import { FAST_HZ, levelOfRms, SILENT } from '@/lib/app/synths/lib/routing-activity';

/** An analyser holding a steady wave of `amp`, recording the buffer sizes it was asked to fill. */
function analyser(amp: number, fftSize = 32) {
  const filled: number[] = [];
  const source: LiveSource = {
    analyser: {
      fftSize,
      getFloatTimeDomainData: (a: Float32Array) => {
        filled.push(a.length);
        a.fill(amp);
      },
    },
  };
  return { source, filled };
}

afterEach(() => meterStore.set({ gate: false, lfo: 0, overload: 0, power: false }));

describe('createMeterReader', () => {
  it('reads nothing with the power off, whatever the meters and the analyser say', () => {
    meterStore.set({ power: false, gate: true, lfo: 1, overload: 0, env1: 1 });
    const { source, filled } = analyser(0.5);
    expect(createMeterReader()(source, false)).toBe(SILENT);
    expect(filled).toEqual([]);
  });

  it('takes the meters as the engine reports them, and the output level from the analyser', () => {
    meterStore.set({
      power: true,
      gate: true,
      lfo: -0.4,
      lfoHz: 2,
      overload: 0,
      env1: 0.3,
      env2: 0.7,
      oscV: [0.1, -0.2],
      oscHz: [220],
      oscLv: [0.9, 0.4],
    });
    const m = createMeterReader()(analyser(0.25).source, false);
    expect(m).toMatchObject({ gate: true, lfo: -0.4, lfoHz: 2, env1: 0.3, env2: 0.7 });
    // An oscillator the engine gave no pitch for reads 0 Hz, not undefined.
    expect(m.osc).toEqual([
      { v: 0.1, hz: 220, lv: 0.9 },
      { v: -0.2, hz: 0, lv: 0.4 },
    ]);
    expect(m.out).toBeCloseTo(levelOfRms(0.25), 6);
  });

  it('reads the output as silent with no analyser, and fills in what the engine has not reported', () => {
    meterStore.set({ power: true, gate: false, lfo: 0, overload: 0 });
    const m = createMeterReader()({ analyser: null }, false);
    expect(m).toMatchObject({ out: 0, env1: 0, env2: 0, lfoHz: 0, osc: [] });
  });

  it('keeps one buffer the size of the analyser, made again only when that size changes', () => {
    meterStore.set({ power: true, gate: true, lfo: 0, overload: 0 });
    const read = createMeterReader();
    const small = analyser(0.5, 32);
    read(small.source, false);
    read(small.source, false);
    const big = analyser(0.5, 64);
    read(big.source, false);
    expect([...small.filled, ...big.filled]).toEqual([32, 32, 64]);
  });

  it('raises every wave to FAST_HZ for a visitor who asks for less motion', () => {
    meterStore.set({
      power: true,
      gate: true,
      lfo: 1,
      lfoHz: 0.5,
      overload: 0,
      oscV: [1],
      oscHz: [1],
    });
    const read = createMeterReader();
    expect(read(null, false).lfoHz).toBe(0.5);
    const steady = read(null, true);
    expect(steady.lfoHz).toBe(FAST_HZ);
    expect(steady.osc[0].hz).toBe(FAST_HZ);
  });
});
