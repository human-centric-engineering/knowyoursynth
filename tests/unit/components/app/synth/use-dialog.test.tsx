// @vitest-environment happy-dom

/**
 * `useDialog` against a real `<dialog>`: the `open` prop opens and closes it, and a click on the backdrop, not its
 * content, closes it.
 *
 * @see components/app/synth/use-dialog.ts
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useDialog } from '@/components/app/synth/use-dialog';

function Harness({ open }: { open: boolean }) {
  const { ref, close } = useDialog(open);
  return (
    <dialog ref={ref}>
      <p>Inside</p>
      <button type="button" onClick={close}>
        Close
      </button>
    </dialog>
  );
}

const dialog = (container: HTMLElement) => {
  const d = container.querySelector('dialog');
  if (!d) throw new Error('no dialog');
  return d;
};

describe('useDialog', () => {
  it('stays closed until open, opens on open, and closes when open turns false', () => {
    const { container, rerender } = render(<Harness open={false} />);
    expect(dialog(container).open).toBe(false);
    rerender(<Harness open />);
    expect(dialog(container).open).toBe(true);
    rerender(<Harness open={false} />);
    expect(dialog(container).open).toBe(false);
  });

  it('closes from inside, and on a click on the backdrop but not on its content', () => {
    const { container } = render(<Harness open />);
    const d = dialog(container);
    fireEvent.click(screen.getByText('Inside'));
    expect(d.open).toBe(true);
    fireEvent.click(d);
    expect(d.open).toBe(false);
    d.showModal();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(d.open).toBe(false);
  });

  it('does nothing while no dialog is attached', () => {
    const { result, rerender } = renderHook(({ open }) => useDialog(open), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    expect(result.current.ref.current).toBeNull();
    expect(() => result.current.close()).not.toThrow();
  });
});
