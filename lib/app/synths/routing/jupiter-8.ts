/**
 * Jupiter-8 signal routing, projected from its spec (`.context/app/synth-data/jupiter-8/jupiter-8.synth.json`,
 * 0.10.0): block and edge ids are the spec's module and connection ids; switches, levels and jacks are the
 * definition's (`defs/jupiter-8.ts`). One voice's path is drawn, with the LFOs, bender and assigner every voice shares.
 *
 * Where the definition says more than the spec, it decides. PWM reaches only a VCO playing its pulse wave
 * (`c25`–`c28`). The source mix is a crossfade, so fully right silences VCO-1 and fully left VCO-2 (`c06`, `c07`), and
 * VCO-2's noise rides on its side. The performance LFO needs LFO MODULATION on as well as its VCO or VCF switch (`c11`,
 * `c15`, `c19`). The VCO MOD depths and CROSS MOD are squared, as `toEngine()` reads them. The bender is the app's mod
 * wheel, so its sends carry the wheel (`c10`, `c14`, `c18`). VCA LEVEL scales the voice out of the VCA and VOLUME the
 * way out, both curved as `toEngine()` curves them (`c23`).
 *
 * Where it says less, it decides too. It plays one patch on all eight voices, so KEY MODE, PANEL MODE and BALANCE do
 * not change the sound; it has no jacks, so the highest-note CV and gate out is left out with its connections, and an
 * external arpeggio clock stops the arpeggio; it keeps no patch memory.
 */
