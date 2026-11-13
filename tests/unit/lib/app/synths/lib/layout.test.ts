/**
 * Layout tests: a long panel cut into modules and stacked like a case (modular), or cut into pieces and put down on
 * one faceplate with what no piece cuts left out (compact), and the one selector every panel surface draws through.
 *
 * The expected positions are worked out by hand from the layout constants (plate margins 26 top / 30 bottom / 12
 * sides, 8 between modules, 26 between rows, 22 case border, blanks only for a row at least 200 short).
 *
 * @see lib/app/synths/lib/layout.ts
 */
import { describe, expect, it } from 'vitest';
import { compactDef, layoutDef, layoutKind, modularDef } from '@/lib/app/synths/lib/layout';
import type {
  CompactLayout,
  Control,
  Jack,
  ModularLayout,
  SynthDef,
} from '@/lib/app/synths/contract';
import { getSynthDef } from '@/lib/app/synths/defs';
import { makeMiniD } from '@/tests/fixtures/synths/mini-d';

/** Two rows: [osc | mixer] (300 short of the widest row → a blank), then [mod/filter (named) | patch bay]. */
const SPEC: ModularLayout = {
  brand: 'MINI-D',
  rows: [
    [{ cut: [0, 0, 300, 400] }, { cut: [300, 0, 500, 400] }],
    [{ cut: [500, 0, 1000, 400], name: 'MODIFIERS' }, { cut: [1000, 0, 1300, 400] }],
  ],
};

const find = <T extends { id: string }>(list: T[], id: string): T => {
  const x = list.find((i) => i.id === id);
  if (!x) throw new Error(`no ${id}`);
  return x;
};

