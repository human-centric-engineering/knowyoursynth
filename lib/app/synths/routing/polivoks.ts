/**
 * Polivoks signal routing, projected from its spec (`.context/app/synth-data/polivoks/polivoks.synth.json`, 0.13.0):
 * block and edge ids are the spec's module and connection ids; switches and levels are the definition's
 * (`defs/polivoks.ts`).
 *
 * Where the definition says more than the spec, it decides. The voices switch picks which key Generator II follows
 * (`c02`, `c03`), as the spec draws it. The modulation depths and the FM are squared, as `toEngine()` reads them, and
 * the mixer levels and VOLUME curved as it curves them; ВЫХОД breaks the way out (`c20`). At the modulator's noise position the four modulation edges come from the
 * noise generator instead, as `toEngine()` takes them (`c05n`, `c06n`, `c13n`, `c19n`, not in the spec). The pedal (`c14`) is not
 * modelled, and the external input, with nothing to plug into it, is left out.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';

const lvl = (id: string) => [{ id, pow: 1.7 }];
const sq = (id: string) => [{ id, pow: 2 }];

/** A modulation edge: from the modulator, or from the noise generator while РЕЖИМ is at noise (`<id>n`), as `toEngine()` hears it. */
const mod = (
  id: string,
  to: string,
  label: string,
  levels: { id: string; pow: number }[] | string[]
) => [
  {
    id,
    from: 'modulator',
    to,
    signal: 'cv' as const,
    label,
    levels,
    when: { id: 'lfo.shape', in: ['triangle', 'square', 'stepped'] },
  },
  {
    id: `${id}n`,
    from: 'noise',
    to,
    signal: 'cv' as const,
    label,
    levels,
    when: { id: 'lfo.shape', eq: 'noise' },
  },
];

