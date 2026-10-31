/**
 * WASP Deluxe signal routing, projected from its spec (`.context/app/synth-data/wasp-deluxe/wasp-deluxe.synth.json`,
 * 0.7.0): block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/wasp-deluxe.ts`).
 *
 * Where the definition says more than the spec, it decides. PITCH MOD moves both oscillators in `toEngine()`, which
 * the spec only infers, so `c05` and `c06` both carry it. The control oscillator's NOISE and RND shapes come from the
 * engine's noise and sample-and-hold sources, but they are the same block and the same edges on the panel. The engine
 * keeps every route that is not exactly zero, with no floor of its own, so each level is its knob's plain travel (the
 * two FILTER CONTROL knobs from their centre), off only under `ROUTING_FLOOR`. With nothing in EXT AUDIO the output is
 * fed back through the EXT channel (`c13`), as in `toEngine()`'s `extIn` normal.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';

const OSC_SPECS = [
  { label: 'Type', value: 'Digitally controlled' },
  { label: 'Ranges', value: "32', 16', 8', 4', 2'" },
  { label: 'Waveforms', value: 'Off, sawtooth, square, ENH' },
];
const SOUNDING = ['saw', 'square', 'enh'];

export const routing: SynthRouting = {
  synth: 'wasp-deluxe',
  out: 'output',
  blocks: [
    {
      id: 'kbd',
      name: 'MIDI',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      description:
        'Turns incoming MIDI into note pitch, the gate and pitch bend. There is no keyboard on this model.',
    },
    {
      id: 'pitch',
      name: 'Keyboard section',
      module: 'glide',
      controls: ['pitch.bend', 'pitch.tune', 'pitch.glide'],
      description: 'Bend, tune and glide, applied to the note before both oscillators.',
    },
    {
      id: 'osc1',
      name: 'Oscillator 1',
      module: 'osc',
      controls: ['osc1.ft', 'osc1.width', 'osc1.wave'],
      meter: 'osc1',
      description:
        'The upper oscillator, in five footage ranges, with a pulse WIDTH control. OFF silences it.',
      specs: [...OSC_SPECS, { label: 'Pulse width', value: '10 to 50 %' }],
    },
    {
      id: 'osc2',
      name: 'Oscillator 2',
      module: 'osc',
      controls: ['osc2.ft', 'osc2.pitch', 'osc2.wave'],
      meter: 'osc2',
      description:
        'The lower oscillator, in five footage ranges, with a PITCH control that sets its interval against Oscillator 1.',
      specs: OSC_SPECS,
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      description: 'White noise, mixed in by NOISE SIGNAL.',
      specs: [{ label: 'Colour', value: 'White' }],
    },
    {
      id: 'mixer',
      name: 'Mix',
      module: 'mixer',
      controls: ['mix.osc1', 'mix.osc2', 'mix.ext', 'mix.noise'],
      passes: true,
      description:
        'Levels for the two oscillators, EXT and noise, into the filter. With nothing in EXT AUDIO, EXT carries the WASP’s own output back in.',
      specs: [{ label: 'Channels', value: 'OSC 1, OSC 2, EXT, noise' }],
    },
    {
      id: 'ctrl_osc',
      name: 'Control oscillator',
      module: 'lfo',
      controls: ['ctrl.freq', 'ctrl.wave', 'ctrl.pitchMod'],
      meter: 'lfo',
      description:
        'A modulation oscillator that makes no sound itself. It moves both oscillators’ pitch through PITCH MOD and the filter through its FILTER CONTROL knob.',
      specs: [
        { label: 'Rate', value: '0.5 to 100 Hz' },
        {
          label: 'Shapes',
          value: 'Sine, rising sawtooth, falling sawtooth, square, noise, random',
        },
      ],
    },
    {
      id: 'vcf',
      name: 'Filter',
      module: 'filter',
      controls: ['vcf.freq', 'vcf.q', 'vcf.mode', 'vcf.oscAmt', 'vcf.envAmt'],
      description:
        'A multimode filter. Q sets the slope in low-pass and high-pass, and the width in band-pass and notch. Both FILTER CONTROL knobs move the cutoff either way.',
      specs: [{ label: 'Modes', value: 'Low-pass, band-pass, notch, high-pass' }],
    },
    {
      id: 'vca_env',
      name: 'VCA envelope',
      module: 'env',
      controls: ['vca.attack', 'vca.decay', 'vca.sustain', 'vca.hold'],
      meter: 'env1',
      // HOLD freezes the level where it is, but the engine still notes the key going down and up, so it would report
      // an attack or a release that is not moving. A frozen envelope lights nothing.
      stages: {
        attack: { id: 'vca.attack', when: { id: 'vca.hold', eq: false } },
        decay: { id: 'vca.decay', when: { id: 'vca.hold', eq: false } },
        sustain: { id: 'vca.sustain', when: { id: 'vca.hold', eq: false } },
        release: { id: 'vca.decay', when: { id: 'vca.hold', eq: false } },
      },
      description:
        'Attack, decay and sustain for the amplifier; decay also sets the fade after release. SUSTAIN at its end stop repeats the envelope, and HOLD freezes it.',
      specs: [{ label: 'Stages', value: 'Attack, decay (also release), sustain; repeat' }],
    },
    {
      id: 'ctrl_env',
      name: 'Control envelope',
      module: 'env',
      controls: ['cenv.attack', 'cenv.decay', 'cenv.delay'],
      meter: 'env2',
      // DECAY sets the release too. In its REPEAT position DELAY sets no wait: the engine zeroes it (`dly` under `cRep`
      // in defs/wasp-deluxe.ts), so the delay stage never runs and the knob does not light.
      stages: {
        delay: 'cenv.delay',
        attack: 'cenv.attack',
        decay: 'cenv.decay',
        release: 'cenv.decay',
      },
      description:
        'Attack and decay for the filter, after a delay. The delay knob’s other end is REPEAT.',
      specs: [
        { label: 'Stages', value: 'Delay, attack, decay; repeat' },
        { label: 'Delay', value: 'Up to 1 s' },
      ],
    },
    {
      id: 'vca',
      name: 'Amplifier',
      module: 'amp',
      description: 'The output amplifier, opened by the VCA envelope.',
    },
    {
      id: 'output',
      name: 'Output',
      module: 'out',
      controls: ['out.volume', 'out.phones'],
      description: 'VOLUME to MAIN AUDIO and the rear outputs, and a separate headphone level.',
      specs: [{ label: 'MAIN AUDIO', value: '3.5 mm, 0 dBu at most' }],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'pitch', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'kbd', to: 'pitch', signal: 'cv', label: 'pitch bend' },
    { id: 'c03', from: 'pitch', to: 'osc1', signal: 'cv', label: 'pitch' },
    { id: 'c04', from: 'pitch', to: 'osc2', signal: 'cv', label: 'pitch' },
    {
      id: 'c05',
      from: 'ctrl_osc',
      to: 'osc1',
      signal: 'cv',
      label: 'pitch',
      levels: ['ctrl.pitchMod'],
    },
    {
      id: 'c06',
      from: 'ctrl_osc',
      to: 'osc2',
      signal: 'cv',
      label: 'pitch',
      levels: ['ctrl.pitchMod'],
    },
    {
      id: 'c10',
      from: 'osc1',
      to: 'mixer',
      signal: 'audio',
      when: { id: 'osc1.wave', in: SOUNDING },
      levels: ['mix.osc1'],
    },
    {
      id: 'c11',
      from: 'osc2',
      to: 'mixer',
      signal: 'audio',
      when: { id: 'osc2.wave', in: SOUNDING },
      levels: ['mix.osc2'],
    },
    { id: 'c12', from: 'noise', to: 'mixer', signal: 'audio', levels: ['mix.noise'] },
    {
      id: 'c13',
      from: 'output',
      to: 'mixer',
      signal: 'audio',
      label: 'feedback',
      levels: ['mix.ext'],
      breaks: 'j.ext',
    },
    { id: 'c14', from: 'mixer', to: 'vcf', signal: 'audio' },
    {
      id: 'c15',
      from: 'ctrl_osc',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf.oscAmt', off: 0 }],
    },
    {
      id: 'c16',
      from: 'ctrl_env',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf.envAmt', off: 0 }],
    },
    { id: 'c17', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c18', from: 'kbd', to: 'vca_env', signal: 'gate' },
    { id: 'c19', from: 'kbd', to: 'ctrl_env', signal: 'gate' },
    { id: 'c20', from: 'vca_env', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c21', from: 'vca', to: 'output', signal: 'audio' },
  ],
  jacks: {
    'j.osc1': 'osc1',
    'j.osc2': 'osc2',
    'j.ext': 'mixer',
    'j.main': 'output',
    'j.phones': 'output',
  },
};
