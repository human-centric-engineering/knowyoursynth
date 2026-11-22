/**
 * Where the mod wheel reaches (`wheelReach`, t-308), read from the Model D's routing, and what the keyboard strip
 * says of it (`wheelSays`): it changes with MOD MIX and the MODULATION switches, and says what would send it
 * somewhere when it reaches nothing.
 *
 * @see lib/app/synths/lib/routing.ts
 * @see lib/app/synths/lib/performance.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues, SynthRouting } from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';
import { routing } from '@/lib/app/synths/routing/model-d';
import { WHEEL, type CableLike } from '@/lib/app/synths/lib/patch';
import { readsWheel, wheelReach, type WheelReach } from '@/lib/app/synths/lib/routing';
import { wheelSays } from '@/lib/app/synths/lib/performance';

const reach = (set: ControlValues = {}, wheel = 0, cables: CableLike[] = []): WheelReach => {
  const r = wheelReach(modelD, routing, { values: { ...modelD.init, ...set }, cables, wheel });
  if (!r) throw new Error('the Model D routing reads the wheel');
  return r;
};
const says = (set: ControlValues = {}, wheel = 0) => wheelSays(modelD, routing, reach(set, wheel));

describe('wheelReach on Model D', () => {
  it('reaches nothing at the init patch, with both MODULATION switches off, and names the two that would open it', () => {
    expect(modelD.init['mod.toOsc']).toBe(false);
    expect(modelD.init['mod.toFilter']).toBe(false);
    const r = reach();
    expect(r.blocks).toEqual([]);
    expect(r.edges).toEqual([]);
    expect(r.switches).toEqual([]);
    expect(r.doors).toEqual([
      { id: 'mod.toOsc', v: true },
      { id: 'mod.toFilter', v: true },
    ]);
    expect(says()).toEqual({
      to: 'Nowhere',
      hint: 'Switch on OSCILLATOR MODULATION or Filter modulation.',
    });
  });

  it('lands on the oscillators the mixer hears with OSCILLATOR MODULATION on, through that switch', () => {
    const r = reach({ 'mod.toOsc': true });
    // Oscillator 2 is off in the mixer at init, so its pitch is on no live path.
    expect(r.blocks).toEqual(['osc1']);
    expect(r.edges).toEqual(['c03', 'c23', 'c30']);
    expect(r.switches).toEqual(['mod.toOsc']);
    expect(r.doors).toEqual([]);
    expect(reach({ 'mod.toOsc': true, 'mix.osc2On': true, 'mix.osc2': 5 }).blocks).toEqual([
      'osc1',
      'osc2',
    ]);
    expect(says({ 'mod.toOsc': true })).toEqual({ from: 'LFO', to: '→ Oscillators' });
  });

  it('lands on the filter with FILTER MODULATION on, and on both with both', () => {
    expect(reach({ 'mod.toFilter': true }).blocks).toEqual(['filter']);
    expect(says({ 'mod.toFilter': true }).to).toBe('→ Filter');
    const both = reach({ 'mod.toOsc': true, 'mod.toFilter': true });
    expect(both.blocks).toEqual(['osc1', 'filter']);
    expect(both.switches).toEqual(['mod.toOsc', 'mod.toFilter']);
    expect(says({ 'mod.toOsc': true, 'mod.toFilter': true }).to).toBe('→ Oscillators · Filter');
  });

  it('brings in what MOD MIX lets through: source B fully right, source A fully left, both between', () => {
    const on = { 'mod.toFilter': true };
    expect(modelD.init['mod.srcA']).toBe('osc3');
    expect(modelD.init['mod.srcB']).toBe('lfo');
    expect(reach({ ...on, 'mod.mix': 10 }).sources).toEqual(['lfo']);
    expect(reach({ ...on, 'mod.mix': 0 }).sources).toEqual(['osc3']);
    expect(reach({ ...on, 'mod.mix': 5 }).sources).toEqual(['lfo', 'osc3']);
    expect(says({ ...on, 'mod.mix': 0 }).from).toBe('Oscillator 3');
    // And the source switches pick which block that is.
    expect(reach({ ...on, 'mod.mix': 10, 'mod.srcB': 'noise' }).sources).toEqual(['noise']);
  });

  it('says where it would go with the wheel down, so the label reads before it is pushed', () => {
    expect(reach({ 'mod.toFilter': true }, 0).blocks).toEqual(
      reach({ 'mod.toFilter': true }, 1).blocks
    );
  });

  it('gives MOD DEPTH as the knob plus the wheel, where the knob alone would give that depth', () => {
    const on = { 'mod.toFilter': true };
    // The engine's depth is (MOD DEPTH / 10)² + the wheel: at 0 with the wheel halfway, the knob at √0.5 of its travel.
    expect(reach({ ...on, 'mod.depth': 0 }, 0.5).depth).toEqual([
      { id: 'mod.depth', value: expect.closeTo(10 * Math.sqrt(0.5), 6) },
    ]);
    expect(reach({ ...on, 'mod.depth': 5 }, 0).depth[0].value).toBeCloseTo(5, 6);
    expect(reach({ ...on, 'mod.depth': 5 }, 0.75).depth[0].value).toBeCloseTo(10, 6);
    // Past the knob's travel it stops at the end.
    expect(reach({ ...on, 'mod.depth': 8 }, 1).depth[0].value).toBe(10);
    // Reaching nothing, it adds to nothing.
    expect(reach({}, 1).depth).toEqual([]);
  });
});

describe('wheelReach on any routing', () => {
  it('is null for a routing that never reads the wheel', () => {
    const none: SynthRouting = {
      ...routing,
      edges: routing.edges.map((e) => ({
        ...e,
        levels: e.levels?.filter((l) => !readsWheel(l)),
      })),
    };
    expect(wheelReach(modelD, none, { values: modelD.init, cables: [] })).toBeNull();
  });

  it('reads the wheel alone or inside a sum', () => {
    expect(readsWheel(WHEEL)).toBe(true);
    expect(readsWheel({ id: WHEEL })).toBe(true);
    expect(readsWheel({ sum: [{ id: 'mod.depth', pow: 2 }, WHEEL] })).toBe(true);
    expect(readsWheel('mod.depth')).toBe(false);
    expect(readsWheel({ sum: ['mod.depth', 'mod.mix'] })).toBe(false);
  });
});
