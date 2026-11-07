/**
 * PWM Mantis signal routing, projected from its spec (`.context/app/synth-data/mantis/mantis.synth.json`, 0.13.0): block
 * and edge ids are the spec's module and connection ids; switches and levels are the definition's (`defs/mantis.ts`).
 *
 * The six mod routes (`c24`–`c53`) are drawn one edge per SOURCE, live while that source is chosen and the route's MOD
 * knob is off its centre. A shape route reaches only the waves SHAPE MOD moves here (pulse, triangle, wavetable), and the
 * width route only Wide Band. A route's SCALE multiplies it as it plays, so it is no level here. The joystick is drawn
 * into the keyboard block, as the spec files it. There are no jacks.
 */
import type {
  RoutingBlock,
  RoutingEdge,
  RoutingLevel,
  RoutingWhen,
  SynthRouting,
} from '@/lib/app/synths/contract';

const OSC_SPECS = [
  { label: 'Waves', value: 'Sine, triangle, sawtooth, pulse, organ, wavetable' },
  { label: 'Wavetables', value: 'The Mantis special and nine from the OSCar' },
  { label: 'Octave', value: '−3 to +2' },
];
const osc = (n: 1 | 2): RoutingBlock => ({
  id: `osc${n}`,
  name: `Oscillator ${n}`,
  module: 'osc',
  meter: n === 1 ? 'osc1' : 'osc2',
  controls: [
    `osc${n}.wave`,
    `osc${n}.shape`,
    `osc${n}.octave`,
    `osc${n}.shapeMod`,
    `osc${n}.pitchMod`,
    `route.osc${n}Shape.source`,
    `route.osc${n}Shape.scale`,
    `route.osc${n}Pitch.source`,
    `route.osc${n}Pitch.scale`,
    ...(n === 2
      ? ['osc2.semitone', 'osc2.cent', 'osc2.density', 'osc2.densityRate', 'drift.amount']
      : []),
  ],
  description:
    n === 1
      ? 'A mathematically generated oscillator: WAVE picks its shape and SHAPE changes it. Its two mod routes move its shape and its pitch.'
      : 'Oscillator 2, tuned against Oscillator 1 by SEMITONE and CENT, with a detuned density copy that thickens it. Its two mod routes move its shape and its pitch.',
  specs: OSC_SPECS,
});
const env = (n: 1 | 2): RoutingBlock => ({
  id: `env${n}`,
  name: `Envelope ${n}`,
  module: 'env',
  meter: n === 1 ? 'env1' : 'env2',
  controls: [
    `env${n}.attack`,
    `env${n}.decay`,
    `env${n}.sustain`,
    `env${n}.release`,
    `env${n}.velocity`,
    `env${n}.sustFall`,
    `env${n}.repeat`,
    `env${n}.legato`,
  ],
  stages: {
    attack: `env${n}.attack`,
    decay: `env${n}.decay`,
    sustain: `env${n}.sustain`,
    release: `env${n}.release`,
  },
  description:
    n === 1
      ? 'An ADSR with velocity, sustain fall and repeat, wired to the VCA: the loudness. It is also a mod route source.'
      : 'An ADSR with velocity, sustain fall and repeat, heard only as the source of a mod route.',
});
const lfo = (n: 1 | 2): RoutingBlock => ({
  id: `lfo${n}`,
  name: `LFO ${n}`,
  module: 'lfo',
  ...(n === 1 ? { meter: 'lfo' as const } : {}),
  controls: [`lfo${n}.wave`, `lfo${n}.rate`, `lfo${n}.fade`, `lfo${n}.sync`, `lfo${n}.keytrig`],
  description: `An LFO with six shapes, a fade, tempo sync and key trigger, heard only as the source of a mod route.`,
  specs: [
    { label: 'Waves', value: 'Sine, triangle, sawtooth down and up, square, sample and hold' },
  ],
});

/** The route on one control: one edge per source, live while it is chosen and the MOD knob is off the centre. */
const ROUTE_SOURCES: [src: string, block: string][] = [
  ['env1', 'env1'],
  ['lfo1', 'lfo1'],
  ['note', 'kbd'],
  ['env2', 'env2'],
  ['lfo2', 'lfo2'],
];
const route = (
  first: number,
  r: string,
  to: string,
  label: string,
  knob: string,
  also?: RoutingWhen
): RoutingEdge[] =>
  ROUTE_SOURCES.map(([src, from], i) => {
    const chosen: RoutingWhen = { id: `route.${r}.source`, eq: src };
    return {
      id: `c${first + i}`,
      from,
      to,
      signal: 'cv',
      label,
      when: also ? { all: [chosen, also] } : chosen,
      levels: [{ id: knob, off: 0 }],
    };
  });
