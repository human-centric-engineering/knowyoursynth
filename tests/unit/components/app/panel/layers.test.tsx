// @vitest-environment happy-dom

/**
 * The layers over the faceplate: the Areas view, the search spotlight, the
 * magnifier and the sound-map layers (dimming, sensitivity, "why is it dark?").
 *
 * @see components/app/panel/layers.tsx
 */

import { describe, it, expect, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  AreaLayer,
  DimLayer,
  DoorRings,
  HeatLayer,
  HeatRanks,
  Lens,
  Locator,
  heatColor,
} from '@/components/app/panel/layers';
import {
  MAP_OFF,
  findStore,
  focusStore,
  highlightStore,
  lensStore,
  mapStore,
} from '@/components/app/synth/stores';
import type { SoundMap } from '@/components/app/synth/stores';
import { WHEEL } from '@/lib/app/synths/lib/soundmap';
import { allPartsDef as def } from '@/tests/fixtures/synths/all-parts';
import { modelD } from '@/tests/fixtures/synths/model-d';
import type { PatchCable } from '@/lib/app/synths/contract';

afterEach(() => {
  focusStore.set(null);
  findStore.set(null);
  lensStore.set(null);
  highlightStore.set([]);
  mapStore.set(MAP_OFF);
});

const inSvg = (node: ReactNode) => render(<svg>{node}</svg>);
const setMap = (m: Partial<SoundMap>) =>
  act(() => mapStore.set({ ...MAP_OFF, status: 'ready', ...m }));

describe('AreaLayer', () => {
  it('tints every area, and lights the one in focus while the rest dims', () => {
    const { container } = inSvg(<AreaLayer def={def} />);
    const left = screen.getByRole('button', { name: 'Left: The left half.' });
    expect(left.getAttribute('fill-opacity')).toBe('0.2');
    // The two-rect area has square corners and one tab stop.
    expect(screen.getAllByRole('button')).toHaveLength(2);

    fireEvent.pointerEnter(left, { pointerType: 'mouse', clientX: 10, clientY: 20 });
    expect(focusStore.get()).toEqual({ kind: 'area', id: 'left', x: 10, y: 20, tip: true });
    expect(left.getAttribute('fill-opacity')).toBe('0.12');
    expect(container.querySelector('mask#kysAreaEdge')).not.toBeNull();
    expect(container.querySelector('path[fill="#05060a"]')).not.toBeNull();

    fireEvent.pointerMove(left, { pointerType: 'mouse', clientX: 11, clientY: 21 });
    expect(focusStore.get()).toMatchObject({ x: 11 });
    fireEvent.pointerMove(left, { pointerType: 'touch', clientX: 99, clientY: 21 });
    expect(focusStore.get()).toMatchObject({ x: 11 });
    fireEvent.pointerLeave(left);
    expect(focusStore.get()).toMatchObject({ id: 'left', tip: false });
  });

  it('keeps a pressed area up after the pointer leaves', () => {
    inSvg(<AreaLayer def={def} />);
    const right = screen.getByRole('button', { name: 'Right: The right half.' });
    fireEvent.click(right, { clientX: 5, clientY: 6 });
    expect(focusStore.get()).toMatchObject({ id: 'right', sticky: true });
    fireEvent.pointerLeave(right);
    expect(focusStore.get()).toMatchObject({ id: 'right', tip: true });
  });

  it('places the card under the area when it is reached from the keyboard', () => {
    inSvg(<AreaLayer def={def} />);
    fireEvent.focus(screen.getByRole('button', { name: 'Left: The left half.' }));
    expect(focusStore.get()).toMatchObject({ kind: 'area', id: 'left', tip: true });
  });
});

describe('Locator', () => {
  it('draws nothing with nothing to find, or when the thing found is unknown', () => {
    const { container } = inSvg(<Locator def={def} />);
    expect(container.querySelector('path')).toBeNull();
    act(() => findStore.set({ kind: 'control', id: 'nope' }));
    expect(container.querySelector('path')).toBeNull();
    act(() => findStore.set({ kind: 'areas', ids: ['nope'] }));
    expect(container.querySelector('path')).toBeNull();
  });

  it('spotlights one area, or several at once', () => {
    const { container } = inSvg(<Locator def={def} />);
    act(() => findStore.set({ kind: 'area', id: 'left' }));
    expect(container.querySelector('mask#kysFindEdge')).not.toBeNull();
    act(() => findStore.set({ kind: 'areas', ids: ['left', 'right'] }));
    const box = container.querySelector('rect[fill="none"]');
    expect(box?.getAttribute('width')).toBe('1600');
  });

  it.each([
    ['jack', 'j.in', 40],
    ['control', 'knob.d-silver', 58.5],
    ['control', 'fader.v', 62],
    ['control', 'menu.cont', 116],
    ['control', 'select.mode', 54],
    ['control', 'joy.x', 55],
    ['control', 'rocker.h', 55],
    ['control', 'toggle.2', 40],
  ] as const)('rings a %s (%s) at the size it needs', (kind, id, r) => {
    const { container } = inSvg(<Locator def={def} />);
    act(() => findStore.set({ kind, id }));
    const ring = container.querySelector('circle.kys-pulse');
    expect(Number(ring?.getAttribute('r'))).toBeCloseTo(r);
  });
});

