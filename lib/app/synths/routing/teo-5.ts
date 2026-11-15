/**
 * TEO-5 signal routing, projected from its spec (`.context/app/synth-data/teo-5/teo-5.synth.json`, 0.12.0): block and
 * edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's (`defs/teo-5.ts`).
 * One voice's path is drawn, then the overdrive, effect and reverb all five voices share. Built as the Take 5's is
 * (`routing/take-5.ts`), the voice the TEO-5 shares.
 *
 * Where the definition says more than the spec, it decides. Each mixer channel is its button and its level on the
 * display (`c09`–`c13`). OVERDRIVE at zero bypasses the overdrive rather than muting it, so it is not a level on `c28`.
 * The envelopes' AMOUNT knobs are bipolar, so a level is their distance from centre; the VCA hears only the positive
 * half of ENV 2's AMOUNT (`c19`), which a level cannot say, so below centre the VCA edge lights while the voice is
 * silent. X-MOD's depth is the knob squared (`c07`). VOLUME scales the way out, curved as `toEngine()` curves it
 * (`c30`).
 *
 * The spec wires the LFOs' and Envelope 1's direct destinations to nothing, only naming them as parameters; the
 * definition has those three destination selectors and no matrix, so each is drawn as a route per destination with an
 * id derived from its source and target (`lfo1_osc1`, `env1_res`), switched by the selector and scaled by the AMOUNT
 * knob, as `destRoutes()` in `toEngine()` builds them.
 *
 * Where it says less, it decides too. It has no pitch bend of its own or LFO note reset, so those connections are left
 * out. The arpeggiator plays the voices only while it is on (`c01`); the sequencer's buttons are panel modes.
 */
import type {
  RoutingEdge,
  RoutingLevel,
  RoutingWhen,
  SynthRouting,
} from '@/lib/app/synths/contract';

