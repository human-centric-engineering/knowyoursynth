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
  levelOfRms,
  RISE_MS,
  routingActivity,
  settle,
  SILENT,
  type ActivityMeters,
} from '@/lib/app/synths/lib/routing-activity';
import { routing } from '@/lib/app/synths/routing/model-d';

const state = (set: ControlValues = {}) =>
  routingState(modelD, routing, { values: { ...modelD.init, ...set }, cables: [], wheel: 0 });

/** A note held, loud: the gate up, both contours at the top, the output at full. */
const PLAYING: ActivityMeters = { gate: true, env1: 1, env2: 1, lfo: 0, out: 1 };

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

  it('keeps the LFO glowing while it is routed, swelling with its swing, and dark while it is not', () => {
    const routed = state({
      'mod.toFilter': true,
      'mod.depth': 5,
      'mod.mix': 10,
      'mod.srcB': 'lfo',
    });
    expect(routed.blocks.lfo).toBe(true);
    const low = routingActivity(routing, routed, { ...SILENT, lfo: 0 });
    const peak = routingActivity(routing, routed, { ...SILENT, lfo: -1 });
    expect(low.blocks.lfo).toBeGreaterThan(0);
    expect(peak.blocks.lfo).toBe(1);
    expect(low.blocks.lfo).toBeLessThan(peak.blocks.lfo);
    // The mod bus passes on what feeds it.
    expect(peak.blocks.mod_bus).toBe(1);
    expect(routingActivity(routing, state(), { ...SILENT, lfo: 1 }).blocks.lfo).toBe(0);
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
      gate: true,
      env1: 4,
      env2: Number.NaN,
      lfo: 0,
      out: -2,
    });
    expect(a.blocks.filter_contour).toBe(1);
    expect(a.blocks.loudness_contour).toBe(0);
    expect(a.blocks.vca).toBe(0);
  });
});

describe('settle', () => {
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
