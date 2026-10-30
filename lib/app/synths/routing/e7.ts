/**
 * e7 signal routing, projected from its spec (`.context/app/synth-data/e7/e7.synth.json`, 0.12.0): block and edge ids
 * are the spec's module and connection ids; switches and levels are the definition's (`defs/e7.ts`). One voice's path
 * is drawn, then the stereo placement and effects all seven voices share. The definition has no sockets.
 *
 * Where the definition says more than the spec, it decides. The modulation knobs into pitch and the filter are
 * squared in `toEngine()`, as the levels read them; LFO 3 is silent until the mod wheel brings it in, so its edges carry
 * its MOD WHEEL knob and the wheel (`c05`, `c17`, `c32`, `c40`, `c49`). A VCO with its wave at none and its pulse off
 * is silent (`c11`, `c23`). The filter's EG 1 MOD is the whole of EG 1's depth whatever VELOCITY EG1 MOD says, which
 * only shares it between the plain and the velocity-scaled envelope (`c29`). EG 1 moves LFO 2's rate only in the modes
 * that run one wave per voice (`c48`), and in KB Tracking the key moves it too, which the spec draws no connection
 * for: it is drawn with an id of its own (`kbd_lfo2`). The chorus and the delay pass the voices on dry at MIX zero.
 * The engine's first LFO is the e7's LFO 2 (`lfo`), so LFO 2 carries that meter and LFO 1 none.
 *
 * Where it says less, it decides too. It has no external input, pitch bend, aftertouch, velocity on the envelope times
 * or LFO 2 and 3 into pulse width, so those connections are left out. Stereo spread and motion are drawn on the panel
 * but not modelled, so the stereo block passes the voices on.
 */
