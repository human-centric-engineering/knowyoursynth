/**
 * Jupiter-6 signal routing, projected from its spec (`.context/app/synth-data/jupiter-6/jupiter-6.synth.json`,
 * 0.10.0): block and edge ids are the spec's module and connection ids; switches, levels and jacks are the
 * definition's (`defs/jupiter-6.ts`). One voice's path is drawn, with the LFOs, bender and assigner every voice shares.
 *
 * Where the definition says more than the spec, it decides. The VCO MOD selector is two buttons, VCO-1 and VCO-2,
 * either or both lit (`c12`, `c13`, `c16`, `c17`). PWM reaches only a VCO whose PULSE is lit, not VCO-1's fixed
 * SQUARE (`c27`–`c30`). SYNC 1→2 wins when both sync buttons are lit (`c26`). MIX is a crossfade, so fully right
 * silences VCO-1 and fully left VCO-2 (`c06`, `c07`), and VCO-2's noise rides on its side. Every depth is curved as
 * `toEngine()` curves it: VCO MOD LFO to the 2.5, VCO MOD ENV, CROSS MOD and LFO-2's VCO depth squared, the filter's
 * LFO to the 1.6. The bender is the app's mod wheel, so its sends carry the wheel (`c10`, `c14`, `c18`), and WIDE
 * bends three octaves whatever BEND VCO says. ENV-2 LEVEL scales the voice out of the VCA, and VOLUME the way out
 * (`c20`). With neither filter button lit the filter is a low-pass.
 *
 * Where it says less, it decides too. It plays one patch on all six voices, so KEY MODE, PANEL MODE, BALANCE and BENDER
 * are printed only; it has no jacks, and keeps no patch memory. MIDI is the app's, playing the keyboard (`c21`).
 */
