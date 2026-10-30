/**
 * Which control carries a live pointer, and where on it an engine value sits (`f-live-panel` t-154). Read from real
 * definitions, so the tests hold the claim that no synth needs a map: the knob or fader is found from `toEngine()`.
 *
 * @see lib/app/synths/lib/live-pointer.ts
 */

import { describe, expect, it } from 'vitest';
import {
  pointerControl,
  pointerControls,
  pointerSwitches,
  pointerTable,
  pointerValue,
  type PointerKnob,
} from '@/lib/app/synths/lib/live-pointer';
import b2600 from '@/lib/app/synths/defs/b2600';
import behringerSyncussion from '@/lib/app/synths/defs/behringer-syncussion';
import buchlaEasel from '@/lib/app/synths/defs/buchla-easel';
import modelD from '@/lib/app/synths/defs/model-d';
import neutron from '@/lib/app/synths/defs/neutron';
import type { SynthDef } from '@/lib/app/synths/contract';

const ctx = { wheel: 0, patched: {} };
const idOf = (def: SynthDef, param: 'cutoff' | 'amp') =>
  pointerControl(def, param, def.init, ctx)?.id ?? null;

describe('pointerControl', () => {
  it('finds the knob that sets the cutoff from the definition alone', () => {
    expect(idOf(modelD, 'cutoff')).toBe('filter.cutoff');
    expect(idOf(neutron, 'cutoff')).toBe('vcf.freq');
  });

  it('finds a fader the same way', () => {
    const c = pointerControl(b2600, 'cutoff', b2600.init, ctx);
    expect(c?.id).toBe('vcf.freq');
    expect(c?.type).toBe('fader');
  });

  it('finds the VCA’s gain where a control sets it, and nothing on the Model D, whose VCA only its contour opens', () => {
    expect(idOf(neutron, 'amp')).toBe('vca.bias');
    expect(idOf(b2600, 'amp')).toBe('vca.gain');
    expect(idOf(modelD, 'amp')).toBeNull();
  });

  it('passes over a tuning knob the filter follows: the Syncussion’s cutoff tracks TUNE, which is no cutoff knob', () => {
    // Without the pitch check the probe would choose one of its tuning knobs.
    expect(idOf(behringerSyncussion, 'cutoff')).toBeNull();
  });

  it('finds nothing on a synth whose own filter is not the voice’s (the Easel)', () => {
    expect(idOf(buchlaEasel, 'cutoff')).toBeNull();
  });
});

describe('pointerControls', () => {
  it('finds each parameter’s control for the panel’s switches, the same whatever the knobs are set to', () => {
    const turned = { ...neutron.init, 'vcf.freq': 2 };
    expect(pointerSwitches(neutron, turned)).toBe(pointerSwitches(neutron, neutron.init));
    const found = pointerControls(neutron, pointerSwitches(neutron, turned), ctx);
    expect(found.map((f) => [f.param, f.control.id])).toEqual([
      ['cutoff', 'vcf.freq'],
      ['amp', 'vca.bias'],
    ]);
  });
});

describe('pointerValue', () => {
  const knob = pointerControl(modelD, 'cutoff', modelD.init, ctx);
  if (!knob) throw new Error('no cutoff knob on the Model D');
  const values = { ...modelD.init, 'filter.cutoff': -1.3 };
  const pk = pointerTable(modelD, 'cutoff', knob, values, ctx);
  const hz = modelD.toEngine(values, ctx).filter.cutoff;

  it('puts the knob’s own cutoff at the knob’s own value, though it falls between samples', () => {
    expect(pointerValue(pk, hz)).toBeCloseTo(-1.3, 9);
  });

  it('puts a cutoff an octave up further round, and one past the knob’s reach at its end', () => {
    const up = pointerValue(pk, hz * 2);
    expect(up).toBeGreaterThan(-1.3);
    // The knob's travel spans 20 Hz to 20 kHz in ten units: about one unit an octave.
    expect(up).toBeCloseTo(-1.3 + 10 / Math.log2(1000), 1);
    expect(pointerValue(pk, 1e6)).toBe(knob.max);
    expect(pointerValue(pk, 1)).toBe(knob.min);
  });

  it('reads a value the control gives along a flat stretch (past the voice’s clamp) at the place nearest its own', () => {
    // The top fifth of the travel is all at the clamp, and the control is at its end.
    const flat: PointerKnob = {
      param: 'cutoff',
      control: knob,
      own: 5,
      table: [
        { v: -5, e: 4 },
        { v: 3, e: 14 },
        { v: 5, e: 14 },
      ],
    };
    expect(pointerValue(flat, 2 ** 14)).toBe(5);
    expect(pointerValue({ ...flat, own: -5 }, 2 ** 14)).toBe(3);
  });
});
