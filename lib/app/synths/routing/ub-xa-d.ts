/**
 * UB-Xa D signal routing, projected from its spec (`.context/app/synth-data/ub-xa-d/ub-xa-d.synth.json`, 0.7.0):
 * block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/ub-xa-d.ts`). One voice's path is drawn, with the LFOs, portamento and arpeggiator every voice shares.
 *
 * Where the definition says more than the spec, it decides. OSC 1 reaches the mixer only with SAW or PULSE on as well
 * as its mixer switch (`c30`), and OSC 2 at HALF or FULL (`c31`). DEPTH 1 and the performance LFO's DEPTH are squared,
 * as `toEngine()` reads them, and the performance LFO needs LOWER or UPPER on as well as its oscillator switch (`c26`,
 * `c27`). F-ENV bends OSC 2 by the filter's MODULATION knob (`c16`). The modulation LFO reaches each oscillator's
 * pulse width whether or not its PULSE is on, as the engine routes it (`c23`, `c24`). VOLUME scales the way out,
 * curved as `toEngine()` curves it (`c39`, `c40`).
 *
 * Where it says less, it decides too. It plays one patch on all sixteen voices, so BALANCE does not change the sound
 * and the two layer outputs are one path. It has no pitch bend, sequencer or pedals, so those are left out with their
 * connections, and SMP is the modulation LFO's own sample and hold rather than a sampling of the performance LFO.
 */
import type { RoutingLevel, RoutingWhen, SynthRouting } from '@/lib/app/synths/contract';

const DEPTH1: RoutingLevel[] = [{ id: 'mlfo.depth1', pow: 2 }];
const DEPTH2: RoutingLevel[] = ['mlfo.depth2'];
const PLFO_ON: RoutingWhen = {
  any: [
    { id: 'plfo.lower', eq: true },
    { id: 'plfo.upper', eq: true },
  ],
};
const VOLUME: RoutingLevel[] = [{ id: 'out.volume', pow: 1.7 }];
const ENV_SPECS = [{ label: 'Stages', value: 'Attack, decay, sustain, release' }];
const LFO_RATE = { label: 'Rate', value: '0.06 to 50 Hz' };

