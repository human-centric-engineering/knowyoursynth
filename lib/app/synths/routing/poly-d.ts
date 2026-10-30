/**
 * Poly D signal routing, projected from its spec (`.context/app/synth-data/poly-d/poly-d.synth.json`, 0.7.0): block
 * and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/poly-d.ts`).
 *
 * Where the definition says more than the spec, it decides: the mod bus is Model D's crossfade with no depth knob, so
 * MOD MIX fully right silences source A, fully left source B, and the mod wheel alone sets the depth, as `toEngine()`
 * reads them. Each source edge carries its share times the wheel, and each line out the wheel, so the bus is dark
 * with the wheel down. Oscillator 4 off the keyboard leaves its pitch and the bus's pitch modulation (`c24`, `c34`).
 * The mixer levels are curved as `toEngine()` curves them, and VOLUME scales the way out (`c71`, `c72`). The
 * distortion and the chorus pass the sound on dry when switched off, so they stay on the path.
 *
 * Where it says less, it decides too. The definition has no patch jacks but PHONES, so MOD SOURCE cannot break the
 * noise's feed (`c53`), drawn switched. It does not model the sequencer, so that module and its connections are left
 * out; the arpeggiator runs from TEMPO on the clock block.
 */
import type { RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

const SOURCE_A: RoutingLevel[] = [{ id: 'mod.mix', off: 10 }, WHEEL];
const SOURCE_B: RoutingLevel[] = ['mod.mix', WHEEL];
const OSC_SPECS = [
  { label: 'Frequency', value: '0.1 Hz to 20 kHz' },
  { label: 'Ranges', value: "LO, 32', 16', 8', 4', 2'" },
];
const WAVES = {
  label: 'Waveforms',
  value: 'Triangle, triangle-saw, sawtooth, square, wide pulse, narrow pulse',
};
const ENV_SPECS = [
  { label: 'Attack', value: '1 ms to 10 s' },
  { label: 'Decay', value: '4 ms to 35 s' },
];

export const routing: SynthRouting = {
  synth: 'poly-d',
  out: 'output',
  blocks: [
    {
      id: 'kbd',
      name: 'Keyboard and MIDI',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      controls: ['kbd.transpose'],
      description:
        'The keys, the wheels and MIDI, giving the notes, gate, pitch bend and mod wheel. TRANSPOSE moves it an octave either way.',
      specs: [{ label: 'Keys', value: '37, velocity and aftertouch' }],
    },
    {
      id: 'clock',
      name: 'Tempo and sync',
      module: 'util',
      controls: ['arp.tempo'],
      description: 'The internal tempo the arpeggiator runs at.',
    },
    {
      id: 'arp',
      name: 'Arpeggiator',
      module: 'util',
      controls: ['arp.on', 'arp.hold', 'arp.order'],
      description: 'Plays the held notes one after another, in one of eight orders, with HOLD.',
      specs: [{ label: 'Orders', value: '8' }],
    },
    {
      id: 'voices',
      name: 'Voice assignment',
      module: 'util',
      controls: ['voice.mode', 'voice.damp'],
      passes: true,
      description:
        'Hands notes to the four oscillators. MONO plays one note on all of them, UNISON shares them among the notes held, POLY gives each note an oscillator of its own. AUTO DAMP decides whether released chord notes keep sounding.',
      specs: [{ label: 'Voices', value: '4, paraphonic' }],
    },
    {
      id: 'pitch',
      name: 'Tune, glide and bend',
      module: 'glide',
      controls: ['ctl.tune', 'ctl.glide', 'glide.on'],
      description:
        'Applies the master tune, glide and the pitch wheel to the oscillators. Oscillator 4 is left out of it all with OSC 4 CONTROL off.',
    },
    {
      id: 'mod_bus',
      name: 'Modulation mix',
      module: 'mod',
      controls: ['mod.srcA', 'mod.srcB', 'mod.mix', 'mod.toOsc', 'mod.toFilter'],
      passes: true,
      description:
        'Crossfades source A (Oscillator 4 or the filter contour) with source B (noise or the LFO). The mod wheel sets the depth, and the switches send it to the oscillators, the filter or both.',
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.rate', 'lfo.shape'],
      description: 'A modulation source for the mod bus.',
      specs: [
        { label: 'Rate', value: '0.05 to 200 Hz' },
        { label: 'Shapes', value: 'Triangle, square' },
      ],
    },
    {
      id: 'osc1',
      name: 'Oscillator 1',
      module: 'osc',
      meter: 'osc1',
      controls: ['osc1.range', 'osc1.wave'],
      description: 'The pitch reference: no frequency offset.',
      specs: [...OSC_SPECS, WAVES],
    },
    {
      id: 'osc2',
      name: 'Oscillator 2',
      module: 'osc',
      meter: 'osc2',
      controls: ['osc2.range', 'osc2.freq', 'osc2.wave'],
      description: 'An oscillator with a frequency offset of about seven semitones either way.',
      specs: [...OSC_SPECS, WAVES],
    },
    {
      id: 'osc3',
      name: 'Oscillator 3',
      module: 'osc',
      meter: 'osc3',
      controls: ['osc3.range', 'osc3.freq', 'osc3.wave'],
      description: 'An oscillator with a frequency offset of about seven semitones either way.',
      specs: [...OSC_SPECS, WAVES],
    },
    {
      id: 'osc4',
      name: 'Oscillator 4',
      module: 'osc',
      meter: 'osc4',
      controls: ['osc4.range', 'osc4.freq', 'osc4.wave', 'osc4.kbd'],
      description:
        'An oscillator that doubles as a modulation source. Off keyboard control it runs free, like the Minimoog’s third oscillator.',
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
      controls: ['noise.colour'],
      description: 'Pink or white noise: a sound source in the mixer and source B of the mod bus.',
      specs: [{ label: 'Colours', value: 'Pink, white' }],
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      controls: [
        'mix.osc1On',
        'mix.osc1',
        'mix.osc2On',
        'mix.osc2',
        'mix.osc3On',
        'mix.osc3',
        'mix.osc4On',
        'mix.osc4',
        'mix.extOn',
        'mix.ext',
        'mix.noiseOn',
        'mix.noise',
      ],
      passes: true,
      description: 'A level and an on switch for each source, into the filter.',
      specs: [{ label: 'Channels', value: 'Oscillators 1–4, external input, noise' }],
    },
    {
      id: 'vcf',
      name: 'Ladder filter',
      module: 'filter',
      controls: [
        'filter.cutoff',
        'filter.emphasis',
        'filter.contour',
        'filter.mode',
        'filter.kbd1',
        'filter.kbd2',
      ],
      description:
        'A transistor ladder filter with EMPHASIS (resonance), low-pass or high-pass, keyboard tracking in thirds by two switches.',
      specs: [
        { label: 'Slope', value: '24 dB per octave' },
        { label: 'Modes', value: 'Low-pass, high-pass' },
      ],
    },
    {
      id: 'filter_env',
      name: 'Filter contour',
      module: 'env',
      meter: 'env1',
      controls: ['fenv.attack', 'fenv.decay', 'fenv.sustain', 'env.decay'],
      // As the Model D's: the release is the decay time with DECAY on, and immediate with it off.
      stages: {
        attack: 'fenv.attack',
        decay: 'fenv.decay',
        sustain: 'fenv.sustain',
        release: { id: 'fenv.decay', when: { id: 'env.decay', eq: true } },
      },
      description:
        'An attack, decay, sustain envelope for the cutoff, shared by every note. With DECAY on, the release follows the decay time.',
      specs: ENV_SPECS,
    },
    {
      id: 'loud_env',
      name: 'Loudness contour',
      module: 'env',
      meter: 'env2',
      controls: ['aenv.attack', 'aenv.decay', 'aenv.sustain', 'env.decay'],
      // As the Model D's: the release is the decay time with DECAY on, and immediate with it off.
      stages: {
        attack: 'aenv.attack',
        decay: 'aenv.decay',
        sustain: 'aenv.sustain',
        release: { id: 'aenv.decay', when: { id: 'env.decay', eq: true } },
      },
      description:
        'An attack, decay, sustain envelope for the amplifier, shared by every note. With DECAY on, the release follows the decay time; otherwise it is immediate.',
      specs: ENV_SPECS,
    },
    {
      id: 'vca',
      name: 'Amplifier',
      module: 'amp',
      description: 'One amplifier for all four notes, opened by the loudness contour.',
    },
    {
      id: 'distortion',
      name: 'Distortion',
      module: 'fx',
      controls: ['fx.distOn', 'fx.dist', 'fx.tone', 'fx.level'],
      description:
        'DIST drives it, TONE sets how bright it is and LEVEL how loud. Switched off, the sound passes straight through.',
    },
    {
      id: 'chorus',
      name: 'Chorus',
      module: 'fx',
      controls: ['fx.chorusOn', 'fx.chorus1', 'fx.chorus2'],
      description:
        'A bucket-brigade stereo chorus with two modes, usable together; mono in, stereo out. Switched off, the sound passes straight through.',
    },
    {
      id: 'output',
      name: 'Output',
      module: 'out',
      controls: ['out.volume', 'out.phones'],
      description: 'Main VOLUME to the stereo outputs, and a separate headphone volume.',
      specs: [
        { label: 'Main', value: '2 × 1/4-inch TRS servo-balanced, up to −16 dBu' },
        { label: 'Phones', value: '1/4-inch TRS, −4 dBu' },
      ],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'voices', signal: 'cv', label: 'notes' },
    { id: 'c02', from: 'kbd', to: 'voices', signal: 'gate' },
    {
      id: 'c03',
      from: 'kbd',
      to: 'arp',
      signal: 'cv',
      label: 'notes',
      when: { id: 'arp.on', eq: true },
    },
    {
      id: 'c04',
      from: 'arp',
      to: 'voices',
      signal: 'cv',
      label: 'notes',
      when: { id: 'arp.on', eq: true },
    },
    { id: 'c08', from: 'clock', to: 'arp', signal: 'gate', label: 'clock' },
    ...[1, 2, 3, 4].map((n) => ({
      id: `c1${n}`,
      from: 'voices',
      to: 'pitch',
      signal: 'cv' as const,
      label: `note ${n}`,
    })),
    ...[1, 2, 3].map((n) => ({
      id: `c2${n}`,
      from: 'pitch',
      to: `osc${n}`,
      signal: 'cv' as const,
      label: 'pitch',
    })),
    {
      id: 'c24',
      from: 'pitch',
      to: 'osc4',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'osc4.kbd', eq: true },
    },
    ...[1, 2, 3].map((n) => ({
      id: `c3${n}`,
      from: 'mod_bus',
      to: `osc${n}`,
      signal: 'cv' as const,
      label: 'pitch',
      when: { id: 'mod.toOsc', eq: true },
      levels: [WHEEL],
    })),
    {
      id: 'c34',
      from: 'mod_bus',
      to: 'osc4',
      signal: 'cv',
      label: 'pitch',
      when: {
        all: [
          { id: 'mod.toOsc', eq: true },
          { id: 'osc4.kbd', eq: true },
        ],
      },
      levels: [WHEEL],
    },
    ...[1, 2, 3, 4].map((n) => ({
      id: `c4${n}`,
      from: `osc${n}`,
      to: 'mixer',
      signal: 'audio' as const,
      when: { id: `mix.osc${n}On`, eq: true },
      levels: [{ id: `mix.osc${n}`, pow: 1.7 }],
    })),
    { id: 'c50', from: 'kbd', to: 'pitch', signal: 'cv', label: 'pitch bend' },
    {
      id: 'c51',
      from: 'osc4',
      to: 'mod_bus',
      signal: 'cv',
      label: 'source A',
      when: { id: 'mod.srcA', eq: 'osc4' },
      levels: SOURCE_A,
    },
    {
      id: 'c52',
      from: 'filter_env',
      to: 'mod_bus',
      signal: 'cv',
      label: 'source A',
      when: { id: 'mod.srcA', eq: 'eg' },
      levels: SOURCE_A,
    },
    {
      id: 'c53',
      from: 'noise',
      to: 'mod_bus',
      signal: 'cv',
      label: 'source B',
      when: { id: 'mod.srcB', eq: 'noise' },
      levels: SOURCE_B,
    },
    {
      id: 'c54',
      from: 'lfo',
      to: 'mod_bus',
      signal: 'cv',
      label: 'source B',
      when: { id: 'mod.srcB', eq: 'lfo' },
      levels: SOURCE_B,
    },
    { id: 'c55', from: 'kbd', to: 'mod_bus', signal: 'cv', label: 'mod wheel', levels: [WHEEL] },
    {
      id: 'c60',
      from: 'noise',
      to: 'mixer',
      signal: 'audio',
      when: { id: 'mix.noiseOn', eq: true },
      levels: [{ id: 'mix.noise', pow: 1.7 }],
    },
    { id: 'c61', from: 'mixer', to: 'vcf', signal: 'audio' },
    {
      id: 'c62',
      from: 'filter_env',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: ['filter.contour'],
    },
    {
      id: 'c63',
      from: 'pitch',
      to: 'vcf',
      signal: 'cv',
      label: 'keyboard tracking',
      when: {
        any: [
          { id: 'filter.kbd1', eq: true },
          { id: 'filter.kbd2', eq: true },
        ],
      },
    },
    {
      id: 'c64',
      from: 'mod_bus',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'mod.toFilter', eq: true },
      levels: [WHEEL],
    },
    { id: 'c65', from: 'voices', to: 'filter_env', signal: 'gate' },
    { id: 'c66', from: 'voices', to: 'loud_env', signal: 'gate' },
    { id: 'c67', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c68', from: 'loud_env', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c69', from: 'vca', to: 'distortion', signal: 'audio' },
    { id: 'c70', from: 'distortion', to: 'chorus', signal: 'audio' },
    {
      id: 'c71',
      from: 'chorus',
      to: 'output',
      signal: 'audio',
      label: 'left',
      levels: [{ id: 'out.volume', pow: 1.7 }],
    },
    {
      id: 'c72',
      from: 'chorus',
      to: 'output',
      signal: 'audio',
      label: 'right',
      levels: [{ id: 'out.volume', pow: 1.7 }],
    },
  ],
  jacks: {
    'j.phones': 'output',
  },
  omitted: {
    seq: 'The definition does not model the sequencer.',
    c05: 'The keys into the sequencer: the definition does not model it.',
    c06: 'The sequencer into the voices: the definition does not model it.',
    c07: 'The clock into the sequencer: the definition does not model it.',
  },
};
