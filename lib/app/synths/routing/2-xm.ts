/**
 * 2-XM signal routing, projected from its spec (`.context/app/synth-data/2-xm/2-xm.synth.json`, 0.7.0): block and
 * edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/2-xm.ts`). The two modules are the same, so one builder draws both, as the definition does.
 *
 * Where the definition says more than the spec, it decides. VCO 1 CV replaces the module's MIDI pitch for both VCOs in
 * `toEngine()`, so it breaks the pitch feed (`c01`), and VCO 2 CV replaces it for VCO 2 alone, so it breaks `c03`;
 * the spec draws both fixed. VCF CV is heard only with the filter's source switch at EXT, so the velocity-scaled ENV 2
 * it replaces (`c34`) is switched there too. The bipolar knobs (each VCO's MODULATION, the three crossfades into the
 * filter) are one-sided in `toEngine()` (left of centre one way, right the other), which a level cannot say: both
 * edges of a pair carry the knob's distance from centre, so both light when it is off centre either way. MODULATION
 * into pitch is squared and the filter's MODULATION curved, as `toEngine()` reads them. Each module's LEVEL scales its
 * way out, curved as `toEngine()` curves it, so XM2 (LEVEL 0 by default) is dark until it is raised. The meters follow
 * the engine's first voice, XM1, so only XM1's blocks carry one.
 */
import type { RoutingBlock, RoutingEdge, SynthRouting } from '@/lib/app/synths/contract';

const VCO_SPECS = [
  { label: 'Waveforms', value: 'Sawtooth and pulse, crossfaded' },
  { label: 'Coarse range', value: '5 octaves' },
  { label: 'Pulse width', value: '10 to 90%' },
];
const ENV_SPECS = [
  { label: 'Attack', value: '3 ms to 6 s' },
  { label: 'Decay', value: '14 ms to 18 s' },
  { label: 'Release', value: '10 ms to 15 s, set by DECAY' },
];

