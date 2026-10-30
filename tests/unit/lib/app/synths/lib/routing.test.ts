/**
 * The live path: which blocks, edges and cables of a routing the patch uses, on Model D, and on a modular and a pin
 * matrix, whose paths are all or mostly cables.
 *
 * Every case has something dark in it, so a `routingState` that lit everything would fail it.
 *
 * @see lib/app/synths/lib/routing.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues } from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';
import type { CableLike } from '@/lib/app/synths/lib/patch';
import { routingState } from '@/lib/app/synths/lib/routing';
import { routing } from '@/lib/app/synths/routing/model-d';
import { getSynthRouting } from '@/lib/app/synths/routing';
import system55 from '@/lib/app/synths/defs/system-55';
import vcs3 from '@/lib/app/synths/defs/ems-vcs3';

const state = (set: ControlValues = {}, cables: CableLike[] = [], wheel = 0) =>
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

  it('lights the mod wheel edge only while the wheel is up', () => {
    expect(state(MOD_TO_FILTER).edges.c03).toBe(false);
    expect(state(MOD_TO_FILTER, [], 0.5).edges.c03).toBe(true);
  });

  it('darkens the mod bus where the engine drops the route: MOD DEPTH squared, times the source’s share', () => {
    // Depth 0.1 is (0.01)² = 0.0001 of full depth, under the floor; 0.3 is 0.0009, over it.
    expect(state({ ...MOD_TO_FILTER, 'mod.depth': 0.1 }).blocks.mod_bus).toBe(false);
    expect(state({ ...MOD_TO_FILTER, 'mod.depth': 0.1 }).edges.c33).toBe(false);
    expect(state({ ...MOD_TO_FILTER, 'mod.depth': 0.3, 'mod.mix': 0 }).edges.c33).toBe(true);
    // Centred, each source carries half of 0.0009: both under the floor, so nothing feeds the bus.
    expect(state({ ...MOD_TO_FILTER, 'mod.depth': 0.3 }).edges.c33).toBe(false);
    expect(state({ ...MOD_TO_FILTER, 'mod.depth': 0.3 }).blocks.mod_bus).toBe(false);
    // Mix 9.9 leaves source A 1% of a depth of 1%: 0.0001, dropped. Source B carries the rest.
    const s = state({ ...MOD_TO_FILTER, 'mod.depth': 1, 'mod.mix': 9.9, 'mod.srcB': 'lfo' });
    expect([s.edges.c20, s.edges.c23]).toEqual([false, true]);
  });

  it('treats a missing MOD MIX as the engine does: neither source carries', () => {
    const values: ControlValues = { ...modelD.init, ...MOD_TO_FILTER, 'mod.srcB': 'lfo' };
    delete values['mod.mix'];
    const s = routingState(modelD, routing, { values, cables: [] });
    expect([s.edges.c20, s.edges.c23, s.blocks.osc3, s.blocks.lfo]).toEqual([
      false,
      false,
      false,
      false,
    ]);
    // With nothing feeding it, the bus and its way to the filter are dark too, though both are switched on.
    expect([s.blocks.mod_bus, s.edges.c33]).toEqual([false, false]);
  });

  it('darkens the mixer, and its way to the filter, with every channel off', () => {
    const s = state({ 'mix.osc1On': false });
    expect([s.blocks.mixer, s.edges.c50]).toEqual([false, false]);
    // The filter makes signal of its own (it self-oscillates), so it stays on the path.
    expect([s.blocks.filter, s.blocks.vca, s.blocks.output]).toEqual([true, true, true]);
  });

  it('feeds the mod bus from the mod wheel alone', () => {
    const values: ControlValues = { ...modelD.init, ...MOD_TO_FILTER, 'mod.depth': 0 };
    delete values['mod.mix'];
    const s = routingState(modelD, routing, { values, cables: [], wheel: 0.5 });
    expect([s.edges.c03, s.blocks.mod_bus, s.edges.c33]).toEqual([true, true, true]);
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
    const SQUARE_IN: CableLike = { from: 'j.lfoSq', to: 'j.modSrc' };

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
        {
          from: 'j.lfoSq',
          to: 'j.modSrc',
          fromBlock: 'lfo',
          toBlock: 'mod_bus',
          signal: 'cv',
          live: true,
        },
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

    it('skips a cable whose jack ids are names an object inherits', () => {
      expect(state({}, [{ from: 'toString', to: 'constructor' }]).cables).toEqual([]);
      expect(state({}, [{ from: 'j.lfoTri', to: '__proto__' }]).cables).toEqual([]);
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

describe('routingState on a modular: the System 55, every path a cable', () => {
  const s55 = system55;
  const modular = getSynthRouting(s55);
  if (!modular) throw new Error('system-55 has a routing');
  const run = (cables: CableLike[]) => routingState(s55, modular, { values: s55.init, cables });
  const VOICE: CableLike[] = [
    { from: 'j.cm1a.cv_1', to: 'j.m921b_1.dc_mod' },
    { from: 'j.m921b_1.sawtooth', to: 'j.m904a.sig_in' },
    { from: 'j.m904a.sig_out', to: 'j.m902_1.sig_in_pos' },
    { from: 'j.m902_1.out_pos', to: 'j.out.l' },
    { from: 'j.m911_1.out', to: 'j.m902_1.cv_1' },
  ];
  const litBlocks = (s: ReturnType<typeof run>) =>
    Object.entries(s.blocks)
      .filter(([, on]) => on)
      .map(([id]) => id)
      .sort();

  it('lights nothing with nothing patched: no block has a way out but a cable', () => {
    const s = run([]);
    expect(Object.keys(s.blocks)).toHaveLength(modular.blocks.length);
    expect(litBlocks(s)).toEqual([]);
    expect(s.edges).toEqual({});
  });

  it('lights the blocks a patch joins to the output, and only those', () => {
    const s = run(VOICE);
    expect(litBlocks(s)).toEqual(['appout', 'cm1a', 'm902_1', 'm904a', 'm911_1', 'm921b_1']);
    expect(s.cables.every((c) => c.live)).toBe(true);
    // The audio path is audio; the keyboard's pitch and the envelope are control.
    expect(s.cables.map((c) => c.signal)).toEqual(['cv', 'audio', 'audio', 'audio', 'cv']);
  });

  it('follows a cable going in: a second oscillator into the filter lights', () => {
    const s = run([...VOICE, { from: 'j.m921b_2.rectangular', to: 'j.m904a.sig_in' }]);
    expect(s.blocks.m921b_2).toBe(true);
    expect(s.cables.at(-1)).toMatchObject({ fromBlock: 'm921b_2', toBlock: 'm904a', live: true });
  });

  it('follows a cable coming out: without the cable to the output everything goes dark', () => {
    const s = run(VOICE.filter((c) => c.to !== 'j.out.l'));
    expect(litBlocks(s)).toEqual([]);
    expect(s.cables.some((c) => c.live)).toBe(false);
  });

  it('needs something to pass on: an amplifier patched to the output with nothing in it stays dark', () => {
    const s = run([{ from: 'j.m902_1.out_pos', to: 'j.out.l' }]);
    expect(s.blocks.m902_1).toBe(false);
    expect(s.cables[0].live).toBe(false);
  });
});

describe('routingState on a pin matrix: the VCS3', () => {
  const vcs3Routing = getSynthRouting(vcs3);
  if (!vcs3Routing) throw new Error('ems-vcs3 has a routing');
  const run = (set: ControlValues, pins: CableLike[]) =>
    routingState(vcs3, vcs3Routing, { values: { ...vcs3.init, ...set }, cables: pins });
  // Oscillator 1's sine through the filter to output channel 1.
  const PINS: CableLike[] = [
    { from: 'r.osc1sine', to: 'c.vcf' },
    { from: 'r.vcf', to: 'c.out1' },
  ];
  const UP = { power: true, 'osc1.sine': 8, 'vcf.level': 8 };

  it('lights the pins and the blocks they join to the output', () => {
    const s = run(UP, PINS);
    for (const id of ['osc1', 'vcf', 'out_amp1', 'output']) expect(s.blocks[id]).toBe(true);
    expect(s.blocks.osc2).toBe(false);
    expect(s.edges.c01).toBe(true);
    expect(s.edges.c02).toBe(false);
    expect(s.cables.map((c) => [c.signal, c.live])).toEqual([
      ['audio', true],
      ['audio', true],
    ]);
  });

  it('carries nothing on a pin whose row LEVEL is at 0', () => {
    const s = run({ ...UP, 'osc1.sine': 0 }, PINS);
    expect(s.cables[0].live).toBe(false);
    expect(s.blocks.osc1).toBe(false);
    // The filter still passes nothing on, so it and the way out go dark too.
    expect(s.blocks.vcf).toBe(false);
    expect(s.cables[1].live).toBe(false);
  });

  it('draws a pin whose row level cannot be read, rather than taking it as at 0', () => {
    // A sound saved before the row had a LEVEL control: its gain reads NaN, which is not known to be zero.
    const values: ControlValues = { ...vcs3.init, ...UP };
    delete values['osc1.sine'];
    const s = routingState(vcs3, vcs3Routing, { values, cables: PINS });
    expect(s.cables[0].live).toBe(true);
  });

  it('never carries Input 2, which has nothing plugged into it', () => {
    const s = run({ ...UP, 'in.ch2': 10 }, [{ from: 'r.in2', to: 'c.out1' }]);
    expect(s.cables[0].live).toBe(false);
    expect(s.blocks.in_amp2).toBe(false);
  });

  it('goes dark with the mains switch off', () => {
    const s = run({ ...UP, power: false }, PINS);
    expect(s.edges.c01).toBe(false);
    expect(Object.values(s.blocks).some(Boolean)).toBe(false);
  });

  it('never lights the meter, which measures and is not heard', () => {
    const s = run(UP, [...PINS, { from: 'r.osc1sine', to: 'c.meter' }]);
    expect(s.blocks.meter).toBe(false);
    expect(s.cables[2]).toMatchObject({ toBlock: 'meter', live: false });
    expect(s.blocks.osc1).toBe(true);
  });
});
