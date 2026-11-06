/**
 * PWM Malevolent signal routing, projected from its spec (`.context/app/synth-data/malevolent/malevolent.synth.json`,
 * 0.13.0): block and edge ids are the spec's module and connection ids; switches, levels and jacks are the
 * definition's (`defs/malevolent.ts`).
 *
 * Every normal printed under an input (`c02`–`c05`, `c07`–`c10`, `c13`–`c20`) is broken by a cable in that jack, and
 * each depth knob scales its normal as it scales a cable there. A VCO reaches the mixer only with a wave button lit and
 * its LEVEL up (`c06`, `c11`). The VCA's AM 1 normal (`c19`) is the loudness: DRONE holds the VCA open besides, which
 * `out` reaches through `c21` either way. The joystick (`c01`) is drawn into the keyboard block, as the spec files it;
 * the keyboard's own pitch, gate and velocity reach the voice through the normals.
 */
import type {
  RoutingBlock,
  RoutingEdge,
  RoutingLevel,
  SynthRouting,
} from '@/lib/app/synths/contract';

/** A VCO is heard in the mixer while at least one of its wave buttons is lit and its LEVEL is up. */
const waves = (n: number): RoutingLevel => ({
  sum: ['saw', 'tri', 'pulse'].map((w) => ({ id: `vco${n}.${w}`, off: false })),
});
/** The four normals into one VCO. */
const vcoIns = (n: number, ids: [string, string, string, string]): RoutingEdge[] => [
  {
    id: ids[0],
    from: 'keys',
    to: `vco${n}`,
    signal: 'cv',
    label: 'pitch',
    breaks: `j.vco${n}_voct`,
  },
  {
    id: ids[1],
    from: 'lfo',
    to: `vco${n}`,
    signal: 'cv',
    label: 'shape',
    levels: [`vco${n}.shapeMod`],
    breaks: `j.vco${n}_shape`,
  },
  {
    id: ids[2],
    from: 'env1',
    to: `vco${n}`,
    signal: 'cv',
    label: 'FM 1',
    levels: [`vco${n}.fm1`],
    breaks: `j.vco${n}_fm1`,
  },
  {
    id: ids[3],
    from: 'lfo',
    to: `vco${n}`,
    signal: 'cv',
    label: 'FM 2',
    levels: [`vco${n}.fm2`],
    breaks: `j.vco${n}_fm2`,
  },
];
const VCO_SPECS = [
  { label: 'Core', value: '4046' },
  { label: 'Waves', value: 'Saw, triangle and pulse, mixed by three buttons' },
];
const vco = (n: 1 | 2): RoutingBlock => ({
  id: `vco${n}`,
  name: `VCO ${n}`,
  module: 'osc',
  meter: n === 1 ? 'osc1' : 'osc2',
  controls: [
    `vco${n}.coarse`,
    `vco${n}.fine`,
    `vco${n}.shape`,
    `vco${n}.shapeMod`,
    `vco${n}.fm1`,
    `vco${n}.fm2`,
    `vco${n}.saw`,
    `vco${n}.tri`,
    `vco${n}.pulse`,
    `vco${n}.level`,
  ],
  description: `An oscillator whose saw, triangle and pulse each have a jack, and whose three buttons pick which of them reach its OUT and the mixer. SHAPE is the pulse width; FM 1 and FM 2 move its pitch.`,
  specs: VCO_SPECS,
});
const env = (n: 1 | 2): RoutingBlock => ({
  id: `env${n}`,
  name: `Envelope ${n}`,
  module: 'env',
  meter: n === 1 ? 'env1' : 'env2',
  controls: [`env${n}.attack`, `env${n}.decay`, `env${n}.sustain`, `env${n}.release`],
  stages: {
    attack: `env${n}.attack`,
    decay: `env${n}.decay`,
    sustain: `env${n}.sustain`,
    release: `env${n}.release`,
  },
  description:
    n === 1
      ? 'An ADSR with its own gate input, wired to the VCOs’ and the filter’s FM 1: the filter (and pitch) envelope.'
      : 'An ADSR with its own gate input, wired to the VCA’s AM 1: the loudness envelope.',
});