/** One module's blocks, edges and jacks: `k` = 1 for XM1, 2 for XM2. */
function xm(k: 1 | 2): {
  blocks: RoutingBlock[];
  edges: RoutingEdge[];
  jacks: Record<string, string>;
} {
  const m = `xm${k}`;
  const M = `XM${k}`;
  const b = (s: string): string => `${m}_${s}`;
  const c = (n: string): string => `${m}_c${n}`;
  const lead = k === 1;
  const vco = (n: 1 | 2): RoutingBlock => ({
    id: b(`vco${n}`),
    name: `${M} VCO ${n}`,
    module: 'osc',
    ...(lead ? { meter: n === 1 ? ('osc1' as const) : ('osc2' as const) } : {}),
    controls: [
      b(`vco${n}.coarse`),
      b(`vco${n}.fine`),
      b(`vco${n}.pulse_width`),
      b(`vco${n}.modulation`),
      b(`vco${n}.mod_source`),
      ...(n === 2 ? [b('vco2.sync')] : []),
    ],
    description:
      n === 1
        ? 'Sawtooth and pulse, both always running, crossfaded into the filter. One MODULATION knob: left of centre it moves the pitch, right of centre the pulse width.'
        : 'Sawtooth and pulse, both always running, crossfaded into the filter. One MODULATION knob: left of centre it moves the pitch, right of centre the pulse width. Syncs to VCO 1.',
    specs: VCO_SPECS,
  });
  const env = (n: 1 | 2): RoutingBlock => ({
    id: b(`env${n}`),
    name: n === 1 ? `${M} ENV 1 (VCA)` : `${M} ENV 2`,
    module: 'env',
    // Only the lead module's contours follow the voice's envelopes, so only theirs light.
    ...(lead
      ? {
          meter: n === 1 ? ('env1' as const) : ('env2' as const),
          stages: {
            attack: b(`env${n}.attack`),
            decay: b(`env${n}.decay`),
            sustain: b(`env${n}.sustain`),
            release: b(`env${n}.decay`),
          },
        }
      : {}),
    controls: [b(`env${n}.attack`), b(`env${n}.decay`), b(`env${n}.sustain`)],
    description:
      n === 1
        ? 'Attack, decay, sustain for the VCA and VCO 1’s modulation. DECAY also sets the release.'
        : 'Attack, decay, sustain for the filter and VCO 2’s modulation. DECAY also sets the release.',
    specs: ENV_SPECS,
  });
  /** A modulation source into a VCO, through the FM (left) or PWM (right) side of its MODULATION knob. */
  const vcoMod = (
    id: string,
    from: string,
    n: 1 | 2,
    src: string,
    side: 'pitch' | 'pulse width'
  ): RoutingEdge => ({
    id: c(id),
    from: b(from),
    to: b(`vco${n}`),
    signal: 'cv',
    label: side,
    when: { id: b(`vco${n}.mod_source`), eq: src },
    levels: [
      side === 'pitch'
        ? { id: b(`vco${n}.modulation`), off: 0, pow: 2 }
        : { id: b(`vco${n}.modulation`), off: 0 },
    ],
  });
  const FILTER_MOD = [{ id: b('vcf.modulation'), off: 0, pow: 1.5 }];

  return {
    blocks: [
      {
        id: b('pitch'),
        name: `${M} pitch`,
        module: 'glide',
        controls: [b('pitch.portamento')],
        description:
          'Takes the module’s MIDI pitch through portamento to both VCOs. VCO 1 CV replaces it for both, VCO 2 CV for VCO 2 alone.',
      },
      {
        id: b('gate'),
        name: `${M} envelope gate`,
        module: 'util',
        passes: true,
        description: 'Fires both envelopes: the MIDI gate, or ENV GATE when it is patched.',
      },
      vco(1),
      vco(2),
      {
        id: b('lfo'),
        name: `${M} LFO`,
        module: 'lfo',
        ...(lead ? { meter: 'lfo' as const } : {}),
        controls: [b('lfo.rate')],
        description: 'One rate control, restarted by LFO TRIG.',
        specs: [{ label: 'Rate', value: '0.1 to 55 Hz' }],
      },
      env(1),
      env(2),
      {
        id: b('vcf'),
        name: `${M} VCF`,
        module: 'filter',
        controls: [
          b('vcf.mix_vco1'),
          b('vcf.mix_vco2'),
          b('vcf.mix_ext'),
          `${m}.ext_level`,
          b('vcf.frequency'),
          b('vcf.resonance'),
          b('vcf.notch'),
          b('vcf.response'),
          b('vcf.modulation'),
          b('vcf.mod_source'),
        ],
        description:
          'A multimode filter fed by the two VCO crossfades and the external-or-noise crossfade. At LP-HP the NOTCH knob sweeps from low-pass through a notch to high-pass; at BP it is band-pass.',
        specs: [
          { label: 'Slope', value: '12 dB per octave' },
          { label: 'Responses', value: 'Low-pass, notch, high-pass, band-pass' },
        ],
      },
      {
        id: b('vca'),
        name: `${M} VCA`,
        module: 'amp',
        controls: [b('vca.mode'), `${m}.level`, `${m}.pan`],
        description:
          'Driven by ENV 1, by ENV 1 scaled by velocity, or held open at ON/EXT, where VCA CV takes control. LEVEL and PAN place the module in the stereo mix.',
      },
    ],
    edges: [
      {
        id: c('01'),
        from: 'alloc',
        to: b('pitch'),
        signal: 'cv',
        label: 'pitch',
        breaks: `j.${m}.vco1_cv`,
      },
      { id: c('02'), from: b('pitch'), to: b('vco1'), signal: 'cv', label: 'pitch' },
      {
        id: c('03'),
        from: b('pitch'),
        to: b('vco2'),
        signal: 'cv',
        label: 'pitch',
        breaks: `j.${m}.vco2_cv`,
      },
      { id: c('04'), from: 'alloc', to: b('gate'), signal: 'gate', breaks: `j.${m}.env_gate` },
      { id: c('05'), from: b('gate'), to: b('env1'), signal: 'gate' },
      { id: c('06'), from: b('gate'), to: b('env2'), signal: 'gate' },
      {
        id: c('07'),
        from: b('vco1'),
        to: b('vco2'),
        signal: 'audio',
        label: 'sync',
        when: { id: b('vco2.sync'), eq: true },
      },
      { id: c('08'), from: 'alloc', to: b('env1'), signal: 'cv', label: 'velocity' },
      { id: c('09'), from: 'alloc', to: b('env2'), signal: 'cv', label: 'velocity' },
      vcoMod('10', 'env1', 1, 'env1', 'pitch'),
      vcoMod('11', 'env1', 1, 'env1', 'pulse width'),
      vcoMod('12', 'env1', 1, 'env1_vel', 'pitch'),
      vcoMod('13', 'env1', 1, 'env1_vel', 'pulse width'),
      vcoMod('14', 'lfo', 1, 'lfo', 'pitch'),
      vcoMod('15', 'lfo', 1, 'lfo', 'pulse width'),
      {
        id: c('16'),
        from: b('vco1'),
        to: b('vcf'),
        signal: 'audio',
        label: 'sawtooth',
        levels: [{ id: b('vcf.mix_vco1'), off: 0 }],
      },
      {
        id: c('17'),
        from: b('vco1'),
        to: b('vcf'),
        signal: 'audio',
        label: 'pulse',
        levels: [{ id: b('vcf.mix_vco1'), off: 0 }],
      },
      vcoMod('18', 'env2', 2, 'env2', 'pitch'),
      vcoMod('19', 'env2', 2, 'env2', 'pulse width'),
      vcoMod('20', 'env2', 2, 'env2_vel', 'pitch'),
      vcoMod('21', 'env2', 2, 'env2_vel', 'pulse width'),
      vcoMod('22', 'lfo', 2, 'lfo', 'pitch'),
      vcoMod('23', 'lfo', 2, 'lfo', 'pulse width'),
      {
        id: c('24'),
        from: b('vco2'),
        to: b('vcf'),
        signal: 'audio',
        label: 'sawtooth',
        levels: [{ id: b('vcf.mix_vco2'), off: 0 }],
      },
      {
        id: c('25'),
        from: b('vco2'),
        to: b('vcf'),
        signal: 'audio',
        label: 'pulse',
        levels: [{ id: b('vcf.mix_vco2'), off: 0 }],
      },
      {
        id: c('30'),
        from: 'tuning_ref',
        to: b('vcf'),
        signal: 'audio',
        label: 'EXT',
        levels: [
          { id: `${m}.ext_level`, pow: 1.7 },
          { id: b('vcf.mix_ext'), off: 0 },
        ],
        breaks: `j.${m}.ext`,
      },
      {
        id: c('31'),
        from: 'noise',
        to: b('vcf'),
        signal: 'audio',
        levels: [{ id: b('vcf.mix_ext'), off: 0 }],
      },
      {
        id: c('32'),
        from: b('env2'),
        to: b('vcf'),
        signal: 'cv',
        label: 'cutoff',
        when: { id: b('vcf.mod_source'), eq: 'env2' },
        levels: FILTER_MOD,
      },
      {
        id: c('33'),
        from: b('lfo'),
        to: b('vcf'),
        signal: 'cv',
        label: 'cutoff',
        when: { id: b('vcf.mod_source'), eq: 'lfo' },
        levels: FILTER_MOD,
      },
      {
        id: c('34'),
        from: b('env2'),
        to: b('vcf'),
        signal: 'cv',
        label: 'cutoff (velocity)',
        when: { id: b('vcf.mod_source'), eq: 'ext' },
        levels: FILTER_MOD,
        breaks: `j.${m}.vcf_cv`,
      },
      { id: c('35'), from: b('vcf'), to: b('vca'), signal: 'audio' },
      {
        id: c('36'),
        from: b('env1'),
        to: b('vca'),
        signal: 'cv',
        label: 'loudness',
        when: { id: b('vca.mode'), in: ['env', 'env_vel'] },
      },
      {
        id: c('37'),
        from: b('vca'),
        to: 'output',
        signal: 'audio',
        levels: [{ id: `${m}.level`, pow: 1.7 }],
      },
    ],
    jacks: {
      [`j.${m}.cv_out`]: 'alloc',
      [`j.${m}.gate`]: 'alloc',
      [`j.${m}.vco1_cv`]: b('pitch'),
      [`j.${m}.vco2_cv`]: b('vco2'),
      [`j.${m}.env_gate`]: b('gate'),
      [`j.${m}.vco1`]: b('vco1'),
      [`j.${m}.vco2`]: b('vco2'),
      [`j.${m}.lfo_trig`]: b('lfo'),
      [`j.${m}.lfo`]: b('lfo'),
      [`j.${m}.env1`]: b('env1'),
      [`j.${m}.env2`]: b('env2'),
      [`j.${m}.ext`]: b('vcf'),
      [`j.${m}.vcf_cv`]: b('vcf'),
      [`j.${m}.vcf`]: b('vcf'),
      [`j.${m}.vca_cv`]: b('vca'),
      [`j.${m}.vca`]: b('vca'),
    },
  };
}

