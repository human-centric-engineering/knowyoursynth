import { describe, expect, it } from 'vitest';

import type { SelectControl } from '@/lib/app/synths/contract';
import { matrixClick } from '@/lib/app/synths/lib/matrix-points';
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
