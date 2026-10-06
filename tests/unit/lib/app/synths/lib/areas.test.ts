/**
 * Areas tests: membership, SVG paths, and the panel search index.
 *
 * @see lib/app/synths/lib/areas.ts
 */
import { describe, expect, it } from 'vitest';
import {
  areaMap,
  areaMembers,
  areaOf,
  areaPath,
  buildIndex,
  rectsPath,
  searchIndex,
} from '@/lib/app/synths/lib/areas';
import { MODULES } from '@/lib/app/synths/lib/modules';
import type { Control } from '@/lib/app/synths/contract';
import { makeMiniD } from '@/tests/fixtures/synths/mini-d';

describe('area lookups', () => {
  it('areaMap indexes by id and is cached per definition', () => {
    const def = makeMiniD();

    expect(areaMap(def).mixer?.label).toBe('Mixer');
    expect(areaMap(def)).toBe(areaMap(def));
  });

  it('areaOf finds the area a point sits in, edges included, or null', () => {
    const def = makeMiniD();

    expect(areaOf(def, { x: 400, y: 80 })?.id).toBe('mixer');
    expect(areaOf(def, { x: 900, y: 300 })?.id).toBe('mod'); // the second rect of a two-rect area
    expect(areaOf(def, { x: 0, y: 0 })?.id).toBe('osc');
    expect(areaOf(def, { x: 5000, y: 0 })).toBeNull();
    expect(areaOf(makeMiniD({ areas: [] }), { x: 1, y: 1 })).toBeNull();
  });

  it('areaMembers lists the controls and jacks inside an area', () => {
    const def = makeMiniD();
    const mixer = areaMap(def).mixer;
    const patch = areaMap(def).patch;
    if (!mixer || !patch) throw new Error('fixture areas missing');

    expect(areaMembers(def, mixer).controls.map((c) => c.id)).toEqual([
      'mix.osc1',
      'mix.osc2',
      'mix.noise',
    ]);
    expect(areaMembers(def, mixer).jacks).toEqual([]);
    expect(areaMembers(def, patch).jacks).toHaveLength(def.jacks.length);
  });

  it('rectsPath and areaPath draw one closed rect per rect', () => {
    expect(rectsPath([{ x: 1, y: 2, w: 3, h: 4 }])).toBe('M1 2h3v4h-3Z');
    const def = makeMiniD();
    const mod = areaMap(def).mod;
    if (!mod) throw new Error('fixture area missing');
    expect(areaPath(mod)).toBe('M800 0h200v250h-200ZM800 250h200v150h-200Z');
  });
});

describe('buildIndex', () => {
  it('has a row per area, per searchable control and per jack, with lower-cased search text', () => {
    const def = makeMiniD();
    const rows = buildIndex(def);

    expect(rows).toHaveLength(def.areas.length + def.controls.length + def.jacks.length);
    const area = rows.find((r) => r.kind === 'area' && r.id === 'osc');
    expect(area).toMatchObject({
      name: 'Oscillator bank',
      type: 'Section',
      where: '',
      color: MODULES.osc.color,
      unusual: 'The oscillators are called the oscillator bank on this panel.',
    });
    expect(area?._extra).toContain('vco tone oscillators');

    const knob = rows.find((r) => r.id === 'mix.osc1');
    expect(knob).toMatchObject({
      kind: 'control',
      name: 'VOLUME · mixer osc 1',
      type: 'Knob',
      where: 'Mixer',
    });
    expect(knob?._name).toBe('volume · mixer osc 1');

    expect(rows.find((r) => r.id === 'out.volume')?.type).toBe('Slider');
    expect(rows.find((r) => r.id === 'mod.toOsc')?.type).toBe('Switch');
    expect(rows.find((r) => r.id === 'osc2.wave')?.type).toBe('Switch'); // a select has no type of its own
    // enum option labels are searchable
    expect(rows.find((r) => r.id === 'lfo.shape')?._extra).toContain('square triangle');

    const jack = rows.find((r) => r.id === 'lfo.tri');
    expect(jack).toMatchObject({
      kind: 'jack',
      name: 'LFO TRI',
      type: 'Output jack',
      where: 'Patch bay',
    });
    expect(rows.find((r) => r.id === 'cutoff.in')?.type).toBe('Input jack');
  });

  it('leaves out a control marked find: false', () => {
    const base = makeMiniD();
    const controls: Control[] = base.controls.map((c) =>
      c.id === 'mix.noise' ? { ...c, find: false } : c
    );
    const rows = buildIndex(makeMiniD({ controls }));

    expect(rows.some((r) => r.id === 'mix.noise')).toBe(false);
  });
});

describe('searchIndex', () => {
  const rows = buildIndex(makeMiniD());

  it('returns nothing for an empty query', () => {
    expect(searchIndex(rows, '   ')).toEqual([]);
  });

  it('needs every word to match somewhere', () => {
    expect(searchIndex(rows, 'cutoff zebra')).toEqual([]);
  });

  it('ranks a name prefix above a word inside a name above extra text above help', () => {
    const ids = searchIndex(rows, 'lfo', 20).map((r) => r.id);

    // "LFO RATE" and the LFO jacks start with it; "Controllers" has it only in its keywords
    expect(ids.indexOf('lfo.rate')).toBeLessThan(ids.indexOf('mod'));
    expect(ids).toContain('lforate.in');
  });

  it('puts areas before controls before jacks on equal scores, and honours the limit', () => {
    const hits = searchIndex(rows, 'volume', 2);

    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.kind === 'control')).toBe(true);
  });

  it('finds a control by its help text alone', () => {
    const hits = searchIndex(rows, 'resonance');

    expect(hits.map((h) => h.id)).toEqual(['filter.emphasis']);
  });

  it('treats regex characters in the query as text', () => {
    expect(() => searchIndex(rows, 'osc (1')).not.toThrow();
  });
});
