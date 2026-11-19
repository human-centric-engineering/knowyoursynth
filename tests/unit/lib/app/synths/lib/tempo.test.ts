/**
 * A synth's tempo control (`SynthDef.tempo`): one that holds the BPM itself (the TB-303) and one a `tempoMap` turns
 * into the BPM and back (the Subharmonicon, `f-own-sequencer`).
 *
 * @see lib/app/synths/lib/tempo.ts
 */
import { describe, expect, it } from 'vitest';
import { tempoBpmOf, tempoValueFor, withRiffTempo } from '@/lib/app/synths/lib/tempo';

const plain = { tempo: 'seq.tempo' };
const mapped = {
  tempo: 'clock.tempo',
  tempoMap: { toBpm: (v: number) => v * 30, fromBpm: (b: number) => b / 30 },
};

describe('tempo controls', () => {
  it('a plain control holds the BPM', () => {
    expect(tempoValueFor(plain, 128)).toBe(128);
    expect(tempoBpmOf(plain, { 'seq.tempo': 96 })).toBe(96);
    expect(withRiffTempo(plain, { x: 1 }, 140)).toEqual({ x: 1, 'seq.tempo': 140 });
  });

  it('a mapped control holds its own value, which the map turns into the BPM', () => {
    expect(tempoValueFor(mapped, 120)).toBe(4);
    expect(tempoBpmOf(mapped, { 'clock.tempo': 4 })).toBe(120);
    expect(withRiffTempo(mapped, {}, 90)).toEqual({ 'clock.tempo': 3 });
  });

  it('reads nothing from a synth with no tempo control, or a value that is not a number', () => {
    expect(tempoBpmOf({}, { 'seq.tempo': 96 })).toBeNull();
    expect(tempoBpmOf(plain, { 'seq.tempo': 'fast' })).toBeNull();
    expect(withRiffTempo({}, { x: 1 }, 120)).toEqual({ x: 1 });
    expect(withRiffTempo(plain, { x: 1 }, 0)).toEqual({ x: 1 });
  });
});
