'use client';

/**
 * The tutor's drawer from `lg` up (`f-player` t-74): it slides in from the right over the panel, rather than pushing
 * the player narrower, so the panel never refits while you talk to the tutor. It is the only drawer: the sounds open
 * from the Sound Design strip, the lesson and the inspector in the card over the panel.
 *
 * The tutor is rendered all the time, the drawer `hidden` while closed, so a closed one keeps its state (an answer goes
 * on streaming) and is out of the accessibility tree. Below `lg` the tutor is a bottom sheet instead (t-66), and none
 * of this is drawn.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function TutorDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  /** Closes the drawer; the page puts focus back on the button that opened it. */
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  // Escape inside the drawer closes it, as it closes a sheet. Not on the window: the panel and the dialogs have their
  // own uses for it.
  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <aside
      ref={ref}
      id="kys-drawer"
      className="kys-drawer"
      aria-label="Tutor drawer"
      hidden={!open}
    >
      <div className="kys-drawer-head">
        {/* Not a heading: the tutor carries its own, and the drawer is named by its label. */}
        <p className="kys-drawer-title">Tutor</p>
        <button
          type="button"
          className="kys-pbtn"
          aria-label="Close the Tutor drawer"
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="kys-drawer-body is-fill">{children}</div>
    </aside>
  );
}