import type { RoutingEdge, RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

const LFO3: RoutingLevel[] = ['lfo3.wheel', WHEEL];
const VCO_SPECS = [
  { label: 'Waveforms', value: 'Triangle, tri-saw or sawtooth (or none), plus a pulse' },
  { label: 'Pulse width', value: '10 to 50%' },
  { label: 'Transpose', value: '±24 semitones' },
  { label: 'Tune', value: '±½ semitone' },
];
const LFO_SPECS = [
  { label: 'Shapes', value: 'Triangle, ramp up, ramp down, pulse, sample and hold' },
  {
    label: 'Modes',
    value:
      'Monophonic, polyphonic, keyboard tracking, keyboard sync, clock sync, keyboard + clock sync',
  },
];

/** One VCO's modulation, pulse and way into the mixer (`c03`–`c12` for VCO 1, `c15`–`c24` for VCO 2). */
function vco(n: 1 | 2, first: number): RoutingEdge[] {
  const id = (k: number): string => `c${String(first + k).padStart(2, '0')}`;
  const o = `osc${n}`;
  const to = `vco${n}`;
  return [
    {
      id: id(0),
      from: 'lfo1',
      to,
      signal: 'cv',
      label: 'pitch',
      levels: [{ id: `${o}.lfo1`, pow: 2 }],
    },
    {
      id: id(1),
      from: 'lfo2',
      to,
      signal: 'cv',
      label: 'pitch',
      levels: [{ id: `${o}.lfo2`, pow: 2 }],
    },
    {
      id: id(2),
      from: 'lfo3',
      to,
      signal: 'cv',
      label: 'pitch',
      levels: [{ id: `${o}.lfo3`, pow: 2 }, ...LFO3],
    },
    {
      id: id(3),
      from: 'env1',
      to,
      signal: 'cv',
      label: 'pitch',
      levels: [{ id: `${o}.eg1`, pow: 2 }],
    },
    {
      id: id(4),
      from: 'env1',
      to,
      signal: 'cv',
      label: 'pulse width',
      levels: [`${o}.eg1pwm`],
    },
    {
      id: id(5),
      from: 'lfo1',
      to,
      signal: 'cv',
      label: 'pulse width',
      levels: [`${o}.lfo1pwm`],
    },
    {
      id: id(8),
      from: to,
      to: 'mixer',
      signal: 'audio',
      when: {
        any: [
          { id: `${o}.wave`, in: ['tri', 'shark', 'saw'] },
          { id: `${o}.pulse`, eq: true },
        ],
      },
      levels: [`mix.osc${n}`],
    },
    { id: id(9), from: to, to: 'mixer', signal: 'audio', label: 'sub', levels: [`mix.sub${n}`] },
  ];
}

export const routing: SynthRouting = {
  synth: 'e7',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Keys and voices',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      controls: ['kbd.mode', 'kbd.porta'],
      description:
        'Hands notes to the seven voices, polyphonic, mono or unison, with portamento, and gives each its pitch, gate and velocity, plus the mod wheel.',
      specs: [{ label: 'Voices', value: '7' }],
    },
    {
      id: 'vco1',
      name: 'VCO 1',
      module: 'osc',
      meter: 'osc1',
      controls: [
        'osc1.wave',
        'osc1.pulse',
        'osc1.pw',
        'osc1.transpose',
        'osc1.tune',
        'osc1.lfo1',
        'osc1.lfo2',
        'osc1.lfo3',
        'osc1.eg1',
        'osc1.eg1pwm',
        'osc1.lfo1pwm',
      ],
      description:
        'An analogue VCO: triangle, tri-saw or sawtooth with a pulse mixed in, and a square sub an octave down.',
      specs: VCO_SPECS,
    },
    {
      id: 'vco2',
      name: 'VCO 2',
      module: 'osc',
      meter: 'osc2',
      controls: [
        'osc2.wave',
        'osc2.pulse',
        'osc2.pw',
        'osc2.transpose',
        'osc2.tune',
        'osc2.sync',
        'osc2.lfo1',
        'osc2.lfo2',
        'osc2.lfo3',
        'osc2.eg1',
        'osc2.eg1pwm',
        'osc2.lfo1pwm',
      ],
      description: 'The same as VCO 1, and can be hard-synced to it.',
      specs: VCO_SPECS,
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      description: 'White noise into the mixer.',
      specs: [{ label: 'Colour', value: 'White' }],
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      passes: true,
      controls: ['mix.osc1', 'mix.sub1', 'mix.osc2', 'mix.sub2', 'mix.noise'],
      description:
        'The two VCOs, their subs and the noise, each at its own level, into the filter.',
    },
    {
      id: 'vcf',
      name: 'VCF',
      module: 'filter',
      controls: [
        'vcf.cutoff',
        'vcf.res',
        'vcf.eg1',
        'vcf.vel',
        'vcf.lfo1',
        'vcf.lfo2',
        'vcf.lfo3',
        'vcf.kbd',
        'vcf.wheel',
      ],
      description:
        'A resonant ladder low-pass that self-oscillates, moved by EG 1 (part of it by velocity), the LFOs, the keys and the mod wheel.',
      specs: [
        { label: 'Slope', value: '24 dB per octave (4 poles)' },
        { label: 'Cutoff', value: '10 Hz to 25 kHz' },
      ],
    },
    {
      id: 'env1',
      name: 'EG 1',
      module: 'env',
      meter: 'env1',
      controls: ['env1.attack', 'env1.decay', 'env1.sustain', 'env1.release', 'env1.kbd'],
      description:
        'An ADSR for the filter, and for the VCOs’ pitch and pulse width and LFO 2’s rate. Keyboard tracking shortens its times up the keys.',
    },
    {
      id: 'env2',
      name: 'EG 2',
      module: 'env',
      meter: 'env2',
      controls: ['env2.attack', 'env2.decay', 'env2.sustain', 'env2.release', 'env2.kbd'],
      description: 'An ADSR for the VCA. Keyboard tracking shortens its times up the keys.',
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      controls: ['vca.level', 'vca.vel', 'vca.lfo1', 'vca.lfo2', 'vca.lfo3', 'vca.kbd'],
      description:
        'Shaped by EG 2 (part of it by velocity), with tremolo from the LFOs and keyboard tracking. LEVEL sets the sound’s level.',
    },
    {
      id: 'lfo1',
      name: 'LFO 1',
      module: 'lfo',
      controls: ['lfo1.shape', 'lfo1.mode', 'lfo1.rate', 'lfo1.div'],
      description:
        'An LFO for pitch, pulse width, the filter and the VCA: one wave for every voice, one per voice, restarted by each key, or synced to the clock.',
      specs: LFO_SPECS,
    },
    {
      id: 'lfo2',
      name: 'LFO 2',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo2.shape', 'lfo2.mode', 'lfo2.rate', 'lfo2.div', 'lfo2.eg1'],
      description:
        'The same as LFO 1, and EG 1 can move its rate; in KB Tracking its rate follows the keys.',
      specs: LFO_SPECS,
    },
    {
      id: 'lfo3',
      name: 'LFO 3',
      module: 'lfo',
      controls: ['lfo3.shape', 'lfo3.rate', 'lfo3.wheel'],
      description: 'One wave for every voice, silent until the mod wheel brings it in.',
      specs: [{ label: 'Shapes', value: 'Triangle, ramp up, ramp down, pulse' }],
    },
    {
      id: 'stereo',
      name: 'Stereo spread and motion',
      module: 'amp',
      passes: true,
      description:
        'Places the seven voices across the stereo field and moves them. Not modelled here: it passes the voices on.',
    },
    {
      id: 'chorus',
      name: 'Chorus',
      module: 'fx',
      passes: true,
      controls: ['chorus.type', 'chorus.rate', 'chorus.depth', 'chorus.mix'],
      description:
        'Basic (two delay lines) or Ensemble (four), each with its own LFO. At MIX zero it passes the voices on dry.',
      specs: [{ label: 'Processing', value: '24-bit, 48 kHz' }],
    },
    {
      id: 'delay',
      name: 'Delay',
      module: 'fx',
      passes: true,
      controls: ['delay.type', 'delay.time', 'delay.div', 'delay.fb', 'delay.mix'],
      description:
        'Stereo or ping-pong echoes, free or synced to the clock. At MIX zero it passes the voices on dry.',
      specs: [{ label: 'Time', value: '50 ms to 1.35 s' }],
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      passes: true,
      controls: ['out.volume'],
      description: 'Master volume to the left (mono) and right outputs and the headphones.',
      specs: [
        { label: 'Outputs', value: 'L/mono and R, ¼" TRS balanced' },
        { label: 'Phones', value: '¼" TRS stereo' },
      ],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'vco1', signal: 'cv', label: 'pitch' },
    ...vco(1, 3),
    { id: 'c13', from: 'kbd', to: 'vco2', signal: 'cv', label: 'pitch' },
    ...vco(2, 15),
    {
      id: 'c25',
      from: 'vco1',
      to: 'vco2',
      signal: 'audio',
      label: 'sync',
      when: { id: 'osc2.sync', eq: true },
    },
    {
      id: 'c27',
      from: 'noise',
      to: 'mixer',
      signal: 'audio',
      levels: [{ id: 'mix.noise', pow: 1.7 }],
    },
    { id: 'c28', from: 'mixer', to: 'vcf', signal: 'audio' },
    { id: 'c29', from: 'env1', to: 'vcf', signal: 'cv', label: 'cutoff', levels: ['vcf.eg1'] },
    {
      id: 'c30',
      from: 'lfo1',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf.lfo1', pow: 2 }],
    },
    {
      id: 'c31',
      from: 'lfo2',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf.lfo2', pow: 2 }],
    },
    {
      id: 'c32',
      from: 'lfo3',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf.lfo3', pow: 2 }, ...LFO3],
    },
    {
      id: 'c33',
      from: 'kbd',
      to: 'vcf',
      signal: 'cv',
      label: 'keyboard tracking',
      levels: ['vcf.kbd'],
    },
    {
      id: 'c34',
      from: 'kbd',
      to: 'vcf',
      signal: 'cv',
      label: 'mod wheel',
      levels: ['vcf.wheel', WHEEL],
    },
    { id: 'c36', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c37', from: 'env2', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c38', from: 'lfo1', to: 'vca', signal: 'cv', label: 'tremolo', levels: ['vca.lfo1'] },
    { id: 'c39', from: 'lfo2', to: 'vca', signal: 'cv', label: 'tremolo', levels: ['vca.lfo2'] },
    {
      id: 'c40',
      from: 'lfo3',
      to: 'vca',
      signal: 'cv',
      label: 'tremolo',
      levels: ['vca.lfo3', ...LFO3],
    },
    {
      id: 'c41',
      from: 'kbd',
      to: 'vca',
      signal: 'cv',
      label: 'keyboard tracking',
      levels: ['vca.kbd'],
    },
    { id: 'c42', from: 'kbd', to: 'env1', signal: 'gate' },
    { id: 'c43', from: 'kbd', to: 'env2', signal: 'gate' },
    {
      id: 'c46',
      from: 'kbd',
      to: 'lfo1',
      signal: 'gate',
      label: 'restart',
      when: { id: 'lfo1.mode', in: ['kbsync', 'kbclock'] },
    },
    {
      id: 'c47',
      from: 'kbd',
      to: 'lfo2',
      signal: 'gate',
      label: 'restart',
      when: { id: 'lfo2.mode', in: ['kbsync', 'kbclock'] },
    },
    {
      id: 'c48',
      from: 'env1',
      to: 'lfo2',
      signal: 'cv',
      label: 'rate',
      when: { id: 'lfo2.mode', in: ['poly', 'kbtrack', 'kbsync', 'kbclock'] },
      levels: ['lfo2.eg1'],
    },
    {
      id: 'kbd_lfo2',
      from: 'kbd',
      to: 'lfo2',
      signal: 'cv',
      label: 'rate',
      when: { id: 'lfo2.mode', eq: 'kbtrack' },
    },
    { id: 'c49', from: 'kbd', to: 'lfo3', signal: 'cv', label: 'depth', levels: LFO3 },
    {
      id: 'c51',
      from: 'vca',
      to: 'stereo',
      signal: 'audio',
      levels: [{ id: 'vca.level', pow: 1.7 }],
    },
    { id: 'c52', from: 'stereo', to: 'chorus', signal: 'audio', label: 'left' },
    { id: 'c53', from: 'stereo', to: 'chorus', signal: 'audio', label: 'right' },
    { id: 'c54', from: 'chorus', to: 'delay', signal: 'audio', label: 'left' },
    { id: 'c55', from: 'chorus', to: 'delay', signal: 'audio', label: 'right' },
    {
      id: 'c56',
      from: 'delay',
      to: 'out',
      signal: 'audio',
      label: 'left',
      levels: [{ id: 'out.volume', pow: 1.7 }],
    },
    {
      id: 'c57',
      from: 'delay',
      to: 'out',
      signal: 'audio',
      label: 'right',
      levels: [{ id: 'out.volume', pow: 1.7 }],
    },
  ],
  jacks: {},
  omitted: {
    extin: 'The definition has no EXTERNAL INPUT: the engine’s external input is off.',
    c02: 'Pitch bend into VCO 1: drawn on the panel, not modelled.',
    c14: 'Pitch bend into VCO 2: drawn on the panel, not modelled.',
    c09: 'LFO 2 into VCO 1’s pulse width: the definition has no knob for it.',
    c10: 'LFO 3 into VCO 1’s pulse width: the definition has no knob for it.',
    c21: 'LFO 2 into VCO 2’s pulse width: the definition has no knob for it.',
    c22: 'LFO 3 into VCO 2’s pulse width: the definition has no knob for it.',
    c26: 'The external input in place of the noise: the definition has no EXTERNAL INPUT.',
    c35: 'Aftertouch into the cutoff: the app has no aftertouch.',
    c44: 'Velocity on EG 1’s times: drawn on the panel, not modelled.',
    c45: 'Velocity on EG 2’s times: drawn on the panel, not modelled.',
    c50: 'Aftertouch bringing in LFO 3: the app has no aftertouch.',
  },
};