const AUX: RoutingWhen = { id: 'env.routing', in: ['aux-filteramp', 'aux-filtergate'] };
const OSC_SPECS = [
  { label: 'Range', value: '5 octaves and a minor third, in semitones' },
  { label: 'Waves', value: 'Triangle, sawtooth and pulse, any together' },
  { label: 'Pulse width', value: '50 % to 97 %' },
];
const LFO_SPECS = [
  { label: 'Rate', value: '0.022 to 500 Hz' },
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
    ['osc1', 'osc1', ['osc-all', 'osc1', 'pw-all'], 'pitch or width'],
    ['osc2', 'osc2', ['osc-all', 'osc2', 'pw-all'], 'pitch or width'],
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
  synth: 'teo-5',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Keyboard and voices',
      module: 'mode',
      symbol: 'midi',
      meter: 'gate',
      controls: [
        'voice.unison',
        'voice.uniVoices',
        'voice.uniDetune',
        'glide.on',
        'glide.time',
        'voice.vintage',
        'kbd.octave',
      ],
      description:
        'The keys, or MIDI, handed to the five voices, or with UNISON stacked on one key. Sets each voice’s pitch, with PORTAMENTO and OCTAVE, and its gate and velocity; VINTAGE lets the voices drift apart.',
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
      controls: [
        'osc1.freq',
        'osc1.tri',
        'osc1.saw',
        'osc1.pulse',
        'osc.pw',
        'osc1.key',
        'osc1.sync',
        'osc.xmod',
      ],
      description:
        'An analogue oscillator with triangle, sawtooth and pulse, which sum when more than one is on. It can sync to Oscillator 2, and X-MOD lets Oscillator 2’s triangle frequency-modulate it.',
      specs: OSC_SPECS,
    },
    {
      id: 'osc2',
      name: 'Oscillator 2',
      module: 'osc',
      meter: 'osc2',
      controls: [
        'osc2.freq',
        'osc2.detune',
        'osc2.tri',
        'osc2.saw',
        'osc2.pulse',
        'osc.pw',
        'osc2.key',
        'osc2.bypass',
      ],
      description:
        'The same oscillator again, with a fine DETUNE, and the X-MOD and sync source for Oscillator 1. It can bypass the filter, straight to the VCA.',
      specs: [...OSC_SPECS, { label: 'Detune', value: '±49.2 cents' }],
    },
    {
      id: 'sub',
      name: 'Sub oscillator',
      module: 'osc',
      controls: ['mix.sub', 'mix.subLvl'],
      description: 'A square an octave below Oscillator 1, following it, for weight underneath.',
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      controls: ['mix.noise', 'mix.noiseLvl', 'noise.type'],
      description: 'White or pink noise, chosen on the display.',
      specs: [{ label: 'Colours', value: 'White, pink' }],
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      controls: [
        'mix.osc1',
        'mix.osc1Lvl',
        'mix.sub',
        'mix.subLvl',
        'mix.osc2',
        'mix.osc2Lvl',
        'mix.noise',
        'mix.noiseLvl',
      ],
      passes: true,
      description:
        'OSC 1, SUB, OSC 2 and NOISE buttons into the filter, each at its level on the display.',
    },
    {
      id: 'vcf',
      name: 'Filter',
      module: 'filter',
      controls: ['vcf.cutoff', 'vcf.resonance', 'vcf.state', 'vcf.bp', 'vcf.key'],
      description:
        'A 12 dB state-variable filter after the SEM’s, whose STATE sweeps low-pass, notch and high-pass (band-pass with Bandpass on). It does not self-oscillate.',
      specs: [
        { label: 'Slope', value: '12 dB/octave' },
        { label: 'Modes', value: 'Low-pass to notch to high-pass; band-pass' },
      ],
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      description:
        'Each voice’s amplifier, opened by Envelope 2 or, in the third ENV ROUTING, by the gate alone. Oscillator 2 joins here when it bypasses the filter.',
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
        'env1.delay',
        'env.repeat',
      ],
      stages: {
        attack: 'env1.attack',
        decay: 'env1.decay',
        sustain: 'env1.sustain',
        release: 'env1.release',
      },
      description:
        'The filter envelope in the first ENV ROUTING; in the other two it is free, sent by ENV 1 to a destination of its own. AMOUNT is bipolar; a delay and a repeat are on the display.',
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
        'env2.delay',
        'env.repeat',
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
        'One LFO for all five voices, sent by its AMOUNT to one destination: pitch, pulse width, cutoff or resonance.',
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
        'Analogue overdrive on the five voices summed, before and apart from the digital effects. At zero it is bypassed.',
    },
    {
      id: 'fx',
      name: 'Effect',
      module: 'fx',
      controls: ['fx.on', 'fx.type', 'fx.time', 'fx.mix', 'fx.misc'],
      passes: true,
      description: 'One digital effect from twelve, or bypassed when off.',
      specs: [
        {
          label: 'Types',
          value:
            'Stereo delay, BBD, tape delay 1 and 2, chorus, flanger, phaser, high-pass filter, distortion, ring mod, rotating speaker, lo-fi',
        },
      ],
    },
    {
      id: 'reverb',
      name: 'Reverb',
      module: 'fx',
      controls: ['rev.on', 'rev.mix', 'rev.size', 'rev.predelay', 'rev.decay', 'rev.tone'],
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
    {
      id: 'c02',
      from: 'kbd',
      to: 'osc1',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'osc1.key', eq: 'on' },
    },
    {
      id: 'c03',
      from: 'kbd',
      to: 'osc2',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'osc2.key', eq: 'on' },
    },
    {
      id: 'c04',
      from: 'kbd',
      to: 'sub',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'osc1.key', eq: 'on' },
    },
    {
      id: 'c07',
      from: 'osc2',
      to: 'osc1',
      signal: 'audio',
      label: 'X-Mod',
      levels: [{ id: 'osc.xmod', pow: 2 }],
    },
    {
      id: 'c08',
      from: 'osc2',
      to: 'osc1',
      signal: 'audio',
      label: 'sync',
      when: { id: 'osc1.sync', eq: true },
    },
    {
      id: 'c09',
      from: 'osc1',
      to: 'mixer',
      signal: 'audio',
      when: { id: 'mix.osc1', eq: true },
      levels: ['mix.osc1Lvl'],
    },
    {
      id: 'c10',
      from: 'sub',
      to: 'mixer',
      signal: 'audio',
      when: { id: 'mix.sub', eq: true },
      levels: ['mix.subLvl'],
    },
    {
      id: 'c11',
      from: 'osc2',
      to: 'mixer',
      signal: 'audio',
      when: {
        all: [
          { id: 'mix.osc2', eq: true },
          { id: 'osc2.bypass', eq: 'off' },
        ],
      },
      levels: ['mix.osc2Lvl'],
    },
    {
      id: 'c12',
      from: 'osc2',
      to: 'vca',
      signal: 'audio',
      label: 'filter bypass',
      when: {
        all: [
          { id: 'mix.osc2', eq: true },
          { id: 'osc2.bypass', eq: 'on' },
        ],
      },
      levels: ['mix.osc2Lvl'],
    },
    {
      id: 'c13',
      from: 'noise',
      to: 'mixer',
      signal: 'audio',
      when: { id: 'mix.noise', eq: true },
      levels: ['mix.noiseLvl'],
    },
    { id: 'c14', from: 'mixer', to: 'vcf', signal: 'audio' },
    {
      id: 'c15',
      from: 'env1',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'env.routing', eq: 'filter-amp' },
      levels: [{ id: 'env1.amount', off: 0 }],
    },
    {
      id: 'c16',
      from: 'env2',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: AUX,
      levels: [{ id: 'env2.amount', off: 0 }],
    },
    {
      id: 'c17',
      from: 'kbd',
      to: 'vcf',
      signal: 'cv',
      label: 'key tracking',
      levels: ['vcf.key'],
    },
    { id: 'c18', from: 'vcf', to: 'vca', signal: 'audio' },
    {
      id: 'c19',
      from: 'env2',
      to: 'vca',
      signal: 'cv',
      label: 'loudness',
      when: { id: 'env.routing', in: ['filter-amp', 'aux-filteramp'] },
      levels: [{ id: 'env2.amount', off: 0 }],
    },
    {
      id: 'c20',
      from: 'kbd',
      to: 'vca',
      signal: 'gate',
      label: 'loudness',
      when: { id: 'env.routing', eq: 'aux-filtergate' },
    },
    { id: 'c21', from: 'kbd', to: 'env1', signal: 'gate' },
    { id: 'c22', from: 'kbd', to: 'env2', signal: 'gate' },
    {
      id: 'c23',
      from: 'kbd',
      to: 'env1',
      signal: 'cv',
      label: 'velocity',
      when: { id: 'env1.vel', eq: true },
    },
    {
      id: 'c24',
      from: 'kbd',
      to: 'env2',
      signal: 'cv',
      label: 'velocity',
      when: { id: 'env2.vel', eq: true },
    },
    ...destEdges('lfo1', 'lfo1.dest', 'lfo1.amt'),
    ...destEdges('lfo2', 'lfo2.dest', 'lfo2.amt'),
    ...destEdges('env1', 'env1.dest', 'env1.amount', AUX),
    { id: 'c27', from: 'vca', to: 'drive', signal: 'audio' },
    { id: 'c28', from: 'drive', to: 'fx', signal: 'audio' },
    { id: 'c29', from: 'fx', to: 'reverb', signal: 'audio' },
    {
      id: 'c30',
      from: 'reverb',
      to: 'out',
      signal: 'audio',
      levels: [{ id: 'out.volume', pow: 1.7 }],
    },
  ],
  jacks: {},
  omitted: {
    c05: 'Pitch bend to Oscillator 1: the definition has no bend of its own; the page’s keyboard bends.',
    c06: 'Pitch bend to Oscillator 2: the definition has no bend of its own; the page’s keyboard bends.',
    c25: 'Note reset of LFO 1: the definition has no note reset; its LFOs run free.',
    c26: 'Note reset of LFO 2: the definition has no note reset; its LFOs run free.',
  },
};
