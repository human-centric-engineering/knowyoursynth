/**
 * DeepMind 12D signal routing, projected from its spec
 * (`.context/app/synth-data/deepmind-12d/deepmind-12d.synth.json`, 0.7.0): block and edge ids are the spec's module
 * and connection ids; switches, levels and jacks are the definition's (`defs/deepmind-12d.ts`, with its effects in
 * `defs/deepmind-12d-fx.ts`). One voice's path is drawn, then the high-pass filter and effects every voice shares.
 *
 * The spec gives the VCA and VCF envelopes' oscillator routes the same four ids (`c2vo1`, `c2vo2`, `c2vpw`, `c2vtm`).
 * Those ids go to the VCA envelope's, the first listed; the VCF envelope's are drawn as `c2fo1`, `c2fo2`, `c2fpw` and
 * `c2ftm`, after the spec's `c2m*` for the MOD envelope.
 *
 * Where the definition says more than the spec, it decides. OSC 1 reaches the mixer only with SAW or PULSE on (`c40`).
 * Each pitch, PWM and TONE MOD route is picked by its source switch, the LFOs' unipolar choices included, and scaled
 * by its fader, the pitch depths squared as `toEngine()` reads them; with PITCH MOD MODE on both, OSC 1's pitch source
 * moves OSC 2 as well, which the spec has no connection for. The filter LFO depth is squared, plus the MW-LFO depth
 * (`c45`, `c46`). The effects are modelled, not a pass-through: four slots, with the dry sound through them or round
 * them by mode. VOLUME scales the way out, curved as `toEngine()` curves it (`c55`).
 *
 * Where it says less, it decides too. It has no envelope trigger modes, mod matrix, control sequencer, velocity,
 * aftertouch or pitch bend, so the envelopes are always triggered by the keys and the rest is left out with its
 * connections.
 */
import type { RoutingLevel, RoutingWhen, SynthRouting } from '@/lib/app/synths/contract';
import { FX_ALGOS } from '@/lib/app/synths/defs/deepmind-12d-fx';

type Source = 'lfo1' | 'lfo2' | 'env_vca' | 'env_vcf' | 'env_mod';
/** Each source block, its values on the oscillators' source switches, and the id letter of its routes. */
const SOURCES: [block: Source, values: string[], pmValues: string[], pre: string][] = [
  ['lfo1', ['lfo1'], ['lfo1', 'lfo1uni'], 'c21'],
  ['lfo2', ['lfo2'], ['lfo2', 'lfo2uni'], 'c22'],
  ['env_vca', ['vcaEnv'], ['vcaEnv'], 'c2v'],
  ['env_vcf', ['vcfEnv'], ['vcfEnv'], 'c2f'],
  ['env_mod', ['modEnv'], ['modEnv'], 'c2m'],
];
const pick = (id: string, values: string[]): RoutingWhen =>
  values.length === 1 ? { id, eq: values[0] } : { id, in: values };
const PITCH = (id: string): RoutingLevel[] => [{ id, pow: 2 }];
const ENV_CONTROLS = (e: string): string[] =>
  ['attack', 'attackCurve', 'decay', 'decayCurve', 'sustain', 'release', 'releaseCurve'].map(
    (s) => `${e}Env.${s}`
  );
/** An envelope's stage lights: each stage's time slider, and the SUSTAIN level (its curve faders light nothing). */
const ENV_STAGES = (e: string) => ({
  attack: `${e}Env.attack`,
  decay: `${e}Env.decay`,
  sustain: `${e}Env.sustain`,
  release: `${e}Env.release`,
});
const ENV_SPECS = [
  { label: 'Stages', value: 'Attack, decay, sustain, release' },
  { label: 'Curves', value: 'Adjustable per stage' },
];
const LFO_SPECS = [
  { label: 'Rate', value: '0.041 to 65.4 Hz' },
  {
    label: 'Shapes',
    value: 'Sine, triangle, square, ramp up, ramp down, sample and hold, sample and glide',
  },
];
const RANGES = { label: 'Ranges', value: "16', 8', 4'" };
const FILTER_LFO = [{ sum: [{ id: 'vcf.lfo', pow: 2 }, 'vcf.mwLfo'] }];
/** Every effects control: the mode and routing, and each slot's level, type and every algorithm's parameters. */
const FX_CONTROLS = [
  'fx.mode',
  'fx.routing',
  ...[1, 2, 3, 4].flatMap((s) => [
    `fx${s}.level`,
    `fx${s}.type`,
    ...FX_ALGOS.flatMap((a) => a.params.map((q) => `fx${s}.${a.id}.${q.ref.toLowerCase()}`)),
  ]),
];

