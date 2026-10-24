/**
 * The panel's undo history: a change kept as a step back, a gesture's moves as one, the last 20 kept, and Undo and
 * Redo walking back and forth with a new change leaving redo behind; and a new patch set a part at a time: the cables
 * that go pulled out first, the parts down the voice, the new cables plugged in last.
 *
 * @see lib/app/synths/lib/history.ts
 */

import { describe, it, expect } from 'vitest';
import type { Control, SynthDef } from '@/lib/app/synths/contract';
import {
  GLIDE_STAGE_MS,
  HISTORY_CABLE_MS,
  HISTORY_GROUP_MS,
  HISTORY_MAX,
  emptyHistory,
  glideAt,
  glideMs,
  glidePlan,
  panelChanges,
  recordChange,
  tweenCables,
  tweenValues,
  redo,
  undo,
  type PanelSnap,
} from '@/lib/app/synths/lib/history';

const snap = (cutoff: number): PanelSnap => ({ values: { cutoff }, cables: [] });

describe('the panel history', () => {
  it('keeps the state before a change as a step back, and Undo puts it back', () => {
    const h = recordChange(emptyHistory(), snap(1), 0);
    const r = undo(h, snap(2));
    expect(r?.to).toEqual(snap(1));
    expect(r?.history.past).toEqual([]);
    expect(r?.history.future).toEqual([snap(2)]);
  });

  it('takes a gesture as one change: moves close together keep the state before the first', () => {
    let h = recordChange(emptyHistory(), snap(1), 0);
    h = recordChange(h, snap(2), HISTORY_GROUP_MS / 2);
    h = recordChange(h, snap(3), HISTORY_GROUP_MS);
    expect(h.past).toEqual([snap(1)]);
    h = recordChange(h, snap(4), HISTORY_GROUP_MS * 3);
    expect(h.past).toEqual([snap(1), snap(4)]);
  });

  it('keeps only the last 20', () => {
    let h = emptyHistory();
    for (let k = 0; k < HISTORY_MAX + 5; k++)
      h = recordChange(h, snap(k), k * HISTORY_GROUP_MS * 2);
    expect(h.past).toHaveLength(HISTORY_MAX);
    expect(h.past[0]).toEqual(snap(5));
  });

  it('redoes what was undone, and a new change leaves redo behind', () => {
    let h = recordChange(emptyHistory(), snap(1), 0);
    const back = undo(h, snap(2));
    expect(back).not.toBeNull();
    h = back!.history;
    const forward = redo(h, snap(1));
    expect(forward?.to).toEqual(snap(2));
    expect(forward?.history.past).toEqual([snap(1)]);
    const changed = recordChange(h, snap(1), 10_000);
    expect(changed.future).toEqual([]);
    expect(redo(changed, snap(9))).toBeNull();
  });

  it('has nothing to undo or redo when empty', () => {
    expect(undo(emptyHistory(), snap(1))).toBeNull();
    expect(redo(emptyHistory(), snap(1))).toBeNull();
  });
});