describe('Lens', () => {
  it('draws a magnified copy of the panel at the pointer', () => {
    const { container } = inSvg(<Lens view={def.view} zoom={2} source="kysPanelAll" />);
    expect(container.querySelector('use')).toBeNull();
    act(() => lensStore.set({ x: 100, y: 50 }));
    expect(container.querySelector('use')?.getAttribute('transform')).toBe(
      'translate(100 50) scale(2) translate(-100 -50)'
    );
  });
});

describe('DimLayer', () => {
  const cables: PatchCable[] = [{ from: 'j.out', to: 'j.in', color: '#fff' }];

  it('draws nothing until the sound map is ready', () => {
    const { container } = inSvg(
      <DimLayer def={def} cables={cables} values={def.init} outline={false} />
    );
    expect(container.querySelector('path')).toBeNull();
  });

  it('washes unused parts, stripes the ones at zero, and never dims what a lesson points at', () => {
    setMap({
      state: { 'select.mode': 'on', 'knob.vcs3': 'zero', 'j.out>j.in': 'on' },
    });
    act(() => highlightStore.set(['toggle.2']));
    const { container } = inSvg(
      <DimLayer def={def} cables={cables} values={def.init} outline={false} />
    );
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(3);
    expect(paths[2].getAttribute('fill')).toBe('url(#kysStripes)');
  });

  it('fades towards the paper on the outline', () => {
    setMap({ state: {} });
    const { container } = inSvg(<DimLayer def={def} cables={[]} values={def.init} outline />);
    expect(container.querySelector('path')?.getAttribute('fill')).toBe('#eef0ec');
    // Nothing at zero: no stripes.
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});

describe('heat', () => {
  it('heatColor runs yellow to red, and amber to white on a red faceplate', () => {
    expect(heatColor(0, modelD, false)).toBe('rgb(255 214 92)');
    expect(heatColor(1, modelD, false)).toBe('rgb(255 56 40)');
    expect(heatColor(1, def, false)).toBe('rgb(255 255 255)');
    expect(heatColor(1, def, true)).toBe('rgb(255 56 40)');
  });

  it('glows behind sensitive knobs, sliders and switches', () => {
    const { container } = inSvg(<HeatLayer def={def} values={def.init} outline={false} />);
    expect(container.querySelector('g')).toBeNull();
    setMap({
      heat: {
        'knob.d-silver': 1,
        'fader.v': 0.5,
        'fader.h': 0.2,
        'toggle.2': 0.3,
        'menu.hidden': 1,
      },
    });
    expect(container.querySelectorAll('radialGradient')).toHaveLength(2);
    expect(container.querySelectorAll('linearGradient')).toHaveLength(2);
  });

  it('numbers the three most sensitive shown controls', () => {
    const { container } = inSvg(<HeatRanks def={def} values={def.init} outline={false} />);
    expect(container.querySelector('text')).toBeNull();
    setMap({
      heat: { 'knob.d-silver': 1, 'fader.v': 0.5, 'button.plain': 0.4, 'menu.hidden': 0.3 },
      ranked: ['knob.d-silver', 'menu.hidden', 'fader.v', 'button.plain'],
    });
    // The hidden menu row is skipped, and only the first three ranks are considered.
    expect([...container.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['1', '3']);
  });
});

describe('DoorRings', () => {
  const focusOn = (id: string) =>
    act(() => focusStore.set({ kind: 'control', id, x: 0, y: 0, tip: false }));

  it('draws nothing unless the control in focus is dark', () => {
    setMap({ state: { 'knob.pro1': 'on' } });
    const { container } = inSvg(<DoorRings def={def} values={def.init} />);
    focusOn('knob.pro1');
    expect(container.querySelector('circle')).toBeNull();
  });

  it('rings a dark control and every control that would bring it in, saying what to do', () => {
    setMap({
      state: { 'knob.pro1': 'dead' },
      why: {
        'knob.pro1': [
          [{ id: 'knob.d-silver', v: 9 }, { id: WHEEL }, { id: 'slide.h', v: true }],
          [
            { id: 'knob.d-silver', v: 1 },
            { id: 'select.mode', v: 'two' },
            { id: 'rocker.h', v: false },
            { id: 'fader.v', v: 0 },
            { id: 'gone', v: 1 },
          ],
        ],
      },
    });
    const { container } = inSvg(<DoorRings def={def} values={def.init} />);
    focusOn('knob.pro1');
    const tags = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(tags).toEqual([
      'TURN UP',
      'SWITCH ON',
      'OR SET TO TWO',
      'OR SWITCH OFF',
      'OR MOVE DOWN',
    ]);
    // Far-off doors get a line back to the dark control; the neighbour does not.
    expect(container.querySelectorAll('line').length).toBeGreaterThan(0);
  });

  it('flips a tag above a door near the bottom edge', () => {
    setMap({
      state: { 'knob.pro1': 'dead' },
      why: { 'knob.pro1': [[{ id: 'button.plain', v: true }]] },
    });
    const tall = { ...def, view: { w: def.view.w, h: 360 } };
    const { container } = inSvg(<DoorRings def={tall} values={def.init} />);
    focusOn('knob.pro1');
    const tag = container.querySelector('rect[rx="14"]');
    expect(Number(tag?.getAttribute('y'))).toBeLessThan(330);
  });
});
