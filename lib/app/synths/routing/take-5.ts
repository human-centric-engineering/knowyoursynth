/**
 * Take 5 signal routing, projected from its spec (`.context/app/synth-data/take-5/take-5.synth.json`, 0.13.0): block
 * and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/take-5.ts`). One voice's path is drawn, then the overdrive, effect and reverb all five voices share.
 *
 * Where the definition says more than the spec, it decides. Its oscillators always follow the keys, so the pitch feeds
 * (`c02`–`c04`) are fixed, and its filter tracks the keys at a fixed amount and its DRIVE never silences the mixer
 * (`c13`, `c16`). OVERDRIVE at zero bypasses the overdrive rather than muting it (`c27`). The envelopes' AMOUNT knobs
 * are bipolar, so a level is their distance from centre; the VCA hears only the positive half of ENV 2's AMOUNT
 * (`c18`), which a level cannot say, so below centre the VCA edge lights while the voice is silent. FM 2→1's depth is
 * the OSC 2 knob squared (`c07`). VOLUME scales the way out, curved as `toEngine()` curves it (`c29`).
 *
 * The spec wires the LFOs' and Envelope 1's direct destinations (LFO 1, LFO 2, ENV 1 as Aux) to nothing, only to its
 * mod matrix; the definition has those three destination selectors and no matrix, so each is drawn as a route per
 * destination with an id derived from its source and target (`lfo1_osc1`, `env1_res`), switched by the selector and
 * scaled by the AMOUNT knob, as `destRoutes()` in `toEngine()` builds them.
 *
 * Where it says less, it decides too. It has no pitch bend or LFO note reset, so those connections are left out, and
 * no delay stage on the envelopes. The arpeggiator plays the voices only while it is on (`c01`); the sequencer's
 * buttons are panel modes.
 */
import type {
  RoutingEdge,
  RoutingLevel,
  RoutingWhen,
  SynthRouting,
} from '@/lib/app/synths/contract';

const AUX: RoutingWhen = { id: 'env.routing', in: ['aux-filteramp', 'aux-filtergate'] };
const OSC_SPECS = [
  { label: 'Octave', value: '5 ranges, −2 to +2' },
  { label: 'Pitch', value: '±7 semitones' },
  { label: 'Shape', value: 'Sine to sawtooth to pulse, with pulse width' },
];
const LFO_SPECS = [
  { label: 'Shapes', value: 'Triangle, sawtooth, reverse sawtooth, square, sample and hold' },
];

/** A direct destination (`lfo1.dest`, `env1.dest`) as one edge per target, `extra` holding where the source is on. */
function destEdges(
  from: 'lfo1' | 'lfo2' | 'env1',
  dest: string,
  amount: string,
  extra?: RoutingWhen
): RoutingEdge[] {
  const levels: RoutingLevel[] = [{ id: amount, off: 0 }];
  const to: [suffix: string, block: string, values: string[], label: string][] = [
    ['osc1', 'osc1', ['osc-all', 'osc1'], 'pitch'],
    ['osc2', 'osc2', ['osc-all', 'osc2'], 'pitch'],
    ['cutoff', 'vcf', ['cutoff'], 'cutoff'],
    ['res', 'vcf', ['res'], 'resonance'],
  ];
  return to.map(([suffix, block, values, label]) => {
    const pick: RoutingWhen =
      values.length === 1 ? { id: dest, eq: values[0] } : { id: dest, in: values };
    return {
      id: `${from}_${suffix}`,
      from,
      to: block,
      signal: 'cv',
      label,
      when: extra ? { all: [extra, pick] } : pick,
      levels,
    };
  });
}

