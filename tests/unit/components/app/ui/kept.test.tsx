// @vitest-environment happy-dom

/**
 * A kept node (`f-phone-and-tablet` t-66): what is portaled into it keeps its state while the slot showing it comes and
 * goes, which is what lets the tutor keep streaming with its sheet closed.
 *
 * @see components/app/ui/kept.tsx
 */

import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { KeptSlot, useKeptNode } from '@/components/app/ui/kept';

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      Pressed {n}
    </button>
  );
}

function Harness() {
  const node = useKeptNode();
  const [shown, setShown] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShown(!shown)}>
        Toggle
      </button>
      {node && createPortal(<Counter />, node)}
      {shown && (
        <section aria-label="Slot">
          <KeptSlot node={node} />
        </section>
      )}
    </>
  );
}

describe('a kept node', () => {
  it('shows in its slot, leaves the document without it, and comes back with its state', () => {
    render(<Harness />);
    const counter = screen.getByRole('button', { name: 'Pressed 0' });
    expect(screen.getByRole('region', { name: 'Slot' }).contains(counter)).toBe(true);
    fireEvent.click(counter);
    fireEvent.click(counter);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.queryByRole('button', { name: /Pressed/ })).toBeNull();
    // still mounted: the same element, out of the document
    expect(counter.isConnected).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByRole('button', { name: 'Pressed 2' })).toBe(counter);
  });
});
