/**
 * How brightly the routing view lights each part of Model D: the signal going through it now, over the path the
 * patch routes.
 *
 * Every case has something dark in it, or something that changes, so an activity that lit everything (or nothing)
 * would fail it.
 *
 * @see lib/app/synths/lib/routing-activity.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues } from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';
import { routingState } from '@/lib/app/synths/lib/routing';
import {
  FALL_MS,
  FAST_HZ,
  levelOfRms,
  RISE_MS,
  routingActivity,
  settle,
  SILENT,
  SLOW_HZ,
  type ActivityMeters,
} from '@/lib/app/synths/lib/routing-activity';
import { routing } from '@/lib/app/synths/routing/model-d';

const state = (set: ControlValues = {}) =>
  routingState(modelD, routing, { values: { ...modelD.init, ...set }, cables: [], wheel: 0 });

/** A note held, loud: the gate up, both contours at the top, the output at full. */
const PLAYING: ActivityMeters = { ...SILENT, gate: true, env1: 1, env2: 1, out: 1 };

describe('routingActivity on Model D', () => {
  it('is dark everywhere while nothing is playing, though the path is routed', () => {
    const s = state();
    expect(s.blocks.osc1).toBe(true);
    const a = routingActivity(routing, s, SILENT);
    for (const v of Object.values(a.blocks)) expect(v).toBe(0);
    for (const v of Object.values(a.edges)) expect(v).toBe(0);
  });

  it('lights the routed audio path with the output, and leaves a part off the path dark', () => {
    const a = routingActivity(routing, state(), PLAYING);
    for (const b of ['osc1', 'mixer', 'filter', 'vca', 'output']) expect(a.blocks[b], b).toBe(1);
    expect(a.edges.c40).toBe(1);
    // Switched off in the mixer: dark while the note plays.
    expect(a.blocks.osc2).toBe(0);
    expect(a.edges.c41).toBe(0);
    expect(a.blocks.noise).toBe(0);
  });

  it('fades the audio path with the output’s level, as a release tail does', () => {
    const loud = routingActivity(routing, state(), { ...PLAYING, out: 0.8 });
    const tail = routingActivity(routing, state(), { ...PLAYING, gate: false, out: 0.2 });
    expect(loud.blocks.filter).toBe(0.8);
    expect(tail.blocks.filter).toBe(0.2);
    expect(tail.edges.c40).toBe(0.2);
  });

  it('lights the keyboard with its gate, and the master pitch from it', () => {
    const on = routingActivity(routing, state(), { ...SILENT, gate: true });
    expect(on.blocks.midi).toBe(1);
    expect(on.blocks.pitch_bus).toBe(1);
    expect(on.edges.c01).toBe(1);
    const off = routingActivity(routing, state(), SILENT);
    expect(off.blocks.midi).toBe(0);
    expect(off.blocks.pitch_bus).toBe(0);
  });

  it('lights each contour with its own envelope, and one turned off the path not at all', () => {
    const routed = state({ 'filter.contour': 5 });
    expect(routed.blocks.filter_contour).toBe(true);
    const a = routingActivity(routing, routed, { ...SILENT, env1: 0.3, env2: 0.9 });
    expect(a.blocks.filter_contour).toBe(0.3);
    expect(a.blocks.loudness_contour).toBe(0.9);
    const off = state({ 'filter.contour': 0 });
    expect(off.blocks.filter_contour).toBe(false);
    expect(routingActivity(routing, off, { ...SILENT, env1: 0.3 }).blocks.filter_contour).toBe(0);
  });

  const LFO_ROUTED: ControlValues = {
    'mod.toFilter': true,
    'mod.depth': 5,
    'mod.mix': 10,
    'mod.srcB': 'lfo',
  };

  it('pulses a slow LFO with its wave, dark at the trough and full at the peak, and the mod bus with it', () => {
    const routed = state(LFO_ROUTED);
    expect(routed.blocks.lfo).toBe(true);
    const peak = routingActivity(routing, routed, { ...SILENT, lfo: 1, lfoHz: 1 });
    const trough = routingActivity(routing, routed, { ...SILENT, lfo: -1, lfoHz: 1 });
    expect(peak.blocks.lfo).toBe(1);
    expect(trough.blocks.lfo).toBeCloseTo(0.12, 5);
    expect(peak.pulsing.lfo).toBe(true);
    // The mod bus passes on what feeds it, pulse and all.
    expect(peak.blocks.mod_bus).toBe(1);
    expect(peak.pulsing.mod_bus).toBe(true);
    expect(trough.blocks.mod_bus).toBeCloseTo(0.12, 5);
    // Not routed: dark at any point of its wave.
    expect(routingActivity(routing, state(), { ...SILENT, lfo: 1, lfoHz: 1 }).blocks.lfo).toBe(0);
  });

  it('draws a fast LFO as a steady glow, not a false slow pulse, blending between', () => {
    const routed = state(LFO_ROUTED);
    const fast = (lfo: number, lfoHz: number) =>
      routingActivity(routing, routed, { ...SILENT, lfo, lfoHz });
    expect(fast(1, 20).blocks.lfo).toBe(0.75);
    expect(fast(-1, 20).blocks.lfo).toBe(0.75);
    expect(fast(1, 20).pulsing.lfo).toBe(false);
    // Half way from SLOW_HZ to FAST_HZ: half the wave, half the steady glow.
    expect(fast(-1, (SLOW_HZ + FAST_HZ) / 2).blocks.lfo).toBeCloseTo((0.12 + 0.75) / 2, 5);
    expect(fast(-1, SLOW_HZ).blocks.lfo).toBeCloseTo(0.12, 5);
  });

  /** Oscillator 1 full in the mixer, Oscillator 2 at a third, both at audio pitch; Oscillator 3 as given. */
  const oscs = (osc3: { v: number; hz: number; lv: number }) => [
    { v: 0.3, hz: 220, lv: 0.9 },
    { v: -0.2, hz: 220, lv: 0.3 },
    osc3,
  ];
  const BOTH_IN = { 'mix.osc2On': true, 'mix.osc2': 3.3 };

  it('lights an oscillator at audio pitch with the output times its share of the mixer', () => {
    const a = routingActivity(routing, state(BOTH_IN), {
      ...PLAYING,
      out: 0.8,
      osc: oscs({ v: 0, hz: 220, lv: 0 }),
    });
    expect(a.blocks.osc1).toBeCloseTo(0.8, 5);
    expect(a.blocks.osc2).toBeCloseTo(0.8 / 3, 5);
    expect(a.pulsing.osc1).toBe(false);
    // Off the path: dark, whatever the engine says of it.
    expect(a.blocks.osc3).toBe(0);
  });

  it('pulses Oscillator 3 at LO with its wave as a mod source, and holds it at half when fast', () => {
    const asSource = state({ ...LFO_ROUTED, 'mod.mix': 0, 'mod.srcA': 'osc3' });
    expect(asSource.blocks.osc3).toBe(true);
    const at = (v: number, hz: number) =>
      routingActivity(routing, asSource, { ...PLAYING, osc: oscs({ v, hz, lv: 0 }) });
    expect(at(1, 0.5).blocks.osc3).toBe(1);
    expect(at(-1, 0.5).blocks.osc3).toBeCloseTo(0.12, 5);
    expect(at(1, 0.5).pulsing.osc3).toBe(true);
    // At audio pitch and switched out of the mixer: half the sound it modulates, and dark with nothing sounding.
    expect(at(-1, 440).blocks.osc3).toBe(0.5);
    expect(at(-1, 440).pulsing.osc3).toBe(false);
    const quiet = routingActivity(routing, asSource, {
      ...SILENT,
      osc: oscs({ v: 1, hz: 440, lv: 0 }),
    });
    expect(quiet.blocks.osc3).toBe(0);
  });

  it('falls back to the output’s level for an oscillator the engine did not report', () => {
    const a = routingActivity(routing, state(), { ...PLAYING, out: 0.6, osc: [] });
    expect(a.blocks.osc1).toBe(0.6);
  });

  it('lights a live cable with the block it leaves, and not a dead one', () => {
    const s = routingState(modelD, routing, {
      values: modelD.init,
      cables: [{ from: 'j.lfoTri', to: 'j.cutCv' }],
      wheel: 0,
    });
    expect(s.cables[0].live).toBe(true);
    expect(routingActivity(routing, s, { ...SILENT, lfo: 1 }).cables).toEqual([1]);
    const dead = { ...s, cables: [{ ...s.cables[0], live: false }] };
    expect(routingActivity(routing, dead, { ...SILENT, lfo: 1 }).cables).toEqual([0]);
  });

  it('never goes past full or below dark on a wild meter', () => {
    const a = routingActivity(routing, state({ 'filter.contour': 5 }), {
      ...SILENT,
      gate: true,
      env1: 4,
      env2: Number.NaN,
      out: -2,
    });
    expect(a.blocks.filter_contour).toBe(1);
    expect(a.blocks.loudness_contour).toBe(0);
    expect(a.blocks.vca).toBe(0);
  });
});