export const routing: SynthRouting = {
  synth: 'malevolent',
  out: 'out',
  blocks: [
    {
      id: 'keys',
      name: 'Keyboard, joystick and arpeggiator',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      controls: [
        'keys.arpRate',
        'keys.arp',
        'keys.hold',
        'keys.octDown',
        'keys.octUp',
        'keys.vibrato',
        'joy.x',
        'joy.y',
      ],
      description:
        'The 32 keys, MIDI and the arpeggiator, giving the pitch, gate and velocity the patch plays from, and the joystick that bends, glides, adds vibrato and holds.',
      specs: [
        { label: 'Keys', value: '32 mini keys, velocity sensing, octave ±4' },
        { label: 'Arpeggiator', value: 'Six orders, up to six octaves, clock sync' },
      ],
    },
    {
      id: 'joy',
      name: 'Joystick',
      module: 'mod',
      description:
        'Left and right bend the pitch; up glides, or with VIBRATO adds a 5 Hz vibrato; down holds the notes. Its controls are on the keyboard block.',
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.rate'],
      description:
        'One LFO with a triangle and a square output. The triangle is normalled to both VCOs’ SHAPE and FM 2, the filter’s FM 2 and the VCA’s AM 2.',
      specs: [{ label: 'Waves', value: 'Triangle, square' }],
    },
    vco(1),
    vco(2),
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      description: 'White noise, with its own jack and a level in the mixer.',
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      passes: true,
      controls: ['mix.noise', 'mix.aux'],
      description:
        'Sums both VCOs (their levels are in their own sections), the noise and AUX, into the filter’s LOW PASS input.',
    },
    {
      id: 'vcf',
      name: 'Filter',
      module: 'filter',
      controls: ['vcf.cutoff', 'vcf.res', 'vcf.fm1', 'vcf.fm2'],
      description:
        'A 2-pole multimode filter with separate low-pass, band-pass and high-pass inputs into one output, so different sources can be filtered differently at once. It self-oscillates early.',
      specs: [
        { label: 'Type', value: '2-pole Sallen-Key, opto-FET controlled' },
        { label: 'Inputs', value: 'Low pass, band pass, high pass' },
      ],
    },
    env(1),
    env(2),
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      controls: ['vca.drive', 'vca.am1', 'vca.am2', 'vca.mode'],
      description:
        'Opened by AM 1 (Envelope 2) and AM 2 (the LFO triangle) at their depth knobs, or held open by DRONE. DRIVE overdrives its input.',
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.master'],
      description:
        'The top-panel OUT at full level, and MASTER VOL to the line and headphone outputs.',
    },
  ],
  edges: [
    { id: 'c01', from: 'joy', to: 'keys', signal: 'cv', label: 'bend, glide, vibrato, hold' },
    ...vcoIns(1, ['c02', 'c03', 'c04', 'c05']),
    {
      id: 'c06',
      from: 'vco1',
      to: 'mixer',
      signal: 'audio',
      levels: [waves(1), 'vco1.level'],
    },
    ...vcoIns(2, ['c07', 'c08', 'c09', 'c10']),
    {
      id: 'c11',
      from: 'vco2',
      to: 'mixer',
      signal: 'audio',
      levels: [waves(2), 'vco2.level'],
    },
    { id: 'c12', from: 'noise', to: 'mixer', signal: 'audio', levels: ['mix.noise'] },
    { id: 'c13', from: 'mixer', to: 'vcf', signal: 'audio', label: 'low pass', breaks: 'j.vcf_lp' },
    {
      id: 'c14',
      from: 'env1',
      to: 'vcf',
      signal: 'cv',
      label: 'FM 1',
      levels: ['vcf.fm1'],
      breaks: 'j.vcf_fm1',
    },
    {
      id: 'c15',
      from: 'lfo',
      to: 'vcf',
      signal: 'cv',
      label: 'FM 2',
      levels: ['vcf.fm2'],
      breaks: 'j.vcf_fm2',
    },
    { id: 'c16', from: 'vcf', to: 'vca', signal: 'audio', breaks: 'j.vca_in' },
    { id: 'c17', from: 'keys', to: 'env1', signal: 'gate', breaks: 'j.env1_gate' },
    { id: 'c18', from: 'keys', to: 'env2', signal: 'gate', breaks: 'j.env2_gate' },
    {
      id: 'c19',
      from: 'env2',
      to: 'vca',
      signal: 'cv',
      label: 'AM 1',
      levels: ['vca.am1'],
      breaks: 'j.vca_am1',
    },
    {
      id: 'c20',
      from: 'lfo',
      to: 'vca',
      signal: 'cv',
      label: 'AM 2',
      levels: ['vca.am2'],
      breaks: 'j.vca_am2',
    },
    { id: 'c21', from: 'vca', to: 'out', signal: 'audio' },
  ],
  jacks: {
    'j.pitch': 'keys',
    'j.vel': 'keys',
    'j.gate': 'keys',
    'j.lfo_tri': 'lfo',
    'j.lfo_sq': 'lfo',
    'j.vco1_saw': 'vco1',
    'j.vco1_tri': 'vco1',
    'j.vco1_pulse': 'vco1',
    'j.vco1_out': 'vco1',
    'j.vco1_voct': 'vco1',
    'j.vco1_shape': 'vco1',
    'j.vco1_fm1': 'vco1',
    'j.vco1_fm2': 'vco1',
    'j.vco2_saw': 'vco2',
    'j.vco2_tri': 'vco2',
    'j.vco2_pulse': 'vco2',
    'j.vco2_out': 'vco2',
    'j.vco2_voct': 'vco2',
    'j.vco2_shape': 'vco2',
    'j.vco2_fm1': 'vco2',
    'j.vco2_fm2': 'vco2',
    'j.noise': 'noise',
    'j.mix_out': 'mixer',
    'j.aux': 'mixer',
    'j.vcf_lp': 'vcf',
    'j.vcf_bp': 'vcf',
    'j.vcf_hp': 'vcf',
    'j.vcf_fm1': 'vcf',
    'j.vcf_fm2': 'vcf',
    'j.vcf_out': 'vcf',
    'j.env1_out': 'env1',
    'j.env2_out': 'env2',
    'j.env1_gate': 'env1',
    'j.env2_gate': 'env2',
    'j.vca_in': 'vca',
    'j.vca_am1': 'vca',
    'j.vca_am2': 'vca',
    'j.out': 'out',
  },
  omitted: {},
};
