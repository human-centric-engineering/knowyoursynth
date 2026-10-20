'use client';

/**
 * Beside the player from `lg` up (`f-player` t-70): a tab strip down the right-hand edge, and the drawer it opens
 * between it and the player, as a video page keeps its side panel beside the picture. BeatBreaker's Studio is the
 * precedent (its `shell/tool-rail.tsx` and `shell/tool-drawer.tsx`).
 *
 * The drawer pushes rather than covers: the player narrows and the panel refits, so nothing on it is hidden while a
 * region is open. Every region is rendered all the time, the closed ones `hidden`, so a closed one keeps its state (the
 * tutor goes on streaming, the lesson's step stays lit) and is out of the accessibility tree. Below `lg` the same
 * regions are bottom sheets instead (t-66), and none of this is drawn.
 */

import { useEffect, useRef } from 'react';
import type { ComponentType, ReactNode, RefObject } from 'react';
import { BookOpen, GraduationCap, ScanSearch, Sparkles, X } from 'lucide-react';

export type SideId = 'library' | 'lesson' | 'inspector' | 'tutor';

/** The regions, in the strip's order. Sounds is the library's tab name: My sounds and the library sounds are in it. */
export const SIDES: readonly {
  id: SideId;
  label: string;
  title: string;
  Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}[] = [
  { id: 'library', label: 'Sounds', title: 'Sounds', Icon: BookOpen },
  { id: 'lesson', label: 'Lesson', title: 'Lesson', Icon: GraduationCap },
  { id: 'inspector', label: 'Inspect', title: 'Control inspector', Icon: ScanSearch },
  { id: 'tutor', label: 'Tutor', title: 'Tutor', Icon: Sparkles },
];

export function SideRail({
  open,
  onToggle,
  tabRefs,
}: {
  open: SideId | null;
  onToggle: (id: SideId) => void;
  /** So the drawer can hand focus back to the tab that opened it when it closes. */
  tabRefs: RefObject<Partial<Record<SideId, HTMLButtonElement | null>>>;
}) {
  return (
    <nav className="kys-rail" aria-label="Side panels">
      {SIDES.map(({ id, label, Icon }) => (
        <button
          key={id}
          ref={(el) => {
            tabRefs.current[id] = el;
          }}
          type="button"
          className={open === id ? 'is-open' : undefined}
          aria-expanded={open === id}
          aria-controls="kys-drawer"
          onClick={() => onToggle(id)}
        >
          <Icon size={19} aria-hidden={true} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function SideDrawer({
  open,
  onClose,
  panes,
}: {
  open: SideId | null;
  /** Closes the drawer; the page puts focus back on the tab. */
  onClose: () => void;
  panes: Record<SideId, ReactNode>;
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
  const side = SIDES.find((s) => s.id === open);
  return (
    <aside
      ref={ref}
      id="kys-drawer"
      className="kys-drawer"
      aria-label={side ? `${side.title} drawer` : 'Side panel'}
      hidden={!open}
    >
      <div className="kys-drawer-head">
        {/* Not a heading: each region carries its own, and the drawer is named by its label. */}
        <p className="kys-drawer-title">{side?.label}</p>
        <button
          type="button"
          className="kys-pbtn"
          aria-label={`Close the ${side?.label ?? ''} drawer`}
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      {SIDES.map(({ id }) => (
        <div
          key={id}
          hidden={open !== id}
          className={`kys-drawer-body kys-scroll ${id === 'tutor' ? 'is-fill' : ''}`}
        >
          {panes[id]}
        </div>
      ))}
    </aside>
  );
}
