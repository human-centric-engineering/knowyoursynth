// @vitest-environment happy-dom

/**
 * The sequencer's encoder (`f-step-sequencer` t-80): a slider turned by its keys or by a drag up and down, kept on its
 * step grid and inside its range.
 *
 * @see components/app/sequencer/encoder.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Encoder, snap } from '@/components/app/sequencer/encoder';

function encoder(over: Partial<Parameters<typeof Encoder>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <Encoder
      label="Note"
      value={60}
      min={0}
      max={127}
      help="The note."
      onChange={onChange}
      {...over}
    />
  );
  return { onChange, knob: screen.getByRole('slider', { name: 'Note' }) };
}

describe('snap', () => {
  it('puts a value on the step grid from the minimum, inside the range, without float noise', () => {
    expect(snap(1.8, 0.25, 256, 0.25)).toBe(1.75);
    expect(snap(0.1 + 0.2, 0, 1, 0.05)).toBe(0.3);
    expect(snap(-3, 0, 10, 1)).toBe(0);
    expect(snap(300, 0, 127, 1)).toBe(127);
  });
});

describe('Encoder', () => {
  it('reads as a slider: its range, its value, and its value as text', () => {
    const { knob } = encoder({ format: (v) => `n${v}` });
    expect(knob.getAttribute('aria-valuemin')).toBe('0');
    expect(knob.getAttribute('aria-valuemax')).toBe('127');
    expect(knob.getAttribute('aria-valuenow')).toBe('60');
    expect(knob.getAttribute('aria-valuetext')).toBe('n60');
    expect(knob.textContent).toBe('n60');
  });

  it('says when the value shown is a default', () => {
    expect(encoder({ unset: true }).knob.getAttribute('aria-valuetext')).toBe('60 (default)');
  });

  it('moves a step with the arrows, a big step with Page Up and Down, and to either end with Home and End', () => {
    const { knob, onChange } = encoder({ big: 12 });
    for (const key of [
      'ArrowUp',
      'ArrowRight',
      'ArrowDown',
      'ArrowLeft',
      'PageUp',
      'PageDown',
      'Home',
      'End',
    ])
      fireEvent.keyDown(knob, { key });
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([61, 61, 59, 59, 72, 48, 0, 127]);
  });

  it('leaves other keys to the page, and sends nothing for a move that changes nothing', () => {
    const { knob, onChange } = encoder({ value: 127 });
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    fireEvent.keyDown(knob, { key: 'a' });
    fireEvent.keyDown(knob, { key: 'ArrowUp' });
    window.removeEventListener('keydown', outside);
    expect(onChange).not.toHaveBeenCalled();
    // The letter reached the page (it plays a note there); the arrow did not.
    expect(outside.mock.calls.map((c) => (c[0] as KeyboardEvent).key)).toEqual(['a']);
  });

  it('turns with a drag: up is more, the whole range in 400px, and a let-go ends the drag', () => {
    const { knob, onChange } = encoder();
    fireEvent.pointerDown(knob, { clientY: 200, pointerId: 1 });
    expect(document.activeElement).toBe(knob);
    // 40px up of 127 in 400px is 12.7: 73 once snapped.
    fireEvent.pointerMove(knob, { clientY: 160, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientY: 240, pointerId: 1 });
    fireEvent.pointerUp(knob, { pointerId: 1 });
    fireEvent.pointerMove(knob, { clientY: 0, pointerId: 1 });
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([73, 47]);
  });

  it('turns a short range a step every few pixels', () => {
    const { knob, onChange } = encoder({ min: 1, max: 4, value: 1 });
    fireEvent.pointerDown(knob, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientY: 88, pointerId: 1 });
    fireEvent.pointerCancel(knob, { pointerId: 1 });
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([3]);
  });

  it('draws its ring to the share of its range', () => {
    const { knob } = encoder({ min: 0, max: 100, value: 50 });
    expect(knob.style.getPropertyValue('--enc')).toBe('135deg');
  });
});
