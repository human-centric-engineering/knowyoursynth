/**
 * Donner B1 signal routing, projected from its spec (`.context/app/synth-data/donner-b1/donner-b1.synth.json`,
 * 0.11.0): block and edge ids are the spec's module and connection ids; switches, levels and jacks are the
 * definition's (`defs/donner-b1.ts`).
 *
 * Every connection is fixed, and the saturation and delay pass the sound on dry when switched off, as the spec says,
 * so their blocks stay on the path. The effects run in the definition's order (saturation, then delay), which the
 * spec does not know. `toEngine()` gives the one envelope two halves, the filter's (`env1`, the block's meter) and a
 * slightly longer one for the amplifier (`env2`). MASTER is curved as `toEngine()` curves it. The ACCENT button sits
 * on the keyboard and SLIDE on the sequencer, as the spec files them. AUX IN and SYNC IN do nothing here, and SYNC
 * OUT gives the gate.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';

export const routing: SynthRouting = {
  synth: 'donner-b1',
  out: 'out',
  blocks: [
    {
      id: 'seq',
      name: 'Sequencer and arpeggiator',
      module: 'mode',
      controls: ['seq.slide'],
      description:
        'A 16-step sequencer with note, gate length, accent, slide and ratchet on each step, and an arpeggiator. Its notes play through the keyboard section. SLIDE, lit, slides every note.',
      specs: [
        { label: 'Steps', value: '16' },
        { label: 'Patterns', value: '128' },
        { label: 'Tempo', value: '40 to 240 BPM' },
        { label: 'Ratchet', value: '1 to 4' },
        { label: 'Arpeggiator', value: '8 modes' },
      ],
    },
    {
      id: 'kbd',
      name: 'Keyboard and note control',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      controls: ['seq.accent'],
      description:
        'The touch keys, MIDI and the sequencer’s notes become one pitch, gate and accent for the voice. ACCENT, lit, accents every note.',
      specs: [
        { label: 'Keys', value: '26 touch keys, B1 to C4' },
        { label: 'Range', value: '4 octaves, with octave shift' },
      ],
    },
    {
      id: 'vco',
      name: 'Oscillator',
      module: 'osc',
      meter: 'osc1',
      controls: ['vco.wave', 'vco.pitch'],
      description: 'One analogue oscillator, sawtooth or square, with a PITCH knob for tuning.',
      specs: [
        { label: 'Waveforms', value: 'Sawtooth, square' },
        { label: 'Pitch', value: 'A fifth either way, centre detent' },
      ],
    },
    {
      id: 'vcf',
      name: 'Filter',
      module: 'filter',
      controls: ['vcf.cutoff', 'vcf.resonance', 'vcf.depth'],
      description:
        'A resonant analogue low-pass filter, swept by the envelope through DEPTH and brightened on accented notes.',
      specs: [{ label: 'Type', value: 'Low-pass' }],
    },
    {
      id: 'env',
      name: 'Envelope',
      module: 'env',
      meter: 'env1',
      controls: ['env.decay'],
      description:
        'One decay envelope, started by each note, for the filter and the amplifier. It has no release stage.',
    },
    {
      id: 'vca',
      name: 'Amplifier',
      module: 'amp',
      controls: ['vca.accent'],
      description:
        'Shapes each note with the envelope; ACCENT sets how much louder accented notes play.',
    },
    {
      id: 'sat',
      name: 'Saturation',
      module: 'fx',
      controls: ['sat.on', 'sat.drive', 'sat.tone'],
      passes: true,
      description:
        'Switchable distortion, with DRIVE for gain and TONE for brightness. Off, it passes the sound on unchanged.',
    },
    {
      id: 'dly',
      name: 'Delay',
      module: 'fx',
      controls: ['dly.on', 'dly.level', 'dly.time', 'dly.feedback'],
      passes: true,
      description:
        'Switchable delay with LEVEL, TIME and FEEDBACK, one repeat at its minimum. Off, it passes the sound on dry.',
      specs: [
        { label: 'Time', value: 'Up to about 0.5 s' },
        { label: 'Type', value: 'Digital, tape-style' },
      ],
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.master'],
      description: 'MASTER sets the level at MAIN OUT and PHONES, with AUX IN mixed in.',
      specs: [
        { label: 'Line output', value: 'Up to +16 dBu, 1.5 kΩ' },
        { label: 'Headphones', value: '125 mW into 32 Ω' },
        { label: 'Aux input', value: 'Up to +5 dBu' },
      ],
    },
  ],
  edges: [
    { id: 'c01', from: 'seq', to: 'kbd', signal: 'cv', label: 'notes' },
    { id: 'c02', from: 'kbd', to: 'vco', signal: 'cv', label: 'pitch' },
    { id: 'c03', from: 'kbd', to: 'env', signal: 'gate' },
    { id: 'c04', from: 'env', to: 'vcf', signal: 'cv', label: 'cutoff', levels: ['vcf.depth'] },
    { id: 'c05', from: 'env', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c06', from: 'kbd', to: 'vcf', signal: 'cv', label: 'accent', levels: ['vca.accent'] },
    { id: 'c07', from: 'kbd', to: 'vca', signal: 'cv', label: 'accent', levels: ['vca.accent'] },
    { id: 'c08', from: 'vco', to: 'vcf', signal: 'audio' },
    { id: 'c09', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c10', from: 'vca', to: 'sat', signal: 'audio' },
    { id: 'c11', from: 'sat', to: 'dly', signal: 'audio' },
    {
      id: 'c12',
      from: 'dly',
      to: 'out',
      signal: 'audio',
      levels: [{ id: 'out.master', pow: 1.7 }],
    },
  ],
  jacks: {
    'j.auxIn': 'out',
    'j.phones': 'out',
    'j.syncIn': 'seq',
    'j.syncOut': 'seq',
  },
};