export const routing: SynthRouting = {
  synth: 'polivoks',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Keyboard',
      module: 'mode',
      symbol: 'midi',
      meter: 'gate',
      controls: ['kbd.voices', 'kbd.keyMemory'],
      description:
        'Gives the top and the bottom key held to the two generators in two-voice mode, or one key to both in one-voice mode, and a gate to both envelopes.',
      specs: [
        { label: 'Keys', value: '49, F to E' },
        { label: 'Voices', value: '1 or 2' },
      ],
    },
    {
      id: 'modulator',
      name: 'Modulator',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.rate', 'lfo.shape'],
      description:
        'One low-frequency modulator, triangle, square, noise or stepped, sent to both generators, the filter and the amplifier, each at its own depth.',
      specs: [{ label: 'Shapes', value: 'Triangle, square, noise, stepped' }],
    },
    {
      id: 'gen1',
      name: 'Generator I',
      module: 'osc',
      meter: 'osc1',
      controls: ['gen1.range', 'gen1.shape', 'gen1.glide', 'gen.tune', 'gen1.mod', 'gen1.fm'],
      description:
        'The first oscillator, on the top key: five ranges and five waveforms, glissando, and frequency modulation from Generator II.',
      specs: [
        { label: 'Ranges', value: "32' to 2'" },
        { label: 'Waveforms', value: 'Triangle, sawtooth, square, two pulses' },
        { label: 'Tuning', value: 'At least ±12 % (about ±1 tone)' },
      ],
    },
    {
      id: 'gen2',
      name: 'Generator II',
      module: 'osc',
      meter: 'osc2',
      controls: ['gen2.range', 'gen2.shape', 'gen2.detune', 'gen2.mod'],
      description:
        'The second oscillator, on the bottom key: five ranges and five waveforms, detunable against Generator I, and the source of its frequency modulation.',
      specs: [
        { label: 'Ranges', value: "32' to 2'" },
        { label: 'Detune', value: 'At least ±25 % (about ±2 tones)' },
      ],
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      description: 'White noise for wind, surf and steam, and the modulator’s noise position.',
      specs: [{ label: 'Colour', value: 'White' }],
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      passes: true,
      controls: ['mixer.gen1', 'mixer.gen2', 'mixer.noise', 'mixer.ext'],
      description:
        'The levels of Generator I, Generator II, the noise and the external input into the filter.',
    },
    {
      id: 'vcf',
      name: 'Filter',
      module: 'filter',
      controls: ['vcf.cutoff', 'vcf.resonance', 'vcf.mode', 'vcf.env', 'vcf.mod'],
      description:
        'Kuzmin’s filter, low-pass or band-pass, harsh and screaming at high resonance and able to self-oscillate.',
      specs: [
        { label: 'Modes', value: 'Low-pass 12 dB per octave, band-pass 6 dB per octave' },
        { label: 'Cutoff', value: '100 Hz to 10 kHz' },
        { label: 'Chips', value: 'K140UD12 programmable op-amps (µA776 equivalent)' },
      ],
    },
    {
      id: 'fenv',
      name: 'Filter envelope',
      module: 'env',
      meter: 'env1',
      controls: ['fenv.attack', 'fenv.decay', 'fenv.pedestal', 'fenv.release', 'fenv.mode'],
      stages: {
        attack: 'fenv.attack',
        decay: 'fenv.decay',
        sustain: 'fenv.pedestal',
        release: 'fenv.release',
      },
      description:
        'Attack, decay, pedestal (sustain) and after-sound (release), once per key or repeating while it is held.',
    },
    {
      id: 'aenv',
      name: 'Amplifier envelope',
      module: 'env',
      meter: 'env2',
      controls: ['aenv.attack', 'aenv.decay', 'aenv.pedestal', 'aenv.release', 'aenv.mode'],
      stages: {
        attack: 'aenv.attack',
        decay: 'aenv.decay',
        sustain: 'aenv.pedestal',
        release: 'aenv.release',
      },
      description:
        'Attack, decay, pedestal (sustain) and after-sound (release) for the loudness, once per key or repeating while it is held.',
    },
    {
      id: 'vca',
      name: 'Amplifier',
      module: 'amp',
      controls: ['vca.mod'],
      description: 'Shapes the loudness under its envelope, with the modulator for tremolo.',
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.level', 'out.enable', 'out.phones'],
      description: 'The output level and switch, the rear-panel outputs and the headphones.',
      specs: [{ label: 'Output', value: '0.025 V (low) and 0.25 V (high) into 10 kΩ' }],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'gen1', signal: 'cv', label: 'top key' },
    {
      id: 'c02',
      from: 'kbd',
      to: 'gen2',
      signal: 'cv',
      label: 'bottom key',
      when: { id: 'kbd.voices', eq: '2' },
    },
    {
      id: 'c03',
      from: 'kbd',
      to: 'gen2',
      signal: 'cv',
      label: 'top key',
      when: { id: 'kbd.voices', eq: '1' },
    },
    { id: 'c04', from: 'gen2', to: 'gen1', signal: 'audio', label: 'FM', levels: sq('gen1.fm') },
    ...mod('c05', 'gen1', 'pitch', sq('gen1.mod')),
    ...mod('c06', 'gen2', 'pitch', sq('gen2.mod')),
    { id: 'c07', from: 'gen1', to: 'mixer', signal: 'audio', levels: lvl('mixer.gen1') },
    { id: 'c08', from: 'gen2', to: 'mixer', signal: 'audio', levels: lvl('mixer.gen2') },
    { id: 'c09', from: 'noise', to: 'mixer', signal: 'audio', levels: lvl('mixer.noise') },
    { id: 'c11', from: 'mixer', to: 'vcf', signal: 'audio' },
    { id: 'c12', from: 'fenv', to: 'vcf', signal: 'cv', label: 'cutoff', levels: ['vcf.env'] },
    ...mod('c13', 'vcf', 'cutoff', sq('vcf.mod')),
    { id: 'c15', from: 'kbd', to: 'fenv', signal: 'gate' },
    { id: 'c16', from: 'kbd', to: 'aenv', signal: 'gate' },
    { id: 'c17', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c18', from: 'aenv', to: 'vca', signal: 'cv', label: 'loudness' },
    ...mod('c19', 'vca', 'tremolo', ['vca.mod']),
    {
      id: 'c20',
      from: 'vca',
      to: 'out',
      signal: 'audio',
      when: { id: 'out.enable', eq: true },
      levels: lvl('out.level'),
    },
  ],
  jacks: {},
  omitted: {
    extin:
      'The external input: the app has nothing to plug into it, so ВНЕШ. (on the mixer) has nothing to bring up.',
    c10: 'From the external input, which is left out.',
    c14: 'The pedal, which raises the cutoff, is not modelled: the app has no pedal input.',
  },
};
