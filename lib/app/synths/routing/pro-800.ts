/**
 * PRO-800 signal routing, projected from its spec (`.context/app/synth-data/pro-800/pro-800.synth.json`, 0.7.0):
 * block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/pro-800.ts`). One voice's path is drawn, with the LFO, arpeggiator and voice assignment every voice shares.
 *
 * Where the definition says more than the spec, it decides. An oscillator reaches the mixer only with a waveform on
 * and its LEVEL up, and noise by NOISE, curved as `toEngine()` curves it (`c40`–`c42`). Poly-Mod's sources are
 * scaled by FIL ENV (either way from the middle) and OSC B (`c20`, `c21`), the filter envelope by ENVELOPE AMOUNT,
 * either way (`c44`). The LFO's depth is INITIAL AMOUNT plus the mod wheel, on every destination switched on
 * (`c30`–`c34`); the LFO TARGET menu stays at A and B. VOLUME scales the way out (`c50`).
 *
 * Where it says less, it decides too. Menu settings keep their defaults and are not modelled: the vibrato and its
 * connections, velocity to the filter and the VCA, and the clock's sources (the arpeggiator runs at 120 BPM, and
 * SYNC IN does nothing). The sequencer is printed only, so it is left out with its connections.
 */
import type { RoutingLevel, RoutingWhen, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

const LFO_DEPTH: RoutingLevel[] = [{ sum: ['lfo.amount', WHEEL] }];
const ARP_ON: RoutingWhen = {
  any: [
    { id: 'arp.updn', eq: true },
    { id: 'arp.assign', eq: true },
  ],
};
const OSC_SPECS = [
  { label: 'Chip', value: '3340' },
  { label: 'Frequency', value: '32.7 Hz to 8.37 kHz' },
  { label: 'Waveforms', value: 'Sawtooth, triangle, pulse, mixable' },
  { label: 'Pulse width', value: '1 to 99 %' },
];
const ENV_SPECS = [
  { label: 'Stages', value: 'Attack, decay, sustain, release' },
  { label: 'Stage time', value: 'Up to 37.4 s (fast curve), 175 s (slow), in the GliGli firmware' },
];
const waveOn = (osc: string): RoutingWhen => ({
  any: ['saw', 'tri', 'pulse'].map((w) => ({ id: `${osc}.${w}`, eq: true })),
});

export const routing: SynthRouting = {
  synth: 'pro-800',
  out: 'output',
  blocks: [
    {
      id: 'kbd',
      name: 'MIDI input',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      description:
        'Notes, pitch bend and the mod wheel arrive over MIDI (DIN or USB): there is no keyboard on this model. Here the app’s keyboard and MIDI play it.',
    },
    {
      id: 'voices',
      name: 'Voice assignment',
      module: 'util',
      controls: ['voice.unison'],
      passes: true,
      description:
        'Hands notes to the eight voices: polyphonic by default, all eight on one note with UNISON TRACK.',
      specs: [
        { label: 'Voices', value: '8' },
        { label: 'Programs', value: '400 (4 banks of 100)' },
      ],
    },
    {
      id: 'clock',
      name: 'Clock',
      module: 'util',
      description:
        'The tempo the arpeggiator runs at. Here a fixed 120 BPM; SYNC IN is drawn but not modelled.',
      specs: [{ label: 'Sync in', value: '3.5 mm TS, 1 PPS, 2, 24 or 48 PPQ' }],
    },
    {
      id: 'arp',
      name: 'Arpeggiator',
      module: 'util',
      controls: ['arp.updn', 'arp.assign'],
      description:
        'Plays the held notes one after another: ARP UP-DN by key position, ARP ASSIGN in the order played.',
    },
    {
      id: 'glide',
      name: 'Glide',
      module: 'glide',
      controls: ['glide.time'],
      description: 'Slides each voice’s pitch from note to note.',
    },
    {
      id: 'osc_a',
      name: 'Oscillator A',
      module: 'osc',
      meter: 'osc1',
      controls: ['osc1.freq', 'osc1.saw', 'osc1.tri', 'osc1.pulse', 'osc1.pw', 'osc1.sync'],
      description:
        'A 3340 oscillator with waveforms that can be combined. It hard-syncs to Oscillator B and is the Poly-Mod destination.',
      specs: OSC_SPECS,
    },
    {
      id: 'osc_b',
      name: 'Oscillator B',
      module: 'osc',
      meter: 'osc2',
      controls: ['osc2.freq', 'osc2.fine', 'osc2.saw', 'osc2.tri', 'osc2.pulse', 'osc2.pw'],
      description:
        'An oscillator like A, with FINE for detuning. A Poly-Mod source and the sync master for A.',
      specs: [...OSC_SPECS, { label: 'Fine', value: 'Up to a semitone' }],
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      description: 'Noise into every voice’s mixer.',
    },
    {
      id: 'mixer',
      name: 'Voice mixer',
      module: 'mixer',
      controls: ['osc1.level', 'osc2.level', 'noise.level'],
      passes: true,
      description:
        'Oscillator A, Oscillator B and noise into the filter. The oscillators are clean to about 5 and drive the filter above.',
    },
    {
      id: 'polymod',
      name: 'Poly-Mod',
      module: 'mod',
      controls: ['pmod.env', 'pmod.oscb', 'pmod.freqA', 'pmod.filter'],
      passes: true,
      description:
        'Sums the filter envelope (either way) and Oscillator B inside each voice and sends them to Oscillator A’s pitch, the filter or both.',
    },
    {
      id: 'vcf',
      name: 'Filter',
      module: 'filter',
      controls: ['vcf.cutoff', 'vcf.res', 'vcf.env', 'vcf.kbd'],
      description:
        'A resonant low-pass filter in each voice, with envelope amount either way and keyboard tracking off, half or full.',
      specs: [
        { label: 'Slope', value: '24 dB per octave (4 poles), low-pass' },
        { label: 'Keyboard tracking', value: 'Off, half, full' },
        { label: 'FILTER CV IN', value: '0 to 10 V' },
      ],
    },
    {
      id: 'env_filter',
      name: 'Filter envelope',
      module: 'env',
      meter: 'env1',
      controls: ['fenv.attack', 'fenv.decay', 'fenv.sustain', 'fenv.release'],
      description: 'An ADSR for the filter, and a Poly-Mod source. Generated in firmware.',
      specs: ENV_SPECS,
    },
    {
      id: 'env_amp',
      name: 'Amplifier envelope',
      module: 'env',
      meter: 'env2',
      controls: ['aenv.attack', 'aenv.decay', 'aenv.sustain', 'aenv.release'],
      description: 'An ADSR for the VCA. Generated in firmware.',
      specs: ENV_SPECS,
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      description: 'Shapes each voice with the amplifier envelope.',
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.rate', 'lfo.shape', 'lfo.amount', 'lfo.freq', 'lfo.pw', 'lfo.filter'],
      description:
        'One LFO for all voices. INITIAL AMOUNT sets its depth without the mod wheel; the switches send it to both oscillators’ pitch, their pulse width and the filter.',
      specs: [
        { label: 'Rate', value: '0.08 to 20 Hz' },
        {
          label: 'Shapes',
          value: 'Triangle or pulse on the panel; sine, saw, square, random and noise by menu',
        },
      ],
    },
    {
      id: 'output',
      name: 'Output',
      module: 'out',
      controls: ['out.volume', 'out.tune'],
      description: 'The voices summed, with master VOLUME and MASTER TUNE.',
      specs: [
        { label: 'Main', value: '1/4-inch TS, +5 dBu' },
        { label: 'Aux', value: '1/8-inch TS, +20 dBu' },
        { label: 'Phones', value: '1/8-inch TRS' },
      ],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'voices', signal: 'cv', label: 'notes' },
    { id: 'c02', from: 'kbd', to: 'voices', signal: 'gate' },
    { id: 'c03', from: 'kbd', to: 'arp', signal: 'cv', label: 'notes' },
    { id: 'c04', from: 'arp', to: 'voices', signal: 'cv', label: 'notes', when: ARP_ON },
    { id: 'c07', from: 'clock', to: 'arp', signal: 'gate', label: 'clock' },
    { id: 'c10', from: 'voices', to: 'glide', signal: 'cv', label: 'pitch' },
    { id: 'c11', from: 'glide', to: 'osc_a', signal: 'cv', label: 'pitch' },
    { id: 'c12', from: 'glide', to: 'osc_b', signal: 'cv', label: 'pitch' },
    { id: 'c13', from: 'voices', to: 'env_filter', signal: 'gate' },
    { id: 'c14', from: 'voices', to: 'env_amp', signal: 'gate' },
    {
      id: 'c15',
      from: 'osc_b',
      to: 'osc_a',
      signal: 'audio',
      label: 'sync',
      when: { id: 'osc1.sync', eq: true },
    },
    {
      id: 'c20',
      from: 'env_filter',
      to: 'polymod',
      signal: 'cv',
      levels: [{ id: 'pmod.env', off: 0 }],
    },
    { id: 'c21', from: 'osc_b', to: 'polymod', signal: 'audio', levels: ['pmod.oscb'] },
    {
      id: 'c22',
      from: 'polymod',
      to: 'osc_a',
      signal: 'audio',
      label: 'pitch',
      when: { id: 'pmod.freqA', eq: true },
    },
    {
      id: 'c23',
      from: 'polymod',
      to: 'vcf',
      signal: 'audio',
      label: 'cutoff',
      when: { id: 'pmod.filter', eq: true },
    },
    ...(['osc_a', 'osc_b'] as const).flatMap((to, i) => [
      {
        id: `c3${i}`,
        from: 'lfo',
        to,
        signal: 'cv' as const,
        label: 'pitch',
        when: { id: 'lfo.freq', eq: true },
        levels: LFO_DEPTH,
      },
      {
        id: `c3${i + 2}`,
        from: 'lfo',
        to,
        signal: 'cv' as const,
        label: 'pulse width',
        when: { id: 'lfo.pw', eq: true },
        levels: LFO_DEPTH,
      },
    ]),
    {
      id: 'c34',
      from: 'lfo',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'lfo.filter', eq: true },
      levels: LFO_DEPTH,
    },
    {
      id: 'c40',
      from: 'osc_a',
      to: 'mixer',
      signal: 'audio',
      when: waveOn('osc1'),
      levels: ['osc1.level'],
    },
    {
      id: 'c41',
      from: 'osc_b',
      to: 'mixer',
      signal: 'audio',
      when: waveOn('osc2'),
      levels: ['osc2.level'],
    },
    {
      id: 'c42',
      from: 'noise',
      to: 'mixer',
      signal: 'audio',
      levels: [{ id: 'noise.level', pow: 1.7 }],
    },
    { id: 'c43', from: 'mixer', to: 'vcf', signal: 'audio' },
    {
      id: 'c44',
      from: 'env_filter',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf.env', off: 0 }],
    },
    {
      id: 'c45',
      from: 'glide',
      to: 'vcf',
      signal: 'cv',
      label: 'keyboard tracking',
      when: { id: 'vcf.kbd', in: ['half', 'full'] },
    },
    { id: 'c47', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c48', from: 'env_amp', to: 'vca', signal: 'cv', label: 'loudness' },
    {
      id: 'c50',
      from: 'vca',
      to: 'output',
      signal: 'audio',
      levels: [{ id: 'out.volume', pow: 1.7 }],
    },
  ],
  jacks: {
    'j.sync_in': 'clock',
    'j.filter_cv': 'vcf',
    'j.phones': 'output',
    'j.audio_out': 'output',
  },
  omitted: {
    vibrato: 'A menu-only modulator the definition does not model.',
    seq: 'The sequencer is printed only: the definition does not model it.',
    c05: 'The notes into the sequencer: the definition does not model it.',
    c06: 'The sequencer into the voices: the definition does not model it.',
    c08: 'The clock into the sequencer: the definition does not model it.',
    c35: 'Vibrato to Oscillator A: the definition does not model the vibrato.',
    c36: 'Vibrato to Oscillator B: the definition does not model the vibrato.',
    c46: 'Velocity to the filter: a menu amount the definition does not model.',
    c49: 'Velocity to the VCA: a menu amount the definition does not model.',
  },
};
