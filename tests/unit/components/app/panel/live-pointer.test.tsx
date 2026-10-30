// @vitest-environment happy-dom

/**
 * The live pointer on Model D's CUTOFF FREQUENCY knob (`f-live-panel` t-154): under the knob's own pointer, and not
 * drawn, while nothing moves the cutoff; round from it, and drawn, while something does; eased between meters, or
 * straight to each one for a visitor who asks for less motion.
 *
 * The frames are driven by hand (a fake `requestAnimationFrame`), and the engine's meters are set on `meterStore`.
 *
 * @see components/app/panel/live-pointer.tsx
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { LivePointers, pointerAt } from '@/components/app/panel/live-pointer';
import { meterStore } from '@/components/app/synth/stores';
import modelD from '@/lib/app/synths/defs/model-d';
import neutron from '@/lib/app/synths/defs/neutron';
import type { ControlValues, SynthDef } from '@/lib/app/synths/contract';

let frames: FrameRequestCallback[] = [];
let now = 0;

function run(n: number) {
  for (let i = 0; i < n; i++) {
    now += 16;
    const due = frames;
    frames = [];
    act(() => due.forEach((f) => f(now)));
  }
}

/** The knob is at 1 of −5..5: three fifths of its travel. */
const values: ControlValues = { ...modelD.init, 'filter.cutoff': 1 };
const knobHz = modelD.toEngine(values, { wheel: 0, patched: {} }).filter.cutoff;

function draw(def: SynthDef = modelD, v: ControlValues = values) {
  return render(
    <svg>
      <LivePointers def={def} cables={[]} values={v} />
    </svg>
  );
}

function pointer(container: HTMLElement, param = 'cutoff') {
  const el = container.querySelector<SVGGElement>(`[data-pointer="${param}"]`);
  if (!el) throw new Error(`no ${param} pointer`);
  return {
    angle: Number(/rotate\((-?[\d.]+)/.exec(el.getAttribute('transform') ?? '')?.[1]),
    shown: el.style.opacity === '1',
  };
}

const playing = (cutoff: number | undefined) =>
  meterStore.set({ power: true, gate: true, lfo: 0, overload: 0, cutoff });

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

describe('LivePointers', () => {
  const own = -150 + 300 * 0.6;

  it('sits under the knob’s own pointer, not drawn, while the engine runs the cutoff the knob sets', () => {
    const { container } = draw();
    playing(knobHz);
    run(20);
    const p = pointer(container);
    expect(p.angle).toBeCloseTo(own, 1);
    expect(p.shown).toBe(false);
  });

  it('moves round from it, and is drawn, while something sweeps the cutoff', () => {
    const { container } = draw();
    playing(knobHz * 4);
    run(20);
    const up = pointer(container);
    // Two octaves up is about two units of the knob's ten: some sixty degrees round.
    expect(up.angle).toBeGreaterThan(own + 45);
    expect(up.shown).toBe(true);
    // And back under the knob as the sweep ends.
    playing(knobHz);
    run(20);
    expect(pointer(container).angle).toBeCloseTo(own, 1);
    expect(pointer(container).shown).toBe(false);
  });

  it('rests under the knob, not drawn, with the power off or no cutoff reported', () => {
    const { container } = draw();
    meterStore.set({ power: false, gate: false, lfo: 0, overload: 0, cutoff: knobHz * 4 });
    run(5);
    expect(pointer(container)).toEqual({ angle: expect.closeTo(own, 1), shown: false });
    playing(undefined);
    run(5);
    expect(pointer(container)).toEqual({ angle: expect.closeTo(own, 1), shown: false });
  });

  it('eases towards a new value, but goes straight to it for a visitor who asks for less motion', () => {
    const eased = draw();
    playing(knobHz * 4);
    run(1);
    const first = pointer(eased.container).angle;
    run(30);
    const settled = pointer(eased.container).angle;
    expect(first).toBeGreaterThan(own);
    expect(first).toBeLessThan(settled - 1);
    eased.unmount();

    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    const steady = draw();
    run(1);
    expect(pointer(steady.container).angle).toBeCloseTo(settled, 1);
  });

  it('draws no VCA pointer on the Model D, whose VCA has no knob, and one on the Neutron’s', () => {
    expect(draw().container.querySelector('[data-pointer="amp"]')).toBeNull();
    const n = draw(neutron, neutron.init).container;
    expect(n.querySelector('[data-pointer="amp"]')?.getAttribute('data-control')).toBe('vca.bias');
  });
});

describe('pointerAt', () => {
  it('turns about a knob’s centre, and runs along a fader’s slot, upside down where its maximum is at the bottom', () => {
    const knob = modelD.controls.find((c) => c.id === 'filter.cutoff');
    if (knob?.type !== 'knob' || knob.kind !== 'cont') throw new Error('no knob');
    expect(pointerAt(knob, 0.5)).toBe(`rotate(0.00 ${knob.x} ${knob.y})`);
    const fader = { ...knob, type: 'fader', len: 100, orient: 'v', x: 0, y: 0 } as const;
    expect(pointerAt(fader, 1)).toBe('translate(26 -50.00)');
    expect(pointerAt({ ...fader, maxAt: 'bottom' }, 1)).toBe('translate(26 50.00)');
    expect(pointerAt({ ...fader, orient: 'h' }, 1)).toBe('translate(50.00 -20)');
  });
});
