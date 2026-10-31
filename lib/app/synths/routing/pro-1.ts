/**
 * Pro-1 signal routing, projected from its spec (`.context/app/synth-data/pro-1/pro-1.synth.json`, 0.5.0):
 * block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/pro-1.ts`).
 *
 * Where the definition says less than the spec, it decides. Its sequencer and arpeggiator switches are on the panel
 * but `toEngine()` ignores them, so those modules and their connections are omitted, the keyboard pitch (`c01`) is
 * drawn fixed, and the switches sit on the pitch block, which the spec says picks the note source. A cable in EXT
 * takes the noise's place at the NOISE/EXT level, as `toEngine()` does, so the EXT jack breaks the noise normal
 * (`c72`) and the external input needs no block of its own. GATE/CLK re-fires only the filter envelope.
 *
 * The matrix is read from `toEngine()`: a source reaches a destination when its ROUTE switch and the destination's
 * switch pick the same bus, at its AMOUNT squared, times the mod wheel on the WHEEL bus. One block carries both
 * buses, so each destination edge also needs some source routed to its bus. The engine scales each route by its
 * destination's range before its floor (`ROUTING_FLOOR`), which a source edge cannot say, so a source edge is
 * judged at the floor without it.
 */
import type { RoutingEdge, RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

type Bus = 'wheel' | 'direct';

const SOURCES = ['mod.envRoute', 'mod.oscBRoute', 'mod.lfoRoute'];
/** A source into the matrix, on one bus. */
const source = (id: string, from: string, key: string, bus: Bus): RoutingEdge => {
  const amount: RoutingLevel = { id: `mod.${key}Amt`, pow: 2 };
  return {
    id,
    from,
    to: 'mod_matrix',
    signal: 'cv',
    label: bus === 'wheel' ? 'WHEEL bus' : 'DIRECT bus',
    when: { id: `mod.${key}Route`, eq: bus },
    levels: bus === 'wheel' ? [amount, WHEEL] : [amount],
  };
};
/** The matrix to one destination, from one bus. */
const dest = (id: string, to: string, label: string, sw: string, bus: Bus): RoutingEdge => ({
  id,
  from: 'mod_matrix',
  to,
  signal: 'cv',
  label,
  when: { all: [{ id: sw, eq: bus }, { any: SOURCES.map((s) => ({ id: s, eq: bus })) }] },
  ...(bus === 'wheel' ? { levels: [WHEEL] } : {}),
});
const OSC_SPECS = [
  { label: 'Chip', value: '3340 VCO' },
  { label: 'Frequency', value: '32.7 Hz to 8.37 kHz' },
  { label: 'Ranges', value: 'Four octaves' },
  { label: 'Pulse width', value: '0 to 100%' },
];
const ENV_SPECS = [
  { label: 'Attack', value: '2 ms to 6.5 s' },
  { label: 'Decay', value: '2 ms to 15 s' },
  { label: 'Release', value: '2 ms to 25 s' },
  { label: 'Output', value: '0 to 5 V' },
];

export const routing: SynthRouting = {
  synth: 'pro-1',
  out: 'output',
  blocks: [
    {
      id: 'midi',
      name: 'MIDI / USB',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      description: 'Turns incoming MIDI into the keyboard’s pitch, gate and mod wheel.',
      specs: [{ label: 'Channel', value: '1 to 16, on the rear DIP switches' }],
    },
    {
      id: 'pitch_bus',
      name: 'Pitch',
      module: 'glide',
      controls: ['out.tune', 'glide.rate', 'glide.mode', 'seq.select', 'seq.transport', 'arp.mode'],
      description:
        'Adds the OSC CV input and MASTER TUNE to the keyboard pitch, applies GLIDE, and feeds the oscillators and filter tracking. The sequencer and arpeggiator switches are not modelled.',
    },
    {
      id: 'gate_logic',
      name: 'Gate',
      module: 'mode',
      controls: ['mode.retrig', 'mode.repeat', 'mode.drone', 'mode.poly'],
      description:
        'Makes the gate that fires both envelopes: from the keyboard, re-fired by the LFO with REPEAT, or held on with DRONE.',
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      controls: ['lfo.rate', 'lfo.saw', 'lfo.tri', 'lfo.pulse'],
      meter: 'lfo',
      description:
        'A low-frequency oscillator whose three shapes switch on together. A source in the matrix and the clock for REPEAT.',
      specs: [
        { label: 'Rate', value: '0.08 to 30 Hz' },
        { label: 'Shapes', value: 'Sawtooth, triangle, pulse' },
      ],
    },
    {
      id: 'osc_a',
      name: 'Oscillator A',
      module: 'osc',
      controls: ['oscA.freq', 'oscA.octave', 'oscA.saw', 'oscA.pulse', 'oscA.pw', 'oscA.sync'],
      meter: 'osc1',
      description:
        'An oscillator with sawtooth and pulse, on together if you like. Always on the keyboard, and hard-synced to Oscillator B with SYNC.',
      specs: [...OSC_SPECS, { label: 'Waveforms', value: 'Sawtooth, pulse' }],
    },
    {
      id: 'osc_b',
      name: 'Oscillator B',
      module: 'osc',
      controls: [
        'oscB.freq',
        'oscB.octave',
        'oscB.saw',
        'oscB.tri',
        'oscB.pulse',
        'oscB.pw',
        'oscB.lo',
        'oscB.kbd',
      ],
      meter: 'osc2',
      description:
        'An oscillator that doubles as a modulation source. LO FREQ and KYBD OFF make it a second LFO.',
      specs: [
        ...OSC_SPECS,
        { label: 'Waveforms', value: 'Sawtooth, triangle, pulse' },
        { label: 'LO FREQ', value: 'Around 60 Hz and below' },
      ],
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      description: 'White noise into the mixer. A cable in EXT takes its place.',
      specs: [{ label: 'Colours', value: 'White' }],
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      controls: ['mix.oscA', 'mix.oscB', 'mix.noise'],
      passes: true,
      description:
        'Three level knobs and no switches, into the filter: Oscillator A, Oscillator B, and noise or the EXT input.',
      specs: [{ label: 'EXT input impedance', value: '85 kΩ' }],
    },
    {
      id: 'filter',
      name: 'Low-pass filter',
      module: 'filter',
      controls: ['filter.cutoff', 'filter.res', 'filter.env', 'filter.kbd'],
      description:
        'A 4-pole low-pass filter with resonance, its cutoff moved by the filter envelope, the keyboard and the matrix.',
      specs: [
        { label: 'Slope', value: '24 dB per octave (4 poles)' },
        { label: 'Mode', value: 'Low-pass' },
      ],
    },
    {
      id: 'filter_env',
      name: 'Filter envelope',
      module: 'env',
      controls: ['fenv.attack', 'fenv.decay', 'fenv.sustain', 'fenv.release'],
      meter: 'env1',
      stages: {
        attack: 'fenv.attack',
        decay: 'fenv.decay',
        sustain: 'fenv.sustain',
        release: 'fenv.release',
      },
      description: 'An ADSR envelope for the cutoff, and a source in the matrix.',
      specs: ENV_SPECS,
    },
    {
      id: 'amp_env',
      name: 'Amplifier envelope',
      module: 'env',
      controls: ['aenv.attack', 'aenv.decay', 'aenv.sustain', 'aenv.release'],
      meter: 'env2',
      stages: {
        attack: 'aenv.attack',
        decay: 'aenv.decay',
        sustain: 'aenv.sustain',
        release: 'aenv.release',
      },
      description: 'An ADSR envelope for the amplifier.',
      specs: ENV_SPECS,
    },
    {
      id: 'vca',
      name: 'Amplifier',
      module: 'amp',
      description: 'Sets the loudness after the filter, from the amplifier envelope.',
    },
    {
      id: 'mod_matrix',
      name: 'Modulation matrix',
      module: 'mod',
      controls: [
        'mod.envAmt',
        'mod.envRoute',
        'mod.oscBAmt',
        'mod.oscBRoute',
        'mod.lfoAmt',
        'mod.lfoRoute',
        'mod.toAFreq',
        'mod.toAPw',
        'mod.toBFreq',
        'mod.toBPw',
        'mod.toFilter',
      ],
      passes: true,
      description:
        'Two buses. Each source goes, at its AMOUNT, to the DIRECT bus or the WHEEL bus (scaled by the mod wheel); each destination takes one bus or none.',
      specs: [
        { label: 'Sources', value: 'Filter envelope, Oscillator B, LFO' },
        {
          label: 'Destinations',
          value: 'Oscillator A pitch and pulse width, Oscillator B pitch and pulse width, cutoff',
        },
      ],
    },
    {
      id: 'output',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'Master volume, the audio outputs and the headphone socket.',
    },
  ],
  edges: [
    { id: 'c01', from: 'midi', to: 'pitch_bus', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'midi', to: 'gate_logic', signal: 'gate' },
    {
      id: 'c03',
      from: 'midi',
      to: 'mod_matrix',
      signal: 'cv',
      label: 'mod wheel',
      levels: [WHEEL],
    },
    {
      id: 'c22',
      from: 'lfo',
      to: 'gate_logic',
      signal: 'gate',
      label: 'repeat',
      when: { id: 'mode.repeat', eq: true },
    },
    { id: 'c30', from: 'gate_logic', to: 'filter_env', signal: 'gate' },
    { id: 'c31', from: 'gate_logic', to: 'amp_env', signal: 'gate' },
    { id: 'c40', from: 'pitch_bus', to: 'osc_a', signal: 'cv', label: 'pitch' },
    {
      id: 'c41',
      from: 'pitch_bus',
      to: 'osc_b',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'oscB.kbd', eq: true },
    },
    {
      id: 'c42',
      from: 'pitch_bus',
      to: 'filter',
      signal: 'cv',
      label: 'keyboard tracking',
      levels: ['filter.kbd'],
    },
    {
      id: 'c43',
      from: 'osc_b',
      to: 'osc_a',
      signal: 'audio',
      label: 'sync',
      when: { id: 'oscA.sync', eq: true },
    },
    source('c50', 'filter_env', 'env', 'direct'),
    source('c51', 'filter_env', 'env', 'wheel'),
    source('c52', 'osc_b', 'oscB', 'direct'),
    source('c53', 'osc_b', 'oscB', 'wheel'),
    source('c54', 'lfo', 'lfo', 'direct'),
    source('c55', 'lfo', 'lfo', 'wheel'),
    dest('c60', 'osc_a', 'pitch', 'mod.toAFreq', 'direct'),
    dest('c61', 'osc_a', 'pitch', 'mod.toAFreq', 'wheel'),
    dest('c62', 'osc_a', 'pulse width', 'mod.toAPw', 'direct'),
    dest('c63', 'osc_a', 'pulse width', 'mod.toAPw', 'wheel'),
    dest('c64', 'osc_b', 'pitch', 'mod.toBFreq', 'direct'),
    dest('c65', 'osc_b', 'pitch', 'mod.toBFreq', 'wheel'),
    dest('c66', 'osc_b', 'pulse width', 'mod.toBPw', 'direct'),
    dest('c67', 'osc_b', 'pulse width', 'mod.toBPw', 'wheel'),
    dest('c68', 'filter', 'cutoff', 'mod.toFilter', 'direct'),
    dest('c69', 'filter', 'cutoff', 'mod.toFilter', 'wheel'),
    { id: 'c70', from: 'osc_a', to: 'mixer', signal: 'audio', levels: ['mix.oscA'] },
    { id: 'c71', from: 'osc_b', to: 'mixer', signal: 'audio', levels: ['mix.oscB'] },
    {
      id: 'c72',
      from: 'noise',
      to: 'mixer',
      signal: 'audio',
      levels: ['mix.noise'],
      breaks: 'j.ext',
    },
    { id: 'c80', from: 'mixer', to: 'filter', signal: 'audio' },
    {
      id: 'c81',
      from: 'filter_env',
      to: 'filter',
      signal: 'cv',
      label: 'cutoff',
      levels: ['filter.env'],
    },
    { id: 'c82', from: 'filter', to: 'vca', signal: 'audio' },
    { id: 'c83', from: 'amp_env', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c84', from: 'vca', to: 'output', signal: 'audio' },
  ],
  jacks: {
    'j.modWh': 'mod_matrix',
    'j.oscCv': 'pitch_bus',
    'j.gateClk': 'filter_env',
    'j.lfoCv': 'lfo',
    'j.lfoOut': 'lfo',
    'j.kybdCv': 'pitch_bus',
    'j.gate': 'gate_logic',
    'j.ext': 'mixer',
    'j.mixer': 'mixer',
    'j.cutoffCv': 'filter',
    'j.resoCv': 'filter',
    'j.filterEnv': 'filter_env',
    'j.ampEnv': 'amp_env',
    'j.phones': 'output',
    'j.audioOut': 'output',
  },
  omitted: {
    sequencer: 'Not modelled: toEngine() ignores the sequencer switches.',
    arpeggiator: 'Not modelled: toEngine() ignores the ARP switch.',
    ext_in:
      'Drawn as the EXT jack on the mixer: a cable there breaks c72 and plays at its NOISE/EXT level.',
    c04: 'Sequencer recording is not modelled.',
    c05: 'Sequencer recording is not modelled.',
    c06: 'The arpeggiator is not modelled.',
    c10: 'The sequencer is not modelled.',
    c11: 'The sequencer is not modelled.',
    c12: 'The arpeggiator is not modelled.',
    c13: 'The arpeggiator is not modelled.',
    c20: 'The sequencer clock is not modelled.',
    c21: 'The arpeggiator clock is not modelled.',
    c73: 'A cable in EXT takes the place of the noise on c72.',
  },
};
