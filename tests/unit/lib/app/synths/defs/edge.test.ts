/**
 * Behringer EDGE definition tests (t-270): what is the EDGE's own on top of the voice it shares with the Moog DFAM
 * (`dfam-kit.ts`, which `dfam.test.ts` pins control by control): NOISE COLOR, the CLOCK source and SCALE, the
 * PHONES and MIDI sockets, the maker's marks.
 *
 * @see lib/app/synths/defs/edge.ts
 */
import { describe, expect, it } from 'vitest';
import type { ControlValues, EngineContext, EngineParams } from '@/lib/app/synths/contract';
import edge from '@/lib/app/synths/defs/edge';
import dfam from '@/lib/app/synths/defs/dfam';
import { SCALE_PER_BEAT } from '@/lib/app/synths/defs/dfam-kit';

const CTX: EngineContext = { wheel: 0, patched: {} };
const run = (set: ControlValues = {}): EngineParams => edge.toEngine({ ...edge.init, ...set }, CTX);

describe('EDGE toEngine at the init patch', () => {
  it('is the DFAM’s voice: white noise, its own clock (INT/EXT), so no perBeat', () => {
    expect(run()).toEqual(dfam.toEngine(dfam.init, CTX));
    expect(run().dfam?.perBeat).toBeUndefined();
  });

  it('switches only for its own controls; the shared ones map as the DFAM’s do', () => {
    const set = {
      'vco1.wave': 'square',
      'seq.pitch_mod': 'vco12',
      'vcf.mode': 'hp',
      'seq.run': true,
    };
    expect(run(set)).toEqual(dfam.toEngine({ ...dfam.init, ...set }, CTX));
  });
});

describe('EDGE controls of its own', () => {
  it('NOISE COLOR picks pink noise', () => {
    expect(run({ 'noise.color': 'pink' }).noise).toEqual({ level: 0, color: 'pink' });
  });

  it('on MIDI or USB clock, a step is SCALE’s share of the beat; on INT/EXT SCALE does nothing', () => {
    for (const src of ['midi', 'usb'])
      for (const [k, per] of Object.entries(SCALE_PER_BEAT))
        expect(run({ 'clock.source': src, 'clock.scale': k }).dfam?.perBeat, `${src} ${k}`).toBe(
          per
        );
    expect(run({ 'clock.scale': '1/32T' }).dfam?.perBeat).toBeUndefined();
  });

  it('keeps following the app’s clock with perBeat set, which is what sends it', () => {
    expect(run({ 'clock.source': 'midi' }).follow).toBe(true);
  });

  it('places SCALE’s eight positions at the angles printed round it', () => {
    const c = edge.controls.find((x) => x.id === 'clock.scale');
    if (!c || c.kind !== 'enum') throw new Error('no SCALE');
    expect(c.options.map((o) => o.v)).toEqual(Object.keys(SCALE_PER_BEAT));
    expect(c.options.every((o) => typeof o.a === 'number')).toBe(true);
  });
});

describe('EDGE sockets', () => {
  const jack = (id: string) => {
    const j = edge.jacks.find((x) => x.id === id);
    if (!j) throw new Error(`no jack ${id}`);
    return j;
  };

  it('has the DFAM’s 24 patch points, PHONES and the two MIDI sockets', () => {
    expect(edge.jacks).toHaveLength(27);
    const ids = new Set(edge.jacks.map((j) => j.id));
    for (const j of dfam.jacks) expect(ids.has(j.id), j.id).toBe(true);
    expect(jack('j.phones')).toMatchObject({ dir: 'out', signal: 'out' });
  });

  it('leaves MIDI IN and OUT unfollowed: the app’s keys and clock are its MIDI', () => {
    expect(jack('j.midi_in')).toMatchObject({ dir: 'in', dest: null });
    expect(jack('j.midi_out')).toMatchObject({ dir: 'out', signal: null });
  });
});

describe('EDGE panel', () => {
  it('tags the EDGE badge, the behringer logo and its triangle as brand, and nothing else', () => {
    const brand = edge.decor.filter((d) => d.brand).map((d) => (d.t === 'text' ? d.text : d.t));
    expect(brand).toEqual(['EDGE', 'logo', 'path']);
  });

  it('is played by its own sequencer, whose PLAY/STOP is the panel’s', () => {
    expect(edge.ownSequencer).toEqual({ run: 'seq.run' });
    expect(edge.year).toBe(2021);
  });
});