describe('showing an undo', () => {
  const at = { x: 0, y: 0, module: 'filter' as const, help: '' };
  const KNOB: Control = {
    ...at,
    id: 'cutoff',
    type: 'knob',
    r: 10,
    style: 'pro1',
    kind: 'cont',
    min: 0,
    max: 100,
    def: 50,
  };
  const STEPPED: Control = { ...KNOB, id: 'oct', min: 0, max: 4, def: 0, step: 1 };
  const SWITCH: Control = {
    ...at,
    id: 'sync',
    type: 'toggle',
    w: 10,
    kind: 'bool',
    def: false,
  };
  const DEF = { id: 'test', controls: [KNOB, STEPPED, SWITCH], init: {} } as unknown as SynthDef;

  it('names the controls that move and the jacks of the cables that come or go', () => {
    const from: PanelSnap = {
      values: { cutoff: 10, oct: 1 },
      cables: [{ from: 'a', to: 'b', color: '#f00' }],
    };
    const to: PanelSnap = {
      values: { cutoff: 90, oct: 1 },
      cables: [{ from: 'c', to: 'd', color: '#f00' }],
    };
    const { controls, jacks } = panelChanges(from, to);
    expect(controls).toEqual(['cutoff']);
    expect(jacks.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('turns a knob through the values between, and lands exactly where it goes', () => {
    const from = { cutoff: 10, oct: 0, sync: false };
    const to = { cutoff: 90, oct: 4, sync: true };
    expect(tweenValues(DEF, from, to, 0.5).cutoff).toBe(50);
    expect(tweenValues(DEF, from, to, 1)).toBe(to);
  });

  it('steps a stepped knob through each setting, and flips a switch halfway', () => {
    const from = { cutoff: 10, oct: 0, sync: false };
    const to = { cutoff: 10, oct: 4, sync: true };
    const octs = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => tweenValues(DEF, from, to, t).oct);
    expect(octs).toEqual([0, 1, 2, 3, 4]);
    expect(tweenValues(DEF, from, to, 0.4).sync).toBe(false);
    expect(tweenValues(DEF, from, to, 0.6).sync).toBe(true);
  });
});

describe('tweenCables: cables one by one', () => {
  const c = (from: string, to: string) => ({ from, to, color: '#f00' });
  const A = c('a', 'b');
  const B = c('c', 'd');
  const C = c('e', 'f');

  it('takes them out in the order they were plugged, the first at once', () => {
    expect(tweenCables([A, B, C], [], 0)).toEqual([A, B, C]);
    expect(tweenCables([A, B, C], [], 0.01)).toEqual([B, C]);
    expect(tweenCables([A, B, C], [], 0.5)).toEqual([C]);
    expect(tweenCables([A, B, C], [], 1)).toEqual([]);
  });

  it('plugs them back in the order they were plugged', () => {
    expect(tweenCables([], [A, B, C], 0.01)).toEqual([A]);
    expect(tweenCables([], [A, B, C], 0.5)).toEqual([A, B]);
    expect(tweenCables([], [A, B, C], 1)).toEqual([A, B, C]);
  });

  it('keeps the cables that stay throughout', () => {
    expect(tweenCables([A, B], [A, C], 0.01)).toEqual([A]);
    expect(tweenCables([A, B], [A, C], 0.6)).toEqual([A, C]);
  });
});

describe('a glide: a new patch set a part at a time', () => {
  const at = { x: 0, y: 0, help: '' };
  const knob = (id: string, module: Control['module']): Control => ({
    ...at,
    module,
    id,
    type: 'knob',
    r: 10,
    style: 'pro1',
    kind: 'cont',
    min: 0,
    max: 100,
    def: 0,
  });
  // Declared out of the voice's order, so the order the glide goes in is its own.
  const DEF = {
    id: 'test',
    controls: [
      knob('cutoff', 'filter'),
      knob('rate', 'lfo'),
      knob('pitch', 'osc'),
      knob('depth', 'mod'),
    ],
    init: {},
  } as unknown as SynthDef;
  const c = (from: string, to: string) => ({ from, to, color: '#f00' });
  const OLD = c('lfo.out', 'vcf.in');
  const KEPT = c('env.out', 'vca.in');
  const NEW = c('osc.out', 'mix.in');
  const from: PanelSnap = {
    values: { cutoff: 0, rate: 0, pitch: 0, depth: 0 },
    cables: [OLD, KEPT],
  };
  const to: PanelSnap = {
    values: { cutoff: 100, rate: 100, pitch: 100, depth: 0 },
    cables: [KEPT, NEW],
  };

  it('pulls the old cables out first, sets the parts down the voice, and plugs the new cables in last', () => {
    const stages = glidePlan(DEF, from, to);
    expect(stages.map((s) => s.module)).toEqual(['unplug', 'osc', 'filter', 'lfo', 'patch']);
    expect(stages[0].ids.sort()).toEqual(['lfo.out', 'vcf.in']);
    expect(stages[1].ids).toEqual(['pitch']);
    expect(stages.at(-1)?.ids.sort()).toEqual(['mix.in', 'osc.out']);
    // An LFO and its depth are one part; a control that does not move is in none.
    expect(stages.flatMap((s) => s.ids)).not.toContain('depth');
  });

  it('turns one part at a time, the ones after it waiting where they were', () => {
    const stages = glidePlan(DEF, from, to);
    const unplug = stages[0].ms;
    const knobs = stages[1].ms;
    expect(knobs).toBe(GLIDE_STAGE_MS);
    expect(unplug).toBeGreaterThanOrEqual(HISTORY_CABLE_MS);

    // Unplugging: nothing has turned yet, and the old cable is out once its turn begins.
    const out = glideAt(DEF, from, to, stages, 1);
    expect(out.stage).toBe(0);
    expect(out.snap.values).toEqual(from.values);
    expect(out.snap.cables).toEqual([KEPT]);

    // Halfway through the oscillators: pitch half turned, the filter and the LFO as they were, no new cable yet.
    const osc = glideAt(DEF, from, to, stages, unplug + knobs / 2);
    expect(osc.stage).toBe(1);
    expect(osc.snap.values).toEqual({ cutoff: 0, rate: 0, pitch: 50, depth: 0 });
    expect(osc.snap.cables).toEqual([KEPT]);

    // On to the filter: the oscillators done.
    const filter = glideAt(DEF, from, to, stages, unplug + knobs + 1);
    expect(filter.stage).toBe(2);
    expect(filter.snap.values.pitch).toBe(100);
    expect(filter.snap.values.rate).toBe(0);

    // Plugging in: every part set, and the new cable in.
    const plug = glideAt(DEF, from, to, stages, unplug + knobs * 3 + 1);
    expect(plug.stage).toBe(4);
    expect(plug.snap.values).toEqual(to.values);
    expect(plug.snap.cables).toEqual([KEPT, NEW]);
  });

  it('lands exactly on the new patch at the end, and has nothing to do when nothing changes', () => {
    const stages = glidePlan(DEF, from, to);
    expect(glideAt(DEF, from, to, stages, glideMs(stages))).toEqual({ snap: to, stage: -1 });
    expect(glidePlan(DEF, from, from)).toEqual([]);
  });

  it('goes faster when many parts move, so a whole new patch is not a long wait', () => {
    const many = {
      ...DEF,
      controls: (
        ['osc', 'mixer', 'filter', 'env', 'amp', 'lfo', 'glide', 'mode', 'fx', 'out'] as const
      ).map((m) => knob(m, m)),
    };
    const ids = many.controls.map((k) => k.id);
    const stages = glidePlan(
      many,
      { values: Object.fromEntries(ids.map((id) => [id, 0])), cables: [] },
      { values: Object.fromEntries(ids.map((id) => [id, 100])), cables: [] }
    );
    expect(stages.map((s) => s.module)).toEqual(ids);
    expect(stages[0].ms).toBeLessThan(GLIDE_STAGE_MS);
    expect(glideMs(stages)).toBeLessThanOrEqual(2700);
  });
});
