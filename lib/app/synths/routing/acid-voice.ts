/**
 * The voice the TB-303 and the TD-3 share: their specs give it the same modules (`seq`, `vco`, `vcf`, `meg`, `veg`,
 * `acc`, `vca`, `out`) and the same connections `c01`, `c03`–`c12`, and their definitions the same `toEngine()` for
 * it. Each synth's routing (`routing/tb-303.ts`, `routing/td-3.ts`) adds what is its own: the oscillator's tune
 * knob, the facts that differ, the oscillator into the filter and the end of the path.
 *
 * Read from `toEngine()`: ENV MOD never takes the envelope off the cutoff (its depth is 0.5 + 4 × ENV MOD), so `c06`
 * is fixed; the accent's push on the cutoff is ACCENT × (0.6 + 2.6 × RESONANCE), so `c10` is scaled by ACCENT alone,
 * not by ACCENT × RESONANCE as the spec has it.
 */
import type { RoutingBlock, RoutingEdge } from '@/lib/app/synths/contract';

type Spec = { label: string; value: string };

/** The shared blocks, given the tune knob's id and the facts that differ between the two. */
export const acidBlocks = (o: {
  tune: string;
  seqSpecs: Spec[];
  tuning: Spec;
  outSpecs: Spec[];
}): RoutingBlock[] => [
  {
    id: 'seq',
    name: 'Sequencer',
    module: 'util',
    symbol: 'midi',
    meter: 'gate',
    controls: ['seq.accent', 'seq.slide'],
    description:
      'The 16-step sequencer, giving each note its pitch, gate, accent and slide. Here the app’s sequencer, keyboard or MIDI plays it; the ACCENT and SLIDE buttons, lit, accent or slide every note.',
    specs: o.seqSpecs,
  },
  {
    id: 'vco',
    name: 'Oscillator',
    module: 'osc',
    meter: 'osc1',
    controls: ['osc.wave', o.tune],
    description:
      'One oscillator, sawtooth or square, its pitch set by the sequencer and the tune knob.',
    specs: [
      { label: 'Waveforms', value: 'Sawtooth, square' },
      { label: 'Pitch', value: 'A at about 220 Hz with the tune knob centred' },
      o.tuning,
    ],
  },
  {
    id: 'vcf',
    name: 'Filter',
    module: 'filter',
    controls: ['filter.cutoff', 'filter.res', 'filter.envMod'],
    description:
      'A resonant low-pass filter, swept by the envelope through ENV MOD and pushed further on accented notes.',
    specs: [
      { label: 'Type', value: 'Low-pass, 4-pole diode-style ladder' },
      { label: 'Slope', value: 'First pole mismatched; often heard as about 18 dB per octave' },
    ],
  },
  {
    id: 'meg',
    name: 'Main envelope',
    module: 'env',
    meter: 'env1',
    controls: ['env.decay'],
    // The attack is fixed. With no sustain, letting go carries on the decay at DECAY's rate.
    stages: { decay: 'env.decay', release: 'env.decay' },
    description:
      'A sharp attack and an exponential decay on each note, for the filter. Accented notes take its shortest decay.',
    specs: [
      { label: 'Decay', value: '0.2 to 2 s' },
      { label: 'Accented decay', value: '0.2 s' },
    ],
  },
  {
    id: 'veg',
    name: 'Volume envelope',
    module: 'env',
    meter: 'env2',
    description:
      'A fixed attack and decay on each note for the amplifier, with no knob of its own.',
    specs: [{ label: 'Decay', value: '3 to 4 s' }],
  },
  {
    id: 'acc',
    name: 'Accent sweep',
    module: 'env',
    controls: ['amp.accent'],
    passes: true,
    description:
      'On accented notes, smooths the main envelope and adds it to the cutoff and the loudness, by the ACCENT knob. Accents close together climb higher.',
  },
  {
    id: 'vca',
    name: 'Amplifier',
    module: 'amp',
    description: 'Shapes the filtered sound with the volume envelope, louder on accented notes.',
  },
  {
    id: 'out',
    name: 'Output',
    module: 'out',
    controls: ['out.volume'],
    description: 'The line output and headphones, at the VOLUME setting.',
    specs: o.outSpecs,
  },
];

/** The shared connections: `c01` and `c03`–`c12`. */
export const ACID_EDGES: RoutingEdge[] = [
  { id: 'c01', from: 'seq', to: 'vco', signal: 'cv', label: 'pitch' },
  { id: 'c03', from: 'vcf', to: 'vca', signal: 'audio' },
  { id: 'c04', from: 'seq', to: 'meg', signal: 'gate' },
  { id: 'c05', from: 'seq', to: 'veg', signal: 'gate' },
  { id: 'c06', from: 'meg', to: 'vcf', signal: 'cv', label: 'cutoff' },
  { id: 'c07', from: 'seq', to: 'meg', signal: 'gate', label: 'accent' },
  { id: 'c08', from: 'meg', to: 'acc', signal: 'cv' },
  { id: 'c09', from: 'seq', to: 'acc', signal: 'gate', label: 'accent' },
  { id: 'c10', from: 'acc', to: 'vcf', signal: 'cv', label: 'cutoff', levels: ['amp.accent'] },
  { id: 'c11', from: 'acc', to: 'vca', signal: 'cv', label: 'loudness', levels: ['amp.accent'] },
  { id: 'c12', from: 'veg', to: 'vca', signal: 'cv', label: 'loudness' },
];