describe('modularDef', () => {
  it('returns the definition itself when it has no modular spec', () => {
    const def = makeMiniD();
    expect(modularDef(def)).toBe(def);
  });

  it('sizes the case from the widest row and stacks the rows', () => {
    const m = modularDef(makeMiniD({ modular: SPEC }));

    // row 2: 22 + (500+24) + (300+24) + 8 = 878, plus the border → 900 wide
    // two rows of 400 + 56 plate margin, one 26 gap, 22 border top and bottom → 982 high
    expect(m.view).toEqual({ w: 900, h: 982 });
    expect(m.theme.cheeks).toBe('none');
  });

  it('describes the case: one plate per module, a blank for the short row, the brand', () => {
    const m = modularDef(makeMiniD({ modular: SPEC }));

    expect(m.layout?.kind).toBe('modular');
    expect(m.layout?.brand).toBe('MINI-D');
    expect(m.layout?.plates).toEqual([
      { x: 22, y: 22, w: 324, h: 456, name: undefined },
      { x: 354, y: 22, w: 224, h: 456, name: undefined },
      { x: 22, y: 504, w: 524, h: 456, name: 'MODIFIERS' },
      { x: 554, y: 504, w: 324, h: 456, name: undefined },
    ]);
    expect(m.layout?.blanks).toEqual([{ x: 586, y: 22, w: 292, h: 456 }]);
  });

  it('falls back to the synth name for the brand', () => {
    const m = modularDef(makeMiniD({ modular: { rows: SPEC.rows, brand: '' } }));
    expect(m.layout?.brand).toBe('Mini D');
  });

  it('spreads a row that is only a little short over its modules instead of adding a blank', () => {
    const spec: ModularLayout = {
      brand: 'X',
      rows: [
        [{ cut: [0, 0, 500, 400] }, { cut: [500, 0, 1000, 400] }],
        [{ cut: [1000, 0, 1300, 400] }, { cut: [0, 0, 0, 0] }],
      ],
    };
    const m = modularDef(
      makeMiniD({ modular: spec, controls: [], jacks: [], decor: [], areas: [] })
    );

    // row 1 ends at 22 + 524 + 524 + 8 = 1078; row 2 at 22 + 324 + 24 + 8 = 378 → 700 short: a blank
    expect(m.layout?.blanks).toHaveLength(1);
    const narrow: ModularLayout = {
      brand: 'X',
      rows: [[{ cut: [0, 0, 500, 400] }], [{ cut: [0, 0, 400, 400] }]],
    };
    const n = modularDef(
      makeMiniD({ modular: narrow, controls: [], jacks: [], decor: [], areas: [] })
    );
    // 100 short: spread, so both plates come out the full width and there is no blank
    expect(n.layout?.blanks).toEqual([]);
    expect(n.layout?.plates.map((p) => p.w)).toEqual([524, 524]);
  });

  it('moves every control, option, jack and area into its module, keeping ids and values', () => {
    const def = makeMiniD({ modular: SPEC });
    const m = modularDef(def);

    // mix.osc1 (400, 80) is in the second module of row 1: dx = 354 + 12 − 300, dy = 22 + 26
    expect(find<Control>(m.controls, 'mix.osc1')).toMatchObject({
      x: 466,
      y: 128,
      kind: 'cont',
      def: 10,
    });
    // osc2.wave's option buttons move with the first module (dx = 34, dy = 48)
    const select = find<Control>(m.controls, 'osc2.wave');
    expect(select.kind === 'enum' && select.options.map((o) => [o.x, o.y])).toEqual([
      [174, 248],
      [214, 248],
    ]);
    // lfo.tri (1030, 40) is in the patch bay, row 2: dx = 554 + 12 − 1000, dy = 504 + 26
    expect(find<Jack>(m.jacks, 'lfo.tri')).toMatchObject({ x: 596, y: 570, signal: 'lfoTri' });
    expect(find(m.areas, 'mod').rects).toEqual([
      { x: 334, y: 530, w: 200, h: 250 },
      { x: 334, y: 780, w: 200, h: 150 },
    ]);
    expect(m.init).toBe(def.init);
    expect(m.toEngine).toBe(def.toEngine);
  });

  it('moves decor: whole frames, split rects, clipped lines, shifted paths, points', () => {
    const m = modularDef(makeMiniD({ modular: SPEC }));
    const frames = m.decor.filter((d) => d.t === 'frame');
    const rects = m.decor.filter((d) => d.t === 'rect');
    const paths = m.decor.filter((d) => d.t === 'path');
    const texts = m.decor.filter((d) => d.t === 'text');

    expect(frames).toEqual([
      { t: 'frame', x: 44, y: 58, w: 280, h: 380, label: 'OSCILLATOR BANK' },
    ]);
    // the bottom strip crosses all four cuts: four pieces, each squared off
    expect(rects).toHaveLength(4);
    expect(rects.every((r) => r.r === 0)).toBe(true);
    expect(paths).toEqual([{ t: 'path', d: 'M820 260 H980', shift: [-466, 530] }]);
    expect(texts).toEqual([{ t: 'text', x: 466, y: 78, text: 'MIXER' }]);
    // the line at x = 500 sits on the edge of two cuts
    const lines = m.decor.filter((d) => d.t === 'line');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatchObject({ x1: 566, y1: 48, x2: 566, y2: 448 });
  });

  it('drops a line that misses every module', () => {
    const base = makeMiniD();
    const m = modularDef(
      makeMiniD({
        modular: SPEC,
        decor: [
          { t: 'line', x1: -50, y1: 10, x2: -10, y2: 10 },
          { t: 'line', x1: 50, y1: 500, x2: 50, y2: 600 },
          { t: 'line', x1: 10, y1: 10, x2: 10, y2: 10 },
        ],
        controls: base.controls,
      })
    );

    // only the zero-length line inside the first cut survives
    expect(m.decor).toEqual([{ t: 'line', x1: 44, y1: 58, x2: 44, y2: 58 }]);
  });

  it('returns the same object for the same definition', () => {
    const def = makeMiniD({ modular: SPEC });
    expect(modularDef(def)).toBe(modularDef(def));
  });

  it('throws when a control sits in no module', () => {
    const def: SynthDef = makeMiniD({
      modular: { brand: 'X', rows: [[{ cut: [0, 0, 300, 400] }]] },
    });

    expect(() => modularDef(def)).toThrow(
      /^mini-d modular: control mix\.osc1 at 400,80 is in no module$/
    );
  });
});

/**
 * The panel without its bottom strip (y 380..400, no controls), and the patch bay moved under the rest: the first piece
 * stays where it is, the second (the patch bay to y 320) is put down at (0, 380).
 */
const COMPACT: CompactLayout = {
  pieces: [
    { cut: [0, 0, 1000, 380], at: [0, 0] },
    { cut: [1000, 0, 1300, 320], at: [0, 380] },
  ],
};
const NO_CHEEKS = {
  panel: '#222',
  panel2: '#111',
  ink: '#eee',
  font: 'din',
  cheeks: 'none',
} as const;

