import { describe, expect, it } from 'vitest';

import type { Control, SelectControl } from '@/lib/app/synths/contract';
import { matrixClick, pointToShow, withPick } from '@/lib/app/synths/lib/matrix-points';
import microfreak from '@/lib/app/synths/defs/microfreak';

const found = microfreak.controls.find((c) => c.id === 'mx.sel');
if (found?.type !== 'select') throw new Error('the MicroFreak has no matrix select');
const sel: SelectControl = found;
const option = (v: string) => {
  const o = sel.options.find((x) => x.v === v);
  if (!o) throw new Error(`no point ${v}`);
  return o;
};

describe('matrixClick on the MicroFreak matrix', () => {
  it('switches an unlit point on at +50 and picks it', () => {
    expect(
      matrixClick(sel, option('lfo.pitch'), { 'mx.sel': 'cycenv.pitch', 'mx.lfo.pitch': 0 })
    ).toEqual([
      { id: 'mx.lfo.pitch', value: 50 },
      { id: 'mx.sel', value: 'lfo.pitch' },
    ]);
  });

  it('picks a lit point without changing its amount', () => {
    expect(
      matrixClick(sel, option('lfo.pitch'), { 'mx.sel': 'cycenv.pitch', 'mx.lfo.pitch': -30 })
    ).toEqual([{ id: 'mx.sel', value: 'lfo.pitch' }]);
  });

  it('switches the picked point off when it is lit, and keeps it picked', () => {
    expect(
      matrixClick(sel, option('lfo.pitch'), { 'mx.sel': 'lfo.pitch', 'mx.lfo.pitch': 70 })
    ).toEqual([{ id: 'mx.lfo.pitch', value: 0 }]);
  });

  it('switches the picked point back on when it is unlit', () => {
    expect(
      matrixClick(sel, option('lfo.pitch'), { 'mx.sel': 'lfo.pitch', 'mx.lfo.pitch': 0 })
    ).toEqual([
      { id: 'mx.lfo.pitch', value: 50 },
      { id: 'mx.sel', value: 'lfo.pitch' },
    ]);
  });

  it('treats Env > Cutoff as the Filter Amt knob', () => {
    expect(option('env.cutoff').point).toBe('env.filter_amt');
    expect(
      matrixClick(sel, option('env.cutoff'), { 'mx.sel': 'env.cutoff', 'env.filter_amt': 20 })
    ).toEqual([{ id: 'env.filter_amt', value: 0 }]);
  });

  it('only picks on a select that is not a matrix', () => {
    const plain: SelectControl = { ...sel, matrix: undefined };
    expect(matrixClick(plain, option('lfo.pitch'), { 'mx.lfo.pitch': 0 })).toEqual([
      { id: 'mx.sel', value: 'lfo.pitch' },
    ]);
  });
});

describe('pointToShow', () => {
  const values = { ...microfreak.init, 'mx.sel': 'cycenv.pitch' };

  it('picks the point whose amount is pointed at while another point is picked', () => {
    expect(pointToShow(microfreak.controls, ['mx.lfo.pitch'], values)).toEqual({
      id: 'mx.sel',
      value: 'lfo.pitch',
    });
  });

  it('picks for the first hidden amount in a list, past controls on show', () => {
    expect(
      pointToShow(microfreak.controls, ['vcf.cutoff', 'mx.cycenv.pitch', 'mx.key.timbre'], values)
    ).toEqual({ id: 'mx.sel', value: 'key.timbre' });
  });

  it('picks nothing when the amount is already on show, or nothing is a matrix amount', () => {
    expect(pointToShow(microfreak.controls, ['mx.cycenv.pitch'], values)).toBeNull();
    expect(pointToShow(microfreak.controls, ['vcf.cutoff', 'no.such'], values)).toBeNull();
  });

  it('leaves a control hidden by a panel mode that is not a matrix alone', () => {
    const page: Control = {
      id: 'ui.page',
      type: 'select',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      kind: 'enum',
      options: [
        { v: 'a', label: 'A' },
        { v: 'b', label: 'B' },
      ],
      def: 'a',
      ui: true,
      module: 'mod',
      help: 'A page.',
    };
    const deep: Control = { ...page, id: 'deep', show: { id: 'ui.page', eq: 'b' } };
    const list: Control = { ...page, id: 'listed', show: [{ id: 'mx.sel', eq: 'lfo.pitch' }] };
    expect(pointToShow([page, deep], ['deep'], { 'ui.page': 'a' })).toBeNull();
    expect(pointToShow([...microfreak.controls, list], ['listed'], values)).toBeNull();
  });
});

describe('withPick', () => {
  it('draws the pick over the values, and keeps the same values when there is nothing to change', () => {
    const values = { 'mx.sel': 'cycenv.pitch', 'mx.lfo.pitch': 30 };
    expect(withPick(values, { id: 'mx.sel', value: 'lfo.pitch' })).toEqual({
      'mx.sel': 'lfo.pitch',
      'mx.lfo.pitch': 30,
    });
    expect(values['mx.sel']).toBe('cycenv.pitch');
    expect(withPick(values, null)).toBe(values);
    expect(withPick(values, { id: 'mx.sel', value: 'cycenv.pitch' })).toBe(values);
  });
});

describe('the MicroFreak matrix layout', () => {
  it('has a point for each of the 35 crossings, each naming a control that exists', () => {
    const ids = new Set(microfreak.controls.map((c) => c.id));
    expect(sel.options).toHaveLength(35);
    for (const o of sel.options) expect(ids.has(o.point ?? '')).toBe(true);
  });

  it('shows each amount knob on the Matrix encoder only while its point is picked', () => {
    const amounts = microfreak.controls.filter((c) => /^mx\.[a-z]+\.[a-z0-9]+$/.test(c.id));
    expect(amounts).toHaveLength(34);
    for (const c of amounts) expect(c.show).toEqual({ id: 'mx.sel', eq: c.id.slice(3) });
  });

  it('keeps the picked point out of the sound', () => {
    expect(sel.ui).toBe(true);
  });
});
