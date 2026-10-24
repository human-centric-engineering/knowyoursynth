'use client';

/**
 * How big the panel is drawn: fitted to the page, a little smaller, or zoomed in and scrolled (`f-phone-and-tablet`).
 *
 * The panel's SVG fills its frame, so zooming widens the frame inside the horizontal scroller around it. The panel is
 * laid out bigger, not magnified, so its controls keep working at every size, and dragging on bare panel scrolls it.
 * The magnifier lens (`Lens` in `components/app/panel/`) is a different thing and is kept: it enlarges what is under
 * the pointer without moving the page.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { PlayerTip } from '@/components/app/synth/player-tip';

/** The sizes, as multiples of the fitted width: 90%, then fitted (100%), then up in tenths to 200%. */
export const PANEL_SCALES = [0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2] as const;
/** The fitted size, which the middle of the zoom control goes back to. */
const FIT: PanelScale = 1;
export type PanelScale = (typeof PANEL_SCALES)[number];

/** The widest the fitted panel is drawn, unless `--kys-fit-max` says otherwise (full screen lifts it). */
const MAX_FIT = 'var(--kys-fit-max, 1560px)';
/**
 * The narrowest that fitting to the screen's height draws a panel, where the page is that wide. A tall panel (the
 * ARP 2600) fitted to the height would be too small to read and work, so below this it overflows and the page scrolls.
 */
const MIN_FIT_PX = 1100;

/**
 * The panel frame's width at a scale. Fitted, it is the scroller's width, up to 1560 px (or `--kys-fit-max`: the
 * whole width, full screen), and kept short enough to fit the screen's height. Zoomed, it is that width times the
 * scale.
 *
 * The height it fits is the screen's less `--kys-fit-chrome`, which the page sets from `lg` up to what is above the
 * panel and the dock pinned under it (t-74). Without it, the panel may take 82% of the screen's height. Fitting to the
 * height never draws it narrower than `MIN_FIT_PX`: a tall panel is drawn at a working size and scrolled instead.
 */
export function panelFrameStyle(
  view: { w: number; h: number } | null,
  scale: PanelScale
): CSSProperties {
  const cap = view
    ? `min(${MAX_FIT}, max(${MIN_FIT_PX}px, calc((100vh - var(--kys-fit-chrome, 18vh)) * ${(view.w / view.h).toFixed(4)})))`
    : MAX_FIT;
  return { width: `calc(${scale} * min(100%, ${cap}))` };
}

/**
 * The panel's rails' width at a scale: the frame's, so they grow and shrink with it when it is zoomed, but never wider
 * than the screen gives them. They are outside the scroller, so a panel wider than that scrolls under them.
 */
export function panelRailStyle(
  view: { w: number; h: number } | null,
  scale: PanelScale
): CSSProperties {
  return { width: `min(100%, ${String(panelFrameStyle(view, scale).width)})` };
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

/** A scale as a percentage, rounded, so 1.1 reads 110% rather than 110.00000000000001%. */
const percent = (s: PanelScale) => `${Math.round(s * 100)}%`;

/** Zoom out, back to fit, and zoom in, a tenth at a time. */
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
      <PlayerTip name="Zoom out" help="Draw the panel smaller.">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={i === 0}
          onClick={() => onScale(PANEL_SCALES[i - 1])}
          className={btn}
        >
          −
        </button>
      </PlayerTip>
      <PlayerTip
        name="Zoom"
        help={
          scale === FIT
            ? 'The panel is fitted to the page. Use − and + to draw it smaller or bigger.'
            : `Drawn at ${percent(scale)} now. Click to fit it to the page again.`
        }
      >
        <button
          type="button"
          aria-label="Fit the panel to the page"
          aria-pressed={scale === FIT}
          onClick={() => onScale(FIT)}
          className={`${btn} min-w-14 font-mono text-xs`}
        >
          {scale === FIT ? 'Zoom' : percent(scale)}
        </button>
      </PlayerTip>
      <PlayerTip
        name="Zoom in"
        help="Draw the panel bigger, every control still working. Scroll it sideways."
      >
        <button
          type="button"
          aria-label="Zoom in"
          disabled={i === PANEL_SCALES.length - 1}
          onClick={() => onScale(PANEL_SCALES[i + 1])}
          className={btn}
        >
          +
        </button>
      </PlayerTip>
    </div>
  );
}
