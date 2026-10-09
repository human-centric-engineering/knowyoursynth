/**
 * Drive a native `<dialog>` from an `open` prop: show it modally when `open` turns true, close it when it turns false.
 *
 * The dialog's own `close` event (Escape, a close button, a click on the backdrop) is how it tells the page it went;
 * the page then sets `open` back to false. Shared by the lineage and "What is not modelled" dialogs, as in the
 * prototype's `Lineage.jsx` and `Limits.jsx`.
 */

import { useEffect, useRef, type RefObject } from 'react';

export interface DialogControl {
  ref: RefObject<HTMLDialogElement | null>;
  /** Close from inside, as a close button does. */
  close: () => void;
}

export function useDialog(open: boolean): DialogControl {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // A click on the dialog element itself, not its content, is a click on the backdrop. Escape is the keyboard's way
  // out, and the browser handles it, so this is a pointer listener only. The press must start on the backdrop too: a
  // text selection dragged out past the edge ends with a click whose target is the dialog.
  useEffect(() => {
    const d = ref.current;
    if (!d) return undefined;
    let downOnBackdrop = false;
    const onDown = (e: PointerEvent) => {
      downOnBackdrop = e.target === d;
    };
    const onClick = (e: MouseEvent) => {
      if (downOnBackdrop && e.target === d) d.close();
      downOnBackdrop = false;
    };
    d.addEventListener('pointerdown', onDown);
    d.addEventListener('click', onClick);
    return () => {
      d.removeEventListener('pointerdown', onDown);
      d.removeEventListener('click', onClick);
    };
  }, []);
  return { ref, close: () => ref.current?.close() };
}
