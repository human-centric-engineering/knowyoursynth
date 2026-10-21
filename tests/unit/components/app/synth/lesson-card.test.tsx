// @vitest-environment happy-dom

/**
 * The lesson card's dragging: by the header to anywhere on screen, kept on screen, and docked again by ⇆.
 *
 * @see components/app/synth/lesson-card.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LessonCard } from '@/components/app/synth/lesson-card';
import { getSynthDef } from '@/lib/app/synths/defs';

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def = found;

beforeEach(() => {
  window.innerWidth = 1400;
  window.innerHeight = 900;
});

function setup() {
  const onSide = vi.fn();
  render(
    <LessonCard
      def={def}
      preset={null}
      step={null}
      onStep={vi.fn()}
      section="fx"
      onClose={vi.fn()}
      side="right"
      onSide={onSide}
      inspector={null}
      effects={<p>rack</p>}
    />
  );
  const card = screen.getByTestId('lesson-card');
  // happy-dom lays nothing out: the docked card is 400 wide at (960, 300).
  card.getBoundingClientRect = () => new DOMRect(960, 300, 400, 500);
  const head = screen.getByRole('heading', { name: 'Pedals after the synth' }).closest('header');
  if (!head) throw new Error('no header');
  return { card, head, onSide };
}

const drag = (el: Element, from: [number, number], to: [number, number]) => {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: to[0], clientY: to[1] });
};

describe('LessonCard dragging', () => {
  it('moves by the header, keeping the grab point under the pointer', () => {
    const { card, head } = setup();
    expect(card).not.toHaveAttribute('data-detached');

    drag(head, [1000, 320], [300, 120]);

    expect(card).toHaveAttribute('data-detached');
    expect(card.style.left).toBe('260px');
    expect(card.style.top).toBe('100px');
  });

  it('stays on screen when dragged past the edges', () => {
    const { card, head } = setup();

    drag(head, [1000, 320], [5000, 5000]);
    expect(card.style.left).toBe(`${1400 - 400 - 8}px`);
    expect(card.style.top).toBe(`${900 - 120}px`);

    drag(head, [1000, 320], [-5000, -5000]);
    expect(card.style.left).toBe('8px');
    expect(card.style.top).toBe('8px');
  });

  it('does not drag from the header buttons', () => {
    const { card } = setup();
    drag(screen.getByRole('button', { name: 'Close the card' }), [1300, 320], [300, 120]);
    expect(card).not.toHaveAttribute('data-detached');
  });

  it('docks again on the other side from ⇆', () => {
    const { card, head, onSide } = setup();
    drag(head, [1000, 320], [300, 120]);

    fireEvent.click(screen.getByRole('button', { name: 'Move the card to the left' }));

    expect(onSide).toHaveBeenCalledTimes(1);
    expect(card).not.toHaveAttribute('data-detached');
    expect(card.style.left).toBe('');
  });
});