export const routing: SynthRouting = {
  synth: 'ub-xa-d',
  out: 'output',
  blocks: [
    {
      id: 'kbd',
      name: 'MIDI / USB',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      description:
        'Notes arrive over MIDI or USB: the D model has no keyboard. Sends them to the voices, or to the arpeggiator.',
      specs: [{ label: 'MIDI', value: 'In, Out, Thru on DIN; USB 2.0 type B' }],
    },
    {
      id: 'arp',
      name: 'Arpeggiator',
      module: 'mode',
      controls: ['arp.on', 'arp.hold'],
      description: 'Plays a held chord one note at a time, and latches it with HOLD.',
    },
    {
      id: 'voices',
      name: 'Voice allocation',
      module: 'mode',
      controls: ['voice.unison'],
      description:
        'Hands the notes to the sixteen voices, or with UNISON stacks the voices on one key with low-note priority.',
      specs: [
        { label: 'Voices', value: '16' },
        { label: 'Layers', value: '2' },
      ],
    },
    {
      id: 'portamento',
      name: 'Portamento',
      module: 'glide',
      controls: ['glide.time', 'out.tune'],
      description:
        'Polyphonic glide: each voice slides from its previous pitch to its new one on its own. Sets the oscillators’ and the filter’s pitch.',
    },
    {
      id: 'osc1',
      name: 'Oscillator 1',
      module: 'osc',
      meter: 'osc1',
      controls: ['osc1.freq', 'osc1.saw', 'osc1.pulse', 'osc.pw'],
      description:
        'Sawtooth and pulse, each switchable; both on gives a triangle. The sync master for OSC 2, sharing its pulse width.',
      specs: [
        { label: 'Waveforms', value: 'Sawtooth, pulse, triangle (both on)' },
        { label: 'Range', value: '4 octaves, in octave steps' },
      ],
    },
    {
      id: 'osc2',
      name: 'Oscillator 2',
      module: 'osc',
      meter: 'osc2',
      controls: [
        'osc2.freq',
        'osc2.detune',
        'osc2.saw',
        'osc2.pulse',
        'osc.pw',
        'osc2.sync',
        'osc2.fenv',
      ],
      description:
        'Sawtooth and pulse, each switchable, summed with both on and a triangle with both off. Hard-syncs to OSC 1, and F-ENV lets the filter envelope bend its pitch.',
      specs: [
        { label: 'Waveforms', value: 'Sawtooth, pulse, both, triangle (neither)' },
        { label: 'Range', value: '4 octaves, in semitone steps' },
      ],
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      controls: ['noise.level'],
      description: 'Noise into the mixer, at a level set by the NOISE knob in the filter section.',
    },
    {
      id: 'mixer',
      name: 'Voice mixer',
      module: 'mixer',
      controls: ['mix.osc1', 'mix.half', 'mix.full'],
      passes: true,
      description:
        'Three switched sources into the filter: OSC 1 on or off, OSC 2 at half level (about 5 dB down), full level or off, and noise.',
    },
    {
      id: 'vcf',
      name: 'Filter',
      module: 'filter',
      controls: ['vcf.freq', 'vcf.res', 'vcf.mod', 'vcf.fourPole', 'vcf.track'],
      description:
        'A resonant low-pass, 2-pole or 4-pole, swept by the filter envelope, the modulation LFO and the keys.',
      specs: [
        { label: 'Slopes', value: '12 or 24 dB per octave (2 or 4 poles)' },
        { label: 'Mode', value: 'Low-pass' },
      ],
    },
    {
      id: 'env_filter',
      name: 'Filter envelope',
      module: 'env',
      meter: 'env1',
      controls: ['fenv.attack', 'fenv.decay', 'fenv.sustain', 'fenv.release'],
      description: 'An ADSR for the filter cutoff and, with F-ENV on, OSC 2’s pitch.',
      specs: ENV_SPECS,
    },
    {
      id: 'env_loud',
      name: 'Loudness envelope',
      module: 'env',
      meter: 'env2',
      controls: ['lenv.attack', 'lenv.decay', 'lenv.sustain', 'lenv.release'],
      description: 'An ADSR for the VCA.',
      specs: ENV_SPECS,
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      description:
        'Each voice’s amplifier, driven by the loudness envelope, with tremolo from the modulation LFO when VOLUME MOD is on.',
    },
    {
      id: 'mod_lfo',
      name: 'Modulation LFO',
      module: 'lfo',
      meter: 'lfo',
      controls: [
        'mlfo.rate',
        'mlfo.shape',
        'mlfo.depth1',
        'mlfo.osc1',
        'mlfo.osc2',
        'mlfo.filter',
        'mlfo.depth2',
        'mlfo.pwm1',
        'mlfo.pwm2',
        'mlfo.vol',
      ],
      description:
        'The main LFO. DEPTH 1 sends it to OSC 1 pitch, OSC 2 pitch and the cutoff; DEPTH 2 to both pulse widths and the volume, each by its own switch.',
      specs: [
        LFO_RATE,
        { label: 'Shapes', value: 'Sine, sawtooth, square, ramp, sample and hold' },
        { label: 'Modes', value: 'TRIG, SMP' },
      ],
    },
    {
      id: 'perf_lfo',
      name: 'Performance LFO',
      module: 'lfo',
      controls: [
        'plfo.rate',
        'plfo.shape',
        'plfo.depth',
        'plfo.osc1',
        'plfo.osc2',
        'plfo.lower',
        'plfo.upper',
      ],
      description:
        'A second LFO for vibrato, with one depth, switched to OSC 1 and OSC 2 pitch and on per layer.',
      specs: [
        LFO_RATE,
        { label: 'Shapes', value: 'Sine, sawtooth, square, ramp, noise, sample and hold' },
      ],
    },
    {
      id: 'output',
      name: 'Output',
      module: 'out',
      controls: ['out.volume', 'out.balance'],
      description:
        'Master VOLUME and BALANCE between the two layers, to the balanced left, right, mono and headphone outputs.',
      specs: [
        { label: 'Main', value: '2 × 1/4-inch TRS balanced, max +22 dBu, 50 Ω' },
        { label: 'Mono', value: '1/4-inch TRS balanced' },
        { label: 'Phones', value: '1/4-inch TRS, 25 mW, 25 Ω' },
      ],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'voices', signal: 'cv', label: 'notes' },
    { id: 'c02', from: 'kbd', to: 'voices', signal: 'gate' },
    { id: 'c03', from: 'kbd', to: 'arp', signal: 'cv', label: 'notes' },
    {
      id: 'c04',
      from: 'arp',
      to: 'voices',
      signal: 'cv',
      label: 'notes',
      when: { id: 'arp.on', eq: true },
    },
    { id: 'c07', from: 'voices', to: 'portamento', signal: 'cv', label: 'pitch' },
    { id: 'c08', from: 'portamento', to: 'osc1', signal: 'cv', label: 'pitch' },
    { id: 'c09', from: 'portamento', to: 'osc2', signal: 'cv', label: 'pitch' },
    { id: 'c10', from: 'voices', to: 'env_filter', signal: 'gate' },
    { id: 'c11', from: 'voices', to: 'env_loud', signal: 'gate' },
    {
      id: 'c15',
      from: 'osc1',
      to: 'osc2',
      signal: 'audio',
      label: 'sync',
      when: { id: 'osc2.sync', eq: true },
    },
    {
      id: 'c16',
      from: 'env_filter',
      to: 'osc2',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'osc2.fenv', eq: true },
      levels: ['vcf.mod'],
    },
    {
      id: 'c20',
      from: 'mod_lfo',
      to: 'osc1',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'mlfo.osc1', eq: true },
      levels: DEPTH1,
    },
    {
      id: 'c21',
      from: 'mod_lfo',
      to: 'osc2',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'mlfo.osc2', eq: true },
      levels: DEPTH1,
    },
    {
      id: 'c22',
      from: 'mod_lfo',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'mlfo.filter', eq: true },
      levels: DEPTH1,
    },
    {
      id: 'c23',
      from: 'mod_lfo',
      to: 'osc1',
      signal: 'cv',
      label: 'pulse width',
      when: { id: 'mlfo.pwm1', eq: true },
      levels: DEPTH2,
    },
    {
      id: 'c24',
      from: 'mod_lfo',
      to: 'osc2',
      signal: 'cv',
      label: 'pulse width',
      when: { id: 'mlfo.pwm2', eq: true },
      levels: DEPTH2,
    },
    {
      id: 'c25',
      from: 'mod_lfo',
      to: 'vca',
      signal: 'cv',
      label: 'tremolo',
      when: { id: 'mlfo.vol', eq: true },
      levels: DEPTH2,
    },
    {
      id: 'c26',
      from: 'perf_lfo',
      to: 'osc1',
      signal: 'cv',
      label: 'pitch',
      when: { all: [{ id: 'plfo.osc1', eq: true }, PLFO_ON] },
      levels: [{ id: 'plfo.depth', pow: 2 }],
    },
    {
      id: 'c27',
      from: 'perf_lfo',
      to: 'osc2',
      signal: 'cv',
      label: 'pitch',
      when: { all: [{ id: 'plfo.osc2', eq: true }, PLFO_ON] },
      levels: [{ id: 'plfo.depth', pow: 2 }],
    },
    {
      id: 'c30',
      from: 'osc1',
      to: 'mixer',
      signal: 'audio',
      when: {
        all: [
          { id: 'mix.osc1', eq: true },
          {
            any: [
              { id: 'osc1.saw', eq: true },
              { id: 'osc1.pulse', eq: true },
            ],
          },
        ],
      },
    },
    {
      id: 'c31',
      from: 'osc2',
      to: 'mixer',
      signal: 'audio',
      when: {
        any: [
          { id: 'mix.half', eq: true },
          { id: 'mix.full', eq: true },
        ],
      },
    },
    {
      id: 'c32',
      from: 'noise',
      to: 'mixer',
      signal: 'audio',
      levels: [{ id: 'noise.level', pow: 1.7 }],
    },
    { id: 'c33', from: 'mixer', to: 'vcf', signal: 'audio' },
    {
      id: 'c34',
      from: 'env_filter',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: ['vcf.mod'],
    },
    {
      id: 'c35',
      from: 'portamento',
      to: 'vcf',
      signal: 'cv',
      label: 'key tracking',
      when: { id: 'vcf.track', eq: true },
    },
    { id: 'c37', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c38', from: 'env_loud', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c39', from: 'vca', to: 'output', signal: 'audio', label: 'lower', levels: VOLUME },
    { id: 'c40', from: 'vca', to: 'output', signal: 'audio', label: 'upper', levels: VOLUME },
  ],
  jacks: {},
  omitted: {
    bend: 'The definition has no pitch bend: OSC 2 ONLY and AMOUNT are printed only.',
    seq: 'The definition has no sequencer: its buttons are printed only.',
    c05: 'Notes into the sequencer: the definition has no sequencer.',
    c06: 'The sequencer into the voices: the definition has no sequencer.',
    c12: 'MIDI pitch bend into the bend section: the definition has no pitch bend.',
    c13: 'Pitch bend to OSC 1: the definition has no pitch bend.',
    c14: 'Pitch bend to OSC 2: the definition has no pitch bend.',
    c28: 'SMP sampling the performance LFO: the engine plays SMP as the modulation LFO’s own sample and hold.',
    c36: 'The filter pedal into the cutoff: the definition has no pedal inputs.',
  },
};
