'use client';

/**
 * How big the panel is drawn: fitted to the page, or zoomed in and scrolled (`f-phone-and-tablet`).
 *
 * The panel's SVG fills its frame, so zooming widens the frame inside the horizontal scroller around it. The panel is
 * laid out bigger, not magnified, so its controls keep working at every size, and dragging on bare panel scrolls it.
 * The magnifier lens (`Lens` in `components/app/panel/`) is a different thing and is kept: it enlarges what is under
 * the pointer without moving the page.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';

/** The sizes, as multiples of the fitted width. The first is "Fit". */
export const PANEL_SCALES = [1, 1.5, 2, 3] as const;
export type PanelScale = (typeof PANEL_SCALES)[number];

/** The widest the fitted panel is drawn. */
const MAX_FIT_PX = 1560;

/**
 * The panel frame's width at a scale. Fitted, it is the scroller's width, up to 1560 px; a synth with its own layout
 * is also kept short enough to fit the screen's height. Zoomed, it is that width times the scale.
 */
export function panelFrameStyle(
  view: { w: number; h: number } | null,
  scale: PanelScale
): CSSProperties {
  const cap = view
    ? `min(${MAX_FIT_PX}px, ${((82 * view.w) / view.h).toFixed(1)}vh)`
    : `${MAX_FIT_PX}px`;
  return { width: `calc(${scale} * min(100%, ${cap}))` };
}

/** The scroller's ref, keeping the middle of what is in view in the middle when the scale changes. */
export function useKeepCentre(scale: PanelScale): RefObject<HTMLDivElement | null> {
  const scroller = useRef<HTMLDivElement>(null);
  const last = useRef(scale);
  // Where the view was scrolled to at the old scale. Read from scroll events, not at the change: by then the panel has
  // been laid out at the new size, and zooming out has already pulled a view near the right edge back in.
  const left = useRef(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    left.current = el.scrollLeft;
    const onScroll = () => {
      left.current = el.scrollLeft;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    const el = scroller.current;
    const from = last.current;
    last.current = scale;
    if (!el || from === scale) return;
    // The frame is centred while it is narrower than the scroller, so the middle is measured from its left edge. It
    // has already been laid out at the new scale; its width is in proportion, so the old one follows.
    const frame = el.firstElementChild;
    const width = frame instanceof HTMLElement ? frame.offsetWidth : null;
    const gap = (w: number | null) => (w === null ? 0 : Math.max(0, (el.clientWidth - w) / 2));
    const was = width === null ? null : (width * from) / scale;
    const mid = left.current + el.clientWidth / 2 - gap(was);
    const to = Math.max(0, gap(width) + (mid * scale) / from - el.clientWidth / 2);
    el.scrollTo({ left: to });
    // Where the browser will stop, not past it: a scroll that ends where it already was sends no event to correct it.
    left.current = Math.min(to, Math.max(0, el.scrollWidth - el.clientWidth));
  }, [scale]);
  return scroller;
}

/** Zoom out, back to fit, and zoom in. */
export function PanelZoom({
  scale,
  onScale,
  className = '',
}: {
  scale: PanelScale;
  onScale: (s: PanelScale) => void;
  className?: string;
}) {
  const i = PANEL_SCALES.indexOf(scale);
  const btn =
    'flex h-8 min-w-8 items-center justify-center rounded px-2 font-semibold text-(--kys-muted) hover:text-(--kys-text) disabled:opacity-40 disabled:hover:text-(--kys-muted)';
  return (
    <div
      className={`flex shrink-0 items-center rounded-md border border-(--kys-line) bg-(--kys-surface) p-0.5 ${className}`}
      role="group"
      aria-label="Panel size"
    >
      <button
        type="button"
        aria-label="Zoom out"
        disabled={i === 0}
        onClick={() => onScale(PANEL_SCALES[i - 1])}
        className={btn}
      >
        −
      </button>
      <button
        type="button"
        aria-label="Fit the panel to the page"
        aria-pressed={i === 0}
        onClick={() => onScale(PANEL_SCALES[0])}
        className={`${btn} min-w-12 font-mono text-xs`}
      >
        {i === 0 ? 'Fit' : `${scale * 100}%`}
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        disabled={i === PANEL_SCALES.length - 1}
        onClick={() => onScale(PANEL_SCALES[i + 1])}
        className={btn}
      >
        +
      </button>
    </div>
  );
}
