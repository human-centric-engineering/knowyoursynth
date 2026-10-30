// @vitest-environment happy-dom

/**
 * The live glow on Model D's panel (`f-live-panel` t-150): each part lit over its controls with what the engine says
 * goes through it, frame by frame; dark with the power off or off the patch's path; and steady, not pulsing, for a
 * visitor who asks for less motion.
 *
 * The frames are driven by hand (a fake `requestAnimationFrame`), and the engine's meters are set on `meterStore`.
 *
 * @see components/app/panel/live-layer.tsx
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { LiveLayer, type LiveGlow } from '@/components/app/panel/live-layer';
import { meterStore, type Meters } from '@/components/app/synth/stores';
import type { ControlValues } from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';
import { routingState } from '@/lib/app/synths/lib/routing';
import { routing } from '@/lib/app/synths/routing/model-d';

let frames: FrameRequestCallback[] = [];
let now = 0;

/** Runs `n` frames, 16 ms apart. */
function run(n: number, each?: (i: number) => void) {
  for (let i = 0; i < n; i++) {
    each?.(i);
    now += 16;
    const due = frames;
    frames = [];
    act(() => due.forEach((f) => f(now)));
  }
}

/** An analyser that reports a steady wave of `amp`: the output's level. */
const source = (amp: number): LiveGlow['source'] => ({
  analyser: {
    fftSize: 64,
    getFloatTimeDomainData: (a: Float32Array) => a.fill(amp),
  },
});

function glowOf(container: HTMLElement, id: string): number {
  const el = container.querySelector<SVGPathElement>(`[data-live="${id}"]`);
  if (!el) throw new Error(`no glow for ${id}`);
  return Number(el.style.getPropertyValue('--a') || 0);
}

function draw(set: ControlValues = {}, amp = 0.5) {
  const values = { ...modelD.init, ...set };
  const live: LiveGlow = {
    routing,
    state: routingState(modelD, routing, { values, cables: [], wheel: 0 }),
    source: source(amp),
  };
  return render(
    <svg>
      <LiveLayer def={modelD} live={live} cables={[]} values={values} />
    </svg>
  );
}

const PLAYING: Meters = { power: true, gate: true, lfo: 0, overload: 0, env1: 1, env2: 1 };

beforeEach(() => {
  frames = [];
  now = 0;
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  meterStore.set({ gate: false, lfo: 0, overload: 0, power: false });
});

describe('LiveLayer on Model D', () => {
  it('lights the parts the note goes through, and leaves a part off the path dark', () => {
    meterStore.set(PLAYING);
    const { container } = draw();
    run(30);
    // The filter is on the audio path: it follows the output's level (a 0.5 wave is −6 dB, full).
    expect(glowOf(container, 'filter')).toBeCloseTo(1, 2);
    // Each contour follows its envelope, held at the top.
    expect(glowOf(container, 'loudness_contour')).toBeCloseTo(1, 2);
    // Oscillator 2 is switched out of the mixer at init: dark while the note plays.
    expect(glowOf(container, 'osc2')).toBe(0);
  });

  it('fades when the note ends, falling slower than it rose', () => {
    meterStore.set(PLAYING);
    const { container } = draw();
    run(30);
    meterStore.set({ ...PLAYING, gate: false, env1: 0, env2: 0 });
    run(5);
    const fading = glowOf(container, 'loudness_contour');
    expect(fading).toBeGreaterThan(0.5);
    expect(fading).toBeLessThan(1);
    run(200);
    expect(glowOf(container, 'loudness_contour')).toBe(0);
  });

  it('stays dark with the power off, whatever the meters last said', () => {
    meterStore.set({ ...PLAYING, power: false });
    const { container } = draw();
    run(30);
    for (const id of ['filter', 'osc1', 'loudness_contour'])
      expect(glowOf(container, id), id).toBe(0);
  });

  const LFO_ROUTED: ControlValues = {
    'mod.toFilter': true,
    'mod.depth': 5,
    'mod.mix': 10,
    'mod.srcB': 'lfo',
  };
  /** A slow LFO swinging from peak to trough every few frames, and what its glow was at each frame. */
  function swing(container: HTMLElement): number[] {
    const seen: number[] = [];
    run(60, (i) => {
      meterStore.set({ ...PLAYING, lfo: i % 10 < 5 ? 1 : -1, lfoHz: 1 });
      if (i > 0) seen.push(glowOf(container, 'lfo'));
    });
    return seen;
  }

  it('pulses a slow LFO with its wave', () => {
    const { container } = draw(LFO_ROUTED);
    const seen = swing(container);
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.5);
  });

  it('holds a slow LFO steady for a visitor who asks for less motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    const { container } = draw(LFO_ROUTED);
    const seen = swing(container).slice(30);
    expect(Math.max(...seen) - Math.min(...seen)).toBeLessThan(0.01);
    expect(seen[seen.length - 1]).toBeCloseTo(0.75, 2);
  });
});
