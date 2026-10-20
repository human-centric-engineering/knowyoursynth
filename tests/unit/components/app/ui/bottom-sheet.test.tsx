// @vitest-environment happy-dom

/**
 * The bottom sheet (`f-phone-and-tablet` t-66): a modal one holds focus, hides the page from a screen reader and closes
 * on Escape, its Close button and a press outside; a docked one leaves the page live, so a press outside it and an
 * Escape meant for the page leave it open, and its handle moves it between half and full height.
 *
 * @see components/app/ui/bottom-sheet.tsx
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BottomSheet, snapAfterDrag, type SheetSnap } from '@/components/app/ui/bottom-sheet';

beforeAll(() => {
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
});

/** A page with a button outside the sheet and the sheet's own state, as the synth page holds it. */
function Harness({
  docked = false,
  onOpenChange,
}: {
  docked?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<SheetSnap>('half');
  const change = (o: boolean) => {
    onOpenChange?.(o);
    setOpen(o);
  };
  return (
    <>
      <button type="button" onClick={() => change(true)}>
        Open
      </button>
      <button type="button">On the page</button>
      <BottomSheet
        title="Lesson"
        open={open}
        onOpenChange={change}
        docked={docked}
        snap={snap}
        onSnap={setSnap}
      >
        <button type="button">In the sheet</button>
      </BottomSheet>
    </>
  );
}

const sheet = () => screen.getByRole('dialog', { name: 'Lesson' });
const open = () => {
  const trigger = screen.getByRole('button', { name: 'Open' });
  trigger.focus();
  fireEvent.click(trigger);
};
/** Radix listens for a press outside from the tick after it opens. */
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe('snapAfterDrag', () => {
  it('closes a modal sheet dragged down past the threshold, and leaves a short drag alone', () => {
    expect(snapAfterDrag(61, false, 'full')).toBe('closed');
    expect(snapAfterDrag(60, false, 'full')).toBeNull();
    // a modal sheet has one height: dragging it up does nothing
    expect(snapAfterDrag(-200, false, 'full')).toBeNull();
  });

  it('shortens a full docked sheet before it closes it', () => {
    expect(snapAfterDrag(100, true, 'full')).toBe('half');
    expect(snapAfterDrag(100, true, 'half')).toBe('closed');
  });

  it('makes a half docked sheet full when dragged up, and leaves a full one full', () => {
    expect(snapAfterDrag(-61, true, 'half')).toBe('full');
    expect(snapAfterDrag(-61, true, 'full')).toBeNull();
  });
});

describe('a modal sheet', () => {
  it('is a dialog named by its title, with focus moved inside it and the page hidden from screen readers', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    open();

    expect(sheet().getAttribute('data-kys-sheet')).toBe('modal');
    expect(sheet().contains(document.activeElement)).toBe(true);
    // the rest of the page is aria-hidden while it is open, so only the sheet can be reached
    expect(
      screen
        .getByRole('button', { name: 'On the page', hidden: true })
        .closest('[aria-hidden="true"]')
    ).not.toBeNull();
  });

  it('gives focus to its fallback when what opened it has left the page, as a button in another sheet does', async () => {
    // the opener goes when the sheet opens, as the library's "ask the tutor" goes with the Library sheet
    function Gone() {
      const [open, setOpen] = useState(false);
      return (
        <>
          {!open && (
            <button type="button" onClick={() => setOpen(true)}>
              Open
            </button>
          )}
          <button type="button">Tutor in the bar</button>
          <BottomSheet
            title="Tutor"
            open={open}
            onOpenChange={setOpen}
            fallbackFocus={() =>
              screen.getByRole('button', { name: 'Tutor in the bar', hidden: true })
            }
          >
            <button type="button">In the sheet</button>
          </BottomSheet>
        </>
      );
    }
    render(<Gone />);
    open();
    expect(screen.queryByRole('button', { name: 'Open', hidden: true })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tutor in the bar' }))
    );
  });

  it('gives focus to its fallback when what opened it has left the page since', async () => {
    // the opener is there when the sheet opens, and gone by the time it closes
    function Later() {
      const [open, setOpen] = useState(false);
      const [gone, setGone] = useState(false);
      return (
        <>
          {!gone && (
            <button type="button" onClick={() => setOpen(true)}>
              Open
            </button>
          )}
          <button type="button">Tutor in the bar</button>
          <BottomSheet
            title="Tutor"
            open={open}
            onOpenChange={setOpen}
            fallbackFocus={() =>
              screen.getByRole('button', { name: 'Tutor in the bar', hidden: true })
            }
          >
            <button type="button" onClick={() => setGone(true)}>
              Remove the opener
            </button>
          </BottomSheet>
        </>
      );
    }
    render(<Later />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the opener' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tutor in the bar' }))
    );
  });

  it('closes on Escape and gives focus back to what opened it', async () => {
    render(<Harness />);
    open();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' }))
    );
  });

  it('closes on its Close button', () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close Lesson' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on a press outside it', async () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    open();
    await tick();
    // the dimmed page behind it
    const overlay = sheet().previousElementSibling;
    expect(overlay).not.toBeNull();
    // happy-dom sends no pointer type, so Radix reads it as touch and waits for the click that ends the press
    fireEvent.pointerDown(overlay as Element);
    fireEvent.click(overlay as Element);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when its handle is dragged down, and not on a short drag', () => {
    render(<Harness />);
    open();
    const handle = sheet().firstElementChild as HTMLElement;
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 130, pointerId: 1 });
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 180, pointerId: 1 });
    expect(sheet().style.transform).toBe('translateY(80px)');
    fireEvent.pointerUp(handle, { clientY: 180, pointerId: 1 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a docked sheet', () => {
  it('opens half high with focus on the sheet itself, and leaves the page reachable', () => {
    render(<Harness docked />);
    open();

    expect(sheet().getAttribute('data-kys-sheet')).toBe('docked');
    expect(sheet().getAttribute('data-snap')).toBe('half');
    expect(document.activeElement).toBe(sheet());
    expect(
      screen.getByRole('button', { name: 'On the page' }).closest('[aria-hidden="true"]')
    ).toBeNull();
  });

  it('stays open on a press outside it: that is the page being used', async () => {
    const onOpenChange = vi.fn();
    render(<Harness docked onOpenChange={onOpenChange} />);
    open();
    await tick();
    const page = screen.getByRole('button', { name: 'On the page' });
    fireEvent.pointerDown(page);
    fireEvent.click(page);
    expect(screen.getByRole('dialog', { name: 'Lesson' })).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('closes on Escape from inside it, and not on an Escape meant for the page', () => {
    render(<Harness docked />);
    open();
    const outside = screen.getByRole('button', { name: 'On the page' });
    outside.focus();
    fireEvent.keyDown(outside, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Lesson' })).toBeTruthy();

    const inside = screen.getByRole('button', { name: 'In the sheet' });
    inside.focus();
    fireEvent.keyDown(inside, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gives focus back to its opener when closed from inside it', async () => {
    render(<Harness docked />);
    const opener = screen.getByRole('button', { name: 'Open' });
    open();
    expect(document.activeElement).toBe(sheet());
    fireEvent.click(screen.getByRole('button', { name: 'Close Lesson' }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('goes to full height and back from its handle, by press or by drag', () => {
    render(<Harness docked />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Make Lesson taller' }));
    expect(sheet().getAttribute('data-snap')).toBe('full');

    const handle = screen.getByRole('button', { name: 'Make Lesson shorter' });
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 200, pointerId: 1 });
    // the click that ends the drag is not a second press
    fireEvent.click(handle);
    expect(sheet().getAttribute('data-snap')).toBe('half');

    // dragged down again from half, it closes
    const half = screen.getByRole('button', { name: 'Make Lesson taller' });
    fireEvent.pointerDown(half, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(half, { clientY: 200, pointerId: 1 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
