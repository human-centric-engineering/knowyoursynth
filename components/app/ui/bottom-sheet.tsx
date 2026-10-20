'use client';

/**
 * A sheet that rises from the bottom of a small screen (`f-phone-and-tablet` t-66), on Radix Dialog: labelled by its
 * title, closed with Escape, its close button, or a drag down on its handle.
 *
 * Two kinds, because what sits behind them is used differently:
 * - **Modal** (the default): over a dimmed page, focus kept inside, closed by a press outside it. For something read
 *   or typed into on its own, such as the library or the tutor.
 * - **Docked**: half the screen high, with the page above it still live, so the panel can be read and turned while the
 *   sheet explains it. Focus moves into it when it opens but is not held there, as for any non-modal dialog, and a
 *   press outside it is the panel being used, so it does not close it. It can be dragged, or its handle pressed, to
 *   the full height and back.
 */

import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

export type SheetSnap = 'half' | 'full';

/** A half-height docked sheet's share of the screen: the `h-[45dvh]` it is drawn at. */
export const HALF_HEIGHT = 0.45;

/** How far a drag on the handle must go to count, in px. */
const DRAG = 60;

/**
 * Where a drag on the handle leaves the sheet: down shortens a full docked sheet and otherwise closes it, up makes a
 * docked sheet full. `null`: it stays as it was.
 */
export function snapAfterDrag(
  dy: number,
  docked: boolean,
  snap: SheetSnap
): SheetSnap | 'closed' | null {
  if (dy > DRAG) return docked && snap === 'full' ? 'half' : 'closed';
  if (dy < -DRAG && docked && snap === 'half') return 'full';
  return null;
}

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown at the top, and the sheet's accessible name. */
  title: string;
  /** Non-modal and half high, with the page above it live. */
  docked?: boolean;
  /** A docked sheet's height. */
  snap?: SheetSnap;
  onSnap?: (snap: SheetSnap) => void;
  /** Where focus goes back to on closing when what had it on opening has left the page. */
  fallbackFocus?: () => HTMLElement | null;
  children: ReactNode;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  docked = false,
  snap = 'half',
  onSnap,
  fallbackFocus,
  children,
}: BottomSheetProps) {
  const content = useRef<HTMLDivElement>(null);
  /** What had focus when the sheet opened, to give it back to. */
  const returnTo = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  // A drag ends in a click too, which the handle's button must not read as a press.
  const dragged = useRef(false);
  const [pull, setPull] = useState(0);
  const height = docked && snap === 'half' ? 'h-[45dvh]' : 'h-[85dvh]';

  const onDown = (e: PointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, moved: false };
    dragged.current = false;
  };
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    // The sheet follows a drag down; up, it waits for the release to grow.
    setPull(Math.max(0, dy));
  };
  const onUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    dragged.current = d.moved;
    setPull(0);
    const next = snapAfterDrag(e.clientY - d.y, docked, snap);
    if (next === 'closed') onOpenChange(false);
    else if (next) onSnap?.(next);
  };
  const onCancel = () => {
    drag.current = null;
    setPull(0);
  };
  const handle = (
    <span aria-hidden="true" className="block h-1.5 w-10 rounded-full bg-(--kys-line)" />
  );
  const handleProps = {
    onPointerDown: onDown,
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: onCancel,
    className: 'flex h-6 w-full touch-none items-center justify-center',
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={!docked}>
      <Dialog.Portal>
        {!docked && <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />}
        <Dialog.Content
          ref={content}
          aria-describedby={undefined}
          data-kys-sheet={docked ? 'docked' : 'modal'}
          data-snap={docked ? snap : 'full'}
          className={`kys-synth fixed inset-x-0 bottom-0 z-50 flex ${height} flex-col rounded-t-2xl border-t border-(--kys-line) bg-(--kys-ground) pb-[env(safe-area-inset-bottom)] text-(--kys-text) shadow-2xl transition-[height] outline-none`}
          style={pull ? { transform: `translateY(${pull}px)` } : undefined}
          // Docked: a press on the page is the panel being used, and Escape there (dropping a cable) is the panel's.
          onInteractOutside={docked ? (e) => e.preventDefault() : undefined}
          onEscapeKeyDown={
            docked
              ? (e) => {
                  if (!content.current?.contains(document.activeElement)) e.preventDefault();
                }
              : undefined
          }
          onOpenAutoFocus={(e) => {
            const from = document.activeElement;
            // The body, when what was pressed left the page in the same render.
            returnTo.current = from instanceof HTMLElement && from !== document.body ? from : null;
            // Docked, focus goes to the sheet itself rather than its first button, so opening it from a tap on the
            // panel starts nothing.
            if (docked) {
              e.preventDefault();
              content.current?.focus({ preventScroll: true });
            }
          }}
          // Radix gives focus back only to a `Dialog.Trigger`, and what opens a sheet is the page's own button. Docked,
          // focus already moved out to the page stays where it went.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const now = document.activeElement;
            const lost = !now || now === document.body || !!content.current?.contains(now);
            // A sheet opened from inside another (the library's "ask the tutor") was opened by a button that went with
            // that sheet.
            const back = returnTo.current?.isConnected ? returnTo.current : fallbackFocus?.();
            if (lost || !docked) back?.focus({ preventScroll: true });
            returnTo.current = null;
          }}
        >
          {docked ? (
            <button
              type="button"
              {...handleProps}
              aria-label={snap === 'half' ? `Make ${title} taller` : `Make ${title} shorter`}
              onClick={() => {
                if (dragged.current) dragged.current = false;
                else onSnap?.(snap === 'half' ? 'full' : 'half');
              }}
            >
              {handle}
            </button>
          ) : (
            <div {...handleProps}>{handle}</div>
          )}
          <div className="flex items-center justify-between gap-3 px-4 pb-2">
            <Dialog.Title className="kys-label text-(--kys-muted)">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={`Close ${title}`}
              className="kys-label flex h-11 min-w-11 items-center justify-center rounded-md border border-(--kys-line) px-3 text-(--kys-muted) hover:text-(--kys-text)"
            >
              Close
            </Dialog.Close>
          </div>
          <div className="kys-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
