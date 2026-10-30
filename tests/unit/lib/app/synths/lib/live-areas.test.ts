/**
 * The live glow on the panel's face (`f-live-panel` t-150): where each part of Model D lights (`liveAreas()`), and the
 * steady meters a visitor who asks for less motion gets (`steadyMeters()`).
 *
 * @see lib/app/synths/lib/live-areas.ts
 * @see lib/app/synths/lib/routing-activity.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues } from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';
import { panelCells } from '@/lib/app/synths/lib/cells';
import { liveAreas } from '@/lib/app/synths/lib/live-areas';
import { routingState } from '@/lib/app/synths/lib/routing';
import {
  FAST_HZ,
  routingActivity,
  SILENT,
  steadyMeters,
} from '@/lib/app/synths/lib/routing-activity';
import { routing } from '@/lib/app/synths/routing/model-d';

const values = modelD.init;

describe('liveAreas on Model D', () => {
  const areas = liveAreas(modelD, routing, [], values);
  const byId = new Map(areas.map((a) => [a.id, a]));

  it('gives each part with controls on the panel the union of their cells, in its module colour', () => {
    const { cells } = panelCells(modelD, [], values);
    const filter = routing.blocks.find((b) => b.id === 'filter_contour');
    expect(filter?.controls?.length).toBeGreaterThan(1);
    const area = byId.get('filter_contour');
    expect(area?.module).toBe(filter?.module);
    // Every one of its controls' cells, and nothing else.
    expect(area?.d).toBe((filter?.controls ?? []).map((id) => cells[id] ?? '').join(''));
    for (const id of filter?.controls ?? []) if (cells[id]) expect(area?.d).toContain(cells[id]);
  });

  it('lights the main sections of the signal path, and leaves out a part with nothing on the panel', () => {
    for (const id of ['osc1', 'mixer', 'filter', 'filter_contour', 'loudness_contour', 'output'])
      expect(byId.get(id)?.d, id).toBeTruthy();
    // The VCA has no control of its own: nothing to light.
    expect(routing.blocks.find((b) => b.id === 'vca')?.controls ?? []).toEqual([]);
    expect(byId.has('vca')).toBe(false);
  });

  it('lights a patched jack with the part it belongs to, and an empty one not at all', () => {
    const jack = Object.keys(routing.jacks).find((j) => routing.jacks[j] === 'filter');
    if (!jack) throw new Error('the filter has a jack');
    const patched = liveAreas(modelD, routing, [jack], values).find((a) => a.id === 'filter');
    const { cells } = panelCells(modelD, [jack], values);
    expect(cells[jack]).toBeTruthy();
    expect(patched?.d).toContain(cells[jack]);
    expect(byId.get('filter')?.d).not.toContain(cells[jack]);
  });

  it('gives a control two parts list one area of its own, glowing for both', () => {
    const shared = structuredClone(routing);
    shared.blocks.find((b) => b.id === 'osc2')?.controls?.push('filter.emphasis');
    const out = liveAreas(modelD, shared, [], values);
    const { cells } = panelCells(modelD, [], values);
    const both = out.find((a) => a.id === 'osc2 filter');
    expect(both?.blocks).toEqual(['osc2', 'filter']);
    expect(both?.d).toBe(cells['filter.emphasis']);
    // It is neither part's own any more, and comes after the first of them in the routing's order.
    expect(out.find((a) => a.id === 'filter')?.d).not.toContain(cells['filter.emphasis']);
    const ids = out.map((a) => a.id);
    expect(ids.indexOf('osc2 filter')).toBe(ids.indexOf('osc2') + 1);
  });

  it('gives no two parts the same patch of panel', () => {
    const { cells } = panelCells(modelD, [], values);
    const owner = new Map<string, string>();
    for (const b of routing.blocks)
      for (const id of b.controls ?? []) {
        if (!cells[id]) continue;
        expect(owner.get(id), `${id} on ${b.id} and ${owner.get(id)}`).toBeUndefined();
        owner.set(id, b.id);
      }
    expect(owner.size).toBeGreaterThan(10);
  });
});

describe('steadyMeters', () => {
  const LFO_ROUTED: ControlValues = {
    ...values,
    'mod.toFilter': true,
    'mod.depth': 5,
    'mod.mix': 10,
    'mod.srcB': 'lfo',
  };
  const routed = routingState(modelD, routing, { values: LFO_ROUTED, cables: [], wheel: 0 });

  it('holds a slow LFO steady at its trough and its peak, where it would otherwise pulse', () => {
    const at = (lfo: number) => ({ ...SILENT, lfo, lfoHz: 1 });
    const moving = [
      routingActivity(routing, routed, at(1)),
      routingActivity(routing, routed, at(-1)),
    ];
    expect(moving[0].blocks.lfo).not.toBeCloseTo(moving[1].blocks.lfo, 2);
    expect(moving[0].pulsing.lfo).toBe(true);
    const peak = routingActivity(routing, routed, steadyMeters(at(1)));
    const trough = routingActivity(routing, routed, steadyMeters(at(-1)));
    expect(peak.blocks.lfo).toBe(0.75);
    expect(trough.blocks.lfo).toBe(0.75);
    expect(peak.pulsing.lfo).toBe(false);
  });

  it('raises a slow oscillator and a 900-series oscillator to FAST_HZ, and leaves a fast or silent one be', () => {
    const s = steadyMeters({
      ...SILENT,
      osc: [
        { v: 0.5, hz: 0.5, lv: 0 },
        { v: 0.5, hz: 440, lv: 1 },
        { v: 0, hz: 0, lv: 0 },
      ],
      moog: { vco: [0.2, 0.1], vcoHz: [1, 220], env: [0], amp: [0] },
    });
    expect(s.osc.map((o) => o.hz)).toEqual([FAST_HZ, 440, 0]);
    expect(s.moog?.vcoHz).toEqual([FAST_HZ, 220]);
    expect(s.lfoHz).toBe(FAST_HZ);
  });
});