const XM1 = xm(1);
const XM2 = xm(2);

export const routing: SynthRouting = {
  synth: '2-xm',
  out: 'output',
  blocks: [
    {
      id: 'alloc',
      name: 'Voice assignment',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      controls: ['alloc.assign', 'alloc.portamento_on'],
      description:
        'Hands MIDI notes to the two modules: UNISON plays both on one note, SPLIT puts XM1 below the split point and XM2 above, DUO plays them duophonically. Gives each module its pitch, gate and velocity.',
      specs: [
        { label: 'Voices', value: '2' },
        { label: 'Split point', value: 'C4 by default' },
      ],
    },
    {
      id: 'noise',
      name: 'White noise',
      module: 'mixer',
      symbol: 'noise',
      description: 'White noise, reached through each module’s EXT crossfade turned towards NOISE.',
      specs: [{ label: 'Colour', value: 'White' }],
    },
    {
      id: 'tuning_ref',
      name: 'A440 tuning reference',
      module: 'osc',
      description:
        'A fixed 440 Hz tone that takes a module’s EXT input’s place when nothing is patched there, for tuning.',
      specs: [{ label: 'Frequency', value: '440 Hz' }],
    },
    ...XM1.blocks,
    ...XM2.blocks,
    {
      id: 'output',
      name: 'Master output',
      module: 'out',
      controls: ['output.master'],
      description:
        'Sums the two modules at their own level and pan into a stereo pair, then MASTER, to the 3.5 mm stereo jack on top and two 6.35 mm jacks on the rear.',
      specs: [
        { label: 'Top', value: '3.5 mm TRS stereo' },
        { label: 'Rear', value: '2 × 6.35 mm TR' },
      ],
    },
  ],
  edges: [...XM1.edges, ...XM2.edges],
  jacks: { ...XM1.jacks, ...XM2.jacks },
};
