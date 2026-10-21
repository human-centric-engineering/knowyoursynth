// @vitest-environment happy-dom

/**
 * The tutor's drawer from `lg` up: hidden while closed but still rendered, and closed by its × or by Escape inside it.
 *
 * @see components/app/synth/drawers.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TutorDrawer } from '@/components/app/synth/drawers';

function drawer(open: boolean, onClose = vi.fn()) {
  const view = render(
    <TutorDrawer open={open} onClose={onClose}>
      <input aria-label="Ask the tutor" />
    </TutorDrawer>
  );
  return { onClose, view };
}

describe('TutorDrawer', () => {
  it('keeps the tutor rendered while closed, the drawer hidden', () => {
    drawer(false);
    const aside = document.getElementById('kys-drawer');
    expect(aside?.hidden).toBe(true);
    expect(screen.getByLabelText('Ask the tutor', { selector: 'input' })).toBeTruthy();
  });

  it('closes from its × button', () => {
    const { onClose } = drawer(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close the Tutor drawer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape inside it, and not on another key', () => {
    const { onClose } = drawer(true);
    const input = screen.getByRole('textbox', { name: 'Ask the tutor' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves an Escape something inside has already handled', () => {
    const { onClose } = drawer(true);
    const input = screen.getByRole('textbox', { name: 'Ask the tutor' });
    input.addEventListener('keydown', (e) => e.preventDefault());
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not listen for Escape while closed, nor once it closes', () => {
    const onClose = vi.fn();
    const { view } = drawer(false, onClose);
    const aside = document.getElementById('kys-drawer');
    if (!aside) throw new Error('no drawer');
    fireEvent.keyDown(aside, { key: 'Escape' });
    view.rerender(
      <TutorDrawer open onClose={onClose}>
        <input aria-label="Ask the tutor" />
      </TutorDrawer>
    );
    view.rerender(
      <TutorDrawer open={false} onClose={onClose}>
        <input aria-label="Ask the tutor" />
      </TutorDrawer>
    );
    fireEvent.keyDown(aside, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
