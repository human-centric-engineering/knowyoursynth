/**
 * Jupiter-4 signal routing, projected from its spec (`.context/app/synth-data/jupiter-4/jupiter-4.synth.json`,
 * 0.10.0): block and edge ids are the spec's module and connection ids; switches, levels and jacks are the
 * definition's (`defs/jupiter-4.ts`). One voice's path is drawn, with the LFO, trigger, sample-and-hold, lever and
 * ensemble every voice shares.
 *
 * Where the definition says more than the spec, it decides. The arpeggio runs only with an ARPEGGIO mode picked and
 * the trigger on INT, and the sample-and-hold reaches the cutoff only on INT, by VCF MOD (`c04`, `c06`, `c09`). The
 * LFO's own sends are scaled as `toEngine()` scales them: vibrato by VCO MOD squared, the cutoff by LFO MOD, the pulse
 * width by PW with the switch on MOD (`c10`, `c17`, `c11`). The lever is the app's mod wheel, so each of its sends
 * (`c21`–`c26`) carries the wheel times BEND SENS or LFO MOD. LEVEL scales the voice out of the VCA and VOLUME the way
 * out, curved as `toEngine()` curves them (`c27`–`c29`).
 *
 * Where it says less, it decides too. It has no jacks, so EXT CLOCK IN cannot clock the arpeggio or the
 * sample-and-hold (`c05`, `c07`, left out; with EXT picked the engine runs neither), and it keeps no patch memory.
 */