describe('compactDef', () => {
  it('returns the definition itself when it has no compact spec', () => {
    const def = makeMiniD();
    expect(compactDef(def)).toBe(def);
  });

  it('sizes the faceplate to the box round the pieces as they are put down, with no case', () => {
    const m = compactDef(makeMiniD({ compact: COMPACT, theme: NO_CHEEKS }));

    // the first piece is 1000 wide and the widest; the second ends at 380 + 320
    expect(m.view).toEqual({ w: 1000, h: 700 });
    expect(m.layout).toBeUndefined();
    expect(m.theme).toEqual(NO_CHEEKS);
  });

  it('places each cut, keeping ids, values and areas', () => {
    const def = makeMiniD({ compact: COMPACT, theme: NO_CHEEKS });
    const m = compactDef(def);

    // mix.osc1 is in the first piece, which stays put
    expect(find<Control>(m.controls, 'mix.osc1')).toMatchObject({ x: 400, y: 80, def: 10 });
    const select = find<Control>(m.controls, 'osc2.wave');
    expect(select.kind === 'enum' && select.options.map((o) => [o.x, o.y])).toEqual([
      [140, 200],
      [180, 200],
    ]);
    // lfo.tri (1030, 40) is in the patch bay: dx = 0 − 1000, dy = 380 − 0
    expect(find<Jack>(m.jacks, 'lfo.tri')).toMatchObject({ x: 30, y: 420, signal: 'lfoTri' });
    expect(m.controls.map((c) => c.id)).toEqual(def.controls.map((c) => c.id));
    expect(m.jacks.map((j) => j.id)).toEqual(def.jacks.map((j) => j.id));
    // the patch bay's area keeps the part its piece cut (y 0..320), moved with it
    expect(find(m.areas, 'patch').rects).toEqual([{ x: 0, y: 380, w: 300, h: 320 }]);
    // and an area crossing a piece's edge keeps only the part inside it
    expect(find(m.areas, 'mod').rects).toEqual([
      { x: 800, y: 0, w: 200, h: 250 },
      { x: 800, y: 250, w: 200, h: 130 },
    ]);
    expect(m.init).toBe(def.init);
    expect(m.toEngine).toBe(def.toEngine);
  });

  it('leaves out the decor no piece cuts', () => {
    const m = compactDef(makeMiniD({ compact: COMPACT, theme: NO_CHEEKS }));

    // the bottom strip (y 380..400) is in neither piece; the frame (to y 390) and the line at x = 500 are cut at the
    // first piece's foot, the frame squared off
    expect(m.decor).toEqual([
      { t: 'frame', x: 10, y: 10, w: 280, h: 370, r: 0, label: 'OSCILLATOR BANK' },
      { t: 'text', x: 400, y: 30, text: 'MIXER' },
      { t: 'line', x1: 500, y1: 0, x2: 500, y2: 380 },
      { t: 'path', d: 'M820 260 H980', shift: [0, 0] },
    ]);
  });

  it('puts the pieces down inside the end cheeks and keeps them', () => {
    const theme = { ...NO_CHEEKS, cheeks: 'wood', cheekW: 30 } as const;
    const m = compactDef(makeMiniD({ compact: COMPACT, theme }));

    expect(m.view).toEqual({ w: 1060, h: 700 });
    expect(m.theme).toEqual(theme);
    expect(find<Control>(m.controls, 'mix.osc1')).toMatchObject({ x: 430, y: 80 });
    expect(find<Jack>(m.jacks, 'lfo.tri')).toMatchObject({ x: 60, y: 420 });
  });

  it('throws when two pieces are put down over each other', () => {
    const def = makeMiniD({
      theme: NO_CHEEKS,
      compact: {
        pieces: [
          { cut: [0, 0, 1000, 380], at: [0, 0] },
          { cut: [1000, 0, 1300, 320], at: [900, 0] },
        ],
      },
    });
    expect(() => compactDef(def)).toThrow(/^mini-d compact: pieces 0 and 1 overlap$/);
  });

  it('throws when two pieces cut the same part of the long panel', () => {
    const def = makeMiniD({
      theme: NO_CHEEKS,
      compact: {
        pieces: [
          { cut: [0, 0, 1000, 380], at: [0, 0] },
          { cut: [900, 0, 1300, 320], at: [0, 380] },
        ],
      },
    });
    expect(() => compactDef(def)).toThrow(
      /^mini-d compact: pieces 0 and 1 cut the same part of the panel$/
    );
  });

  it('throws when a piece is put down left of or above the faceplate', () => {
    const at = (x: number, y: number) =>
      makeMiniD({
        theme: NO_CHEEKS,
        compact: { pieces: [COMPACT.pieces[0], { cut: [1000, 0, 1300, 320], at: [x, y] }] },
      });
    expect(() => compactDef(at(-20, 380))).toThrow(
      /^mini-d compact: piece 1 is put down outside the faceplate, at -20,380$/
    );
    expect(() => compactDef(at(0, -1))).toThrow(/piece 1 is put down outside the faceplate/);
  });

  it('moves a mark by the piece its centre is in, and drops one in no piece', () => {
    const mark = (id: string, x: number, y: number) => ({
      id,
      name: id,
      help: 'A mark.',
      module: 'osc' as const,
      rect: { x, y, w: 20, h: 10 },
    });
    const m = compactDef(
      makeMiniD({
        theme: NO_CHEEKS,
        compact: COMPACT,
        marks: [mark('logo', 1020, 30), mark('strip', 400, 385)],
      })
    );
    // the patch bay piece: dx = −1000, dy = +380
    expect(m.marks).toEqual([mark('logo', 20, 410)]);
  });

  it('moves the pin matrix with its piece, and throws when it runs out of it', () => {
    const matrix = (x: number) => ({
      x,
      y: 40,
      pitch: 20,
      rows: ['a', 'b'],
      cols: ['c', 'd', 'e'],
      legend: { row: [10, 10] as [number, number], col: [10, 10] as [number, number] },
    });
    const m = compactDef(makeMiniD({ theme: NO_CHEEKS, compact: COMPACT, matrix: matrix(1100) }));
    expect(m.matrix).toMatchObject({ x: 100, y: 420 });
    // its far column (980 + 2 × 20 = 1020) is in the patch bay piece, its first hole in the first
    expect(() =>
      compactDef(makeMiniD({ theme: NO_CHEEKS, compact: COMPACT, matrix: matrix(980) }))
    ).toThrow(/^mini-d compact: the matrix runs out of its piece at 1020,60$/);
  });

  it('throws when a control sits in no piece', () => {
    const def = makeMiniD({
      theme: NO_CHEEKS,
      compact: { pieces: [{ cut: [0, 0, 300, 400], at: [0, 0] }] },
    });
    expect(() => compactDef(def)).toThrow(
      /^mini-d compact: control mix\.osc1 at 400,80 is in no piece$/
    );
  });

  it('returns the same object for the same definition', () => {
    const def = makeMiniD({ compact: COMPACT });
    expect(compactDef(def)).toBe(compactDef(def));
  });
});

