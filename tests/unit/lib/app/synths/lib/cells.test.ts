/**
 * Panel cells tests: each area split into one cell per control (and per patched or patch-bay jack).
 *
 * @see lib/app/synths/lib/cells.ts
 */
import { describe, expect, it } from 'vitest';
import { panelCells } from '@/lib/app/synths/lib/cells';
import type { Control, Jack } from '@/lib/app/synths/contract';
import { makeMiniD } from '@/tests/fixtures/synths/mini-d';

type Poly = [number, number][];

/** "M1 2L3 4L5 6Z M…" → polygons. */
function polygons(path: string): Poly[] {
  return path
    .split('M')
    .filter(Boolean)
    .map((part) =>
      part
        .replace('Z', '')
        .split('L')
        .map((pt): [number, number] => {
          const [x, y] = pt.trim().split(' ').map(Number);
          return [x, y];
        })
    );
}

/** Ray casting; points on an edge may go either way, so tests use points well inside. */
function inside(poly: Poly, [x, y]: [number, number]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const covers = (path: string | undefined, pt: [number, number]) =>
  !!path && polygons(path).some((p) => inside(p, pt));

describe('panelCells', () => {
  it('cuts every area out of the faceplate frame, grown into the free gutter only', () => {
    const { frame } = panelCells(makeMiniD());

    expect(frame.startsWith('M0 0H1300V400H0Z')).toBe(true);
    // the oscillator bank touches the panel edge and the mixer, so it is not grown at all
    expect(frame).toContain('M0 0v400h300v-400Z');
  });

  it('gives every control a cell, and each knob owns the panel nearest to it', () => {
    const def = makeMiniD();
    const { cells } = panelCells(def);

    for (const c of def.controls) expect(cells[c.id], c.id).toBeTruthy();
    // the three mixer knobs are stacked at y = 80, 180, 280: each owns its own band
    expect(covers(cells['mix.osc1'], [400, 80])).toBe(true);
    expect(covers(cells['mix.osc1'], [400, 280])).toBe(false);
    expect(covers(cells['mix.noise'], [400, 280])).toBe(true);
    // its printed label (above it) goes with it
    expect(covers(cells['mix.osc2'], [400, 140])).toBe(true);
  });

  it('gives every jack of a jacks-only area (a patch bay) its own cell', () => {
    const def = makeMiniD();
    const { cells } = panelCells(def);

    for (const j of def.jacks) expect(cells[j.id], j.id).toBeTruthy();
    expect(covers(cells['lfo.tri'], [1030, 40])).toBe(true);
    expect(covers(cells['lfo.tri'], [1280, 300])).toBe(false);
  });

  it('gives a jack in a section with controls a cell only while it has a cable', () => {
    const base = makeMiniD();
    const jack: Jack = {
      id: 'mix.ext',
      x: 470,
      y: 380,
      r: 10,
      label: 'EXT',
      help: '',
      dir: 'in',
      dest: 'extIn',
    };
    const def = makeMiniD({ jacks: [...base.jacks, jack] });

    expect(panelCells(def).cells['mix.ext']).toBeUndefined();
    const patched = panelCells(def, ['mix.ext']).cells;
    expect(patched['mix.ext']).toBeTruthy();
    expect(covers(patched['mix.ext'], [470, 380])).toBe(true);
  });

  it('leaves a control hidden by a panel mode out while it is hidden', () => {
    const base = makeMiniD();
    const controls: Control[] = base.controls.map((c) =>
      c.id === 'mix.noise' ? { ...c, show: { id: 'mod.toOsc', eq: true } } : c
    );
    const def = makeMiniD({ controls });

    expect(
      panelCells(def, [], { ...def.init, 'mod.toOsc': false }).cells['mix.noise']
    ).toBeUndefined();
    expect(panelCells(def, [], { ...def.init, 'mod.toOsc': true }).cells['mix.noise']).toBeTruthy();
    // without values every control counts
    expect(panelCells(def).cells['mix.noise']).toBeTruthy();
  });

  it('splits a fader along its travel and a select by its buttons', () => {
    const def = makeMiniD();
    const { cells } = panelCells(def);

    // out.volume is a vertical fader of length 120 at (900, 320): both ends of its travel are its own
    expect(covers(cells['out.volume'], [900, 270])).toBe(true);
    expect(covers(cells['out.volume'], [900, 370])).toBe(true);
    // osc2.wave's buttons sit at (140, 200) and (180, 200)
    expect(covers(cells['osc2.wave'], [140, 205])).toBe(true);
    expect(covers(cells['osc2.wave'], [180, 205])).toBe(true);
  });

  it('caches by patched jacks and hidden controls', () => {
    const def = makeMiniD();
    const a = panelCells(def, ['lfo.tri', 'cutoff.in']);

    expect(panelCells(def, ['cutoff.in', 'lfo.tri'])).toBe(a);
    expect(panelCells(def, ['lfo.tri'])).not.toBe(a);
  });

  it('skips an area with nothing in it, leaving it part of the frame', () => {
    const base = makeMiniD();
    const def = makeMiniD({
      view: { w: 1600, h: 400 },
      areas: [
        ...base.areas,
        {
          id: 'blank',
          label: 'Blank',
          module: 'util',
          keywords: '',
          rects: [{ x: 1400, y: 0, w: 100, h: 100 }],
          help: '',
        },
      ],
    });
    const { frame } = panelCells(def);

    expect(frame).not.toContain('M1400');
    expect(frame).not.toContain('M1384');
  });
});
