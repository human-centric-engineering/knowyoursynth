/**
 * Modular layout tests: a long panel cut into modules and stacked like a case.
 *
 * The expected positions are worked out by hand from the layout constants (plate margins 26 top / 30 bottom / 12
 * sides, 8 between modules, 26 between rows, 22 case border, blanks only for a row at least 200 short).
 *
 * @see lib/app/synths/lib/layout.ts
 */
import { describe, expect, it } from 'vitest';
import { modularDef } from '@/lib/app/synths/lib/layout';
import type { Control, Jack, ModularLayout, SynthDef } from '@/lib/app/synths/contract';
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
