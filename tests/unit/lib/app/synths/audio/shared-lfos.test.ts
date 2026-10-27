/**
 * Engine additions for the GS Music e7 (t-134): a third LFO (`lfo3`, signal `lfo3`) and LFOs whose phase every voice of
 * a poly synth shares (`common`, the e7's Monophonic LFO mode and its LFO 3).
 *
 * Each test is written to fail with its feature taken out: an `lfo3` that is not computed leaves the VCA shut, and
 * voices that do not share a phase open their VCAs at different times.
 *
 * @see lib/app/synths/audio/dsp-core.ts
 */

import { describe, it, expect } from 'vitest';

import type { EngineParams, Lfo2Params } from '@/lib/app/synths/contract';
import { monoParams, render, rms, type Timed } from '@/tests/unit/lib/app/synths/audio/render';

/** A saw that only a route into `amp` opens: no envelope on the VCA and no bias. */
const shutVoice = (over: Partial<EngineParams> = {}): EngineParams =>
  monoParams({
    osc: [{ level: 0.8, mix: { saw: 1 }, semi: 0 }],
    vca: { envSrc: 'none', bias: 0 },
    ...over,
  });

/** A 10 Hz square: +1 (VCA open) for the first 2400 samples of each 4800, −1 (shut) for the rest. */
const square = (common?: boolean, keySync = false): Lfo2Params & { keySync: boolean } => ({
  rate: 10,
  mix: { sq: 1 },
  keySync,
  ...(common == null ? {} : { common }),
});

describe('third LFO (lfo3)', () => {
  it('moves a destination through signal lfo3', () => {
    const p = shutVoice({ lfo3: square(), routes: [{ src: 'lfo3', dst: 'amp', amt: 1 }] });
    const r = render(p, { len: 4800 });
    expect(rms(r.out, 200, 2200)).toBeGreaterThan(0.02);
    expect(rms(r.out, 2700, 4700)).toBeLessThan(1e-3);
    // without it the signal is 0 and the VCA stays shut
    const without = render({ ...p, lfo3: undefined }, { len: 4800 });
    expect(rms(without.out, 200, 2200)).toBeLessThan(1e-4);
  });

  it('is brought in by the mod wheel through a route scaled by it', () => {
    const p = shutVoice({
      lfo3: square(),
      routes: [{ src: 'lfo3', dst: 'amp', amt: 1, by: 'wheel' }],
    });
    expect(rms(render({ ...p, wheel: 0 }, { len: 4800 }).out, 200, 2200)).toBeLessThan(1e-4);
    expect(rms(render({ ...p, wheel: 1 }, { len: 4800 }).out, 200, 2200)).toBeGreaterThan(0.02);
  });
});

describe('LFOs shared by every voice (common)', () => {
  /**
   * A poly synth whose VCAs only the chosen LFO's square opens. Its `keySync` restarts each voice's square on its note,
   * so without `common` the second voice is open while the first is shut, whatever phases the voices were given.
   */
  function poly(which: 'lfo' | 'lfo2' | 'lfo3', common?: boolean): EngineParams {
    const base = shutVoice({ poly: { voices: 4, stack: 1, mono: false } });
    const routes = [{ src: which, dst: 'amp', amt: 1 }];
    // the main LFO is always there: it stays a slow sine on nothing when another LFO is under test
    if (which === 'lfo') return { ...base, lfo: square(common, true), routes };
    return { ...base, [which]: square(common, true), routes };
  }
  // the second key arrives in the shut half of the first one's cycle
  const keys: Timed[] = [
    [0, { type: 'noteOn', n: 60 }],
    [3000, { type: 'noteOn', n: 67 }],
  ];

  it.each(['lfo', 'lfo2', 'lfo3'] as const)(
    '%s: a voice that starts later follows the phase of the one already playing',
    (which) => {
      const shared = render(poly(which, true), { len: 9600, events: keys });
      // both shut together, then both open together: `keySync` is ignored on a common LFO
      expect(rms(shared.out, 3100, 4700)).toBeLessThan(1e-3);
      expect(rms(shared.out, 5000, 7000)).toBeGreaterThan(0.02);
      // without `common` each voice runs its own phase, so the later one is open while the first is shut
      const free = render(poly(which), { len: 9600, events: keys });
      expect(rms(free.out, 3100, 4700)).toBeGreaterThan(0.01);
    }
  );

  it('gives a voice that starts mid-cycle the sample and hold the playing one holds', () => {
    // the held value is negative on the first cycle, so the route is inverted to open the VCA with it
    const p = shutVoice({
      poly: { voices: 4, stack: 1, mono: false },
      lfo3: { rate: 10, mix: { sh: 1 }, keySync: false, common: true },
      routes: [{ src: 'lfo3', dst: 'amp', amt: -1 }],
    });
    const one = render(p, { len: 4800, events: keys.slice(0, 1) });
    const two = render(p, { len: 4800, events: keys });
    // the second voice sounds at once, before the cycle ends, rather than holding nothing until it does
    expect(rms(one.out, 3100, 4700)).toBeGreaterThan(0.02);
    expect(rms(two.out, 3100, 4700)).toBeGreaterThan(1.2 * rms(one.out, 3100, 4700));
  });
});