import type { RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

const BEND: RoutingLevel[] = ['bend.sens', WHEEL];
const LEVER_LFO: RoutingLevel[] = ['bend.lfoMod', WHEEL];
const VOLUME: RoutingLevel[] = [{ id: 'out.volume', pow: 1.7 }];
const ENV_SPECS = [
  { label: 'Attack', value: '0.6 ms to 3 s' },
  { label: 'Decay', value: '14 ms to 10 s' },
  { label: 'Sustain', value: '0 to 100 %' },
  { label: 'Release', value: '14 ms to 10 s' },
];

export const routing: SynthRouting = {
  synth: 'jupiter-4',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Keyboard, assigner and arpeggio',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      controls: [
        'kbd.assign',
        'kbd.arpMode',
        'kbd.hold',
        'kbd.portamento',
        'kbd.portaOn',
        'kbd.transpose',
        'kbd.tuning',
      ],
      description:
        'The keys hand notes to the four voices in one of four assign modes, or to the arpeggio. Portamento, transpose and the master tuning act here.',
      specs: [
        { label: 'Keys', value: '49, C to C' },
        { label: 'Voices', value: '4' },
        { label: 'Arpeggio', value: 'Up, down, up and down, random' },
        { label: 'Portamento', value: 'Up to 1 s per octave' },
        { label: 'Tuning', value: '±50 cents (A = 442 Hz at centre)' },
      ],
    },
    {
      id: 'trig',
      name: 'Trigger generator',
      module: 'util',
      controls: ['trig.rate', 'trig.arpClock', 'trig.vcfClock'],
      description:
        'An internal clock for the arpeggio and the filter sample-and-hold, each switched between it and an external clock.',
      specs: [{ label: 'Rate', value: 'Up to 25 Hz' }],
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.rate', 'lfo.waveform', 'lfo.delay', 'lfo.bend', 'lfo.bendWide'],
      description:
        'One LFO for all four voices, reaching audio rate. DELAY TIME fades it in on each new key, and LFO BEND offsets its rate live.',
      specs: [
        { label: 'Rate', value: '0.1 to 80 Hz' },
        { label: 'Waveforms', value: 'Sine (triangle), square, sawtooth, reverse sawtooth' },
        { label: 'Delay', value: '0 to 10 s' },
      ],
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      controls: ['noise.on'],
      description:
        'Noise for the voices, switched on by NOISE, and for the filter sample-and-hold.',
    },
    {
      id: 'snh',
      name: 'VCF sample and hold',
      module: 'mod',
      controls: ['trig.vcfMod'],
      passes: true,
      description:
        'Samples the noise at the trigger rate to step the cutoff at random, by VCF MOD.',
    },
    {
      id: 'vco',
      name: 'VCO',
      module: 'osc',
      meter: 'osc1',
      controls: ['vco.range', 'vco.waveform', 'vco.pw', 'vco.pwMode', 'vco.lfoMod', 'vco.sub'],
      description:
        'One oscillator per voice, with a sub-oscillator a square one octave down. The pulse width is set to one of four widths or swept by the LFO.',
      specs: [
        { label: 'Ranges', value: "16', 8', 4'" },
        { label: 'Waveforms', value: 'Sawtooth, square, pulse' },
        { label: 'Pulse widths', value: '50, 40, 20, 10 %' },
        { label: 'Sub-oscillator', value: '1 octave down' },
      ],
    },
    {
      id: 'mix',
      name: 'Voice source mix',
      module: 'mixer',
      passes: true,
      description: 'The VCO waveform, the sub-oscillator and noise, as switched on.',
    },
    {
      id: 'hpf',
      name: 'High-pass filter',
      module: 'filter',
      controls: ['hpf.cutoff'],
      description: 'A high-pass filter ahead of the low-pass. At minimum it passes everything.',
      specs: [{ label: 'Cutoff', value: '40 Hz to 5 kHz' }],
    },
    {
      id: 'vcf',
      name: 'Low-pass filter',
      module: 'filter',
      controls: ['vcf.cutoff', 'vcf.res', 'vcf.kybd', 'vcf.lfoMod', 'vcf.envMod'],
      description:
        'A resonant low-pass filter with keyboard follow, swept by the LFO, its envelope, the sample-and-hold and the lever.',
      specs: [
        { label: 'Resonance', value: '0 to self-oscillation' },
        { label: 'Keyboard follow', value: '10, 40, 70, 100 %' },
      ],
    },
    {
      id: 'env_f',
      name: 'VCF envelope',
      module: 'env',
      meter: 'env1',
      controls: ['env_f.attack', 'env_f.decay', 'env_f.sustain', 'env_f.release', 'vcf.polarity'],
      stages: {
        attack: 'env_f.attack',
        decay: 'env_f.decay',
        sustain: 'env_f.sustain',
        release: 'env_f.release',
      },
      description: 'An ADSR for the cutoff, with a switch to turn it upside down.',
      specs: ENV_SPECS,
    },
    {
      id: 'env_a',
      name: 'VCA envelope',
      module: 'env',
      meter: 'env2',
      controls: ['env_a.attack', 'env_a.decay', 'env_a.sustain', 'env_a.release'],
      stages: {
        attack: 'env_a.attack',
        decay: 'env_a.decay',
        sustain: 'env_a.sustain',
        release: 'env_a.release',
      },
      description: 'An ADSR for the amplifier.',
      specs: ENV_SPECS,
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      controls: ['vca.level'],
      description: 'Shapes each voice with its envelope; LEVEL sets how loud the voice leaves.',
    },
    {
      id: 'bend',
      name: 'Bend / modulation lever',
      module: 'mod',
      controls: ['bend.sens', 'bend.lfoMod', 'bend.vco', 'bend.vcf', 'bend.vca'],
      description:
        'For each of VCO, VCF and VCA a switch picks BEND, OFF or LFO: BEND moves it by BEND SENS, LFO lets the lever bring the LFO in up to LFO MOD. The app’s mod wheel stands in for the lever.',
      specs: [
        { label: 'VCO', value: 'Up to +1 octave' },
        { label: 'VCF', value: 'Up to +2 octaves' },
        { label: 'VCA', value: 'Up to +12 dB' },
      ],
    },
    {
      id: 'ens',
      name: 'Ensemble',
      module: 'fx',
      controls: ['ens.on'],
      description:
        'A stereo chorus on the summed voices. Switched off, the sound passes straight through.',
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'Master VOLUME to the mono and stereo outputs and the headphones.',
      specs: [
        { label: 'Outputs', value: 'Mono, stereo, headphones' },
        { label: 'Output level', value: 'L, M, H' },
      ],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'vco', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'kbd', to: 'env_f', signal: 'gate' },
    { id: 'c03', from: 'kbd', to: 'env_a', signal: 'gate' },
    {
      id: 'c04',
      from: 'trig',
      to: 'kbd',
      signal: 'gate',
      label: 'arpeggio clock',
      when: {
        all: [
          { id: 'trig.arpClock', eq: 'int' },
          { id: 'kbd.arpMode', in: ['up', 'down', 'updown', 'random'] },
        ],
      },
    },
    {
      id: 'c06',
      from: 'trig',
      to: 'snh',
      signal: 'gate',
      label: 'clock',
      when: { id: 'trig.vcfClock', eq: 'int' },
    },
    { id: 'c08', from: 'noise', to: 'snh', signal: 'cv' },
    {
      id: 'c09',
      from: 'snh',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'trig.vcfClock', eq: 'int' },
      levels: ['trig.vcfMod'],
    },
    {
      id: 'c10',
      from: 'lfo',
      to: 'vco',
      signal: 'cv',
      label: 'pitch',
      levels: [{ id: 'vco.lfoMod', pow: 2 }],
    },
    {
      id: 'c11',
      from: 'lfo',
      to: 'vco',
      signal: 'cv',
      label: 'pulse width',
      when: { id: 'vco.pwMode', eq: 'mod' },
      levels: ['vco.pw'],
    },
    {
      id: 'c12',
      from: 'vco',
      to: 'mix',
      signal: 'audio',
      when: { id: 'vco.waveform', in: ['saw', 'square', 'pulse'] },
    },
    {
      id: 'c13',
      from: 'vco',
      to: 'mix',
      signal: 'audio',
      label: 'sub',
      when: { id: 'vco.sub', eq: true },
    },
    {
      id: 'c14',
      from: 'noise',
      to: 'mix',
      signal: 'audio',
      when: { id: 'noise.on', eq: true },
    },
    { id: 'c15', from: 'mix', to: 'hpf', signal: 'audio' },
    { id: 'c16', from: 'hpf', to: 'vcf', signal: 'audio' },
    { id: 'c17', from: 'lfo', to: 'vcf', signal: 'cv', label: 'cutoff', levels: ['vcf.lfoMod'] },
    { id: 'c18', from: 'env_f', to: 'vcf', signal: 'cv', label: 'cutoff', levels: ['vcf.envMod'] },
    { id: 'c19', from: 'vcf', to: 'vca', signal: 'audio' },
    { id: 'c20', from: 'env_a', to: 'vca', signal: 'cv', label: 'loudness' },
    {
      id: 'c21',
      from: 'bend',
      to: 'vco',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'bend.vco', eq: 'bend' },
      levels: BEND,
    },
    {
      id: 'c22',
      from: 'lfo',
      to: 'vco',
      signal: 'cv',
      label: 'pitch, by the lever',
      when: { id: 'bend.vco', eq: 'lfo' },
      levels: [{ id: 'bend.lfoMod', pow: 2 }, WHEEL],
    },
    {
      id: 'c23',
      from: 'bend',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      when: { id: 'bend.vcf', eq: 'bend' },
      levels: BEND,
    },
    {
      id: 'c24',
      from: 'lfo',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff, by the lever',
      when: { id: 'bend.vcf', eq: 'lfo' },
      levels: LEVER_LFO,
    },
    {
      id: 'c25',
      from: 'bend',
      to: 'vca',
      signal: 'cv',
      label: 'loudness',
      when: { id: 'bend.vca', eq: 'bend' },
      levels: BEND,
    },
    {
      id: 'c26',
      from: 'lfo',
      to: 'vca',
      signal: 'cv',
      label: 'loudness, by the lever',
      when: { id: 'bend.vca', eq: 'lfo' },
      levels: LEVER_LFO,
    },
    {
      id: 'c27',
      from: 'vca',
      to: 'ens',
      signal: 'audio',
      levels: [{ id: 'vca.level', pow: 1.4 }],
    },
    { id: 'c28', from: 'ens', to: 'out', signal: 'audio', label: 'A', levels: VOLUME },
    { id: 'c29', from: 'ens', to: 'out', signal: 'audio', label: 'B', levels: VOLUME },
  ],
  jacks: {},
  omitted: {
    memory: 'The definition keeps no patch memory: patches are kept in the library.',
    c05: 'The external clock into the arpeggio: the definition has no EXT CLOCK IN jack, and stops the arpeggio on EXT.',
    c07: 'The external clock into the sample-and-hold: the definition has no EXT CLOCK IN jack, and stops it on EXT.',
  },
};