export const routing: SynthRouting = {
  synth: 'deepmind-12d',
  out: 'output',
  blocks: [
    {
      id: 'kbd',
      name: 'MIDI input',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      description:
        'All notes arrive over MIDI (DIN, USB or Wi-Fi): the 12D has no keyboard. Sends them to the voices, or to the arpeggiator.',
      specs: [{ label: 'MIDI', value: 'In, Out, Thru on DIN; USB 2.0 type B; Wi-Fi' }],
    },
    {
      id: 'arp',
      name: 'Arpeggiator',
      module: 'mode',
      controls: ['arp.on', 'arp.rate', 'arp.gate', 'arp.mode', 'arp.octaves', 'arp.hold'],
      description:
        'Arpeggiates held notes at the master BPM, with gate time and hold. With it on, its notes replace the played ones.',
      specs: [
        { label: 'Octaves', value: '1 to 6' },
        { label: 'Tempo', value: '20 to 275 BPM' },
      ],
    },
    {
      id: 'voices',
      name: 'Voice allocation',
      module: 'mode',
      controls: ['voice.mode', 'voice.detune', 'voice.drift'],
      description:
        'Hands the twelve voices out to the notes: one per note, several per note in unison, one in mono, or a smaller pool. Each voice drifts on its own.',
      specs: [{ label: 'Voices', value: '12' }],
    },
    {
      id: 'portamento',
      name: 'Portamento',
      module: 'glide',
      controls: ['glide.time'],
      description:
        'Glides the pitch between notes, and sets the oscillators’ and the filter’s pitch.',
      specs: [{ label: 'Time', value: '0 to 10 s' }],
    },
    {
      id: 'osc1',
      name: 'OSC 1',
      module: 'osc',
      meter: 'osc1',
      controls: [
        'osc1.range',
        'osc1.saw',
        'osc1.pulse',
        'osc1.pwm',
        'osc1.pwmSrc',
        'osc1.pitchMod',
        'osc1.pmSrc',
        'osc1.pmMode',
      ],
      description:
        'Sawtooth and pulse, each switched on or off, so both can sound together. Pulse width and pitch are each swept by a chosen source.',
      specs: [
        { label: 'Waveforms', value: 'Sawtooth, pulse (together or alone)' },
        RANGES,
        { label: 'Pulse width', value: '50 to 99 %' },
        { label: 'Pitch mod', value: 'Up to 36 semitones' },
      ],
    },
    {
      id: 'osc2',
      name: 'OSC 2',
      module: 'osc',
      meter: 'osc2',
      controls: [
        'osc2.range',
        'osc2.pitch',
        'osc2.toneMod',
        'osc2.tmSrc',
        'osc2.pitchMod',
        'osc2.pmSrc',
        'osc2.sync',
      ],
      description:
        'A square wave whose TONE MOD interrupts the pulse to change its harmonics, with its own pitch offset and hard sync to OSC 1.',
      specs: [
        { label: 'Waveform', value: 'Square, with tone mod' },
        RANGES,
        { label: 'Pitch', value: '±12 semitones' },
      ],
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      controls: ['noise.level'],
      description: 'White noise, mixed with the oscillators.',
    },
    {
      id: 'mixer',
      name: 'Voice mixer',
      module: 'mixer',
      controls: ['osc2.level'],
      passes: true,
      description:
        'Sums OSC 1, OSC 2 and noise before the filter. OSC 1 has no level of its own: OSC 2 and noise are set against it.',
    },
    {
      id: 'vcf',
      name: 'VCF',
      module: 'filter',
      controls: [
        'vcf.freq',
        'vcf.res',
        'vcf.twoPole',
        'vcf.env',
        'vcf.invert',
        'vcf.lfo',
        'vcf.lfoSel',
        'vcf.mwLfo',
        'vcf.kybd',
      ],
      description:
        'A resonant low-pass, 4-pole or 2-pole, swept by the VCF envelope (either way up), a chosen LFO and the keys.',
      specs: [
        { label: 'Slopes', value: '24 or 12 dB per octave (4 or 2 poles)' },
        { label: 'Cutoff', value: '50 Hz to 20 kHz' },
      ],
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      controls: ['vca.level'],
      description: 'Each voice’s amplifier, driven by the VCA envelope.',
      specs: [{ label: 'Level', value: '−12 dB to +6 dB' }],
    },
    {
      id: 'hpf',
      name: 'HPF',
      module: 'filter',
      controls: ['hpf.freq', 'hpf.boost'],
      description:
        'A high-pass filter on all twelve voices after they sum, with a bass BOOST on the path.',
      specs: [
        { label: 'Slope', value: '6 dB per octave' },
        { label: 'Cutoff', value: '20 Hz to 2 kHz' },
        { label: 'Boost', value: '+12 dB bass' },
      ],
    },
    {
      id: 'env_vca',
      name: 'VCA envelope',
      module: 'env',
      meter: 'env2',
      controls: ENV_CONTROLS('vca'),
      stages: ENV_STAGES('vca'),
      description:
        'An ADSR for the VCA, with a curve for each stage, and a source for the oscillators.',
      specs: ENV_SPECS,
    },
    {
      id: 'env_vcf',
      name: 'VCF envelope',
      module: 'env',
      meter: 'env1',
      controls: ENV_CONTROLS('vcf'),
      stages: ENV_STAGES('vcf'),
      description:
        'An ADSR for the filter cutoff, with a curve for each stage, and a source for the oscillators.',
      specs: ENV_SPECS,
    },
    {
      id: 'env_mod',
      name: 'MOD envelope',
      module: 'env',
      controls: ENV_CONTROLS('mod'),
      description: 'A general-purpose ADSR for the oscillators’ pitch, pulse width and tone mod.',
      specs: ENV_SPECS,
    },
    {
      id: 'lfo1',
      name: 'LFO 1',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo1.rate', 'lfo1.delay', 'lfo1.shape', 'lfo1.keySync'],
      description: 'An LFO with seven shapes, a delay with fade-in and key sync.',
      specs: LFO_SPECS,
    },
    {
      id: 'lfo2',
      name: 'LFO 2',
      module: 'lfo',
      controls: ['lfo2.rate', 'lfo2.delay', 'lfo2.shape', 'lfo2.keySync'],
      description: 'A second LFO, the same as LFO 1.',
      specs: LFO_SPECS,
    },
    {
      id: 'fx',
      name: 'Effects engine',
      module: 'fx',
      controls: FX_CONTROLS,
      passes: true,
      description:
        'Four effects slots on the master bus, in one of ten routings. INSERT puts the whole sound through them, SEND adds them beside the dry sound, BYPASS leaves only the dry sound.',
      specs: [
        { label: 'Slots', value: '4' },
        { label: 'Algorithms', value: '35' },
        { label: 'Routings', value: '10' },
      ],
    },
    {
      id: 'output',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'Master volume to the balanced stereo outputs and the headphones.',
      specs: [
        { label: 'Main', value: '2 × 1/4-inch TRS balanced, max +18 dBu' },
        { label: 'Phones', value: '1/4-inch TRS, max +21 dBu' },
      ],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'voices', signal: 'cv', label: 'notes' },
    { id: 'c02', from: 'kbd', to: 'voices', signal: 'gate' },
    {
      id: 'c03',
      from: 'arp',
      to: 'voices',
      signal: 'cv',
      label: 'notes',
      when: { id: 'arp.on', eq: true },
    },
    { id: 'c04', from: 'kbd', to: 'arp', signal: 'cv', label: 'notes' },
    { id: 'c05', from: 'voices', to: 'portamento', signal: 'cv', label: 'pitch' },
    { id: 'c06', from: 'portamento', to: 'osc1', signal: 'cv', label: 'pitch' },
    { id: 'c07', from: 'portamento', to: 'osc2', signal: 'cv', label: 'pitch' },
    { id: 'c08', from: 'voices', to: 'env_vca', signal: 'gate' },
    { id: 'c09', from: 'voices', to: 'env_vcf', signal: 'gate' },
    { id: 'c10', from: 'voices', to: 'env_mod', signal: 'gate' },
    ...SOURCES.flatMap(([block, values, pmValues, pre]) => [
      {
        id: `${pre}o1`,
        from: block,
        to: 'osc1',
        signal: 'cv' as const,
        label: 'pitch',
        when: pick('osc1.pmSrc', pmValues),
        levels: PITCH('osc1.pitchMod'),
      },
      {
        id: `${pre}o2`,
        from: block,
        to: 'osc2',
        signal: 'cv' as const,
        label: 'pitch',
        when: pick('osc2.pmSrc', pmValues),
        levels: PITCH('osc2.pitchMod'),
      },
      {
        id: `${pre}pw`,
        from: block,
        to: 'osc1',
        signal: 'cv' as const,
        label: 'pulse width',
        when: pick('osc1.pwmSrc', values),
        levels: ['osc1.pwm'],
      },
      {
        id: `${pre}tm`,
        from: block,
        to: 'osc2',
        signal: 'cv' as const,
        label: 'tone mod',
        when: pick('osc2.tmSrc', values),
        levels: ['osc2.toneMod'],
      },
    ]),
    {
      id: 'c30',
      from: 'osc1',
      to: 'osc2',
      signal: 'audio',
      label: 'sync',
      when: { id: 'osc2.sync', eq: true },
    },
    {
      id: 'c40',
      from: 'osc1',
      to: 'mixer',
      signal: 'audio',
      when: {
        any: [
          { id: 'osc1.saw', eq: true },
          { id: 'osc1.pulse', eq: true },
        ],
      },
    },
    { id: 'c41', from: 'osc2', to: 'mixer', signal: 'audio', levels: ['osc2.level'] },
    { id: 'c42', from: 'noise', to: 'mixer', signal: 'audio', levels: ['noise.level'] },
    { id: 'c43', from: 'mixer', to: 'vcf', signal: 'audio' },
    {
      id: 'c44',
      from: 'env_vcf',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: ['vcf.env'],
    },
    {
      id: 'c45',
      from: 'lfo1',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'vcf.lfoSel', eq: 'lfo1' },
      levels: FILTER_LFO,
    },
    {
      id: 'c46',
      from: 'lfo2',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'vcf.lfoSel', eq: 'lfo2' },
      levels: FILTER_LFO,
    },
    {
      id: 'c47',
      from: 'portamento',
      to: 'vcf',
      signal: 'cv',
      label: 'key tracking',
      levels: ['vcf.kybd'],
    },
    { id: 'c50', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c51', from: 'env_vca', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c53', from: 'vca', to: 'hpf', signal: 'audio' },
    { id: 'c54', from: 'hpf', to: 'fx', signal: 'audio' },
    {
      id: 'c55',
      from: 'fx',
      to: 'output',
      signal: 'audio',
      levels: [{ id: 'out.volume', pow: 1.7 }],
    },
  ],
  jacks: {},
  omitted: {
    mod_matrix: 'The definition has no mod matrix.',
    ctrl_seq: 'The definition has no control sequencer.',
    c11: 'LFO 1 triggering the VCA envelope: the definition has no envelope trigger modes.',
    c12: 'The control sequencer triggering the VCA envelope: the definition has no control sequencer.',
    c26: 'Aftertouch to OSC 1 pitch: the definition has no aftertouch.',
    c27: 'Aftertouch to OSC 2 pitch: the definition has no aftertouch.',
    c28: 'Mod wheel to OSC 1 pitch: the definition has no MW pitch depth.',
    c29: 'Mod wheel to OSC 2 pitch: the definition has no MW pitch depth.',
    c48: 'Velocity to cutoff: the definition has no velocity sensitivity.',
    c49: 'Pitch bend to cutoff: the definition has no pitch bend.',
    c52: 'Velocity to the VCA: the definition has no velocity sensitivity.',
    c60: 'LFO 1 into the mod matrix: the definition has no mod matrix.',
    c61: 'LFO 2 into the mod matrix: the definition has no mod matrix.',
    c62: 'The VCA envelope into the mod matrix: the definition has no mod matrix.',
    c63: 'The VCF envelope into the mod matrix: the definition has no mod matrix.',
    c64: 'The MOD envelope into the mod matrix: the definition has no mod matrix.',
    c65: 'The control sequencer into the mod matrix: the definition has no mod matrix.',
    c66: 'Performance controllers into the mod matrix: the definition has no mod matrix.',
    c67: 'The voice number into the mod matrix: the definition has no mod matrix.',
    c68: 'The arpeggio clock into the control sequencer: the definition has no control sequencer.',
  },
};