import type { RoutingWhen, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

const VCO_MOD = ['vcomod.lfo', 'vcomod.env', 'vcomod.target'];
const PWM = ['pwm.amount', 'pwm.mode'];
const PLFO_VCO: RoutingWhen = {
  all: [
    { id: 'plfo.on', eq: true },
    { id: 'plfo.vco', eq: true },
  ],
};
const ENV_SPECS = [
  { label: 'Attack', value: '1 ms to 5 s' },
  { label: 'Decay', value: '1 ms to 10 s' },
  { label: 'Sustain', value: '0 to 100 %' },
  { label: 'Release', value: '1 ms to 10 s' },
];

export const routing: SynthRouting = {
  synth: 'jupiter-8',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Keyboard and assigner',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      controls: [
        'assign.mode',
        'arp.mode',
        'arp.rate',
        'arp.range',
        'arp.clock',
        'kbd.holdLower',
        'kbd.holdUpper',
        'glide.mode',
        'glide.time',
        'out.tune',
      ],
      description:
        'Hands the notes to the eight voices by ASSIGN MODE, or to the arpeggio, with portamento and the master tune. Sends pitch and gates to every voice.',
      specs: [
        { label: 'Keys', value: '61' },
        { label: 'Voices', value: '8' },
        { label: 'Arpeggio', value: 'Up, down, up and down, random; 1 to 20 Hz' },
        { label: 'Arpeggio range', value: '1 to 4 octaves' },
        { label: 'Master tune', value: '±50 cents' },
      ],
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.rate', 'lfo.delay', 'lfo.wave'],
      description: 'The programmable LFO every voice shares, with a delay before it comes in.',
      specs: [
        { label: 'Rate', value: '0.05 to 40 Hz' },
        { label: 'Delay', value: '0 to 4 s' },
        { label: 'Waveforms', value: 'Sine, sawtooth, square, random' },
      ],
    },
    {
      id: 'lfo2',
      name: 'Performance LFO',
      module: 'lfo',
      controls: ['plfo.on', 'plfo.vco', 'plfo.vcf', 'plfo.vcoDepth', 'plfo.vcfDepth', 'plfo.rise'],
      description:
        'A second LFO for vibrato and growl by hand, brought in by LFO MODULATION over its RISE TIME.',
    },
    {
      id: 'vco1',
      name: 'VCO-1',
      module: 'osc',
      meter: 'osc1',
      controls: ['vco1.range', 'vco1.wave', 'vco1.xmod', ...VCO_MOD, ...PWM],
      description: 'The first oscillator, cross-modulated by VCO-2 at audio rate by CROSS MOD.',
      specs: [
        { label: 'Ranges', value: "16', 8', 4', 2'" },
        { label: 'Waveforms', value: 'Triangle, sawtooth, pulse, square' },
      ],
    },
    {
      id: 'vco2',
      name: 'VCO-2',
      module: 'osc',
      meter: 'osc2',
      controls: [
        'vco2.range',
        'vco2.fine',
        'vco2.wave',
        'vco2.lowFreq',
        'vco2.sync',
        ...VCO_MOD,
        ...PWM,
      ],
      description:
        'The second oscillator, with noise among its waveforms and sync to VCO-1. In LOW FREQ it leaves the keys and runs as a slow modulator.',
      specs: [
        { label: 'Range', value: "16' to 2', chromatic, with a low-frequency mode" },
        { label: 'Fine tune', value: '±50 cents' },
        { label: 'Waveforms', value: 'Sine, sawtooth, pulse, noise' },
      ],
    },
    {
      id: 'mix',
      name: 'Source mix',
      module: 'mixer',
      controls: ['mix.balance'],
      passes: true,
      description: 'Balances VCO-1 against VCO-2: both at full level in the middle.',
    },
    {
      id: 'hpf',
      name: 'High-pass filter',
      module: 'filter',
      controls: ['hpf.cutoff'],
      description: 'A high-pass filter with no resonance, ahead of the low-pass.',
      specs: [{ label: 'Slope', value: '6 dB per octave' }],
    },
    {
      id: 'vcf',
      name: 'Low-pass filter',
      module: 'filter',
      controls: [
        'vcf.cutoff',
        'vcf.res',
        'vcf.slope',
        'vcf.envSel',
        'vcf.env',
        'vcf.lfo',
        'vcf.kbd',
      ],
      description:
        'A resonant low-pass, 12 or 24 dB per octave, swept by an envelope, the LFO, the performance LFO, the bender and the keys.',
      specs: [
        { label: 'Slopes', value: '12 or 24 dB per octave' },
        { label: 'Key follow', value: '0 to 120 %' },
      ],
    },
    {
      id: 'env1',
      name: 'ENV-1',
      module: 'env',
      meter: 'env1',
      controls: [
        'env1.attack',
        'env1.decay',
        'env1.sustain',
        'env1.release',
        'env1.kf',
        'env1.polarity',
      ],
      description:
        'An ADSR with key follow and polarity, for the VCOs’ pitch and pulse width, and the filter if picked.',
      specs: ENV_SPECS,
    },
    {
      id: 'env2',
      name: 'ENV-2',
      module: 'env',
      meter: 'env2',
      controls: ['env2.attack', 'env2.decay', 'env2.sustain', 'env2.release', 'env2.kf'],
      description: 'An ADSR with key follow for the VCA, and the filter if picked.',
      specs: ENV_SPECS,
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      controls: ['vca.level', 'vca.lfo'],
      description: 'Shapes each voice with ENV-2, with LFO tremolo in four steps.',
      specs: [{ label: 'LFO mod', value: '0, 1, 2, 3' }],
    },
    {
      id: 'bend',
      name: 'Bender',
      module: 'mod',
      controls: ['bend.vcoSens', 'bend.vcfSens', 'bend.vco1', 'bend.vco2', 'bend.vcf'],
      description:
        'The bender lever, with separate depths on pitch and cutoff and a switch for each destination. The app’s mod wheel stands in for it pushed to the right.',
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.volume', 'out.balance'],
      description: 'Master VOLUME to the upper, lower and mix outputs and the headphones.',
      specs: [
        { label: 'Balanced', value: 'Upper and lower, 600 Ω, 0 dBm' },
        { label: 'Unbalanced', value: 'Upper, mix, lower, 1 kΩ, 0 or −20 dBm' },
        { label: 'Phones', value: 'Stereo, 8 Ω, L/M/H' },
      ],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'vco1', signal: 'cv', label: 'pitch' },
    {
      id: 'c02',
      from: 'kbd',
      to: 'vco2',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'vco2.lowFreq', eq: false },
    },
    { id: 'c03', from: 'kbd', to: 'env1', signal: 'gate' },
    { id: 'c04', from: 'kbd', to: 'env2', signal: 'gate' },
    {
      id: 'c05',
      from: 'vco2',
      to: 'vco1',
      signal: 'audio',
      label: 'cross mod',
      levels: [{ id: 'vco1.xmod', pow: 2 }],
    },
    {
      id: 'c06',
      from: 'vco1',
      to: 'mix',
      signal: 'audio',
      levels: [{ id: 'mix.balance', off: 10 }],
    },
    { id: 'c07', from: 'vco2', to: 'mix', signal: 'audio', levels: ['mix.balance'] },
    { id: 'c08', from: 'env2', to: 'vca', signal: 'cv', label: 'loudness' },
    {
      id: 'c09',
      from: 'lfo',
      to: 'vca',
      signal: 'cv',
      label: 'tremolo',
      levels: [{ id: 'vca.lfo', off: 0 }],
    },
    {
      id: 'c10',
      from: 'bend',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'bend.vcf', eq: true },
      levels: ['bend.vcfSens', WHEEL],
    },
    {
      id: 'c11',
      from: 'lfo2',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: {
        all: [
          { id: 'plfo.on', eq: true },
          { id: 'plfo.vcf', eq: true },
        ],
      },
      levels: ['plfo.vcfDepth'],
    },
    ...([1, 2] as const).flatMap((n) => {
      const picked: RoutingWhen = { id: 'vcomod.target', in: [`vco${n}`, 'both'] };
      return [
        {
          id: n === 1 ? 'c12' : 'c16',
          from: 'lfo',
          to: `vco${n}`,
          signal: 'cv' as const,
          label: 'pitch',
          when: picked,
          levels: [{ id: 'vcomod.lfo', pow: 2 }],
        },
        {
          id: n === 1 ? 'c13' : 'c17',
          from: 'env1',
          to: `vco${n}`,
          signal: 'cv' as const,
          label: 'pitch',
          when: picked,
          levels: [{ id: 'vcomod.env', pow: 2 }],
        },
        {
          id: n === 1 ? 'c14' : 'c18',
          from: 'bend',
          to: `vco${n}`,
          signal: 'cv' as const,
          label: 'pitch',
          when: { id: `bend.vco${n}`, eq: true },
          levels: ['bend.vcoSens', WHEEL],
        },
        {
          id: n === 1 ? 'c15' : 'c19',
          from: 'lfo2',
          to: `vco${n}`,
          signal: 'cv' as const,
          label: 'pitch',
          when: PLFO_VCO,
          levels: ['plfo.vcoDepth'],
        },
      ];
    }),
    { id: 'c20', from: 'mix', to: 'hpf', signal: 'audio' },
    { id: 'c21', from: 'hpf', to: 'vcf', signal: 'audio' },
    { id: 'c22', from: 'vcf', to: 'vca', signal: 'audio' },
    {
      id: 'c23',
      from: 'vca',
      to: 'out',
      signal: 'audio',
      levels: [
        { id: 'vca.level', pow: 1.7 },
        { id: 'out.volume', pow: 1.7 },
      ],
    },
    {
      id: 'c24',
      from: 'vco1',
      to: 'vco2',
      signal: 'audio',
      label: 'sync',
      when: { id: 'vco2.sync', eq: true },
    },
    ...([1, 2] as const).flatMap((n) => [
      {
        id: n === 1 ? 'c25' : 'c27',
        from: 'lfo',
        to: `vco${n}`,
        signal: 'cv' as const,
        label: 'pulse width',
        when: {
          all: [
            { id: 'pwm.mode', eq: 'lfo' },
            { id: `vco${n}.wave`, eq: 'pulse' },
          ],
        },
        levels: ['pwm.amount'],
      },
      {
        id: n === 1 ? 'c26' : 'c28',
        from: 'env1',
        to: `vco${n}`,
        signal: 'cv' as const,
        label: 'pulse width',
        when: {
          all: [
            { id: 'pwm.mode', eq: 'env1' },
            { id: `vco${n}.wave`, eq: 'pulse' },
          ],
        },
        levels: ['pwm.amount'],
      },
    ]),
    {
      id: 'c29',
      from: 'env1',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'vcf.envSel', eq: 'env1' },
      levels: ['vcf.env'],
    },
    {
      id: 'c30',
      from: 'env2',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'vcf.envSel', eq: 'env2' },
      levels: ['vcf.env'],
    },
    { id: 'c31', from: 'lfo', to: 'vcf', signal: 'cv', label: 'cutoff', levels: ['vcf.lfo'] },
    { id: 'c32', from: 'kbd', to: 'vcf', signal: 'cv', label: 'key follow', levels: ['vcf.kbd'] },
  ],
  jacks: {},
  omitted: {
    memory: 'The definition keeps no patch memory: patches are kept in the library.',
    cvout: 'The definition has no CV OUT or GATE OUT jacks.',
    c33: 'The highest note into the CV out: the definition has no CV OUT jack.',
    c34: 'The gate into the gate out: the definition has no GATE OUT jack.',
  },
};