export const routing: SynthRouting = {
  synth: 'take-5',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Keyboard and voices',
      module: 'mode',
      symbol: 'midi',
      meter: 'gate',
      controls: ['voice.unison', 'glide.on', 'glide.time', 'voice.vintage'],
      description:
        'The keys, or MIDI, handed to the five voices, or with UNISON stacked on one key. Sets each voice’s pitch, with GLIDE, and its gate and velocity; VINTAGE lets the voices drift apart.',
      specs: [
        { label: 'Keys', value: '44, with velocity and aftertouch' },
        { label: 'Voices', value: '5' },
      ],
    },
    {
      id: 'arp',
      name: 'Arpeggiator',
      module: 'mode',
      controls: ['arp.on', 'arp.mode', 'arp.octave', 'clock.bpm', 'clock.div'],
      description: 'Plays the held keys one at a time, at the clock’s tempo and division.',
      specs: [
        { label: 'Modes', value: 'Up, down, up and down, random, assign' },
        { label: 'Octaves', value: '1 to 3' },
        { label: 'Tempo', value: '30 to 250 BPM' },
        { label: 'Sequencer', value: '64 steps, polyphonic' },
      ],
    },
    {
      id: 'osc1',
      name: 'Oscillator 1',
      module: 'osc',
      meter: 'osc1',
      controls: ['osc1.octave', 'osc1.pitch', 'osc1.shape', 'osc1.sync', 'osc.fm'],
      description:
        'An analogue oscillator whose SHAPE morphs sine to sawtooth to pulse. It can sync to Oscillator 2, and with FM 2→1 Oscillator 2 frequency-modulates it.',
      specs: OSC_SPECS,
    },
    {
      id: 'osc2',
      name: 'Oscillator 2',
      module: 'osc',
      meter: 'osc2',
      controls: ['osc2.octave', 'osc2.pitch', 'osc2.shape'],
      description:
        'The same oscillator again, and the FM and sync source for Oscillator 1. With FM 2→1 on it leaves the mixer.',
      specs: OSC_SPECS,
    },
    {
      id: 'sub',
      name: 'Sub oscillator',
      module: 'osc',
      controls: ['mix.sub'],
      description: 'A sub oscillator from Oscillator 1, for weight underneath.',
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      controls: ['mix.noise'],
      description:
        'One knob for colour and level: white noise clockwise of centre, pink counter-clockwise.',
      specs: [{ label: 'Colours', value: 'White, pink' }],
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      controls: ['mix.osc1', 'mix.sub', 'mix.osc2', 'mix.noise'],
      passes: true,
      description:
        'OSC 1, OSC 1 SUB, OSC 2 and NOISE levels into the filter. With FM 2→1 on, the OSC 2 knob sets the FM depth instead.',
    },
    {
      id: 'vcf',
      name: 'Filter',
      module: 'filter',
      controls: ['vcf.cutoff', 'vcf.resonance', 'vcf.drive'],
      description:
        'A resonant low-pass with drive and key tracking, swept by its envelope. It self-oscillates at high resonance.',
      specs: [{ label: 'Mode', value: 'Low-pass' }],
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      description:
        'Each voice’s amplifier, opened by Envelope 2 or, in the third ENV ROUTING, by the gate alone.',
    },
    {
      id: 'env1',
      name: 'Envelope 1',
      module: 'env',
      meter: 'env1',
      controls: [
        'env.routing',
        'env1.attack',
        'env1.decay',
        'env1.sustain',
        'env1.release',
        'env1.amount',
        'env1.vel',
        'env1.dest',
      ],
      stages: {
        attack: 'env1.attack',
        decay: 'env1.decay',
        sustain: 'env1.sustain',
        release: 'env1.release',
      },
      description:
        'The filter envelope in the first ENV ROUTING; in the other two it is free, sent by ENV 1 to a destination of its own. AMOUNT is bipolar.',
    },
    {
      id: 'env2',
      name: 'Envelope 2',
      module: 'env',
      meter: 'env2',
      controls: [
        'env2.attack',
        'env2.decay',
        'env2.sustain',
        'env2.release',
        'env2.amount',
        'env2.vel',
      ],
      stages: {
        attack: 'env2.attack',
        decay: 'env2.decay',
        sustain: 'env2.sustain',
        release: 'env2.release',
      },
      description:
        'The loudness envelope; in the second and third ENV ROUTING it sweeps the filter too, and in the third the VCA follows the gate instead.',
    },
    {
      id: 'lfo1',
      name: 'LFO 1',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo1.freq', 'lfo1.shape', 'lfo1.amt', 'lfo1.dest'],
      description:
        'One LFO for all five voices, sent by its AMOUNT to one destination: pitch, cutoff or resonance.',
      specs: LFO_SPECS,
    },
    {
      id: 'lfo2',
      name: 'LFO 2',
      module: 'lfo',
      controls: ['lfo2.freq', 'lfo2.shape', 'lfo2.amt', 'lfo2.dest'],
      description: 'An LFO in each voice, with the same controls as LFO 1.',
      specs: LFO_SPECS,
    },
    {
      id: 'drive',
      name: 'Overdrive',
      module: 'fx',
      controls: ['drive.amount'],
      passes: true,
      description:
        'Overdrive on the five voices summed, before and apart from the digital effects. At zero it is bypassed.',
    },
    {
      id: 'fx',
      name: 'Effect',
      module: 'fx',
      controls: ['fx.on', 'fx.type', 'fx.time', 'fx.mix', 'fx.misc'],
      passes: true,
      description: 'One digital effect from eleven, or bypassed when off.',
      specs: [
        {
          label: 'Types',
          value:
            'Stereo delay, BBD, tape delay 1 and 2, chorus, flanger, phaser, high-pass filter, distortion, ring mod, rotating speaker',
        },
      ],
    },
    {
      id: 'reverb',
      name: 'Reverb',
      module: 'fx',
      controls: ['rev.on', 'rev.mix', 'rev.decay', 'rev.predelay', 'rev.tone', 'rev.damping'],
      passes: true,
      description: 'A plate reverb after the effect, or bypassed when off.',
      specs: [{ label: 'Type', value: 'Plate' }],
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'Master volume to the stereo outputs and the headphones.',
      specs: [
        { label: 'Main', value: 'Left and right, 1/4-inch unbalanced' },
        { label: 'Phones', value: '1/4-inch stereo' },
      ],
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
      from: 'osc2',
      to: 'osc1',
      signal: 'audio',
      label: 'FM',
      when: { id: 'osc.fm', eq: true },
      levels: [{ id: 'mix.osc2', pow: 2 }],
    },
    {
      id: 'c08',
      from: 'osc2',
      to: 'osc1',
      signal: 'audio',
      label: 'sync',
      when: { id: 'osc1.sync', eq: true },
    },
    { id: 'c09', from: 'osc1', to: 'mixer', signal: 'audio', levels: ['mix.osc1'] },
    { id: 'c10', from: 'sub', to: 'mixer', signal: 'audio', levels: ['mix.sub'] },
    {
      id: 'c11',
      from: 'osc2',
      to: 'mixer',
      signal: 'audio',
      when: { id: 'osc.fm', eq: false },
      levels: ['mix.osc2'],
    },
    {
      id: 'c12',
      from: 'noise',
      to: 'mixer',
      signal: 'audio',
      levels: [{ id: 'mix.noise', off: 0 }],
    },
    { id: 'c13', from: 'mixer', to: 'vcf', signal: 'audio' },
    {
      id: 'c14',
      from: 'env1',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'env.routing', eq: 'filter-amp' },
      levels: [{ id: 'env1.amount', off: 0 }],
    },
    {
      id: 'c15',
      from: 'env2',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: AUX,
      levels: [{ id: 'env2.amount', off: 0 }],
    },
    { id: 'c16', from: 'kbd', to: 'vcf', signal: 'cv', label: 'key tracking' },
    { id: 'c17', from: 'vcf', to: 'vca', signal: 'audio' },
    {
      id: 'c18',
      from: 'env2',
      to: 'vca',
      signal: 'cv',
      label: 'loudness',
      when: { id: 'env.routing', in: ['filter-amp', 'aux-filteramp'] },
      levels: [{ id: 'env2.amount', off: 0 }],
    },
    {
      id: 'c19',
      from: 'kbd',
      to: 'vca',
      signal: 'gate',
      label: 'loudness',
      when: { id: 'env.routing', eq: 'aux-filtergate' },
    },
    { id: 'c20', from: 'kbd', to: 'env1', signal: 'gate' },
    {
      id: 'c21',
      from: 'kbd',
      to: 'env1',
      signal: 'cv',
      label: 'velocity',
      when: { id: 'env1.vel', eq: true },
    },
    { id: 'c22', from: 'kbd', to: 'env2', signal: 'gate' },
    {
      id: 'c23',
      from: 'kbd',
      to: 'env2',
      signal: 'cv',
      label: 'velocity',
      when: { id: 'env2.vel', eq: true },
    },
    ...destEdges('lfo1', 'lfo1.dest', 'lfo1.amt'),
    ...destEdges('lfo2', 'lfo2.dest', 'lfo2.amt'),
    ...destEdges('env1', 'env1.dest', 'env1.amount', AUX),
    { id: 'c26', from: 'vca', to: 'drive', signal: 'audio' },
    { id: 'c27', from: 'drive', to: 'fx', signal: 'audio' },
    { id: 'c28', from: 'fx', to: 'reverb', signal: 'audio' },
    {
      id: 'c29',
      from: 'reverb',
      to: 'out',
      signal: 'audio',
      levels: [{ id: 'out.volume', pow: 1.7 }],
    },
  ],
  jacks: {},
  omitted: {
    c05: 'Pitch bend to Oscillator 1: the definition has no pitch bend.',
    c06: 'Pitch bend to Oscillator 2: the definition has no pitch bend.',
    c24: 'Note reset of LFO 1: the definition has no note reset; its LFOs run free.',
    c25: 'Note reset of LFO 2: the definition has no note reset; its LFOs run free.',
  },
};
