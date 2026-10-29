/**
 * The live path: which blocks, edges and cables of a routing the patch uses, on Model D.
 *
 * Every case has something dark in it, so a `routingState` that lit everything would fail it.
 *
 * @see lib/app/synths/lib/routing.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues } from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';
import { routingState, type RoutingCable } from '@/lib/app/synths/lib/routing';
import { routing } from '@/lib/app/synths/routing/model-d';

const state = (set: ControlValues = {}, cables: RoutingCable[] = [], wheel = 0) =>
  routingState(modelD, routing, { values: { ...modelD.init, ...set }, cables, wheel });

/** Oscillator 3 and the LFO both feeding the filter through the mod bus, nothing else on it. */
const MOD_TO_FILTER: ControlValues = { 'mod.toFilter': true, 'mod.depth': 5, 'mod.mix': 5 };

describe('routingState on Model D', () => {
  it('lights the init patch: Oscillator 1 through the mixer, filter and amplifier', () => {
    const s = state();
    expect(modelD.init['mix.osc1On']).toBe(true);
    for (const b of ['midi', 'pitch_bus', 'osc1', 'mixer', 'filter', 'vca', 'output'])
      expect(s.blocks[b], b).toBe(true);
    for (const e of ['c10', 'c40', 'c50', 'c53', 'c55']) expect(s.edges[e], e).toBe(true);
    // Switched off in the mixer, and the mod bus going nowhere.
    for (const b of ['osc2', 'osc3', 'noise', 'ext_in', 'mod_bus', 'lfo'])
      expect(s.blocks[b], b).toBe(false);
    expect(s.edges.c41).toBe(false);
  });

  it('darkens an oscillator switched off in the mixer, and the edges that fed it', () => {
    const s = state({ 'mix.osc1On': false });
    expect(s.blocks.osc1).toBe(false);
    expect(s.edges.c40).toBe(false);
    expect(s.edges.c10).toBe(false);
    expect(s.blocks.filter).toBe(true);
  });

  it('darkens an oscillator whose mixer level is at zero, though its switch is on', () => {
    const s = state({ 'mix.osc2On': true, 'mix.osc2': 0 });
    expect(s.blocks.osc2).toBe(false);
    expect(state({ 'mix.osc2On': true, 'mix.osc2': 0.5 }).blocks.osc2).toBe(true);
  });

  it('keeps Oscillator 3 lit as a modulator when it is off in the mixer', () => {
    const s = state({ ...MOD_TO_FILTER, 'mod.srcA': 'osc3', 'mix.osc3On': false });
    expect(s.blocks.osc3).toBe(true);
    expect(s.edges.c20).toBe(true);
    expect(s.edges.c33).toBe(true);
    expect(s.edges.c42).toBe(false);
  });

  it('follows MOD MIX: fully right silences source A, fully left source B', () => {
    const right = state({ ...MOD_TO_FILTER, 'mod.mix': 10 });
    expect([right.edges.c20, right.edges.c23]).toEqual([false, true]);
    expect([right.blocks.osc3, right.blocks.lfo]).toEqual([false, true]);
    const left = state({ ...MOD_TO_FILTER, 'mod.mix': 0 });
    expect([left.edges.c20, left.edges.c23]).toEqual([true, false]);
    expect(left.blocks.lfo).toBe(false);
  });

  it('lights the mod bus from the mod wheel when MOD DEPTH is at zero', () => {
    const off = { ...MOD_TO_FILTER, 'mod.depth': 0 };
    expect(state(off).edges.c33).toBe(false);
    expect(state(off).blocks.mod_bus).toBe(false);
    expect(state(off, [], 0.5).edges.c33).toBe(true);
    expect(state(off, [], 0.5).blocks.mod_bus).toBe(true);
  });

  it('needs every part of an all-condition: modulation reaches Oscillator 3 only under keyboard control', () => {
    const on = { ...MOD_TO_FILTER, 'mod.toOsc': true, 'mix.osc3On': true, 'mix.osc3': 5 };
    expect(state({ ...on, 'osc3.kbd': true }).edges.c32).toBe(true);
    expect(state({ ...on, 'osc3.kbd': false }).edges.c32).toBe(false);
    expect(state({ ...on, 'osc3.kbd': false }).edges.c12).toBe(false);
  });

  it('lights keyboard tracking with either switch', () => {
    expect(state().edges.c52).toBe(false);
    expect(state({ 'filter.kbd2': true }).edges.c52).toBe(true);
  });

  describe('cables', () => {
    const NOISE_B = { ...MOD_TO_FILTER, 'mod.srcB': 'noise' };
    const SQUARE_IN: RoutingCable = { from: 'j.lfoSq', to: 'j.modSrc' };

    it('lights the noise normal into the mod bus with no cable in MOD SOURCE', () => {
      const s = state(NOISE_B);
      expect(s.edges.c22).toBe(true);
      expect(s.blocks.noise).toBe(true);
    });

    it('breaks the normal with a cable into MOD SOURCE, and lights the cable instead', () => {
      const s = state(NOISE_B, [SQUARE_IN]);
      expect(s.edges.c22).toBe(false);
      expect(s.blocks.noise).toBe(false);
      expect(s.blocks.lfo).toBe(true);
      expect(s.cables).toEqual([
        { from: 'j.lfoSq', to: 'j.modSrc', fromBlock: 'lfo', toBlock: 'mod_bus', live: true },
      ]);
    });

    it('holds a cable that replaces a normal to the normal’s switch', () => {
      const s = state({ ...NOISE_B, 'mod.srcB': 'lfo', 'mod.srcA': 'eg' }, [SQUARE_IN]);
      expect(s.cables[0].live).toBe(false);
      // The LFO is still lit, through its own switch position.
      expect(s.edges.c23).toBe(true);
    });

    it('breaks the feedback normal with a cable into EXT', () => {
      const ext = { 'mix.extOn': true, 'mix.ext': 4 };
      expect(state(ext).edges.c45).toBe(true);
      const s = state(ext, [{ from: 'j.filtCont', to: 'j.ext' }]);
      expect(s.edges.c45).toBe(false);
      expect(s.cables[0].live).toBe(true);
      expect(s.blocks.filter_contour).toBe(true);
    });

    it('leaves a cable dark when nothing after it reaches the output', () => {
      const s = state({}, [{ from: 'j.lfoTri', to: 'j.ext' }]);
      expect(s.blocks.ext_in).toBe(false);
      expect(s.cables[0]).toMatchObject({ fromBlock: 'lfo', toBlock: 'ext_in', live: false });
      expect(s.blocks.lfo).toBe(false);
    });

    it('lights a summing cable and the block it comes from', () => {
      const s = state({}, [{ from: 'j.lfoTri', to: 'j.cutCv' }]);
      expect(s.cables[0].live).toBe(true);
      expect(s.blocks.lfo).toBe(true);
    });

    it('skips a cable to a jack the routing does not know', () => {
      expect(state({}, [{ from: 'j.lfoTri', to: 'j.nope' }]).cables).toEqual([]);
    });
  });

  it('is pure: the same patch gives the same answer, and the input is not changed', () => {
    const values = { ...modelD.init, ...MOD_TO_FILTER };
    const cables = [{ from: 'j.lfoSq', to: 'j.modSrc' }];
    const frozen = JSON.stringify({ values, cables });
    const a = routingState(modelD, routing, { values, cables });
    const b = routingState(modelD, routing, { values, cables });
    expect(b).toEqual(a);
    expect(JSON.stringify({ values, cables })).toBe(frozen);
  });
});