describe('layoutDef and layoutKind', () => {
  it('draws a synth with no layout of its own as defined, either way', () => {
    const def = makeMiniD();
    expect(layoutKind(def)).toBeNull();
    expect(layoutDef(def)).toBe(def);
    expect(layoutDef(def, true)).toBe(def);
  });

  it('opens a modular synth in its case, and Long is the faceplate as defined', () => {
    const def = makeMiniD({ modular: SPEC });
    expect(layoutKind(def)).toBe('modular');
    expect(layoutDef(def)).toBe(modularDef(def));
    expect(layoutDef(def, true)).toBe(def);
  });

  it('opens a compact synth compact, and Long is the full faceplate', () => {
    const def = makeMiniD({ compact: COMPACT });
    expect(layoutKind(def)).toBe('compact');
    expect(layoutDef(def)).toBe(compactDef(def));
    expect(layoutDef(def, true)).toBe(def);
  });
});

describe('the Grandmother, compact (t-229)', () => {
  const full = getSynthDef('grandmother')!;
  const compact = layoutDef(full);

  it('opens compact, shorter than the full faceplate', () => {
    expect(layoutKind(full)).toBe('compact');
    expect(compact.view.h).toBeLessThan(full.view.h);
    expect(compact.view.w / compact.view.h).toBeGreaterThan(full.view.w / full.view.h);
  });

  it('leaves the keys out', () => {
    const keys = (d: SynthDef) =>
      d.decor.filter((x) => x.t === 'rect' && (x.fill === '#f4f4f0' || x.fill === '#111113'));
    expect(keys(full).length).toBeGreaterThan(19);
    expect(keys(compact)).toEqual([]);
  });

  it('keeps GLIDE and PLAY / HOLD / TAP on the panel, in their own areas', () => {
    for (const [id, area] of [
      ['glide', 'glide'],
      ['arp.play', 'lhc'],
      ['arp.hold', 'lhc'],
      ['arp.tap', 'lhc'],
    ] as const) {
      const c = find<Control>(compact.controls, id);
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(compact.view.w);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(compact.view.h);
      const r = find(compact.areas, area).rects;
      expect(r.some((q) => c.x >= q.x && c.x <= q.x + q.w && c.y >= q.y && c.y <= q.y + q.h)).toBe(
        true
      );
    }
  });
});