/** The oscillators are silent with NOISE BALANCE or RM BALANCE fully up. */
const OSC_HEARD: RoutingLevel[] = [
  { id: 'mix.noise', off: 10 },
  { id: 'mix.ring', off: 10 },
];
const SHAPED = (n: number): RoutingWhen => ({
  id: `osc${n}.wave`,
  in: ['pulse', 'triangle', 'wavetable'],
});

export const routing: SynthRouting = {
  synth: 'mantis',
  out: 'out',
  blocks: [
    {
      id: 'arp',
      name: 'Arpeggiator',
      module: 'mode',
      controls: ['arp.on', 'arp.mode', 'arp.octaves', 'arp.sync', 'arp.bpm', 'arp.swing'],
      description: 'Plays the held notes one after another, at the tempo and SYNC division.',
      specs: [
        { label: 'Orders', value: 'Up, down, up/down 1 and 2, played, random' },
        { label: 'Range', value: '1 to 6 octaves' },
      ],
    },
    {
      id: 'kbd',
      name: 'Keyboard, joystick and voicing',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      controls: [
        'kbd.voicing',
        'kbd.glide',
        'kbd.glideAuto',
        'kbd.hold',
        'kbd.voicePan',
        'joy.x',
        'joy.y',
        'out.tune',
      ],
      description:
        'The 37 keys (or the arpeggiator), giving the pitch, gate and velocity the voices play from, the voicing (Mono, Duophonic or Quad), glide, and the joystick that bends and adds vibrato.',
      specs: [
        { label: 'Keys', value: '37 semi-weighted, velocity and channel aftertouch' },
        { label: 'Voices', value: 'Mono, Duophonic (2) or Quad (4)' },
      ],
    },
    osc(1),
    osc(2),
    {
      id: 'sub',
      name: 'Osc 1 sub',
      module: 'osc',
      meter: 'osc4',
      controls: ['sub.level'],
      description: 'Oscillator 1’s wave an octave lower.',
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      description: 'White noise, set against the oscillators by NOISE BALANCE.',
    },
    {
      id: 'ring',
      name: 'Ring modulator',
      module: 'mixer',
      symbol: 'util',
      passes: true,
      description: 'Oscillator 1 times Oscillator 2: bell and metal tones.',
    },
    {
      id: 'mix',
      name: 'Mixer',
      module: 'mixer',
      passes: true,
      controls: ['mix.osc', 'mix.noise', 'mix.ring'],
      description:
        'Three balances in a row: Oscillator 1 against 2, the oscillators against noise, then all that against the ring modulator.',
    },
    {
      id: 'vcf',
      name: 'Dual filter',
      module: 'filter',
      controls: [
        'vcf.mode',
        'vcf.cutoff',
        'vcf.res',
        'vcf.width',
        'vcf.drive',
        'vcf.keytrack',
        'vcf.cutoffMod',
        'vcf.widthMod',
        'route.cutoff.source',
        'route.cutoff.scale',
        'route.width.source',
        'route.width.scale',
      ],
      description:
        'Two state-variable filters per voice path: low-pass, band-pass or high-pass at 12 or 24 dB, or a low-pass and a high-pass WIDTH apart, in a row (Wide Band) or side by side (Wide Notch).',
      specs: [
        { label: 'Types', value: 'LP12, BP12, HP12, LP24, BP24, HP24, Wide Band, Wide Notch' },
        { label: 'Built on', value: 'SSI2164 VCAs' },
      ],
    },
    env(1),
    env(2),
    lfo(1),
    lfo(2),
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      description: 'Analogue VCAs opened by Envelope 1.',
    },
    {
      id: 'fx',
      name: 'Chorus and reverb',
      module: 'fx',
      controls: [
        'fx.chorusLevel',
        'fx.chorusType',
        'fx.reverbLevel',
        'fx.reverbTime',
        'fx.reverbLpf',
        'fx.reverbHpf',
      ],
      description: 'A stereo chorus with four types, then a reverb with LPF and HPF switches.',
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'The stereo line outputs and headphones, at VOLUME.',
    },
  ],
  edges: [
    {
      id: 'c01',
      from: 'arp',
      to: 'kbd',
      signal: 'cv',
      label: 'notes',
      when: { id: 'arp.on', eq: true },
    },
    { id: 'c02', from: 'kbd', to: 'osc1', signal: 'cv', label: 'pitch' },
    { id: 'c03', from: 'kbd', to: 'osc2', signal: 'cv', label: 'pitch' },
    { id: 'c04', from: 'kbd', to: 'sub', signal: 'cv', label: 'pitch' },
    {
      id: 'c07',
      from: 'osc1',
      to: 'mix',
      signal: 'audio',
      levels: [{ id: 'mix.osc', off: 5 }, ...OSC_HEARD],
    },
    {
      id: 'c08',
      from: 'osc2',
      to: 'mix',
      signal: 'audio',
      levels: [{ id: 'mix.osc', off: -5 }, ...OSC_HEARD],
    },
    {
      id: 'c09',
      from: 'sub',
      to: 'mix',
      signal: 'audio',
      levels: ['sub.level', { id: 'mix.osc', off: 5 }, ...OSC_HEARD],
    },
    {
      id: 'c10',
      from: 'noise',
      to: 'mix',
      signal: 'audio',
      levels: ['mix.noise', { id: 'mix.ring', off: 10 }],
    },
    { id: 'c11', from: 'osc1', to: 'ring', signal: 'audio', levels: ['mix.ring'] },
    { id: 'c12', from: 'osc2', to: 'ring', signal: 'audio', levels: ['mix.ring'] },
    { id: 'c13', from: 'ring', to: 'mix', signal: 'audio', levels: ['mix.ring'] },
    { id: 'c14', from: 'mix', to: 'vcf', signal: 'audio' },
    {
      id: 'c15',
      from: 'kbd',
      to: 'vcf',
      signal: 'cv',
      label: 'key track',
      levels: ['vcf.keytrack'],
    },
    { id: 'c16', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c17', from: 'env1', to: 'vca', signal: 'cv' },
    { id: 'c18', from: 'kbd', to: 'env1', signal: 'gate' },
    {
      id: 'c19',
      from: 'kbd',
      to: 'env1',
      signal: 'cv',
      label: 'velocity',
      levels: [{ id: 'env1.velocity', off: 0 }],
    },
    {
      id: 'c20',
      from: 'kbd',
      to: 'lfo1',
      signal: 'gate',
      label: 'reset',
      when: { id: 'lfo1.keytrig', eq: true },
    },
    { id: 'c21', from: 'kbd', to: 'env2', signal: 'gate' },
    {
      id: 'c22',
      from: 'kbd',
      to: 'env2',
      signal: 'cv',
      label: 'velocity',
      levels: [{ id: 'env2.velocity', off: 0 }],
    },
    {
      id: 'c23',
      from: 'kbd',
      to: 'lfo2',
      signal: 'gate',
      label: 'reset',
      when: { id: 'lfo2.keytrig', eq: true },
    },
    ...route(24, 'osc1Shape', 'osc1', 'shape', 'osc1.shapeMod', SHAPED(1)),
    ...route(29, 'osc2Shape', 'osc2', 'shape', 'osc2.shapeMod', SHAPED(2)),
    ...route(34, 'osc1Pitch', 'osc1', 'pitch', 'osc1.pitchMod'),
    ...route(39, 'osc2Pitch', 'osc2', 'pitch', 'osc2.pitchMod'),
    ...route(44, 'cutoff', 'vcf', 'cutoff', 'vcf.cutoffMod'),
    ...route(49, 'width', 'vcf', 'width', 'vcf.widthMod', { id: 'vcf.mode', eq: 'wide_band' }),
    { id: 'c54', from: 'vca', to: 'fx', signal: 'audio' },
    { id: 'c56', from: 'fx', to: 'out', signal: 'audio' },
  ],
  jacks: {},
  omitted: {
    c05: 'The joystick is drawn into the keyboard block, whose pitch already reaches Oscillator 1 (c02).',
    c06: 'The joystick is drawn into the keyboard block, whose pitch already reaches Oscillator 2 (c03).',
    c55: 'The right-hand side of the stereo pair: drawn as one line with c54.',
    c57: 'The right-hand side of the stereo pair: drawn as one line with c56.',
  },
};
