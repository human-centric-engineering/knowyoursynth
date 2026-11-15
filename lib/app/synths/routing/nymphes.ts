/**
 * Nymphes signal routing, projected from its spec (`.context/app/synth-data/nymphes/nymphes.synth.json`, 0.12.0):
 * block and edge ids are the spec's module and connection ids; levels and switches are the definition's
 * (`defs/nymphes.ts`). One voice's path is drawn, then the high-pass and reverb the six voices share.
 *
 * Where the definition says more than the spec, it decides. The mixer levels, the pitch depths and VOLUME are curved
 * as `toEngine()` curves them (`c07`–`c12`, `c20`); the spec's patch level (`out.amp_level`, MIDI only) is not a
 * control, so VOLUME scales the way out. The spec's assignable modulation has no connections, only a matrix; of it
 * the definition models LFO 2's depth on five parameters, each drawn as an edge with an id derived from its source
 * and target (`lfo2_pw`, `lfo2_cut`). The reverb is bypassed with MIX at zero rather than muted, so it is not a level
 * on `c19`.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';

const LFO_SPECS = [
  { label: 'Shapes', value: 'Triangle, saw down, saw up, square, random' },
  { label: 'Rate types', value: 'Low, high, key track, BPM' },
];

export const routing: SynthRouting = {
  synth: 'nymphes',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'MIDI and voice assigner',
      module: 'mode',
      symbol: 'midi',
      meter: 'gate',
      controls: ['voice.mode', 'voice.detune', 'voice.chord', 'glide.time', 'glide.legato'],
      description:
        'MIDI notes handed to the six voices in the play mode: one each in POLY, stacked six or four deep on one note in UNI A and UNI B, three notes of two in TRI, two of three in DUO, or one voice in MONO. Sets each voice’s pitch, with glide and the detune between stacked voices, and its gate.',
      specs: [
        { label: 'Voices', value: '6' },
        { label: 'Play modes', value: 'POLY, UNI A, UNI B, TRI, DUO, MONO' },
        { label: 'Input', value: 'MIDI over 3.5 mm TRS or USB; no keyboard' },
      ],
    },
    {
      id: 'osc',
      name: 'Oscillator',
      module: 'osc',
      meter: 'osc1',
      controls: ['osc.wave', 'osc.pw', 'lfo1.pitch', 'env1.pitch'],
      description:
        'An analogue oscillator whose WAVE morphs from sawtooth through square to triangle, with PW on the square part. LFO 1 and the filter envelope move its pitch.',
      specs: [{ label: 'Wave', value: 'Sawtooth → square → triangle, continuously' }],
    },
    {
      id: 'sub',
      name: 'Sub oscillator',
      module: 'osc',
      controls: ['osc.sub'],
      description: 'A square an octave below the oscillator, following it.',
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      controls: ['noise.level'],
      description: 'White noise.',
    },
    {
      id: 'mixer',
      name: 'Source mix',
      module: 'mixer',
      controls: ['osc.level', 'osc.sub', 'noise.level'],
      passes: true,
      description: 'LVL, SUB and NOISE into the filter.',
    },
    {
      id: 'lpf',
      name: 'Low-pass filter',
      module: 'filter',
      controls: ['vcf.cutoff', 'vcf.res', 'vcf.track', 'vcf.env', 'vcf.lfo'],
      description:
        'A 24 dB resonant low-pass in each voice, self-oscillating at full RES and tracking the keys note for note at full TRACK.',
      specs: [
        { label: 'Slope', value: '24 dB/octave' },
        { label: 'Cutoff', value: '32.7 Hz to 16.7 kHz' },
      ],
    },
    {
      id: 'env_f',
      name: 'Filter envelope',
      module: 'env',
      meter: 'env1',
      controls: ['env1.attack', 'env1.decay', 'env1.sustain', 'env1.release'],
      stages: {
        attack: 'env1.attack',
        decay: 'env1.decay',
        sustain: 'env1.sustain',
        release: 'env1.release',
      },
      description:
        'An ADSR that opens the cutoff by EG (filter) and raises the pitch by EG (pitch). Unipolar: it only ever adds.',
    },
    {
      id: 'env_a',
      name: 'Amp envelope',
      module: 'env',
      meter: 'env2',
      controls: ['env2.attack', 'env2.decay', 'env2.sustain', 'env2.release'],
      stages: {
        attack: 'env2.attack',
        decay: 'env2.decay',
        sustain: 'env2.sustain',
        release: 'env2.release',
      },
      description:
        'An ADSR on the VCA: each note’s loudness. Its sliders are the SHIFT row over the filter envelope’s.',
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      description: 'Each voice’s amplifier, under the amp envelope.',
    },
    {
      id: 'lfo1',
      name: 'LFO 1',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo1.rate', 'lfo1.wave', 'lfo1.delay', 'lfo1.fade', 'lfo1.type', 'lfo1.sync'],
      description:
        'An LFO in each voice, wired to the pitch and the cutoff only, by the two LFO sliders. DELAY holds it back after each note; KEY SYNC restarts it.',
      specs: LFO_SPECS,
    },
    {
      id: 'lfo2',
      name: 'LFO 2',
      module: 'lfo',
      meter: 'lfo2',
      controls: [
        'lfo2.rate',
        'lfo2.wave',
        'lfo2.delay',
        'lfo2.fade',
        'lfo2.type',
        'lfo2.sync',
        'lfo2.pw',
        'lfo2.level',
        'lfo2.noise',
        'lfo2.cutoff',
        'lfo2.res',
      ],
      description:
        'One LFO for all six voices, on its menu page. Each slider there sets how far it moves that slider’s parameter; here PW, LVL, NOISE, CUT and RES are modelled.',
      specs: LFO_SPECS,
    },
    {
      id: 'hpf',
      name: 'High-pass filter',
      module: 'filter',
      controls: ['hpf.cutoff'],
      passes: true,
      description:
        'A 6 dB high-pass on the six voices summed: with the low-pass, a band-pass. At the bottom it lets everything through.',
      specs: [{ label: 'Slope', value: '6 dB/octave, no resonance' }],
    },
    {
      id: 'reverb',
      name: 'Reverb',
      module: 'fx',
      controls: ['rev.size', 'rev.decay', 'rev.filter', 'rev.mix'],
      passes: true,
      description:
        'The only digital stage: a reverb with SIZE, DEC, a low-pass (FILT) and MIX, set on its menu page. At MIX zero it is bypassed.',
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'VOLUME to the mono line output and the headphones.',
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'osc', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'kbd', to: 'sub', signal: 'cv', label: 'pitch' },
    {
      id: 'c03',
      from: 'kbd',
      to: 'lpf',
      signal: 'cv',
      label: 'key tracking',
      levels: ['vcf.track'],
    },
    { id: 'c04', from: 'kbd', to: 'env_f', signal: 'gate' },
    { id: 'c05', from: 'kbd', to: 'env_a', signal: 'gate' },
    {
      id: 'c06',
      from: 'kbd',
      to: 'lfo1',
      signal: 'gate',
      label: 'key sync',
      when: { id: 'lfo1.sync', eq: 1 },
    },
    {
      id: 'c07',
      from: 'lfo1',
      to: 'osc',
      signal: 'cv',
      label: 'pitch',
      levels: [{ id: 'lfo1.pitch', pow: 2 }],
    },
    {
      id: 'c08',
      from: 'lfo1',
      to: 'sub',
      signal: 'cv',
      label: 'pitch',
      levels: [{ id: 'lfo1.pitch', pow: 2 }],
    },
    {
      id: 'c09',
      from: 'env_f',
      to: 'osc',
      signal: 'cv',
      label: 'pitch',
      levels: [{ id: 'env1.pitch', pow: 2 }],
    },
    {
      id: 'c10',
      from: 'osc',
      to: 'mixer',
      signal: 'audio',
      levels: [{ id: 'osc.level', pow: 1.7 }],
    },
    {
      id: 'c11',
      from: 'sub',
      to: 'mixer',
      signal: 'audio',
      levels: [{ id: 'osc.sub', pow: 1.7 }],
    },
    {
      id: 'c12',
      from: 'noise',
      to: 'mixer',
      signal: 'audio',
      levels: [{ id: 'noise.level', pow: 1.7 }],
    },
    { id: 'c13', from: 'mixer', to: 'lpf', signal: 'audio' },
    {
      id: 'c14',
      from: 'env_f',
      to: 'lpf',
      signal: 'cv',
      label: 'cutoff',
      levels: ['vcf.env'],
    },
    {
      id: 'c15',
      from: 'lfo1',
      to: 'lpf',
      signal: 'cv',
      label: 'cutoff',
      levels: ['vcf.lfo'],
    },
    { id: 'c16', from: 'lpf', to: 'vca', signal: 'audio' },
    { id: 'c17', from: 'env_a', to: 'vca', signal: 'cv', label: 'loudness' },
    { id: 'c18', from: 'vca', to: 'hpf', signal: 'audio', label: 'six voices' },
    { id: 'c19', from: 'hpf', to: 'reverb', signal: 'audio' },
    {
      id: 'c20',
      from: 'reverb',
      to: 'out',
      signal: 'audio',
      levels: [{ id: 'out.volume', pow: 1.7 }],
    },
    {
      id: 'lfo2_pw',
      from: 'lfo2',
      to: 'osc',
      signal: 'cv',
      label: 'pulse width',
      levels: ['lfo2.pw'],
    },
    {
      id: 'lfo2_lvl',
      from: 'lfo2',
      to: 'mixer',
      signal: 'cv',
      label: 'oscillator level',
      levels: ['lfo2.level'],
    },
    {
      id: 'lfo2_noise',
      from: 'lfo2',
      to: 'mixer',
      signal: 'cv',
      label: 'noise level',
      levels: ['lfo2.noise'],
    },
    {
      id: 'lfo2_cut',
      from: 'lfo2',
      to: 'lpf',
      signal: 'cv',
      label: 'cutoff',
      levels: ['lfo2.cutoff'],
    },
    {
      id: 'lfo2_res',
      from: 'lfo2',
      to: 'lpf',
      signal: 'cv',
      label: 'resonance',
      levels: ['lfo2.res'],
    },
  ],
  jacks: {},
  omitted: {},
};
