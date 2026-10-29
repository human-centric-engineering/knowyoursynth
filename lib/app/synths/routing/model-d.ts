/**
 * Model D signal routing, projected from its spec (`.context/app/synth-data/model-d/model-d.synth.json`, 0.1.0):
 * block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/model-d.ts`).
 *
 * Where the definition says more than the spec, it decides: the mod bus's crossfade (MOD MIX fully right silences
 * source A, fully left source B) and its depth (MOD DEPTH squared, plus the mod wheel) are read from `toEngine()`,
 * which drops a source whose share of the depth is under `ROUTING_FLOOR`. So each source edge carries its share
 * times the depth, and matches the engine at the floor.
 */
import type { RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

const DEPTH: RoutingLevel[] = [{ sum: [{ id: 'mod.depth', pow: 2 }, WHEEL] }];
const SOURCE_A: RoutingLevel[] = [{ id: 'mod.mix', off: 10 }, ...DEPTH];
const SOURCE_B: RoutingLevel[] = ['mod.mix', ...DEPTH];
const OSC_SPECS = [
  { label: 'Frequency', value: '0.1 Hz to 20 kHz' },
  { label: 'Ranges', value: "LO, 32', 16', 8', 4', 2'" },
];

export const routing: SynthRouting = {
  synth: 'model-d',
  out: 'output',
  blocks: [
    {
      id: 'midi',
      name: 'MIDI / USB',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      description:
        'Turns incoming MIDI into the keyboard’s pitch, gate, pitch bend and mod wheel voltages.',
    },
    {
      id: 'pitch_bus',
      name: 'Master pitch',
      module: 'glide',
      description:
        'Adds up keyboard pitch, pitch bend, the OSC 1V/OCT input and TUNE, applies GLIDE, and sets the oscillators’ pitch.',
    },
    {
      id: 'mod_bus',
      name: 'Modulation mix',
      module: 'mod',
      passes: true,
      description:
        'Crossfades source A (Oscillator 3 or the filter contour) with source B (noise or the LFO), scales the result by MOD DEPTH and the mod wheel, and sends it to oscillator pitch, filter cutoff or both.',
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      meter: 'lfo',
      description:
        'A dedicated low-frequency oscillator. Both shapes are always on their jacks; the switch picks which one feeds the mod bus.',
      specs: [
        { label: 'Rate', value: '0.05 to 200 Hz (300 Hz with CV)' },
        { label: 'Shapes', value: 'Triangle, square' },
      ],
    },
    {
      id: 'osc1',
      name: 'Oscillator 1',
      module: 'osc',
      meter: 'osc1',
      description:
        'The reference oscillator: no fine-tune knob, its pitch set by RANGE and the master TUNE.',
      specs: [
        ...OSC_SPECS,
        {
          label: 'Waveforms',
          value: 'Triangle, triangle-saw, sawtooth, square, wide pulse, narrow pulse',
        },
      ],
    },
    {
      id: 'osc2',
      name: 'Oscillator 2',
      module: 'osc',
      meter: 'osc2',
      description: 'An oscillator with a detune knob of about seven semitones either way.',
      specs: [
        ...OSC_SPECS,
        {
          label: 'Waveforms',
          value: 'Triangle, triangle-saw, sawtooth, square, wide pulse, narrow pulse',
        },
      ],
    },
    {
      id: 'osc3',
      name: 'Oscillator 3',
      module: 'osc',
      meter: 'osc3',
      description:
        'An oscillator that doubles as a modulation source. Off keyboard control it runs free, usually at LO as a second LFO.',
      specs: [
        ...OSC_SPECS,
        {
          label: 'Waveforms',
          value: 'Triangle, reverse sawtooth, sawtooth, square, wide pulse, narrow pulse',
        },
      ],
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      description: 'White or pink noise: a sound source in the mixer and source B of the mod bus.',
      specs: [{ label: 'Colours', value: 'White, pink' }],
    },
    {
      id: 'ext_in',
      name: 'External input',
      module: 'mixer',
      symbol: 'input',
      description:
        'Audio from outside into the mixer. With nothing plugged into EXT, the main output is fed back here, the loop used for overdrive.',
      specs: [{ label: 'Input impedance', value: '1 MΩ' }],
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      passes: true,
      description: 'Five channels, each with a level knob and an on/off switch, into the filter.',
      specs: [{ label: 'Channels', value: 'Oscillators 1–3, external input, noise' }],
    },
    {
      id: 'filter',
      name: 'Ladder filter',
      module: 'filter',
      description: 'A transistor ladder filter with EMPHASIS (resonance), low-pass or high-pass.',
      specs: [
        { label: 'Slope', value: '24 dB per octave (4 poles)' },
        { label: 'Modes', value: 'Low-pass, high-pass' },
      ],
    },
    {
      id: 'filter_contour',
      name: 'Filter contour',
      module: 'env',
      meter: 'env1',
      description:
        'An attack, decay, sustain envelope for the cutoff. Release is either immediate or the decay time, set by FILTER DECAY.',
      specs: [{ label: 'Output', value: '0 to 4 V' }],
    },
    {
      id: 'loudness_contour',
      name: 'Loudness contour',
      module: 'env',
      meter: 'env2',
      description:
        'An attack, decay, sustain envelope for the amplifier. Release is either immediate or the decay time, set by LOUD DECAY.',
      specs: [
        { label: 'Output', value: '0 to 4.6 V' },
        { label: 'Dynamic range', value: '80 dB' },
      ],
    },
    {
      id: 'vca',
      name: 'Amplifier',
      module: 'amp',
      description: 'Sets the loudness after the filter, from the loudness contour and LOUD CV.',
    },
    {
      id: 'output',
      name: 'Output',
      module: 'out',
      description:
        'Master volume, the MAIN OUT switch, the headphone amplifier and the A-440 tone.',
    },
  ],
  edges: [
    { id: 'c01', from: 'midi', to: 'pitch_bus', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'midi', to: 'pitch_bus', signal: 'cv', label: 'pitch bend' },
    { id: 'c03', from: 'midi', to: 'mod_bus', signal: 'cv', label: 'mod wheel', levels: [WHEEL] },
    { id: 'c04', from: 'midi', to: 'filter_contour', signal: 'gate' },
    { id: 'c05', from: 'midi', to: 'loudness_contour', signal: 'gate' },
    { id: 'c10', from: 'pitch_bus', to: 'osc1', signal: 'cv', label: 'pitch' },
    { id: 'c11', from: 'pitch_bus', to: 'osc2', signal: 'cv', label: 'pitch' },
    {
      id: 'c12',
      from: 'pitch_bus',
      to: 'osc3',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'osc3.kbd', eq: true },
    },
    {
      id: 'c20',
      from: 'osc3',
      to: 'mod_bus',
      signal: 'cv',
      label: 'source A',
      when: { id: 'mod.srcA', eq: 'osc3' },
      levels: SOURCE_A,
    },
    {
      id: 'c21',
      from: 'filter_contour',
      to: 'mod_bus',
      signal: 'cv',
      label: 'source A',
      when: { id: 'mod.srcA', eq: 'eg' },
      levels: SOURCE_A,
    },
    {
      id: 'c22',
      from: 'noise',
      to: 'mod_bus',
      signal: 'cv',
      label: 'source B',
      when: { id: 'mod.srcB', eq: 'noise' },
      levels: SOURCE_B,
      breaks: 'j.modSrc',
    },
    {
      id: 'c23',
      from: 'lfo',
      to: 'mod_bus',
      signal: 'cv',
      label: 'source B',
      when: { id: 'mod.srcB', eq: 'lfo' },
      levels: SOURCE_B,
    },
    {
      id: 'c30',
      from: 'mod_bus',
      to: 'osc1',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'mod.toOsc', eq: true },
      levels: DEPTH,
    },
    {
      id: 'c31',
      from: 'mod_bus',
      to: 'osc2',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'mod.toOsc', eq: true },
      levels: DEPTH,
    },
    {
      id: 'c32',
      from: 'mod_bus',
      to: 'osc3',
      signal: 'cv',
      label: 'pitch',
      when: {
        all: [
          { id: 'mod.toOsc', eq: true },
          { id: 'osc3.kbd', eq: true },
        ],
      },
      levels: DEPTH,
    },
    {
      id: 'c33',
      from: 'mod_bus',
      to: 'filter',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'mod.toFilter', eq: true },
      levels: DEPTH,
    },
    ...[1, 2, 3].map((n) => ({
      id: `c4${n - 1}`,
      from: `osc${n}`,
      to: 'mixer',
      signal: 'audio' as const,
      when: { id: `mix.osc${n}On`, eq: true },
      levels: [`mix.osc${n}`],
    })),
    {
      id: 'c43',
      from: 'noise',
      to: 'mixer',
      signal: 'audio',
      when: { id: 'mix.noiseOn', eq: true },
      levels: ['mix.noise'],
    },
    {
      id: 'c44',
      from: 'ext_in',
      to: 'mixer',
      signal: 'audio',
      when: { id: 'mix.extOn', eq: true },
      levels: ['mix.ext'],
    },
    {
      id: 'c45',
      from: 'output',
      to: 'ext_in',
      signal: 'audio',
      label: 'feedback',
      breaks: 'j.ext',
    },
    { id: 'c50', from: 'mixer', to: 'filter', signal: 'audio' },
    {
      id: 'c51',
      from: 'filter_contour',
      to: 'filter',
      signal: 'cv',
      label: 'cutoff',
      levels: ['filter.contour'],
    },
    {
      id: 'c52',
      from: 'midi',
      to: 'filter',
      signal: 'cv',
      label: 'keyboard tracking',
      when: {
        any: [
          { id: 'filter.kbd1', eq: true },
          { id: 'filter.kbd2', eq: true },
        ],
      },
    },
    { id: 'c53', from: 'filter', to: 'vca', signal: 'audio' },
    { id: 'c54', from: 'loudness_contour', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c55', from: 'vca', to: 'output', signal: 'audio' },
  ],
  jacks: {
    'j.modSrc': 'mod_bus',
    'j.oscCv': 'pitch_bus',
    'j.lfoCv': 'lfo',
    'j.lfoTri': 'lfo',
    'j.lfoSq': 'lfo',
    'j.ext': 'ext_in',
    'j.mix': 'mixer',
    'j.cutCv': 'filter',
    'j.fcGate': 'filter_contour',
    'j.filtCont': 'filter_contour',
    'j.lcGate': 'loudness_contour',
    'j.loudCont': 'loudness_contour',
    'j.loudCv': 'vca',
    'j.main': 'output',
    'j.phones': 'output',
  },
};
