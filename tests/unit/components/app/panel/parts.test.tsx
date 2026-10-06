// @vitest-environment happy-dom

/**
 * The faceplate parts, drawn from a made-up synth with one of every part
 * (`tests/fixtures/synths/all-parts.ts`) so each drawing branch runs in both
 * views, and driven the way a player does: drag, keys, presses.
 *
 * @see components/app/panel/parts.tsx
 */

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SynthPanel } from '@/components/app/panel/synth-panel';
import type { SynthPanelProps } from '@/components/app/panel/synth-panel';
import { optionIndex, polar, valueAngle, wavePath } from '@/components/app/panel/parts';
import { focusStore, highlightStore, meterStore } from '@/components/app/synth/stores';
import { allPartsDef } from '@/tests/fixtures/synths/all-parts';
import type { ControlValues, PatchCable } from '@/lib/app/synths/contract';

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

beforeAll(() => {
  // happy-dom has no SVG geometry or pointer capture; the parts only need the identity.
  Object.assign(SVGElement.prototype, {
    getScreenCTM: () => ({ ...IDENTITY, inverse: () => IDENTITY }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => {
      throw new Error('already released');
    },
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
  highlightStore.set([]);
  meterStore.set({ gate: false, lfo: 0, overload: 0, power: false });
});

function props(over: Partial<SynthPanelProps> = {}): SynthPanelProps {
  return {
    def: allPartsDef,
    values: allPartsDef.init,
    cables: [],
    onChange: vi.fn(),
    onConnect: vi.fn(),
    onRemoveCable: vi.fn(),
    ...over,
  };
}

const with_ = (over: ControlValues) => ({ ...allPartsDef.init, ...over });

describe('every part draws in both views', () => {
  it.each([false, true])('outline=%s', (outline) => {
    const { container } = render(<SynthPanel {...props({ outline })} />);
    // Hardware-only artwork is left off the paper.
    expect(container.textContent?.includes('HW ONLY')).toBe(!outline);
    // The display prints the page title.
    expect(container.textContent).toContain('PAGE ONE');
    // The menu rows on page 1 are drawn, the one on page 2 is not.
    expect(screen.getByRole('slider', { name: 'DEPTH' })).toBeTruthy();
    expect(screen.queryByRole('slider', { name: 'HIDDEN' })).toBeNull();
    // The joystick's second axis is drawn by the first.
    expect(screen.getAllByRole('slider', { name: 'Joystick' })).toHaveLength(1);
    // Matrix jacks are its legends, not sockets.
    expect(screen.queryByRole('button', { name: 'ROW 1 output jack' })).toBeNull();
    expect(screen.getByRole('note', { name: 'Row one matrix row' })).toBeTruthy();
  });

  it('prints output names on plates (outPlates) and section names on tabs', () => {
    const { container } = render(<SynthPanel {...props()} />);
    expect(container.querySelector('rect[fill="#ffffff"][rx="3"]')).not.toBeNull();
    expect(container.querySelector('rect[stroke-width="1.6"][rx="4"]')).not.toBeNull();
  });

  it('draws the other theme options: black jacks, bezels, dotted rings, no cheeks', () => {
    const def = {
      ...allPartsDef,
      theme: {
        ...allPartsDef.theme,
        jack: 'black' as const,
        bezel: true,
        knobRing: 'dots' as const,
        button: 'black' as const,
        cheeks: 'none' as const,
        tabs: false,
        font: 'din' as const,
        weight: 600,
      },
    };
    const { container } = render(<SynthPanel {...props({ def })} />);
    expect(
      container.querySelector('rect[fill="url(#kysWood)"],rect[fill="url(#kysMetal)"]')
    ).toBeNull();
    expect(container.querySelectorAll('circle[fill="url(#kysBlack)"]').length).toBeGreaterThan(0);
  });

  it('page 2 shows its note and the menu row that lives there', () => {
    const { container } = render(<SynthPanel {...props({ values: with_({ page: 'p2' }) })} />);
    expect(container.textContent).toContain('PAGE TWO');
    expect(container.textContent).toContain('Nothing');
    expect(screen.getByRole('slider', { name: 'HIDDEN' })).toBeTruthy();
    expect(screen.queryByRole('slider', { name: 'DEPTH' })).toBeNull();
  });
});

describe('lamps', () => {
  const litCount = (container: HTMLElement) =>
    container.querySelectorAll('circle[fill="#fff"][opacity]').length;

  it('light from the meters and the panel values', () => {
    const { container } = render(<SynthPanel {...props()} />);
    const before = litCount(container);
    act(() =>
      meterStore.set({
        gate: true,
        lfo: 1,
        overload: 2,
        power: true,
        env1: 1,
        pulser: 1,
        seq: 0,
        voices: 1,
        oscs: 2,
      })
    );
    expect(litCount(container)).toBeGreaterThan(before);
  });

  it('draw ink dots on paper', () => {
    const { container } = render(<SynthPanel {...props({ outline: true })} />);
    expect(container.querySelectorAll('circle[fill="#1c2530"][opacity]').length).toBeGreaterThan(0);
  });
});

describe('knobs', () => {
  it('drag up to turn a continuous knob, Shift for fine moves', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    const knob = screen.getByRole('slider', { name: 'D-SILVER' });
    fireEvent.pointerDown(knob, { clientX: 0, clientY: 100, pointerId: 1 });
    expect(focusStore.get()).toMatchObject({ kind: 'control', id: 'knob.d-silver', tip: false });
    fireEvent.pointerMove(knob, { clientX: 0, clientY: 81 });
    expect(onChange).toHaveBeenLastCalledWith('knob.d-silver', 6);
    fireEvent.pointerMove(knob, { clientX: 0, clientY: 10, shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith('knob.d-silver', 6);
    // A long drag stops at the end of the travel.
    fireEvent.pointerMove(knob, { clientX: 0, clientY: -2000 });
    expect(onChange).toHaveBeenLastCalledWith('knob.d-silver', 10);
    fireEvent.pointerUp(knob);
    // After the drag, moving does nothing.
    onChange.mockClear();
    fireEvent.pointerMove(knob, { clientX: 0, clientY: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a log knob moves by ratio and snaps to its step', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    const knob = screen.getByRole('slider', { name: 'RATE' });
    fireEvent.keyDown(knob, { key: 'ArrowRight' });
    const [, v] = onChange.mock.calls[0];
    expect(v).toBeGreaterThan(5);
    expect((v as number) % 0.5).toBe(0);
    fireEvent.keyDown(knob, { key: 'ArrowLeft', shiftKey: true });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('ignores keys that are not arrows, and double-click puts it back', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    const knob = screen.getByRole('slider', { name: 'CUTOFF' });
    fireEvent.keyDown(knob, { key: 'a' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.doubleClick(knob);
    expect(onChange).toHaveBeenCalledWith('knob.scaled', null);
  });

  it('an enum knob steps by drag, cycles on a press, and clamps from the keyboard', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    const knob = screen.getByRole('slider', { name: 'knob.enum' });
    expect(knob.getAttribute('aria-valuetext')).toBe('a');

    fireEvent.pointerDown(knob, { clientX: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientX: 0, clientY: 52 });
    expect(onChange).toHaveBeenLastCalledWith('knob.enum', 'c');
    fireEvent.pointerUp(knob);

    onChange.mockClear();
    fireEvent.pointerDown(knob, { clientX: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(knob);
    expect(onChange).toHaveBeenCalledWith('knob.enum', 'b');

    fireEvent.keyDown(knob, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('knob.enum', 'a');
  });

  it('shows where a lesson wants it, for continuous and enum knobs', () => {
    const plain = render(<SynthPanel {...props()} />).container;
    const before = plain.querySelectorAll('path[fill="#f6a63a"]').length;
    const target = with_({ 'knob.scaled': 4, 'knob.enum': 'b' });
    const marked = render(<SynthPanel {...props({ target })} />).container;
    expect(marked.querySelectorAll('path[fill="#f6a63a"]').length).toBe(before + 2);
  });

  it('is ringed while a lesson points at it', () => {
    const { container } = render(<SynthPanel {...props()} />);
    act(() => highlightStore.set(['knob.cat', 'fader.v', 'select.mode', 'menu.cont', 'j.in']));
    expect(container.querySelectorAll('.kys-pulse').length).toBeGreaterThanOrEqual(6);
  });

  it('tells the inspector what the mouse is over, and lets go when it leaves', () => {
    render(<SynthPanel {...props()} />);
    const knob = screen.getByRole('slider', { name: 'PRO1' });
    fireEvent.pointerEnter(knob, { pointerType: 'mouse', clientX: 3, clientY: 4 });
    expect(focusStore.get()).toEqual({
      kind: 'control',
      id: 'knob.pro1',
      x: 3,
      y: 4,
      tip: true,
    });
    fireEvent.pointerMove(knob, { pointerType: 'mouse', clientX: 9, clientY: 4 });
    expect(focusStore.get()).toMatchObject({ x: 9 });
    fireEvent.pointerLeave(knob);
    expect(focusStore.get()).toMatchObject({ tip: false });
  });
});

describe('switches and buttons', () => {
  it.each([
    ['slide.v', 'SRC', 'y'],
    ['slide.h', 'slide.h', true],
    ['rocker.h', 'rocker.h', false],
    ['rocker.3', 'rocker.3', 'r'],
    ['button.lamp', 'button.lamp', 0],
    ['toggle.3', 'toggle.3', 'd'],
  ])('%s steps to its next position on a press', (id, name, next) => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    fireEvent.click(screen.getByRole('button', { name }));
    expect(onChange).toHaveBeenCalledWith(id, next);
    expect(focusStore.get()).toMatchObject({ kind: 'control', id });
  });

  it('steps from the keyboard on Enter and Space only', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    const sw = screen.getByRole('button', { name: 'rocker.v' });
    fireEvent.keyDown(sw, { key: 'x' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(sw, { key: ' ' });
    expect(onChange).toHaveBeenCalledWith('rocker.v', true);
  });

  it('marks a lesson target on switches and on buttons', () => {
    const target = with_({ 'slide.v': 'z', 'rocker.v': true, 'button.plain': true });
    const { container } = render(<SynthPanel {...props({ target })} />);
    expect(container.querySelectorAll('circle[fill="#f6a63a"]').length).toBe(3);
  });
});

describe('faders', () => {
  it('drag along the slot, clamped to the travel', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    const fader = screen.getByRole('slider', { name: 'A' });
    fireEvent.pointerDown(fader, { clientX: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(fader, { clientX: 0, clientY: 50 });
    expect(onChange).toHaveBeenLastCalledWith('fader.v', 7);
    fireEvent.pointerMove(fader, { clientX: 0, clientY: -500 });
    expect(onChange).toHaveBeenLastCalledWith('fader.v', 10);
    fireEvent.pointerMove(fader, { clientX: 0, clientY: 50, shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith('fader.v', 3);
    fireEvent.pointerUp(fader);
    onChange.mockClear();
    fireEvent.pointerMove(fader, { clientX: 0, clientY: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a horizontal fader moves right for more, and keys step it', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    const fader = screen.getByRole('slider', { name: 'fader.h' });
    expect(fader.getAttribute('aria-orientation')).toBe('horizontal');
    fireEvent.pointerDown(fader, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(fader, { clientX: 10, clientY: 0 });
    expect(onChange).toHaveBeenLastCalledWith('fader.h', 9);
    fireEvent.keyDown(fader, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('fader.h', 8.2);
    fireEvent.keyDown(fader, { key: 'ArrowDown', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith('fader.h', 7.95);
    fireEvent.keyDown(fader, { key: 'Tab' });
    expect(onChange).toHaveBeenCalledTimes(3);
    fireEvent.doubleClick(fader);
    expect(onChange).toHaveBeenLastCalledWith('fader.h', null);
  });

  it('marks a lesson target on vertical and horizontal faders', () => {
    const target = with_({ 'fader.v': 9, 'fader.h': 1 });
    const { container } = render(<SynthPanel {...props({ target })} />);
    expect(container.querySelector('path[d="M5 0 L-8 -7 L-8 7 Z"]')).not.toBeNull();
    expect(container.querySelector('path[d="M0 -5 L-7 8 L7 8 Z"]')).not.toBeNull();
  });
});

describe('select buttons', () => {
  it('choose an option, and pressing the lit one sets the off value', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    fireEvent.click(screen.getByRole('radio', { name: 'select.mode: Two' }));
    expect(onChange).toHaveBeenLastCalledWith('select.mode', 'two');
    fireEvent.click(screen.getByRole('radio', { name: 'select.mode: One' }));
    expect(onChange).toHaveBeenLastCalledWith('select.mode', 'off');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'select.mode: Three' }), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('select.mode', 'three');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'select.mode: Three' }), { key: 'q' });
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('has no button for a hidden option, and marks a lesson target', () => {
    const { container } = render(
      <SynthPanel {...props({ target: with_({ 'select.mode': 'three' }) })} />
    );
    expect(screen.queryByRole('radio', { name: 'select.mode: Off' })).toBeNull();
    expect(container.querySelector('circle[r="6"][fill="#f6a63a"]')).not.toBeNull();
  });
});

describe('menu rows', () => {
  it('print the value, formatted when the control has a readout', () => {
    render(<SynthPanel {...props()} />);
    expect(screen.getByRole('slider', { name: 'DEPTH' }).getAttribute('aria-valuetext')).toBe('3');
    expect(screen.getByRole('slider', { name: 'TIME' }).getAttribute('aria-valuetext')).toBe(
      '3 ms'
    );
    expect(screen.getByRole('slider', { name: 'WAVE' }).getAttribute('aria-valuetext')).toBe(
      'Sine'
    );
  });

  it('change by drag and mark a lesson target', () => {
    const onChange = vi.fn();
    const target = with_({ 'menu.cont': 8, 'menu.enum': 'sq' });
    const { container } = render(<SynthPanel {...props({ onChange, target })} />);
    const row = screen.getByRole('slider', { name: 'DEPTH' });
    fireEvent.pointerDown(row, { clientX: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 0, clientY: 81 });
    expect(onChange).toHaveBeenLastCalledWith('menu.cont', 4);
    expect(container.querySelectorAll('path[d="M5 0 L-6 -6 L-6 6 Z"]')).toHaveLength(2);
  });
});

describe('joystick', () => {
  it('drags both axes to the pointer, clamped to ±1', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    const stick = screen.getByRole('slider', { name: 'Joystick' });
    expect(stick.getAttribute('aria-valuetext')).toBe('left-right 0.50, up-down -0.50');
    fireEvent.pointerDown(stick, { clientX: 931, clientY: 500, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith('joy.x', 1);
    expect(onChange).toHaveBeenCalledWith('joy.y', 0);
    fireEvent.pointerMove(stick, { clientX: 900, clientY: 0 });
    expect(onChange).toHaveBeenLastCalledWith('joy.y', 1);
    fireEvent.pointerUp(stick);
    onChange.mockClear();
    fireEvent.pointerMove(stick, { clientX: 0, clientY: 0, pointerType: 'mouse' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('nudges from the keyboard and resets on double-click', () => {
    const onChange = vi.fn();
    render(<SynthPanel {...props({ onChange })} />);
    const stick = screen.getByRole('slider', { name: 'Joystick' });
    fireEvent.keyDown(stick, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('joy.x', 0.6);
    fireEvent.keyDown(stick, { key: 'ArrowLeft', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith('joy.x', 0.48);
    fireEvent.keyDown(stick, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('joy.y', -0.4);
    fireEvent.keyDown(stick, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('joy.y', -0.6);
    fireEvent.doubleClick(stick);
    expect(onChange).toHaveBeenCalledWith('joy.x', null);
    expect(onChange).toHaveBeenLastCalledWith('joy.y', null);
  });

  it('marks a lesson target', () => {
    const { container } = render(<SynthPanel {...props({ target: with_({ 'joy.x': -1 }) })} />);
    expect(container.querySelector('circle[r="6"][fill="#f6a63a"]')).not.toBeNull();
  });
});

describe('pin matrix', () => {
  const pins: PatchCable[] = [{ from: 'm.r1', to: 'm.c2', color: '#fff' }];

  it('puts a pin in an empty hole and explains it', () => {
    const onConnect = vi.fn();
    render(<SynthPanel {...props({ onConnect })} />);
    const grid = screen.getByRole('grid');
    // (1160, 440): row 2, column 2.
    fireEvent.click(grid, { clientX: 1160, clientY: 440 });
    expect(onConnect).toHaveBeenCalledWith('m.r2', 'm.c2');
    expect(focusStore.get()).toMatchObject({ id: 'm.r2>m.c2', pin: true, sticky: true });
  });

  it('takes a pin out of its hole', () => {
    const onRemoveCable = vi.fn();
    const { container } = render(<SynthPanel {...props({ cables: pins, onRemoveCable })} />);
    expect(container.querySelectorAll('circle[fill="#f3f2ec"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('grid'), { clientX: 1160, clientY: 420 });
    expect(onRemoveCable).toHaveBeenCalledWith(0);
  });

  it('explains the hole under the mouse, and ignores presses off the grid', () => {
    const onConnect = vi.fn();
    render(<SynthPanel {...props({ onConnect })} />);
    const grid = screen.getByRole('grid');
    fireEvent.pointerMove(grid, { clientX: 1140, clientY: 420, pointerType: 'mouse' });
    expect(focusStore.get()).toMatchObject({ id: 'm.r1>m.c1', empty: true });
    fireEvent.pointerMove(grid, { clientX: 5000, clientY: 420 });
    fireEvent.pointerLeave(grid);
    expect(focusStore.get()).toBeNull();
    fireEvent.click(grid, { clientX: 5000, clientY: 5000 });
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('rings the holes a lesson points at, fades dead pins, and draws on paper', () => {
    act(() => highlightStore.set(['m.r1', 'm.c2']));
    const { container } = render(<SynthPanel {...props({ cables: pins, outline: true })} />);
    expect(container.querySelectorAll('circle.kys-pulse[stroke="#ff5d8f"]')).toHaveLength(1);
    expect(container.querySelectorAll('rect.kys-pulse[stroke="#ff5d8f"]')).toHaveLength(2);
  });
});

describe('jacks', () => {
  it('draw banana sockets and label positions', () => {
    const { container } = render(<SynthPanel {...props()} />);
    expect(container.querySelector('circle[fill="#f0501e"]')).not.toBeNull();
    expect(container.querySelector('circle[fill="#123456"]')).not.toBeNull();
    // A `labelPos: 'none'` jack prints no label but keeps its name for assistive tech.
    expect(screen.getByRole('button', { name: 'IN 2 input jack' })).toBeTruthy();
  });

  it('hover tells the inspector, but keeps a just-plugged cable card up', () => {
    render(<SynthPanel {...props()} />);
    const j = screen.getByRole('button', { name: 'IN input jack' });
    act(() =>
      focusStore.set({
        kind: 'cable',
        id: 'j.out>j.in',
        from: 'j.out',
        to: 'j.in',
        at: 'j.in',
        x: 0,
        y: 0,
        tip: true,
      })
    );
    fireEvent.pointerMove(j, { pointerType: 'mouse', clientX: 1, clientY: 1 });
    expect(focusStore.get()).toMatchObject({ kind: 'cable', id: 'j.out>j.in' });
    fireEvent.pointerLeave(j);
    expect(focusStore.get()).toMatchObject({ kind: 'cable', tip: false });
  });
});

describe('geometry helpers', () => {
  it('polar: 0° is 12 o’clock, clockwise positive', () => {
    const [x, y] = polar(0, 0, 10, 90);
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(0);
  });

  it('optionIndex falls back to the first option', () => {
    expect(optionIndex({ options: [{ v: 'a', label: 'A' }] }, 'zzz')).toBe(0);
  });

  it('valueAngle spreads enum options over ±120°, honours `a`, and sweeps cont ±150°', () => {
    const opts = [
      { v: 'a', label: '' },
      { v: 'b', label: '' },
      { v: 'c', label: '' },
    ];
    expect(valueAngle({ kind: 'enum', options: opts, def: 'a' }, 'c')).toBe(120);
    expect(valueAngle({ kind: 'enum', options: [{ v: 1, label: '' }], def: 1 }, 1)).toBe(0);
    expect(valueAngle({ kind: 'enum', options: [{ v: 1, label: '', a: 33 }], def: 1 }, 1)).toBe(33);
    expect(valueAngle({ kind: 'cont', min: 0, max: 10, def: 0 }, 10)).toBe(150);
  });

  it('wavePath draws nothing for an unknown shape', () => {
    expect(wavePath('zigzag', 10)).toBe('');
  });
});
