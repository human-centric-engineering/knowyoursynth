/**
 * The 900-series engine's reading per module (`meters()`), which the routing view lights each 921, 911 and 902 from:
 * two of a kind set differently must read differently, and a slot the patch does not use reads nothing.
 *
 * The engine core runs on its own here, with nothing patched between the modules: every input reads 0 V, and an
 * envelope's S-trigger is held on by marking its input cabled (an S-trigger is on while held low).
 *
 * @see lib/app/synths/audio/moog-core.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MoogParams } from '@/lib/app/synths/contract';
import { createMoog, MOOG_DESTS, MOOG_SIGNALS } from '@/lib/app/synths/audio/moog-core';

const SR = 48000;

/** A bare engine core: every destination reads 0 V; `held` marks those destinations cabled. */
function core(held: string[] = []) {
  const SI = Object.fromEntries(MOOG_SIGNALS.map((n, i) => [n, i]));
  const DI = Object.fromEntries(MOOG_DESTS.map((n, i) => [n, i]));
  const S = new Float64Array(MOOG_SIGNALS.length);
  const cabled = new Uint8Array(MOOG_DESTS.length);
  for (const d of held) cabled[DI[d]] = 1;
  return createMoog(SR, S, SI, DI, () => 0, cabled);
}

const run = (m: ReturnType<typeof core>, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * SR); i++) m.step(60, true);
};

afterEach(() => vi.restoreAllMocks());

describe('the 900-series engine’s reading per module', () => {
  it('reports each oscillator’s own wave and pitch: two at different rates read differently', () => {
    // Both start their cycle at 0, so only the rate tells them apart.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const m = core();
    // 0 V in: middle C, then 8 and 7 octaves down (about 1 Hz and 2 Hz, a 921B at LO).
    const params: MoogParams = {
      vco: [
        { kind: 'b', semi: -96, sync: 'off' },
        { kind: 'b', semi: -84, sync: 'off' },
      ],
    };
    m.set(params, new Set(['v1sin', 'v2sin']));
    run(m, 0.125);
    const r = m.meters();
    const hz = 261.6256 / 256;
    expect(r.vcoHz[0]).toBeCloseTo(hz, 3);
    expect(r.vcoHz[1]).toBeCloseTo(hz * 2, 3);
    // An eighth of a second in: a slow wave an eighth of its cycle on, a twice-as-fast one a quarter.
    expect(r.vco[0]).toBeCloseTo(Math.sin(2 * Math.PI * hz * 0.125), 2);
    expect(r.vco[1]).toBeCloseTo(Math.sin(2 * Math.PI * hz * 2 * 0.125), 2);
    expect(Math.abs(r.vco[1] - r.vco[0])).toBeGreaterThan(0.2);
  });

  it('reports each envelope’s own level: a fast contour at its peak while a slow one is still rising', () => {
    const m = core(['e1st', 'e2st']);
    m.set(
      {
        vco: [],
        env: [
          { t1: 0.005, t2: 5, t3: 1, sus: 6 },
          { t1: 2, t2: 5, t3: 1, sus: 6 },
        ],
      },
      new Set(['e1', 'e2'])
    );
    run(m, 0.05);
    const r = m.meters();
    expect(r.env[0]).toBeCloseTo(1, 2);
    expect(r.env[1]).toBeGreaterThan(0);
    expect(r.env[1]).toBeLessThan(0.3);
    // The same reading as the panel lamps, on a 0..1 scale of the +6 V peak.
    expect(r.env[1]).toBeCloseTo(m.envLevel(1) / 6, 6);
  });

  it('reports each amplifier’s gain, 6 V being unity', () => {
    const m = core();
    m.set(
      {
        vco: [],
        vca: [
          { v: 3, exp: false },
          { v: 6, exp: false },
        ],
      },
      new Set(['a1p', 'a2p'])
    );
    run(m, 0.05);
    const r = m.meters();
    expect(r.amp[0]).toBeCloseTo(0.5, 3);
    expect(r.amp[1]).toBeCloseTo(1, 3);
  });

  it('reads nothing from a slot the patch does not use, and has one place per slot', () => {
    const m = core(['e1st', 'e2st']);
    m.set(
      {
        vco: [{ kind: 'b', semi: 0, sync: 'off' }],
        env: [
          { t1: 0.005, t2: 5, t3: 1, sus: 6 },
          { t1: 0.005, t2: 5, t3: 1, sus: 6 },
        ],
      },
      // Only envelope 2 is read by a cable; oscillator 1 and envelope 1 are set but unpatched.
      new Set(['e2'])
    );
    run(m, 0.05);
    const r = m.meters();
    expect(r.env[1]).toBeGreaterThan(0.9);
    expect(r.env[0]).toBe(0);
    expect(r.vco[0]).toBe(0);
    expect(r.vcoHz[0]).toBe(0);
    expect([r.vco.length, r.env.length, r.amp.length]).toEqual([7, 4, 5]);
  });
});