describe('settle', () => {
  it('lets a moving wave fall as quickly as it rises', () => {
    expect(settle(1, 0, RISE_MS, true)).toBeCloseTo(Math.exp(-1), 5);
    expect(settle(1, 0, RISE_MS, true)).toBeLessThan(settle(1, 0, RISE_MS));
  });

  it('comes up quickly and falls away slowly', () => {
    const up = settle(0, 1, RISE_MS);
    const down = settle(1, 0, RISE_MS);
    expect(up).toBeCloseTo(1 - Math.exp(-1), 5);
    // Over the same time, falling covers far less ground than rising.
    expect(1 - down).toBeLessThan(up / 4);
    expect(settle(1, 0, FALL_MS)).toBeCloseTo(Math.exp(-1), 5);
  });

  it('lands on its target rather than creeping forever, and holds still at it', () => {
    expect(settle(0.001, 0, 16)).toBe(0);
    expect(settle(0.5, 0.5, 16)).toBe(0.5);
    // A frame of no time (or a clock that ran back) moves nothing.
    expect(settle(0.3, 1, -5)).toBe(0.3);
  });
});

describe('levelOfRms', () => {
  it('maps the output’s level in decibels: −60 dB dark, −6 dB full, between in proportion', () => {
    expect(levelOfRms(0)).toBe(0);
    expect(levelOfRms(0.001)).toBeCloseTo(0, 5);
    expect(levelOfRms(0.5)).toBeCloseTo(1, 2);
    expect(levelOfRms(0.9)).toBe(1);
    expect(levelOfRms(10 ** (-33 / 20))).toBeCloseTo(0.5, 5);
    expect(levelOfRms(Number.NaN)).toBe(0);
  });
});
