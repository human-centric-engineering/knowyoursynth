/**
 * The live flow on the panel's face (`f-live-panel` t-153): where each line runs (`liveFlows()`), between the patches
 * of panel the live glow lights, and which routes, pins and cables get one.
 *
 * @see lib/app/synths/lib/live-flow.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues, PatchCable, SynthDef, SynthRouting } from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';
import vcs3 from '@/lib/app/synths/defs/ems-vcs3';
import system15 from '@/lib/app/synths/defs/system-15';
import { liveAreas } from '@/lib/app/synths/lib/live-areas';
import { flowAnchors, liveFlows } from '@/lib/app/synths/lib/live-flow';
import { routingState } from '@/lib/app/synths/lib/routing';
import { routing } from '@/lib/app/synths/routing/model-d';
import { routing as vcs3Routing } from '@/lib/app/synths/routing/ems-vcs3';
import { getSynthRouting } from '@/lib/app/synths/routing';

function flows(def: SynthDef, r: SynthRouting, set: ControlValues = {}, cables: PatchCable[] = []) {
  const values = { ...def.init, ...set };
  const patched = cables.flatMap((c) => [c.from, c.to]);
  const state = routingState(def, r, { values, cables, wheel: 0 });
  const areas = liveAreas(def, r, patched, values);
  return { state, areas, lines: liveFlows(def, r, state, areas) };
}

/** The numbers of a path, as [x, y] pairs. */
const points = (d: string) => {
  const v = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return Array.from({ length: v.length / 2 }, (_, i) => [v[2 * i], v[2 * i + 1]]);
};

describe('liveFlows on Model D', () => {
  it('runs each line from the edge of the part it leaves to the edge of the part it feeds', () => {
    const { areas, lines } = flows(modelD, routing);
    const anchors = flowAnchors(areas);
    const line = lines.find((l) => l.id === 'pitch_bus>osc1:cv');
    const from = anchors.get('pitch_bus');
    const to = anchors.get('osc1');
    if (!line || !from || !to) throw new Error('no pitch → Oscillator 1 line');
    const pts = points(line.d);
    const [x0, y0] = pts[0];
    const [x1, y1] = pts[pts.length - 1];
    // The controllers sit left of the oscillators: it leaves just past the one's right side and arrives just short of
    // the other's left, from the glow areas' boxes, not the middle of either.
    expect(from.x1).toBeLessThan(to.x0);
    expect(x0).toBeGreaterThan(from.x1);
    expect(x0).toBeLessThan(from.x1 + 12);
    expect(y0).toBeGreaterThan(from.y0);
    expect(y0).toBeLessThan(from.y1);
    expect(x1).toBeLessThan(to.x0);
    expect(x1).toBeGreaterThan(to.x0 - 12);
    expect(y1).toBeGreaterThan(to.y0);
    expect(y1).toBeLessThan(to.y1);
    // The arrowhead's tip is the line's end.
    expect(points(line.head)[0]).toEqual([x1, y1]);
  });

  it('draws a short arrow across the seam between two parts whose patches touch', () => {
    const { areas, lines } = flows(modelD, routing);
    const anchors = flowAnchors(areas);
    const line = lines.find((l) => l.id === 'mixer>filter:audio');
    const mixer = anchors.get('mixer');
    const filter = anchors.get('filter');
    if (!line || !mixer || !filter) throw new Error('no mixer → filter line');
    // The filter's switches stand right up against the mixer.
    expect(filter.x0 - mixer.x1).toBeLessThan(40);
    const pts = points(line.d);
    const [x0] = pts[0];
    const [x1] = pts[pts.length - 1];
    expect(x0).toBeLessThan(mixer.x1 + 6);
    expect(x1).toBeGreaterThan(filter.x0 - 6);
    expect(x1 - x0).toBeGreaterThan(30);
    expect(x1 - x0).toBeLessThan(45);
  });

  it('anchors a part on the cells of its own controls', () => {
    const { areas } = flows(modelD, routing);
    const own = areas.find((a) => a.id === 'filter');
    const box = flowAnchors(areas).get('filter');
    const xs = points(own?.d ?? '').map(([x]) => x);
    expect(xs.length).toBeGreaterThan(0);
    expect(box?.x0).toBe(Math.min(...xs));
    expect(box?.x1).toBe(Math.max(...xs));
  });

  it('draws only the routes the patch carries signal along, each with its own signal', () => {
    const on = flows(modelD, routing);
    const osc1 = on.lines.find((l) => l.id === 'osc1>mixer:audio');
    expect(osc1?.signal).toBe('audio');
    expect(osc1?.edges.length).toBe(1);
    expect(on.state.edges[osc1?.edges[0] ?? '']).toBe(true);
    // Oscillator 1 switched out of the mixer, and Oscillator 2 in: its route is dark and draws nothing, while the
    // mixer still feeds the filter.
    const off = flows(modelD, routing, { 'mix.osc1On': false, 'mix.osc2On': true, 'mix.osc2': 8 });
    expect(off.state.edges[osc1?.edges[0] ?? '']).toBe(false);
    expect(off.lines.some((l) => l.from === 'osc1')).toBe(false);
    expect(off.lines.some((l) => l.id === 'osc2>mixer:audio')).toBe(true);
    expect(off.lines.some((l) => l.id === 'mixer>filter:audio')).toBe(true);
  });

  it('runs on through a part with nothing on the panel, as the signal does', () => {
    const { areas, lines } = flows(modelD, routing);
    // The VCA has no controls of its own: the filter's line runs on to the output.
    expect(flowAnchors(areas).has('vca')).toBe(false);
    expect(lines.some((l) => l.from === 'vca' || l.to === 'vca')).toBe(false);
    const line = lines.find((l) => l.id === 'filter>output:audio');
    expect(line?.edges).toEqual([routing.edges.find((e) => e.from === 'filter')?.id]);
    // And a line out of a part that has nowhere to start (the keyboard's MIDI) is not drawn.
    expect(lines.some((l) => l.from === 'midi')).toBe(false);
  });

  it('draws nothing over a patch cable, which the face draws already', () => {
    const cable = { from: 'j.lfoTri', to: 'j.cutCv' };
    const { state, lines } = flows(modelD, routing, {}, [cable]);
    expect(state.cables[0]?.live).toBe(true);
    expect(lines.some((l) => l.cables.length > 0)).toBe(false);
  });
});

describe('liveFlows elsewhere', () => {
  it('draws a line for a live pin of a pin matrix, which no cable shows', () => {
    const { state, lines } = flows(vcs3, vcs3Routing, {}, [{ from: 'r.in1', to: 'c.out1' }]);
    expect(state.cables[0]?.live).toBe(true);
    const line = lines.find((l) => l.cables.includes(0));
    expect(line?.id).toBe('in_amp1>out_amp1:cv');
  });

  it('draws no lines on a modular, whose every path is a cable', () => {
    const r = getSynthRouting(system15);
    if (!r) throw new Error('no System 15 routing');
    const { state, lines } = flows(system15, r, {}, [{ from: 'j.m923.lp_out', to: 'j.out.l' }]);
    expect(r.edges).toHaveLength(0);
    expect(state.cables[0]?.live).toBe(true);
    expect(lines).toEqual([]);
  });
});
