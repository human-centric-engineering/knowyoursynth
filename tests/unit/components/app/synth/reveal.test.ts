// @vitest-environment happy-dom

/**
 * Keeping a lesson step's controls in view above the Lesson sheet (`f-phone-and-tablet` t-66).
 *
 * @see components/app/synth/reveal.ts
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { revealDelta, revealOnPanel, screenBox } from '@/components/app/synth/reveal';
import { controlMap, jackMap } from '@/lib/app/synths/lib/patch';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';

const def = getSynthDef('model-d');
if (!def) throw new Error('model-d is not registered');

/** Half size, moved 10 px right and 500 px down: a panel scaled to a phone, below the fold. */
const CTM = { a: 0.5, b: 0, c: 0, d: 0.5, e: 10, f: 500 };

beforeAll(async () => {
  await loadSynthDef('model-d');
  class Point {
    constructor(
      public x = 0,
      public y = 0
    ) {}
    matrixTransform(m: typeof CTM) {
      return { x: this.x * m.a + m.e, y: this.y * m.d + m.f };
    }
  }
  Object.assign(globalThis, { DOMPoint: Point });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const svgWith = (ctm: typeof CTM | null) =>
  Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'svg'), {
    getScreenCTM: () => ctm,
  });

describe('revealDelta', () => {
  it('is 0 for a span already inside the band', () => {
    expect(revealDelta({ start: 100, end: 200 }, { start: 0, end: 400 })).toBe(0);
  });

  it('brings a span below the band up to its end, and one above it down to its start', () => {
    expect(revealDelta({ start: 500, end: 600 }, { start: 0, end: 400 })).toBe(200);
    expect(revealDelta({ start: -50, end: 50 }, { start: 0, end: 400 })).toBe(-50);
  });

  it('lines a span too big for the band up with its start', () => {
    expect(revealDelta({ start: 300, end: 900 }, { start: 0, end: 400 })).toBe(300);
  });
});

describe('screenBox', () => {
  it('boxes the controls and jacks named, through the panel’s transform, with room round them', () => {
    const c = controlMap(def)['filter.cutoff'];
    const j = jackMap(def)['j.cutCv'];
    if (!c || !j) throw new Error('the Model D has no filter.cutoff or j.cutCv');
    const box = screenBox(svgWith(CTM), def, ['filter.cutoff', 'j.cutCv', 'not-a-control']);
    const xs = [c.x, j.x].map((x) => x * 0.5 + 10);
    const ys = [c.y, j.y].map((y) => y * 0.5 + 500);
    expect(box).toEqual({
      x: { start: Math.min(...xs) - 24, end: Math.max(...xs) + 24 },
      y: { start: Math.min(...ys) - 24, end: Math.max(...ys) + 24 },
    });
  });

  it('is null when nothing named is drawn, or the panel has no transform yet', () => {
    expect(screenBox(svgWith(CTM), def, ['nothing'])).toBeNull();
    expect(screenBox(svgWith(null), def, ['filter.cutoff'])).toBeNull();
  });
});

describe('revealOnPanel', () => {
  it('scrolls the page so the controls sit above the sheet, and the panel’s scroller to bring them across', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const scroller = document.createElement('div');
    scroller.scrollBy = vi.fn();
    // the scroller shows only its first 100 px across
    scroller.getBoundingClientRect = () => ({ left: 0, right: 100 }) as DOMRect;
    const c = controlMap(def)['filter.cutoff'];
    if (!c) throw new Error('the Model D has no filter.cutoff');
    const y = c.y * 0.5 + 500;
    const x = c.x * 0.5 + 10;

    revealOnPanel({ svg: svgWith(CTM), scroller, def, ids: ['filter.cutoff'], sheetTop: 400 });

    expect(scrollBy).toHaveBeenCalledWith({ top: y + 24 - 400, behavior: 'smooth' });
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: x + 24 - 100, behavior: 'smooth' });
  });

  it('leaves the page where it is when the controls are already in view', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    revealOnPanel({
      svg: svgWith({ ...CTM, f: 100, d: 0.01 }),
      scroller: null,
      def,
      ids: ['filter.cutoff'],
      sheetTop: 400,
    });
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
