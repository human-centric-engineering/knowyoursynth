/**
 * How brightly the routing view lights each part of Model D, and of a System 55 whose every path is a cable: the
 * signal going through it now, over the path the patch routes.
 *
 * Every case has something dark in it, or something that changes, so an activity that lit everything (or nothing)
 * would fail it.
 *
 * @see lib/app/synths/lib/routing-activity.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues } from '@/lib/app/synths/contract';
import type { CableLike } from '@/lib/app/synths/lib/patch';
import modelD from '@/lib/app/synths/defs/model-d';
import system55 from '@/lib/app/synths/defs/system-55';
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
import { getSynthRouting } from '@/lib/app/synths/routing';
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

describe('routingActivity on a modular: the System 55, every path a cable', () => {
  const modular = getSynthRouting(system55);
  if (!modular) throw new Error('system-55 has a routing');
  const state55 = (cables: CableLike[]) =>
    routingState(system55, modular, { values: system55.init, cables });
  const run = (cables: CableLike[], meters: ActivityMeters) =>
    routingActivity(modular, state55(cables), meters);
  // The keyboard plays an oscillator through the filter and an amplifier to the output; the keyboard's trigger fires
  // an envelope that opens the amplifier.
  const VOICE: CableLike[] = [
    { from: 'j.cm1a.cv_1', to: 'j.m921b_1.dc_mod' },
    { from: 'j.m921b_1.sawtooth', to: 'j.m904a.sig_in' },
    { from: 'j.m904a.sig_out', to: 'j.m902_1.sig_in_pos' },
    { from: 'j.m902_1.out_pos', to: 'j.out.l' },
    { from: 'j.cm1a.trig_lower', to: 'j.m911_1.strig' },
    { from: 'j.m911_1.out', to: 'j.m902_1.cv_1' },
  ];
  const LINE = ['m921b_1', 'm904a', 'm902_1', 'appout'];

  it('lights the patched audio line with the output’s level, and fades it as a release tail does', () => {
    const loud = run(VOICE, { ...PLAYING, out: 0.8 });
    for (const b of LINE) expect(loud.blocks[b], b).toBe(0.8);
    const tail = run(VOICE, { ...SILENT, out: 0.2 });
    for (const b of LINE) expect(tail.blocks[b], b).toBe(0.2);
    // The audio cables glow with the line; a module the patch does not use stays dark.
    const audio = loud.cables.filter((_, i) => state55(VOICE).cables[i].signal === 'audio');
    expect(audio).toEqual([0.8, 0.8, 0.8]);
    expect(loud.blocks.m921b_2).toBe(0);
  });

  it('goes dark when the cable to the output comes out', () => {
    const a = run(
      VOICE.filter((c) => c.to !== 'j.out.l'),
      PLAYING
    );
    for (const b of LINE) expect(a.blocks[b], b).toBe(0);
  });

  it('lights the keyboard with its gate, and the envelope with the sound it shapes, through its release', () => {
    const held = run(VOICE, { ...SILENT, gate: true, out: 0.6 });
    expect(held.blocks.cm1a).toBe(1);
    expect(held.blocks.m911_1).toBe(0.6);
    // Key up, the release still sounding: the keyboard goes dark, the envelope does not.
    const tail = run(VOICE, { ...SILENT, out: 0.3 });
    expect(tail.blocks.cm1a).toBe(0);
    expect(tail.blocks.m911_1).toBe(0.3);
    expect(run(VOICE, SILENT).blocks.m911_1).toBe(0);
  });

  it('lights a modulating oscillator with the sound, not with the key it is tuned from', () => {
    const FM: CableLike[] = [
      ...VOICE,
      { from: 'j.cm1a.cv_2', to: 'j.m921b_2.dc_mod' },
      { from: 'j.m921b_2.sine', to: 'j.m921b_1.ac_mod' },
    ];
    const held = run(FM, { ...SILENT, gate: true, out: 0.3 });
    expect(held.blocks.m921b_2).toBe(0.3);
    expect(run(FM, { ...SILENT, out: 0.2 }).blocks.m921b_2).toBe(0.2);
  });

  it('keeps a mixer on the audio line only while it mixes audio', () => {
    // The keyboard's trigger through a mixer into the amplifier's audio input: control, so the mixer glows with the
    // trigger rather than the output's level.
    const cv = run(
      [
        ...VOICE,
        { from: 'j.cm1a.trig_upper', to: 'j.cp3am_1.in1' },
        { from: 'j.cp3am_1.out_pos_1', to: 'j.m902_1.sig_in_neg' },
      ],
      { ...SILENT, gate: true, out: 0.2 }
    );
    expect(cv.blocks.cp3am_1).toBe(1);
    // A second oscillator mixed in is audio, so the mixer follows the output's level.
    const mixed = run(
      [
        ...VOICE,
        { from: 'j.m921b_2.sawtooth', to: 'j.cp3am_1.in1' },
        { from: 'j.cp3am_1.out_pos_1', to: 'j.m902_1.sig_in_neg' },
      ],
      { ...SILENT, gate: true, out: 0.2 }
    );
    expect(mixed.blocks.cp3am_1).toBe(0.2);
  });

  describe('with the engine reporting each module', () => {
    /** The engine slot (0-based) a block reads, as the routing gives it. */
    const slot = (id: string, kind: string) => {
      const meter = modular.blocks.find((b) => b.id === id)?.meter ?? '';
      const m = new RegExp(`^${kind}:(\\d+)$`).exec(meter);
      if (!m) throw new Error(`${id} reads no ${kind} slot`);
      return Number(m[1]) - 1;
    };
    /** A reading for every slot of a System 55, all at rest but those `set` gives. */
    const moog = (
      set: Partial<Record<'vco' | 'vcoHz' | 'env' | 'amp', [string, number][]>>
    ): NonNullable<ActivityMeters['moog']> => {
      const r = {
        vco: Array(7).fill(0),
        vcoHz: Array(7).fill(0),
        env: Array(4).fill(0),
        amp: Array(5).fill(0),
      };
      for (const [k, pairs] of Object.entries(set) as [keyof typeof r, [string, number][]][])
        for (const [id, v] of pairs) r[k][slot(id, k === 'vcoHz' ? 'vco' : k)] = v;
      return r;
    };
    // Two 921Bs at LO into the filter, and two envelopes: one opens the amplifier, the other sweeps the filter.
    const TWO: CableLike[] = [
      ...VOICE,
      { from: 'j.m921b_2.sawtooth', to: 'j.m904a.sig_in' },
      { from: 'j.cm1a.trig_upper', to: 'j.m911_2.strig' },
      { from: 'j.m911_2.out', to: 'j.m904a.cv_1' },
    ];

    it('reads each 921, 911 and 902 from its own slot, and each from a different one', () => {
      const ids: [string, string][] = [
        ['m921b_1', 'vco'],
        ['m921b_2', 'vco'],
        ['m921', 'vco'],
        ['m911_1', 'env'],
        ['m911_2', 'env'],
        ['m902_1', 'amp'],
        ['m902_2', 'amp'],
      ];
      const slots = ids.map(([id, kind]) => `${kind}:${slot(id, kind)}`);
      expect(new Set(slots).size).toBe(ids.length);
      // The 921A driver makes no sound of its own, and the keyboard keeps its gate.
      expect(modular.blocks.find((b) => b.id === 'cm1a')?.meter).toBe('gate');
    });

    it('lights two oscillators at LO with their own waves: one at its peak, one at its trough', () => {
      const a = run(TWO, {
        ...PLAYING,
        out: 0.5,
        moog: moog({
          vco: [
            ['m921b_1', 1],
            ['m921b_2', -1],
          ],
          vcoHz: [
            ['m921b_1', 1],
            ['m921b_2', 2],
          ],
        }),
      });
      expect(a.blocks.m921b_1).toBeCloseTo(1, 5);
      expect(a.blocks.m921b_2).toBeCloseTo(0.12, 5);
      expect(a.pulsing.m921b_1).toBe(true);
      expect(a.pulsing.m921b_2).toBe(true);
      // Their cables pulse with them, apart.
      const s = state55(TWO);
      const from = (id: string) =>
        a.cables[s.cables.findIndex((c) => c.fromBlock === id && c.live)];
      expect(from('m921b_1')).toBeCloseTo(1, 5);
      expect(from('m921b_2')).toBeCloseTo(0.12, 5);
    });

    it('lights an oscillator at audio pitch with the output, steady', () => {
      const a = run(TWO, {
        ...PLAYING,
        out: 0.4,
        moog: moog({ vco: [['m921b_1', -1]], vcoHz: [['m921b_1', 220]] }),
      });
      expect(a.blocks.m921b_1).toBeCloseTo(0.4, 5);
      expect(a.pulsing.m921b_1).toBe(false);
    });

    it('lights two envelopes on different contours with their own levels', () => {
      const a = run(TWO, {
        ...PLAYING,
        out: 0.5,
        moog: moog({
          env: [
            ['m911_1', 0.9],
            ['m911_2', 0.25],
          ],
        }),
      });
      expect(a.blocks.m911_1).toBeCloseTo(0.9, 5);
      expect(a.blocks.m911_2).toBeCloseTo(0.25, 5);
    });

    it('lights an amplifier with its gain, never brighter than the output it carries', () => {
      const open = run(TWO, { ...PLAYING, out: 0.7, moog: moog({ amp: [['m902_1', 0.3]] }) });
      expect(open.blocks.m902_1).toBeCloseTo(0.3, 5);
      const quiet = run(TWO, { ...PLAYING, out: 0.1, moog: moog({ amp: [['m902_1', 1]] }) });
      expect(quiet.blocks.m902_1).toBeCloseTo(0.1, 5);
    });

    it('lights an amplifier passing only control with what feeds it, not its gain', () => {
      // An envelope through the second amplifier to the filter's cutoff: control, off the audio line. Its gain is
      // full, which says nothing of what reaches it; it glows with the envelope.
      const cv: CableLike[] = [
        ...VOICE,
        { from: 'j.m911_1.out', to: 'j.m902_2.sig_in_pos' },
        { from: 'j.m902_2.out_pos', to: 'j.m904a.cv_1' },
      ];
      const meters = (env: number) => ({
        ...PLAYING,
        out: 0.8,
        moog: moog({ amp: [['m902_2', 1]], env: [['m911_1', env]] }),
      });
      expect(run(cv, meters(0.4)).blocks.m902_2).toBeCloseTo(0.4, 5);
      expect(run(cv, meters(0)).blocks.m902_2).toBe(0);
    });

    it('leaves a module the patch does not use dark, whatever its slot reads', () => {
      const a = run(VOICE, {
        ...PLAYING,
        moog: moog({ vco: [['m921b_2', 1]], vcoHz: [['m921b_2', 1]], env: [['m911_2', 1]] }),
      });
      expect(a.blocks.m921b_2).toBe(0);
      expect(a.blocks.m911_2).toBe(0);
    });
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