import type { RoutingLevel, RoutingWhen, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

const VCO_MOD = ['vcomod.lfo', 'vcomod.env'];
const PWM = ['pwm.pw', 'pwm.depth', 'pwm.src'];
const BEND_VCO: RoutingLevel[] = [{ sum: ['bend.vco', { id: 'bend.wide', off: false }] }, WHEEL];
const LFO2_VCO: RoutingLevel[] = [{ id: 'lfo2.vco', pow: 2 }];
const LFO2_ON: RoutingWhen = { id: 'lfo2.on', eq: true };
/** VCO-2's RANGE above LOW, where it follows the keys. */
const KEYED = Array.from({ length: 61 }, (_, i) => i + 12);
const ENV_SPECS = [
  { label: 'Attack', value: 'Up to 18 s' },
  { label: 'Decay', value: 'Up to 20 s' },
  { label: 'Release', value: 'Up to 20 s' },
  { label: 'Key follow', value: '0 to 120 %' },
];

export const routing: SynthRouting = {
  synth: 'jupiter-6',
  out: 'out',
  blocks: [
    {
      id: 'midi',
      name: 'MIDI',
      module: 'util',
      symbol: 'midi',
      description: 'Note on and off from outside, played on the keyboard. Here the app’s MIDI.',
    },
    {
      id: 'kbd',
      name: 'Keyboard and assigner',
      module: 'util',
      meter: 'gate',
      controls: [
        'voice.assign',
        'voice.solo',
        'voice.detune',
        'arp.up',
        'arp.down',
        'arp.rate',
        'arp.range',
        'arp.hold',
        'glide.time',
        'glide.porta',
        'glide.gliss',
        'out.tune',
      ],
      description:
        'Hands the notes to the six voices by ASSIGN, or to the arpeggio, with glide and the master tune. Sends pitch and gates to every voice.',
      specs: [
        { label: 'Keys', value: '61' },
        { label: 'Voices', value: '6' },
        { label: 'Arpeggio', value: 'Up, down, up and down, down and up; 1 to 25 Hz' },
        { label: 'Arpeggio range', value: '1 to 4 octaves' },
        { label: 'Glide', value: '0 to 1.6 s per octave' },
        { label: 'Unison detune', value: '±50 cents' },
        { label: 'Master tune', value: '±50 cents' },
      ],
    },
    {
      id: 'lfo',
      name: 'LFO-1',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.rate', 'lfo.delay', 'lfo.wave'],
      description: 'The programmable LFO every voice shares, with a delay before it comes in.',
      specs: [
        { label: 'Rate', value: '0.04 to 100 Hz (random to 400 Hz)' },
        { label: 'Delay', value: '0 to 2 s' },
        { label: 'Waveforms', value: 'Triangle, sawtooth, square, random' },
      ],
    },
    {
      id: 'lfo2',
      name: 'LFO-2',
      module: 'lfo',
      controls: ['lfo2.on', 'lfo2.vco', 'lfo2.vcf', 'lfo2.rate', 'lfo2.rise'],
      description:
        'A second LFO for vibrato and growl by hand, brought in by LFO MOD over its RISE TIME.',
      specs: [
        { label: 'Rate', value: '1 to 10 Hz' },
        { label: 'Rise time', value: '0.05 to 1 s' },
        { label: 'Depth', value: 'VCO ±100 cents or more, VCF ±4 octaves' },
      ],
    },
    {
      id: 'vco1',
      name: 'VCO-1',
      module: 'osc',
      meter: 'osc1',
      controls: [
        'vco1.range',
        'vco1.tri',
        'vco1.saw',
        'vco1.pulse',
        'vco1.square',
        'vco1.xmod',
        'vco1.xmodEnv',
        ...VCO_MOD,
        'vcomod.vco1',
        ...PWM,
      ],
      description:
        'The first oscillator, its waveforms combinable, cross-modulated by VCO-2 by hand and by ENV-1.',
      specs: [
        { label: 'Range', value: "32' to 2', chromatic" },
        { label: 'Pulse width', value: '50 to 0 %' },
        { label: 'VCO MOD depth', value: 'LFO 10 octaves, ENV-1 5 octaves' },
      ],
    },
    {
      id: 'vco2',
      name: 'VCO-2',
      module: 'osc',
      meter: 'osc2',
      controls: [
        'vco2.range',
        'vco2.tune',
        'vco2.tri',
        'vco2.saw',
        'vco2.pulse',
        'vco2.noise',
        'vco.sync12',
        'vco.sync21',
        ...VCO_MOD,
        'vcomod.vco2',
        ...PWM,
      ],
      description:
        'The second oscillator, with noise among its waveforms. In LOW it leaves the keys and runs as a slow modulator for cross mod.',
      specs: [
        { label: 'Range', value: "LOW 1.5–50 Hz, 32' to 2' chromatic, HIGH 2' to 0.5'" },
        { label: 'Fine tune', value: '±50 cents' },
      ],
    },
    {
      id: 'mix',
      name: 'Mixer',
      module: 'mixer',
      controls: ['mix.balance'],
      passes: true,
      description: 'Balances VCO-1 against VCO-2: both at full level in the middle.',
    },
    {
      id: 'vcf',
      name: 'Multimode filter',
      module: 'filter',
      controls: [
        'vcf.lpf',
        'vcf.hpf',
        'vcf.freq',
        'vcf.res',
        'vcf.envSel',
        'vcf.env',
        'vcf.lfo',
        'vcf.kybd',
      ],
      description:
        'A resonant filter, low-pass or high-pass, or band-pass with both buttons lit, swept by an envelope, LFO-1, LFO-2, the bender and the keys.',
      specs: [
        { label: 'Modes', value: 'Low-pass 24 dB, high-pass 24 dB, band-pass 12 dB per octave' },
        { label: 'Cutoff', value: '5 Hz to 30 kHz' },
        { label: 'Envelope and LFO depth', value: '10 octaves or more' },
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
      stages: {
        attack: 'env1.attack',
        decay: 'env1.decay',
        sustain: 'env1.sustain',
        release: 'env1.release',
      },
      description:
        'An ADSR with key follow and polarity, for the VCOs’ pitch, pulse width and cross mod, and the filter if picked.',
      specs: ENV_SPECS,
    },
    {
      id: 'env2',
      name: 'ENV-2',
      module: 'env',
      meter: 'env2',
      controls: ['env2.attack', 'env2.decay', 'env2.sustain', 'env2.release', 'env2.kf'],
      stages: {
        attack: 'env2.attack',
        decay: 'env2.decay',
        sustain: 'env2.sustain',
        release: 'env2.release',
      },
      description: 'An ADSR with key follow for the VCA, and the filter if picked.',
      specs: ENV_SPECS,
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      controls: ['vca.level', 'vca.lfo'],
      description: 'Shapes each voice with ENV-2, by ENV-2 LEVEL, with LFO-1 tremolo.',
      specs: [{ label: 'ENV-2 level', value: '60 dB' }],
    },
    {
      id: 'bend',
      name: 'Bender',
      module: 'mod',
      controls: ['bend.vco', 'bend.vcf', 'bend.vco1', 'bend.vco2', 'bend.wide'],
      description:
        'The bender lever, with separate depths on pitch and cutoff and a button for each VCO. The app’s mod wheel stands in for it pushed to the right.',
      specs: [
        { label: 'VCO', value: '±1 octave (±3 octaves or more with WIDE)' },
        { label: 'VCF', value: '±5 octaves' },
      ],
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'Master VOLUME to the outputs and headphones.',
      specs: [
        { label: 'Unbalanced', value: '1/4-inch jack, 0, −15 or −30 dBm' },
        { label: 'Balanced', value: 'XLR, 600 Ω' },
        { label: 'Phones', value: 'Stereo, 8 Ω' },
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
      when: { id: 'vco2.range', in: KEYED },
    },
    { id: 'c03', from: 'kbd', to: 'env1', signal: 'gate' },
    { id: 'c04', from: 'kbd', to: 'env2', signal: 'gate' },
    {
      id: 'c05',
      from: 'vco2',
      to: 'vco1',
      signal: 'audio',
      label: 'cross mod',
      levels: [
        {
          sum: [
            { id: 'vco1.xmod', pow: 2 },
            { id: 'vco1.xmodEnv', pow: 2 },
          ],
        },
      ],
    },
    {
      id: 'c06',
      from: 'vco1',
      to: 'mix',
      signal: 'audio',
      when: {
        any: [
          { id: 'vco1.tri', eq: true },
          { id: 'vco1.saw', eq: true },
          { id: 'vco1.pulse', eq: true },
          { id: 'vco1.square', eq: true },
        ],
      },
      levels: [{ id: 'mix.balance', off: 10 }],
    },
    {
      id: 'c07',
      from: 'vco2',
      to: 'mix',
      signal: 'audio',
      when: {
        any: [
          { id: 'vco2.tri', eq: true },
          { id: 'vco2.saw', eq: true },
          { id: 'vco2.pulse', eq: true },
          { id: 'vco2.noise', eq: true },
        ],
      },
      levels: ['mix.balance'],
    },
    { id: 'c08', from: 'env2', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c09', from: 'lfo', to: 'vca', signal: 'cv', label: 'tremolo', levels: ['vca.lfo'] },
    {
      id: 'c10',
      from: 'bend',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: ['bend.vcf', WHEEL],
    },
    {
      id: 'c11',
      from: 'lfo2',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: LFO2_ON,
      levels: ['lfo2.vcf'],
    },
    ...([1, 2] as const).flatMap((n) => [
      {
        id: n === 1 ? 'c12' : 'c16',
        from: 'lfo',
        to: `vco${n}`,
        signal: 'cv' as const,
        label: 'pitch',
        when: { id: `vcomod.vco${n}`, eq: true },
        levels: [{ id: 'vcomod.lfo', pow: 2.5 }],
      },
      {
        id: n === 1 ? 'c13' : 'c17',
        from: 'env1',
        to: `vco${n}`,
        signal: 'cv' as const,
        label: 'pitch',
        when: { id: `vcomod.vco${n}`, eq: true },
        levels: [{ id: 'vcomod.env', pow: 2 }],
      },
      {
        id: n === 1 ? 'c14' : 'c18',
        from: 'bend',
        to: `vco${n}`,
        signal: 'cv' as const,
        label: 'pitch',
        when: { id: `bend.vco${n}`, eq: true },
        levels: BEND_VCO,
      },
      {
        id: n === 1 ? 'c15' : 'c19',
        from: 'lfo2',
        to: `vco${n}`,
        signal: 'cv' as const,
        label: 'pitch',
        when: LFO2_ON,
        levels: LFO2_VCO,
      },
    ]),
    {
      id: 'c20',
      from: 'vca',
      to: 'out',
      signal: 'audio',
      levels: [
        { id: 'vca.level', pow: 1.3 },
        { id: 'out.volume', pow: 1.7 },
      ],
    },
    { id: 'c21', from: 'midi', to: 'kbd', signal: 'cv', label: 'notes' },
    { id: 'c22', from: 'mix', to: 'vcf', signal: 'audio' },
    { id: 'c23', from: 'vcf', to: 'vca', signal: 'audio' },
    {
      id: 'c24',
      from: 'env1',
      to: 'vco1',
      signal: 'cv',
      label: 'cross-mod depth',
      levels: [{ id: 'vco1.xmodEnv', pow: 2 }],
    },
    {
      id: 'c25',
      from: 'vco1',
      to: 'vco2',
      signal: 'audio',
      label: 'sync',
      when: { id: 'vco.sync12', eq: true },
    },
    {
      id: 'c26',
      from: 'vco2',
      to: 'vco1',
      signal: 'audio',
      label: 'sync',
      when: {
        all: [
          { id: 'vco.sync21', eq: true },
          { id: 'vco.sync12', eq: false },
        ],
      },
    },
    ...([1, 2] as const).flatMap((n) => [
      {
        id: n === 1 ? 'c27' : 'c29',
        from: 'lfo',
        to: `vco${n}`,
        signal: 'cv' as const,
        label: 'pulse width',
        when: {
          all: [
            { id: 'pwm.src', eq: 'lfo' },
            { id: `vco${n}.pulse`, eq: true },
          ],
        },
        levels: ['pwm.depth'],
      },
      {
        id: n === 1 ? 'c28' : 'c30',
        from: 'env1',
        to: `vco${n}`,
        signal: 'cv' as const,
        label: 'pulse width',
        when: {
          all: [
            { id: 'pwm.src', eq: 'env1' },
            { id: `vco${n}.pulse`, eq: true },
          ],
        },
        levels: ['pwm.depth'],
      },
    ]),
    {
      id: 'c31',
      from: 'env1',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'vcf.envSel', eq: 'env1' },
      levels: ['vcf.env'],
    },
    {
      id: 'c32',
      from: 'env2',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'vcf.envSel', eq: 'env2' },
      levels: ['vcf.env'],
    },
    {
      id: 'c33',
      from: 'lfo',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf.lfo', pow: 1.6 }],
    },
    {
      id: 'c34',
      from: 'kbd',
      to: 'vcf',
      signal: 'cv',
      label: 'key follow',
      levels: ['vcf.kybd'],
    },
  ],
  jacks: {},
  omitted: {
    memory: 'The definition keeps no patch memory: patches are kept in the library.',
  },
};
