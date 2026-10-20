/**
 * Keep what a lesson step points at in view while the Lesson sheet covers the bottom of a small screen
 * (`f-phone-and-tablet` t-66).
 *
 * The sheet is docked at half height, so the panel above it stays live. When the step changes, or the sheet opens, the
 * page scrolls so the step's controls sit in the band between the top of the screen and the top of the sheet, and the
 * panel's own scroller (when it is zoomed) scrolls them into its width.
 */

import { controlMap, jackMap } from '@/lib/app/synths/lib/patch';
import type { SynthDef } from '@/lib/app/synths/contract';

/** Room left round the controls, in px. */
const PAD = 24;

export interface Span {
  start: number;
  end: number;
}

/**
 * How far to scroll so `span` sits inside `band`: 0 when it already does. A span too big for the band lines up with
 * the band's start.
 */
export function revealDelta(span: Span, band: Span): number {
  if (span.end - span.start > band.end - band.start || span.start < band.start)
    return span.start - band.start;
  if (span.end > band.end) return span.end - band.end;
  return 0;
}

/** Where the given controls and jacks are on screen, as one box; `null` if none is drawn. */
export function screenBox(
  svg: SVGSVGElement,
  def: SynthDef,
  ids: string[]
): { x: Span; y: Span } | null {
  const ctm = svg.getScreenCTM?.();
  if (!ctm) return null;
  const cm = controlMap(def);
  const jm = jackMap(def);
  const points = ids.flatMap((id) => {
    const item = cm[id] ?? jm[id];
    if (!item) return [];
    const p = new DOMPoint(item.x, item.y).matrixTransform(ctm);
    return [{ x: p.x, y: p.y }];
  });
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: { start: Math.min(...xs) - PAD, end: Math.max(...xs) + PAD },
    y: { start: Math.min(...ys) - PAD, end: Math.max(...ys) + PAD },
  };
}

/**
 * Scroll the step's controls into the band above the sheet. `sheetTop` is the sheet's top edge, in px from the top of
 * the screen.
 */
export function revealOnPanel(opts: {
  svg: SVGSVGElement;
  scroller: HTMLElement | null;
  def: SynthDef;
  ids: string[];
  sheetTop: number;
}): void {
  const { svg, scroller, def, ids, sheetTop } = opts;
  const box = screenBox(svg, def, ids);
  if (!box) return;
  if (scroller) {
    const r = scroller.getBoundingClientRect();
    const dx = revealDelta(box.x, { start: r.left, end: r.right });
    if (dx) scroller.scrollBy({ left: dx, behavior: 'smooth' });
  }
  const dy = revealDelta(box.y, { start: 0, end: sheetTop });
  if (dy) window.scrollBy({ top: dy, behavior: 'smooth' });
}
