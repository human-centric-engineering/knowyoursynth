/**
 * TD-3 signal routing, projected from its spec (`.context/app/synth-data/td-3/td-3.synth.json`, 0.10.0):
 * block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/td-3.ts`). The voice it shares with the TB-303 is in `routing/acid-voice.ts`, with where `toEngine()`
 * overrides the spec there (ENV MOD never fully off; the accent's cutoff push scaled by ACCENT, not ACCENT ×
 * RESONANCE).
 *
 * FILTER IN breaks the oscillator's normal into the filter (`c02`). The distortion's ON/OFF switch picks between it
 * and the straight path to the output, and its LEVEL is curved as `toEngine()` curves it. The MIDI module and its
 * clock into the sequencer (`c16`) are left out: the definition has no clock-source setting, and the app does not
 * model MIDI clock. SYNC IN is drawn on the sequencer it would clock, though a cable in it does nothing here.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';
import { ACID_EDGES, acidBlocks } from '@/lib/app/synths/routing/acid-voice';

export const routing: SynthRouting = {
  synth: 'td-3',
  out: 'out',
  blocks: [
    ...acidBlocks({
      tune: 'osc.tune',
      seqSpecs: [
        { label: 'Steps', value: '16' },
        { label: 'Patterns', value: '64, in groups I to IV' },
        { label: 'Tracks', value: '7' },
        { label: 'CV out', value: '+1 to +5 V, 1 V per octave' },
        { label: 'Gate out', value: '0 / +12 V' },
      ],
      tuning: { label: 'Tune', value: 'About an octave either way' },
      outSpecs: [
        { label: 'Line output', value: 'Up to +8 dBu, 1.5 kΩ' },
        { label: 'Headphones', value: '50 mW into 32 Ω' },
      ],
    }),
    {
      id: 'dist',
      name: 'Distortion',
      module: 'fx',
      controls: ['dist.on', 'dist.drive', 'dist.tone', 'dist.level'],
      passes: true,
      description:
        'Distortion after the amplifier, with DRIVE, TONE and LEVEL. Switched off, the sound goes round it.',
    },
  ],
  edges: [
    ...ACID_EDGES,
    { id: 'c02', from: 'vco', to: 'vcf', signal: 'audio', breaks: 'j.filterIn' },
    {
      id: 'c13',
      from: 'vca',
      to: 'dist',
      signal: 'audio',
      when: { id: 'dist.on', eq: true },
    },
    {
      id: 'c14',
      from: 'dist',
      to: 'out',
      signal: 'audio',
      when: { id: 'dist.on', eq: true },
      levels: [{ id: 'dist.level', pow: 1.7 }],
    },
    {
      id: 'c15',
      from: 'vca',
      to: 'out',
      signal: 'audio',
      when: { id: 'dist.on', eq: false },
    },
  ],
  jacks: {
    'j.filterIn': 'vcf',
    'j.syncIn': 'seq',
    'j.cvOut': 'seq',
    'j.gateOut': 'seq',
    'j.phones': 'out',
  },
  omitted: {
    midi: 'Its notes reach the voice as the sequencer’s here; MIDI clock is not modelled.',
    c16: 'MIDI clock into the sequencer: the definition has no clock-source setting and the app does not model it.',
  },
};
