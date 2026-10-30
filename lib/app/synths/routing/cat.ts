/**
 * CAT signal routing, projected from its spec (`.context/app/synth-data/cat/cat.synth.json`, 0.7.0): block and edge
 * ids are the spec's module and connection ids; switches, levels and jacks are the definition's (`defs/cat.ts`).
 *
 * Where the definition says more than the spec, it decides. GATE IN takes the place of the notes' gate in
 * `toEngine()`, so it breaks `c10`, which the spec draws fixed. Each VCO reaches the filter at the sum of its waveform
 * sliders, as `toEngine()` mixes them, so VCO 2 (every slider at 0 by default) goes dark until one is raised, unless
 * it is syncing VCO 1. The VCO modulation depths are squared, the filter's linear, as `toEngine()` reads them; the
 * filter's envelope group runs through its envelope amount, VCO 1 through a route, both at MOD DEPTH. PULSE WIDTH is
 * the depth of the sine or the ADSR on VCO 1's pulse width, and a fixed width at DC (no edge). VOLUME scales the way
 * out (`c56`), curved as `toEngine()` curves it. Glide and pitch bend shape the pitch but never stop it, so `c01`–`c03`
 * are fixed.
 */
import type { RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';

const VCO1_MIX: RoutingLevel[] = [
  {
    sum: [
      { id: 'vco1.sub', pow: 1.5 },
      { id: 'vco1.saw', pow: 1.5 },
      { id: 'vco1.tri', pow: 1.5 },
      { id: 'vco1.pulse', pow: 1.5 },
    ],
  },
];
const VCO2_MIX: RoutingLevel[] = [
  {
    sum: [
      { id: 'vco2.sub', pow: 1.5 },
      { id: 'vco2.square', pow: 1.5 },
      { id: 'vco2.saw', pow: 1.5 },
    ],
  },
];
const CHIP = { label: 'Chip', value: 'CEM3340 type (CoolAudio V3340)' };

export const routing: SynthRouting = {
  synth: 'cat',
  out: 'output',
  blocks: [
    {
      id: 'kbd',
      name: 'MIDI and keyboard assignment',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      description:
        'Turns MIDI notes into a lowest-note and a highest-note pitch for duophonic playing, a gate and pitch bend. There is no keyboard on this model.',
    },
    {
      id: 'pitch',
      name: 'Pitch, glide and bend',
      module: 'glide',
      controls: ['pitch.glide', 'pitch.octave', 'pitch.bend', 'pitch.kbdCtrl'],
      description:
        'Applies glide, octave shift and pitch bend to both notes. KEYBOARD CONTROL picks which note VCO 1 follows, or none; VCO 2 always plays the lowest.',
      specs: [{ label: 'KB CV out', value: '0 to 8 V' }],
    },
    {
      id: 'gate_bus',
      name: 'Gate and ADSR repeat',
      module: 'util',
      controls: ['trig.repeat'],
      passes: true,
      description:
        'Gives the gate to both envelopes. ADSR REPEAT on GATED fires them again at the LFO rate while a key is held, on AUTO all the time.',
      specs: [
        { label: 'Gate in threshold', value: '2.1 V' },
        { label: 'Gate out', value: '0 to 12 V' },
      ],
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.rate', 'lfo.delay'],
      description:
        'A sine and a square at once. The sine fades in after each key by LFO DELAY; the square clocks the sample and hold and the ADSR repeat.',
      specs: [
        { label: 'Rate', value: '0.03 to 30 Hz' },
        { label: 'Shapes', value: 'Sine, square' },
        { label: 'Delay', value: '0 to 5 s' },
      ],
    },
    {
      id: 'sample_hold',
      name: 'Sample and hold',
      module: 'mod',
      controls: ['sh.src'],
      description:
        'Samples VCO 1 or the noise at the LFO rate; its stepped output is one of the modulation choices.',
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      controls: ['noise.level'],
      description:
        'White noise, mixed into the filter by NOISE LEVEL and offered to the sample and hold.',
      specs: [{ label: 'Colour', value: 'White' }],
    },
    {
      id: 'vco1',
      name: 'VCO 1',
      module: 'osc',
      meter: 'osc1',
      controls: [
        'vco1.coarse',
        'vco1.fine',
        'vco1.sub',
        'vco1.saw',
        'vco1.tri',
        'vco1.pulse',
        'vco1.pw',
        'vco1.pwmSrc',
        'vco1.sync',
        'vco1.mod1Src',
        'vco1.mod1Depth',
        'vco1.mod2Src',
        'vco1.mod2Depth',
      ],
      description:
        'Four waveforms at once, each on its own level slider, with coarse and fine tuning, two modulation groups and switched pulse width modulation.',
      specs: [
        { label: 'Waveforms', value: 'Sub-octave square, sawtooth, triangle, pulse' },
        { label: 'Frequency', value: '1 Hz to 38.5 kHz in 6 overlapping ranges' },
        CHIP,
      ],
    },
    {
      id: 'vco2',
      name: 'VCO 2',
      module: 'osc',
      meter: 'osc2',
      controls: [
        'vco2.fine',
        'vco2.sub',
        'vco2.square',
        'vco2.saw',
        'vco2.mod1Src',
        'vco2.mod1Depth',
        'vco2.mod2Src',
        'vco2.mod2Depth',
      ],
      description:
        'Three waveforms at once on level sliders, fine tuning only, always on the lowest note held, and the sync master for VCO 1.',
      specs: [
        { label: 'Waveforms', value: 'Sub-octave square, square, sawtooth' },
        { label: 'Tuning range', value: '2.5 octaves' },
        CHIP,
      ],
    },
    {
      id: 'vcf',
      name: 'VCF',
      module: 'filter',
      controls: [
        'vcf.vco1Audio',
        'vcf.fc',
        'vcf.q',
        'vcf.kbd',
        'vcf.mod1Src',
        'vcf.mod1Depth',
        'vcf.mod2Src',
        'vcf.mod2Depth',
      ],
      description:
        'A 4-pole low-pass that self-oscillates at full Q, fed by VCO 1 (switchable), VCO 2, the noise and EXT AUDIO, with keyboard tracking and two modulation groups.',
      specs: [
        { label: 'Slope', value: '24 dB per octave (4 poles)' },
        { label: 'Chip', value: 'V2044 (CoolAudio SSM2044 clone)' },
        { label: 'Keyboard tracking', value: '0 to 1 V per octave' },
      ],
    },
    {
      id: 'adsr',
      name: 'ADSR',
      module: 'env',
      meter: 'env1',
      controls: ['adsr.attack', 'adsr.decay', 'adsr.sustain', 'adsr.release'],
      description:
        'Attack, decay, sustain, release: a modulation choice everywhere and a VCA source.',
      specs: [
        { label: 'Output', value: '0 to 8.8 V' },
        { label: 'Attack', value: '3 ms to 6 s' },
        { label: 'Decay', value: '2 ms to 7 s' },
        { label: 'Release', value: '2 ms to 7 s' },
      ],
    },
    {
      id: 'ar',
      name: 'AR',
      module: 'env',
      meter: 'env2',
      controls: ['ar.attack', 'ar.release'],
      description:
        'Attack and release only, holding full level while the key is down: a modulation choice everywhere and a VCA source.',
      specs: [
        { label: 'Output', value: '0 to 6.5 V' },
        { label: 'Attack', value: '3 ms to 7 s' },
        { label: 'Release', value: '2 ms to 7 s' },
      ],
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      controls: ['vca.mode'],
      description:
        'Shapes the loudness from the ADSR or the AR, or is bypassed for a level that never stops.',
      specs: [{ label: 'Chip', value: 'V13700 OTA' }],
    },
    {
      id: 'output',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description:
        'VOLUME, the 3.5 mm main out and phones on top, and high and low level 1/4-inch outputs on the rear.',
      specs: [
        { label: 'Main out', value: '3.5 mm, up to +9.4 dBu' },
        { label: 'High out', value: '1/4-inch TS, up to +10 dBu' },
        { label: 'Low out', value: '1/4-inch TS, 30 dB below high' },
      ],
    },
  ],
  edges: [
    { id: 'c01', from: 'kbd', to: 'pitch', signal: 'cv', label: 'low note' },
    { id: 'c02', from: 'kbd', to: 'pitch', signal: 'cv', label: 'high note' },
    { id: 'c03', from: 'kbd', to: 'pitch', signal: 'cv', label: 'pitch bend' },
    {
      id: 'c04',
      from: 'pitch',
      to: 'vco1',
      signal: 'cv',
      label: 'high note',
      when: { id: 'pitch.kbdCtrl', eq: 'poly' },
    },
    {
      id: 'c05',
      from: 'pitch',
      to: 'vco1',
      signal: 'cv',
      label: 'low note',
      when: { id: 'pitch.kbdCtrl', eq: 'mono' },
    },
    { id: 'c06', from: 'pitch', to: 'vco2', signal: 'cv', label: 'low note' },
    {
      id: 'c07',
      from: 'pitch',
      to: 'vcf',
      signal: 'cv',
      label: 'keyboard tracking',
      levels: ['vcf.kbd'],
    },
    {
      id: 'c08',
      from: 'vco2',
      to: 'vco1',
      signal: 'audio',
      label: 'sync',
      when: { id: 'vco1.sync', in: ['mode_a', 'mode_b'] },
    },
    { id: 'c10', from: 'kbd', to: 'gate_bus', signal: 'gate', breaks: 'j.gateIn' },
    {
      id: 'c11',
      from: 'lfo',
      to: 'gate_bus',
      signal: 'gate',
      label: 'repeat',
      when: { id: 'trig.repeat', in: ['gated', 'auto'] },
    },
    { id: 'c12', from: 'gate_bus', to: 'adsr', signal: 'gate' },
    { id: 'c13', from: 'gate_bus', to: 'ar', signal: 'gate' },
    { id: 'c14', from: 'lfo', to: 'sample_hold', signal: 'gate', label: 'clock' },
    {
      id: 'c15',
      from: 'vco1',
      to: 'sample_hold',
      signal: 'cv',
      label: 'sampled',
      when: { id: 'sh.src', eq: 'vco1' },
    },
    {
      id: 'c16',
      from: 'noise',
      to: 'sample_hold',
      signal: 'cv',
      label: 'sampled',
      when: { id: 'sh.src', eq: 'noise' },
    },
    ...(
      [
        ['c20', 'lfo', 'vco1', 'vco1.mod1', 'sine'],
        ['c21', 'lfo', 'vco1', 'vco1.mod1', 'square'],
        ['c22', 'sample_hold', 'vco1', 'vco1.mod1', 'sh'],
        ['c23', 'adsr', 'vco1', 'vco1.mod2', 'adsr'],
        ['c24', 'ar', 'vco1', 'vco1.mod2', 'ar'],
        ['c25', 'vco2', 'vco1', 'vco1.mod2', 'vco2'],
        ['c26', 'lfo', 'vco2', 'vco2.mod1', 'sine'],
        ['c27', 'lfo', 'vco2', 'vco2.mod1', 'square'],
        ['c28', 'sample_hold', 'vco2', 'vco2.mod1', 'sh'],
        ['c29', 'adsr', 'vco2', 'vco2.mod2', 'adsr'],
        ['c30', 'ar', 'vco2', 'vco2.mod2', 'ar'],
        ['c31', 'vco1', 'vco2', 'vco2.mod2', 'vco1'],
      ] as const
    ).map(([id, from, to, group, src]) => ({
      id,
      from,
      to,
      signal: 'cv' as const,
      label: 'pitch',
      when: { id: `${group}Src`, eq: src },
      levels: [{ id: `${group}Depth`, pow: 2 }],
    })),
    ...(
      [
        ['c32', 'lfo', 'vcf.mod1', 'sine'],
        ['c33', 'lfo', 'vcf.mod1', 'square'],
        ['c34', 'sample_hold', 'vcf.mod1', 'sh'],
        ['c35', 'adsr', 'vcf.mod2', 'adsr'],
        ['c36', 'ar', 'vcf.mod2', 'ar'],
        ['c37', 'vco1', 'vcf.mod2', 'vco1'],
      ] as const
    ).map(([id, from, group, src]) => ({
      id,
      from,
      to: 'vcf',
      signal: 'cv' as const,
      label: 'cutoff',
      when: { id: `${group}Src`, eq: src },
      levels: [`${group}Depth`],
    })),
    {
      id: 'c40',
      from: 'lfo',
      to: 'vco1',
      signal: 'cv',
      label: 'pulse width',
      when: { id: 'vco1.pwmSrc', eq: 'sine' },
      levels: ['vco1.pw'],
    },
    {
      id: 'c41',
      from: 'adsr',
      to: 'vco1',
      signal: 'cv',
      label: 'pulse width',
      when: { id: 'vco1.pwmSrc', eq: 'adsr' },
      levels: ['vco1.pw'],
    },
    {
      id: 'c50',
      from: 'vco1',
      to: 'vcf',
      signal: 'audio',
      when: { id: 'vcf.vco1Audio', eq: true },
      levels: VCO1_MIX,
    },
    { id: 'c51', from: 'vco2', to: 'vcf', signal: 'audio', levels: VCO2_MIX },
    {
      id: 'c52',
      from: 'noise',
      to: 'vcf',
      signal: 'audio',
      levels: [{ id: 'noise.level', pow: 1.7 }],
    },
    { id: 'c53', from: 'vcf', to: 'vca', signal: 'audio' },
    {
      id: 'c54',
      from: 'adsr',
      to: 'vca',
      signal: 'cv',
      label: 'loudness',
      when: { id: 'vca.mode', eq: 'adsr' },
    },
    {
      id: 'c55',
      from: 'ar',
      to: 'vca',
      signal: 'cv',
      label: 'loudness',
      when: { id: 'vca.mode', eq: 'ar' },
    },
    {
      id: 'c56',
      from: 'vca',
      to: 'output',
      signal: 'audio',
      levels: [{ id: 'out.volume', pow: 1.7 }],
    },
  ],
  jacks: {
    'j.vco1Cv': 'pitch',
    'j.vco2Cv': 'pitch',
    'j.kbCv': 'pitch',
    'j.gateIn': 'gate_bus',
    'j.gateOut': 'gate_bus',
    'j.adsrOut': 'adsr',
    'j.arOut': 'ar',
    'j.vcfFc': 'vcf',
    'j.vcfQ': 'vcf',
    'j.extAudio': 'vcf',
    'j.vcaCv': 'vca',
    'j.phones': 'output',
    'j.mainOut': 'output',
  },
};
