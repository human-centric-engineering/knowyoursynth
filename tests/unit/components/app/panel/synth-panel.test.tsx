// @vitest-environment happy-dom

/**
 * The faceplate renderer, drawn from Model D.
 *
 * - Model D's panel in the hardware and outline views (snapshots), and the
 *   modular case a `layout` puts in place of the long faceplate.
 * - `design` (D11) has no effect yet.
 * - Patching: press an output then an input to connect, the explanation is
 *   focused, Escape and a second press cancel, a cable press removes it.
 * - Dragging a plug onto another jack moves the cable.
 *
 * @see components/app/panel/synth-panel.tsx
 */

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SynthPanel } from '@/components/app/panel/synth-panel';
import type { SynthPanelProps } from '@/components/app/panel/synth-panel';
import {
  MAP_OFF,
  findStore,
  focusStore,
  lensStore,
  mapStore,
  pendingStore,
} from '@/components/app/synth/stores';
import { modularDef } from '@/lib/app/synths/lib/layout';
import { modelD } from '@/tests/fixtures/synths/model-d';
import type { PatchCable, SynthDef } from '@/lib/app/synths/contract';

/** Screen = view units, so a pointer position is a panel position. */
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

beforeAll(() => {
  // happy-dom has no SVG geometry or pointer capture; the panel only needs the identity.
  Object.assign(SVGElement.prototype, {
    getScreenCTM: () => ({ ...IDENTITY, inverse: () => IDENTITY }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
  if (typeof globalThis.DOMPoint === 'undefined' || !('matrixTransform' in DOMPoint.prototype)) {
    class Point {
      constructor(
        public x = 0,
        public y = 0
      ) {}
      matrixTransform() {
        return this;
      }
    }
    Object.assign(globalThis, { DOMPoint: Point });
  }
});

afterEach(() => {
  focusStore.set(null);
  findStore.set(null);
  lensStore.set(null);
  mapStore.set(MAP_OFF);
});

function props(over: Partial<SynthPanelProps> = {}): SynthPanelProps {
  return {
    def: modelD,
    values: modelD.init,
    cables: [],
    onChange: vi.fn(),
    onConnect: vi.fn(),
    onRemoveCable: vi.fn(),
    ...over,
  };
}

const jack = (label: string, dir: 'input' | 'output') =>
  screen.getByRole('button', { name: `${label} ${dir} jack` });

describe('Model D panel views', () => {
  it('draws the hardware view', () => {
    const { container } = render(<SynthPanel {...props()} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Behringer Model D front panel');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 2000 716');
    // Every control and jack has its hit area.
    expect(screen.getAllByRole('slider')).toHaveLength(
      modelD.controls.filter((c) => c.type === 'knob').length
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('draws the outline view on paper', () => {
    const { container } = render(<SynthPanel {...props({ outline: true })} />);
    expect(container.querySelector('rect[fill="#f3f4ef"]')).not.toBeNull();
    // The wood cheeks are dashed outlines, not wood.
    expect(container.querySelector('rect[fill="url(#kysWood)"]')).toBeNull();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('the two views differ', () => {
    const hw = render(<SynthPanel {...props()} />).container.innerHTML;
    const paper = render(<SynthPanel {...props({ outline: true })} />).container.innerHTML;
    expect(hw).not.toBe(paper);
  });

  it('draws the long faceplate when the definition has no layout', () => {
    // Model D has no `modular` spec, so its modular form is itself: the long view.
    expect(modularDef(modelD)).toBe(modelD);
    const { container } = render(<SynthPanel {...props()} />);
    expect(container.querySelector('rect[fill="url(#kysFace)"]')).not.toBeNull();
    expect(container.querySelector('rect[fill="url(#kysWood)"]')).not.toBeNull();
  });

  it('draws the modular case, in both views, when the definition has a layout', () => {
    const cut: SynthDef = {
      ...modelD,
      modular: {
        brand: 'MODEL D CASE',
        rows: [[{ cut: [0, 0, 1000, 716] }], [{ cut: [1000, 0, 2000, 716] }]],
      },
    };
    const def = modularDef(cut);
    expect(def.layout?.plates).toHaveLength(2);
    const hw = render(<SynthPanel {...props({ def })} />).container;
    // The case replaces the faceplate and its cheeks, and prints the brand on each plate.
    expect(hw.querySelector('rect[fill="url(#kysWood)"]')).toBeNull();
    expect(hw.querySelectorAll('rect[fill="url(#kysMetal)"]').length).toBeGreaterThan(0);
    expect(hw.textContent).toContain('MODEL D CASE');
    const paper = render(<SynthPanel {...props({ def, outline: true })} />).container;
    expect(paper.querySelectorAll('rect[stroke-width="2.5"]')).toHaveLength(2);
  });
});

describe('design prop (D11)', () => {
  it('has no effect yet: faithful, neutral and the default render the same markup', () => {
    const plain = render(<SynthPanel {...props()} />).container.innerHTML;
    const faithful = render(<SynthPanel {...props({ design: 'faithful' })} />).container.innerHTML;
    const neutral = render(<SynthPanel {...props({ design: 'neutral' })} />).container.innerHTML;
    expect(faithful).toBe(plain);
    expect(neutral).toBe(faithful);
  });

  it('has no effect on the outline view either', () => {
    const faithful = render(<SynthPanel {...props({ outline: true, design: 'faithful' })} />)
      .container.innerHTML;
    const neutral = render(<SynthPanel {...props({ outline: true, design: 'neutral' })} />)
      .container.innerHTML;
    expect(neutral).toBe(faithful);
  });
});

describe('patching', () => {
  it('connects an output to an input, whichever is pressed first, and explains the new cable', () => {
    const onConnect = vi.fn();
    render(<SynthPanel {...props({ onConnect })} />);

    fireEvent.click(jack('CUT CV', 'input'), { clientX: 10, clientY: 20 });
    expect(pendingStore.get()).toBe('j.cutCv');
    fireEvent.click(jack('FILT CONT', 'output'), { clientX: 30, clientY: 40 });

    expect(onConnect).toHaveBeenCalledWith('j.filtCont', 'j.cutCv');
    expect(pendingStore.get()).toBeNull();
    expect(focusStore.get()).toMatchObject({
      kind: 'cable',
      id: 'j.filtCont>j.cutCv',
      at: 'j.filtCont',
      x: 30,
      y: 40,
      sticky: true,
    });
  });

  it('places the explanation by the jack when it was chosen from the keyboard', () => {
    render(<SynthPanel {...props()} />);
    fireEvent.keyDown(jack('MIX', 'output'), { key: 'Enter' });
    fireEvent.keyDown(jack('EXT', 'input'), { key: ' ' });
    expect(focusStore.get()).toMatchObject({ kind: 'cable', id: 'j.mix>j.ext', tip: true });
  });

  it('starts again from a jack of the same direction, and cancels on a second press', () => {
    const onConnect = vi.fn();
    render(<SynthPanel {...props({ onConnect })} />);

    fireEvent.click(jack('MIX', 'output'));
    fireEvent.click(jack('MAIN', 'output'));
    expect(pendingStore.get()).toBe('j.main');

    fireEvent.click(jack('MAIN', 'output'));
    expect(pendingStore.get()).toBeNull();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('drops a held cable on Escape, on a press elsewhere and when the mouse leaves', () => {
    const { container } = render(<SynthPanel {...props()} />);
    const svg = container.querySelector('svg') as SVGSVGElement;

    fireEvent.click(jack('MIX', 'output'));
    // The pointer draws a loose cable from the held jack.
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 300 });
    expect(container.querySelectorAll('path[stroke="#ffffff"]').length).toBeGreaterThan(0);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(pendingStore.get()).toBeNull();

    fireEvent.click(jack('MIX', 'output'));
    fireEvent.click(svg);
    expect(pendingStore.get()).toBeNull();

    fireEvent.click(jack('MIX', 'output'));
    fireEvent.pointerLeave(svg, { pointerType: 'touch' });
    expect(pendingStore.get()).toBe('j.mix');
    fireEvent.pointerLeave(svg, { pointerType: 'mouse' });
    expect(pendingStore.get()).toBeNull();
  });

  it('clears the search spotlight on a press', () => {
    const { container } = render(<SynthPanel {...props()} />);
    act(() => findStore.set({ kind: 'control', id: 'filter.cutoff' }));
    fireEvent.pointerDown(container.querySelector('svg') as SVGSVGElement);
    expect(findStore.get()).toBeNull();
  });
});

describe('cables', () => {
  const cables: PatchCable[] = [
    { from: 'j.filtCont', to: 'j.cutCv', color: '#ffb020' },
    { from: 'j.mix', to: 'nowhere', color: '#38c6ff' },
  ];

  it('draws a cable between its jacks, and skips one whose jack is unknown', () => {
    const { container } = render(<SynthPanel {...props({ cables })} />);
    expect(container.querySelectorAll('path[stroke="#ffb020"]')).toHaveLength(1);
    expect(container.querySelectorAll('path[stroke="#38c6ff"]')).toHaveLength(0);
  });

  it('explains a cable under the mouse, and lets go of it when the mouse leaves', () => {
    const { container } = render(<SynthPanel {...props({ cables })} />);
    const cable = container.querySelector('path[stroke="#ffb020"]')?.parentElement as Element;
    fireEvent.pointerEnter(cable, { pointerType: 'mouse', clientX: 5, clientY: 6 });
    expect(focusStore.get()).toMatchObject({ kind: 'cable', id: 'j.filtCont>j.cutCv', tip: true });
    fireEvent.pointerMove(cable, { pointerType: 'mouse', clientX: 7, clientY: 8 });
    expect(focusStore.get()).toMatchObject({ x: 7, y: 8 });
    fireEvent.pointerLeave(cable);
    expect(focusStore.get()).toMatchObject({ tip: false });
    // The focused cable is drawn lit.
    expect(container.querySelector('path[stroke-opacity="0.85"]')).not.toBeNull();
  });

  it('removes a cable when it is pressed', () => {
    const onRemoveCable = vi.fn();
    const { container } = render(<SynthPanel {...props({ cables, onRemoveCable })} />);
    act(() =>
      focusStore.set({
        kind: 'cable',
        id: 'j.filtCont>j.cutCv',
        from: 'j.filtCont',
        to: 'j.cutCv',
        x: 0,
        y: 0,
        tip: true,
      })
    );
    fireEvent.click(container.querySelector('path[stroke="#ffb020"]') as Element);
    expect(onRemoveCable).toHaveBeenCalledWith(0);
    expect(focusStore.get()).toBeNull();
  });

  it('fades a cable the sound map finds dead', () => {
    act(() =>
      mapStore.set({
        ...MAP_OFF,
        status: 'ready',
        state: { 'j.filtCont>j.cutCv': 'dead' },
      })
    );
    const { container } = render(<SynthPanel {...props({ cables, dimOn: true })} />);
    expect(container.querySelector('g[opacity="0.32"]')).not.toBeNull();
  });

  describe('dragging a plug', () => {
    const plugsOf = (container: HTMLElement) =>
      container.querySelectorAll<SVGGElement>('g[style*="grab"]');
    const filtCont = modelD.jacks.find((j) => j.id === 'j.filtCont');
    const loudCont = modelD.jacks.find((j) => j.id === 'j.loudCont');

    it('moves the cable to the output it is dropped on', () => {
      const onMoveCable = vi.fn();
      const onRemoveCable = vi.fn();
      const { container } = render(
        <SynthPanel {...props({ cables, onMoveCable, onRemoveCable })} />
      );
      const [fromPlug] = plugsOf(container);
      fireEvent.pointerDown(fromPlug, { clientX: filtCont?.x, clientY: filtCont?.y, pointerId: 1 });
      // A twitch under five pixels is not a drag.
      fireEvent.pointerMove(fromPlug, { clientX: (filtCont?.x ?? 0) + 2, clientY: filtCont?.y });
      fireEvent.pointerMove(fromPlug, { clientX: loudCont?.x, clientY: loudCont?.y });
      expect(focusStore.get()).toMatchObject({ id: 'j.loudCont>j.cutCv', prospect: true });
      expect(container.querySelector('circle.kys-pulse[stroke="#fff"]')).not.toBeNull();
      fireEvent.pointerUp(fromPlug, { clientX: loudCont?.x, clientY: loudCont?.y });

      expect(onMoveCable).toHaveBeenCalledWith(0, 'from', 'j.loudCont');
      expect(focusStore.get()).toMatchObject({ id: 'j.loudCont>j.cutCv', sticky: true });
      // The click that ends a drag does not unplug the cable.
      fireEvent.click(fromPlug);
      expect(onRemoveCable).not.toHaveBeenCalled();
    });

    it('puts the plug back when it is dropped away from a jack, and a plain press unplugs it', () => {
      const onMoveCable = vi.fn();
      const onRemoveCable = vi.fn();
      const { container } = render(
        <SynthPanel {...props({ cables, onMoveCable, onRemoveCable })} />
      );
      const [, toPlug] = plugsOf(container);
      fireEvent.pointerDown(toPlug, { clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(toPlug, { clientX: 1000, clientY: 5 });
      fireEvent.pointerCancel(toPlug);
      expect(onMoveCable).not.toHaveBeenCalled();

      fireEvent.pointerDown(toPlug, { clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerUp(toPlug);
      fireEvent.click(toPlug);
      expect(onRemoveCable).toHaveBeenCalledWith(0);
    });

    it('has no draggable plugs without onMoveCable', () => {
      const { container } = render(<SynthPanel {...props({ cables })} />);
      expect(plugsOf(container)).toHaveLength(0);
    });
  });
});

describe('controls', () => {
  it('turns a knob from the keyboard, clamped to its range', () => {
    const onChange = vi.fn();
    const values = { ...modelD.init, 'mix.osc1': 10 };
    render(<SynthPanel {...props({ values, onChange })} />);
    const knob = screen.getAllByRole('slider', { name: 'VOLUME' })[0];
    fireEvent.keyDown(knob, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('mix.osc1', 10);
    fireEvent.keyDown(knob, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('mix.osc1', 9.8);
  });

  it('flips a rocker when it is pressed', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    fireEvent.click(screen.getByRole('button', { name: 'A-440' }));
    expect(onChange).toHaveBeenCalledWith('out.a440', true);
  });

  it('marks where a lesson wants a control to go', () => {
    const plain = render(<SynthPanel {...props()} />).container;
    const target = { ...modelD.init, 'filter.cutoff': -4 };
    const marked = render(<SynthPanel {...props({ target })} />).container;
    expect(plain.querySelectorAll('path[fill="#f6a63a"]')).toHaveLength(0);
    expect(marked.querySelectorAll('path[fill="#f6a63a"]')).toHaveLength(1);
  });
});

describe('magnifier', () => {
  it('follows the pointer while zoomed, holds still during a mouse drag, and goes when zoom is off', () => {
    const { container, rerender } = render(<SynthPanel {...props({ zoom: 2 })} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 300, pointerType: 'mouse' });
    expect(lensStore.get()).toEqual({ x: 400, y: 300 });
    expect(container.querySelector('use[href="#kysPanelAll"]')).not.toBeNull();
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 300, pointerType: 'mouse', buttons: 1 });
    expect(lensStore.get()).toEqual({ x: 400, y: 300 });

    rerender(<SynthPanel {...props({ zoom: 0 })} />);
    expect(lensStore.get()).toBeNull();
  });
});
