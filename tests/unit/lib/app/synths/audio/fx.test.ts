/**
 * Outboard effects rack tests: the stored-setting normaliser (outside data, so every field is checked), and the
 * rack's wiring and gain moves on a stand-in audio graph.
 *
 * @see lib/app/synths/audio/fx.ts
 */

import { describe, it, expect } from 'vitest';

import { createRack, FX_DEFAULT, normalizeFx } from '@/lib/app/synths/audio/fx';
import {
  FakeContext,
  FakeConvolver,
  FakeGain,
  FakeOsc,
  FakeShaper,
  type FakeNode,
} from '@/tests/unit/lib/app/synths/audio/fake-audio';

describe('normalizeFx', () => {
  it('gives the defaults for anything that is not a setting', () => {
    for (const v of [undefined, null, 3, 'on', []]) expect(normalizeFx(v)).toEqual(FX_DEFAULT);
  });

  it('keeps valid fields, clamps levels to 0..1, and drops wrong types and unknown keys', () => {
    const out = normalizeFx({
      on: true,
      drive: { on: true, amount: 2, tone: -1, extra: 5 },
      chorus: { on: 'yes', rate: Number.NaN, depth: 0.25 },
      delay: 'loud',
      reverb: { size: 0.9, mix: Infinity },
      other: { on: true },
    });
    expect(out).toEqual({
      on: true,
      drive: { on: true, amount: 1, tone: 0 },
      chorus: { on: true, rate: 0.35, depth: 0.25 },
      delay: FX_DEFAULT.delay,
      reverb: { on: true, size: 0.9, mix: 0.25 },
    });
  });

  it('never hands back the defaults object itself', () => {
    const out = normalizeFx({});
    out.drive.amount = 0.9;
    expect(FX_DEFAULT.drive.amount).toBe(0.35);
  });
});

describe('createRack', () => {
  function build() {
    const ctx = new FakeContext();
    const made: FakeNode[] = [];
    const orig = {
      gain: ctx.createGain.bind(ctx),
      shaper: ctx.createWaveShaper.bind(ctx),
      osc: ctx.createOscillator.bind(ctx),
      conv: ctx.createConvolver.bind(ctx),
    };
    ctx.createGain = () => {
      const n = orig.gain();
      made.push(n);
      return n;
    };
    ctx.createWaveShaper = () => {
      const n = orig.shaper();
      made.push(n);
      return n;
    };
    ctx.createOscillator = () => {
      const n = orig.osc();
      made.push(n);
      return n;
    };
    ctx.createConvolver = () => {
      const n = orig.conv();
      made.push(n);
      return n;
    };
    // The rack takes a real BaseAudioContext; the stand-in has the methods it calls.
    const rack = createRack(ctx as unknown as BaseAudioContext);
    return { ctx, rack, made };
  }

  it('starts with the defaults: the rack switched off (bypass open, chain shut), the chorus LFO running', () => {
    const { rack, made } = build();
    const input = rack.input as unknown as FakeGain;
    const output = rack.output as unknown as FakeGain;
    const [bypass, chainOut] = [made[2] as FakeGain, made[3] as FakeGain];
    expect(input.outputs).toContain(bypass);
    expect(bypass.outputs).toContain(output);
    expect(bypass.gain.last).toBe(1);
    expect(chainOut.gain.last).toBe(0);
    expect(made.filter((n): n is FakeOsc => n instanceof FakeOsc).every((o) => o.started)).toBe(
      true
    );
    const limiter = made
      .filter((n): n is FakeShaper => n instanceof FakeShaper)
      .find((s) => s.oversample === '2x');
    expect(limiter?.curve?.length).toBe(4096);
    // the soft limiter: unity below 0.7, never past 1
    expect(Math.max(...Array.from(limiter!.curve!))).toBeLessThanOrEqual(1);
  });

  it('switching on crossfades to the chain, rebuilds the drive curve and the room only when they move', () => {
    const { rack, made } = build();
    const [bypass, chainOut] = [made[2] as FakeGain, made[3] as FakeGain];
    const drive = made
      .filter((n): n is FakeShaper => n instanceof FakeShaper)
      .find((s) => s.oversample === '4x')!;
    const conv = made.find((n): n is FakeConvolver => n instanceof FakeConvolver)!;
    const firstCurve = drive.curve;
    const firstRoom = conv.buffer;
    rack.set({
      ...FX_DEFAULT,
      on: true,
      drive: { on: true, amount: 0.9, tone: 0.2 },
      reverb: { on: true, size: 1, mix: 0.5 },
    });
    expect(bypass.gain.last).toBe(0);
    expect(chainOut.gain.last).toBe(1);
    expect(drive.curve).not.toBe(firstCurve);
    expect(conv.buffer).not.toBe(firstRoom);
    // a room of 0.6 + 4.4 s at 48 kHz, decaying noise
    expect(conv.buffer!.getChannelData(0).length).toBe(Math.floor(48000 * 5));
    const curve = drive.curve;
    const room = conv.buffer;
    rack.set({
      ...FX_DEFAULT,
      on: true,
      drive: { on: true, amount: 0.9, tone: 0.5 },
      reverb: { on: false, size: 1, mix: 0.5 },
    });
    expect(drive.curve).toBe(curve);
    expect(conv.buffer).toBe(room);
  });

  it('takes any stored value, normalising it first', () => {
    const { rack, made } = build();
    const bypass = made[2] as FakeGain;
    rack.set('garbage');
    expect(bypass.gain.last).toBe(1);
  });
});
