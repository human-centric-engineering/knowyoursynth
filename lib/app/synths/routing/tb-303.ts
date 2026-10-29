/**
 * TB-303 signal routing, projected from its spec (`.context/app/synth-data/tb-303/tb-303.synth.json`, 0.10.0):
 * block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/tb-303.ts`). The voice it shares with the TD-3 is in `routing/acid-voice.ts`, with where `toEngine()`
 * overrides the spec there (ENV MOD never fully off; the accent's cutoff push scaled by ACCENT, not ACCENT ×
 * RESONANCE).
 *
 * Every connection is fixed. MIX IN sums with the bass at the outputs, so its block passes on what is patched there
 * as well as the voice. SYNC IN is drawn on the sequencer it would clock, though a cable in it does nothing here.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';
import { ACID_EDGES, acidBlocks } from '@/lib/app/synths/routing/acid-voice';

export const routing: SynthRouting = {
  synth: 'tb-303',
  out: 'out',
  blocks: [
    ...acidBlocks({
      tune: 'osc.tuning',
      seqSpecs: [
        { label: 'Steps', value: '1 to 16 (1 to 15 in triplets)' },
        { label: 'Patterns', value: '64, in groups I to IV' },
        { label: 'Tracks', value: '7, 64 measures each, 256 in all' },
        { label: 'Tempo', value: '40 to 300 BPM' },
        { label: 'CV out', value: '+1 to +5 V, 1 V per octave' },
        { label: 'Gate out', value: '0 / +12 V' },
      ],
      tuning: { label: 'Tuning', value: '±500 cents' },
      outSpecs: [
        { label: 'Line output', value: '10 kΩ' },
        { label: 'Headphones', value: '8 to 300 Ω' },
      ],
    }),
    {
      id: 'mix',
      name: 'MIX IN',
      module: 'mixer',
      passes: true,
      description:
        'Mixes an outside sound, such as a rhythm machine, in with the bass at equal level, just before the outputs.',
      specs: [
        { label: 'Input impedance', value: '100 kΩ' },
        { label: 'Mix', value: '1:1' },
      ],
    },
  ],
  edges: [
    ...ACID_EDGES,
    { id: 'c02', from: 'vco', to: 'vcf', signal: 'audio' },
    { id: 'c13', from: 'vca', to: 'mix', signal: 'audio' },
    { id: 'c14', from: 'mix', to: 'out', signal: 'audio' },
  ],
  jacks: {
    'j.mixIn': 'mix',
    'j.sync': 'seq',
    'j.cv': 'seq',
    'j.gate': 'seq',
    'j.phones': 'out',
    'j.output': 'out',
  },
};
