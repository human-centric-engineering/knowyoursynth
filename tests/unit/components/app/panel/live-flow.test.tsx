// @vitest-environment happy-dom

/**
 * The live flow on Model D's panel (`f-live-panel` t-153, Signal ▾ Live + flow): a line for each route the patch
 * carries signal along, styled by its signal, glowing with what the engine says goes along it, its dashes running
 * frame by frame; standing still for a visitor who asks for less motion; and nothing at all in plain Live.
 *
 * The frames are driven by hand (a fake `requestAnimationFrame`), and the engine's meters are set on `meterStore`.
 *
 * @see components/app/panel/live-flow.tsx
 * @see components/app/panel/live-layer.tsx
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { LiveLayer, type LiveGlow } from '@/components/app/panel/live-layer';
import { RUN_PERIOD } from '@/components/app/panel/live-flow';
import { meterStore, type Meters } from '@/components/app/synth/stores';
import type { ControlValues } from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';
import vcs3 from '@/lib/app/synths/defs/ems-vcs3';
import { routingState } from '@/lib/app/synths/lib/routing';
import { routingActivity, SILENT } from '@/lib/app/synths/lib/routing-activity';
import { routing } from '@/lib/app/synths/routing/model-d';
import { routing as vcs3Routing } from '@/lib/app/synths/routing/ems-vcs3';

let frames: FrameRequestCallback[] = [];
let now = 0;

/** Runs `n` frames, 16 ms apart. */
function run(n: number) {
  for (let i = 0; i < n; i++) {
    now += 16;
    const due = frames;
    frames = [];
    act(() => due.forEach((f) => f(now)));
  }
}

function draw(flow: boolean, set: ControlValues = {}) {
  const values = { ...modelD.init, ...set };
  const live: LiveGlow = {
    routing,
    state: routingState(modelD, routing, { values, cables: [], wheel: 0 }),
    // An analyser reporting a steady 0.5 wave: the output at −6 dB, full.
    source: {
      analyser: { fftSize: 64, getFloatTimeDomainData: (a: Float32Array) => a.fill(0.5) },
    },
    flow,
  };
  return render(
    <svg>
      <LiveLayer def={modelD} live={live} cables={[]} values={values} />
    </svg>
  );
}

const lineOf = (c: HTMLElement, id: string) => {
  const el = c.querySelector<SVGGElement>(`[data-flow="${id}"]`);
  if (!el) throw new Error(`no line ${id}`);
  return el;
};
const glow = (el: Element) => Number((el as SVGGElement).style.getPropertyValue('--a') || 0);
const runOf = (c: HTMLElement) =>
  c.querySelector<SVGGElement>('.kys-flow')?.style.getPropertyValue('--run') ?? '';

const PLAYING: Meters = { power: true, gate: true, lfo: 0, overload: 0, env1: 1, env2: 0.6 };

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

describe('LiveLayer with the flow on Model D', () => {
  it('draws a line for each live route, styled by its signal, and none in plain Live', () => {
    const { container } = draw(true);
    expect(lineOf(container, 'mixer>filter:audio').getAttribute('class')).toContain('is-audio');
    expect(lineOf(container, 'loudness_contour>output:cv').getAttribute('class')).toContain(
      'is-cv'
    );
    // Each line has its path, the dashes that run along it, and its arrowhead.
    expect(lineOf(container, 'mixer>filter:audio').querySelectorAll('path')).toHaveLength(3);
    expect(draw(false).container.querySelector('[data-flow]')).toBeNull();
  });

  it('draws nothing for a route the patch has switched off', () => {
    const { container } = draw(true, { 'mix.osc1On': false, 'mix.osc2On': true, 'mix.osc2': 8 });
    expect(container.querySelector('[data-flow="osc2>mixer:audio"]')).not.toBeNull();
    expect(container.querySelector('[data-flow="osc1>mixer:audio"]')).toBeNull();
  });

  it('glows each line with what goes along it, dark with the power off', () => {
    const { container } = draw(true);
    run(30);
    const audio = lineOf(container, 'mixer>filter:audio');
    const contour = lineOf(container, 'loudness_contour>output:cv');
    expect(glow(audio)).toBe(0);
    meterStore.set(PLAYING);
    run(30);
    // The audio line follows the output's level; the contour's its envelope, held at 0.6.
    expect(glow(audio)).toBeCloseTo(1, 2);
    expect(glow(contour)).toBeCloseTo(0.6, 2);
  });

  it('runs its dashes along the lines, frame by frame', () => {
    meterStore.set(PLAYING);
    const { container } = draw(true);
    run(10);
    const first = Number(runOf(container));
    run(10);
    const later = Number(runOf(container));
    expect(first).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(first);
    // It wraps at one dash and its gap, so the dashes never jump.
    run(200);
    expect(Number(runOf(container))).toBeLessThan(RUN_PERIOD);
  });

  it('shows the lines without moving them for a visitor who asks for less motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    meterStore.set(PLAYING);
    const { container } = draw(true);
    run(30);
    expect(glow(lineOf(container, 'mixer>filter:audio'))).toBeCloseTo(1, 2);
    expect(runOf(container)).toBe('');
  });

  it('reads a pin matrix’s line from its pin, dark while nothing comes into the part it leaves', () => {
    const cables = [{ from: 'r.in1', to: 'c.out1' }];
    const live: LiveGlow = {
      routing: vcs3Routing,
      state: routingState(vcs3, vcs3Routing, { values: vcs3.init, cables, wheel: 0 }),
      source: {
        analyser: { fftSize: 64, getFloatTimeDomainData: (a: Float32Array) => a.fill(0.5) },
      },
      flow: true,
    };
    const { container } = render(
      <svg>
        <LiveLayer def={vcs3} live={live} cables={cables} values={vcs3.init} />
      </svg>
    );
    const line = lineOf(container, 'in_amp1>out_amp1:cv');
    // Its line stands for the pin: the routing has no edge between the two.
    expect(vcs3Routing.edges.some((e) => e.from === 'in_amp1' && e.to === 'out_amp1')).toBe(false);
    run(30);
    expect(glow(line)).toBe(0);
    meterStore.set(PLAYING);
    run(30);
    // The input amplifier has nothing coming in on the init panel: its pin carries nothing, and the line shows it.
    const a = routingActivity(vcs3Routing, live.state, { ...SILENT, gate: true, out: 1 });
    expect(a.blocks.in_amp1).toBe(0);
    expect(glow(line)).toBe(0);
  });
});
