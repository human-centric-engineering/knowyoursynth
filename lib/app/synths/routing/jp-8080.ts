/**
 * JP-8080 signal routing, projected from its spec (`.context/app/synth-data/jp-8080/jp-8080.synth.json`, 0.13.0): block
 * and edge ids are the spec's module and connection ids; switches and levels are the definition's (`defs/jp-8080.ts`).
 *
 * The spec models one patch's voice; the JP-8080 runs two, Upper and Lower, each with its own effects (its
 * `modelling_gaps`). So one builder draws both: the Upper patch under the spec's own ids, the Lower under the same ids
 * with `lo_` in front (`lo_osc1`, `lo_c25`), with the keyboard, the arpeggiator and the output they share. The meters
 * follow the engine's first voice, which is the Upper patch unless KEY MODE is SINGLE with PANEL SELECT on LOWER, so
 * only the Upper patch's blocks carry one.
 *
 * Where the definition says more than the spec, it decides. KEY MODE and PANEL SELECT pick which patches sound, so each
 * patch's way out holds only while it plays. In DUAL and SPLIT the effects engine takes one chain, the Upper patch's, so
 * the Lower voice joins the Upper tone control there (`lo_c52x`, a derived id) and its own chain is used only when it
 * plays alone. OSC BALANCE is an equal-power crossfade, so it scales each oscillator's way into the mixer (`c25`–`c27`).
 * The noise on OSC 2 ignores the keys (`c08`). Cross mod reaches OSC 1 except on the super saw and noise, and EXT (no
 * input here) silences OSC 2. LFO 1 moves CONTROL 1 of the square and triangle mod only (`c20`).
 *
 * Where it says less, it decides too. There is no pitch bend, aftertouch, individual or external trigger, external
 * input, morphing, motion, RPS or Voice Modulator here, so those modules and connections are left out.
 */
import type {
  RoutingBlock,
  RoutingEdge,
  RoutingLevel,
  RoutingWhen,
  SynthRouting,
} from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

type Part = 'up' | 'lo';

const BOTH: RoutingWhen = { id: 'perf.keyMode', in: ['dual', 'split'] };
const SINGLE: RoutingWhen = { id: 'perf.keyMode', eq: 'single' };
const VOLUME: RoutingLevel[] = [{ id: 'out.volume', pow: 1.7 }];
const ENV_TIMES = { label: 'Times', value: '0–127 (about 2 ms to 10 s here)' };

/** One patch's blocks and edges. */
function patch(s: Part): { blocks: RoutingBlock[]; edges: RoutingEdge[] } {
  const lead = s === 'up';
  const b = (x: string): string => (lead ? x : `lo_${x}`);
  const k = (x: string): string => `${s}.${x}`;
  const L = lead ? 'Upper' : 'Lower';
  const bi = (x: string): RoutingLevel => ({ id: k(x), off: 0 });
  const pick = (ctl: string, values: string[]): RoutingWhen => ({ id: k(ctl), in: values });
  const not = (ctl: string, values: string[]): RoutingWhen => ({
    id: k(ctl),
    in: OPTIONS[ctl].filter((v) => !values.includes(v)),
  });
  const extOff: RoutingWhen = { id: k('osc2Ext'), eq: false };
  const ringOn: RoutingWhen = { all: [{ id: k('ring'), eq: true }, extOff] };
  const xmodOk: RoutingWhen = { all: [not('osc1Wave', ['superSaw', 'noise']), extOff] };
  const pitchBoth = pick('dest', ['osc12']);
  const pitch2 = pick('dest', ['osc12', 'osc2']);
  const toXmod = pick('dest', ['xmod']);
  const sounds: RoutingWhen = lead
    ? { any: [BOTH, { id: 'perf.panel', eq: 'upper' }] }
    : { all: [SINGLE, { id: 'perf.panel', eq: 'lower' }] };
  const lfo2Depth = (x: string): RoutingLevel[] => [bi(x), WHEEL];
  return {
    blocks: [
      {
        id: b('pitch'),
        name: `${L} pitch`,
        module: 'glide',
        controls: [k('porta'), k('portaTime'), k('shift')],
        passes: true,
        description:
          'The note the oscillators play, with portamento and OSC SHIFT’s octaves added (bend, part transpose and detune are not modelled).',
      },
      {
        id: b('osc1'),
        name: `${L} OSC 1`,
        module: 'osc',
        ...(lead ? { meter: 'osc1' as const } : {}),
        controls: [k('osc1Wave'), k('osc1Ctl1'), k('osc1Ctl2'), k('xmod')],
        description:
          'Seven waveforms, each with its own CONTROL 1 and CONTROL 2: the super saw, triangle mod, noise, feedback osc, square, saw and triangle. OSC 2 can modulate its frequency.',
        specs: [
          {
            label: 'Waveforms',
            value: 'Super saw, triangle mod, noise, feedback osc, square (PWM), saw, triangle',
          },
        ],
      },
      {
        id: b('osc2'),
        name: `${L} OSC 2`,
        module: 'osc',
        ...(lead ? { meter: 'osc2' as const } : {}),
        controls: [
          k('osc2Wave'),
          k('osc2Ext'),
          k('osc2Range'),
          k('osc2Fine'),
          k('osc2Ctl1'),
          k('osc2Ctl2'),
          k('sync'),
        ],
        description:
          'Square, saw, triangle or noise, pitched against OSC 1 by RANGE and FINE/WIDE, with hard sync to OSC 1. EXT puts the external input in its place.',
        specs: [
          { label: 'Waveforms', value: 'Square (PWM), saw, triangle, noise, or external input' },
          { label: 'Range', value: '±24 semitones, or ±4 octaves at WIDE' },
        ],
      },
      {
        id: b('ring'),
        name: `${L} ring modulator`,
        module: 'osc',
        controls: [k('ring')],
        description: 'OSC 1 times OSC 2, heard on OSC 2’s side of OSC BALANCE.',
      },
      {
        id: b('mixer'),
        name: `${L} OSC BALANCE`,
        module: 'mixer',
        controls: [k('balance')],
        passes: true,
        description:
          'Crossfades OSC 1 and the OSC 2 side (OSC 2 or the ring modulator), equal at the centre.',
      },
      {
        id: b('env_pitch'),
        name: `${L} pitch envelope`,
        module: 'env',
        controls: [k('pDepth'), k('pA'), k('pD'), k('dest')],
        description:
          'Attack and decay, up or down by DEPTH, on the pitch of both oscillators or OSC 2, or on the cross mod depth.',
        specs: [ENV_TIMES],
      },
      {
        id: b('vcf'),
        name: `${L} filter`,
        module: 'filter',
        controls: [k('cutoff'), k('res'), k('vcfType'), k('slope'), k('keyFollow'), k('vcfLfo')],
        description:
          'Low-pass, band-pass or high-pass, resonant to self-oscillation, with key follow.',
        specs: [
          { label: 'Types', value: 'HPF, BPF, LPF' },
          { label: 'Slope', value: '-12 or -24 dB per octave' },
        ],
      },
      {
        id: b('env_filter'),
        name: `${L} filter envelope`,
        module: 'env',
        ...(lead
          ? {
              meter: 'env1' as const,
              stages: { attack: k('fA'), decay: k('fD'), sustain: k('fS'), release: k('fR') },
            }
          : {}),
        controls: [k('fDepth'), k('fA'), k('fD'), k('fS'), k('fR')],
        description:
          'An ADSR on the cutoff, opening it (above centre) or closing it (below) by DEPTH.',
        specs: [ENV_TIMES],
      },
      {
        id: b('vca'),
        name: `${L} amp`,
        module: 'amp',
        controls: [k('ampLevel'), k('pan'), k('ampLfo')],
        description: 'The patch’s level, with LFO 1 as tremolo or auto pan.',
      },
      {
        id: b('env_amp'),
        name: `${L} amp envelope`,
        module: 'env',
        ...(lead
          ? {
              meter: 'env2' as const,
              stages: { attack: k('aA'), decay: k('aD'), sustain: k('aS'), release: k('aR') },
            }
          : {}),
        controls: [k('aA'), k('aD'), k('aS'), k('aR')],
        description: 'An ADSR on the loudness of each note.',
        specs: [ENV_TIMES],
      },
      {
        id: b('lfo1'),
        name: `${L} LFO 1`,
        module: 'lfo',
        ...(lead ? { meter: 'lfo' as const } : {}),
        controls: [k('lfo1Wave'), k('lfo1Rate'), k('lfo1Fade'), k('oscLfo')],
        description:
          'Triangle, saw, square or sample and hold, fading in after each key; its depths are set where it is used.',
        specs: [{ label: 'Waveforms', value: 'Triangle, saw, square, sample and hold' }],
      },
      {
        id: b('lfo2'),
        name: `${L} LFO 2`,
        module: 'lfo',
        controls: [k('lfo2Rate'), k('lfo2Pitch'), k('lfo2Filter'), k('lfo2Amp')],
        description:
          'A triangle the mod wheel brings in, on pitch, filter and amp at three depths of its own.',
        specs: [{ label: 'Waveform', value: 'Triangle' }],
      },
      {
        id: b('tone'),
        name: `${L} tone control`,
        module: 'fx',
        controls: [k('bass'), k('treble')],
        passes: true,
        description: 'Bass and treble boost or cut on the patch’s output.',
      },
      {
        id: b('mfx'),
        name: `${L} multi-effects`,
        module: 'fx',
        controls: [k('mfxType'), k('mfxLevel')],
        passes: true,
        description:
          'One of thirteen effects: super chorus, flanger, phasing, twisting, freeze phase or distortion.',
        specs: [{ label: 'Types', value: '13' }],
      },
      {
        id: b('delay'),
        name: `${L} delay`,
        module: 'fx',
        controls: [k('dlyType'), k('dlyTime'), k('dlyFeedback'), k('dlyLevel')],
        passes: true,
        description: 'Five delay types, panning or mono, with TIME, FEEDBACK and LEVEL.',
        specs: [{ label: 'Longest echo', value: '1250 ms mono, 625 ms panning' }],
      },
    ],
    edges: [
      { id: b('c05'), from: 'kbd', to: b('pitch'), signal: 'cv', label: 'note' },
      { id: b('c07'), from: b('pitch'), to: b('osc1'), signal: 'cv', label: 'pitch' },
      {
        id: b('c08'),
        from: b('pitch'),
        to: b('osc2'),
        signal: 'cv',
        label: 'pitch',
        when: { all: [not('osc2Wave', ['noise']), extOff] },
      },
      {
        id: b('c09'),
        from: b('env_pitch'),
        to: b('osc1'),
        signal: 'cv',
        label: 'pitch',
        when: pitchBoth,
        levels: [bi('pDepth')],
      },
      {
        id: b('c10'),
        from: b('env_pitch'),
        to: b('osc2'),
        signal: 'cv',
        label: 'pitch',
        when: pitch2,
        levels: [bi('pDepth')],
      },
      {
        id: b('c11'),
        from: b('lfo1'),
        to: b('osc1'),
        signal: 'cv',
        label: 'pitch',
        when: pitchBoth,
        levels: [bi('oscLfo')],
      },
      {
        id: b('c12'),
        from: b('lfo1'),
        to: b('osc2'),
        signal: 'cv',
        label: 'pitch',
        when: pitch2,
        levels: [bi('oscLfo')],
      },
      {
        id: b('c13'),
        from: b('lfo2'),
        to: b('osc1'),
        signal: 'cv',
        label: 'pitch',
        levels: lfo2Depth('lfo2Pitch'),
      },
      {
        id: b('c14'),
        from: b('lfo2'),
        to: b('osc2'),
        signal: 'cv',
        label: 'pitch',
        levels: lfo2Depth('lfo2Pitch'),
      },
      {
        id: b('c15'),
        from: 'kbd',
        to: b('lfo2'),
        signal: 'cv',
        label: 'mod wheel',
        levels: [WHEEL],
      },
      {
        id: b('c16'),
        from: b('osc2'),
        to: b('osc1'),
        signal: 'audio',
        label: 'cross mod',
        when: xmodOk,
        levels: [{ id: k('xmod'), pow: 2 }],
      },
      {
        id: b('c17'),
        from: b('env_pitch'),
        to: b('osc1'),
        signal: 'cv',
        label: 'cross mod depth',
        when: { all: [toXmod, xmodOk] },
        levels: [bi('pDepth')],
      },
      {
        id: b('c18'),
        from: b('lfo1'),
        to: b('osc1'),
        signal: 'cv',
        label: 'cross mod depth',
        when: { all: [toXmod, xmodOk] },
        levels: [bi('oscLfo')],
      },
      {
        id: b('c19'),
        from: b('osc1'),
        to: b('osc2'),
        signal: 'audio',
        label: 'sync',
        when: { all: [{ id: k('sync'), eq: true }, extOff, not('osc2Wave', ['noise'])] },
      },
      {
        id: b('c20'),
        from: b('lfo1'),
        to: b('osc1'),
        signal: 'cv',
        label: 'shape',
        when: pick('osc1Wave', ['square', 'triMod']),
        levels: [k('osc1Ctl2')],
      },
      {
        id: b('c21'),
        from: b('lfo1'),
        to: b('osc2'),
        signal: 'cv',
        label: 'pulse width',
        when: { all: [pick('osc2Wave', ['square']), extOff] },
        levels: [k('osc2Ctl2')],
      },
      { id: b('c23'), from: b('osc1'), to: b('ring'), signal: 'audio', when: ringOn },
      { id: b('c24'), from: b('osc2'), to: b('ring'), signal: 'audio', when: ringOn },
      {
        id: b('c25'),
        from: b('osc1'),
        to: b('mixer'),
        signal: 'audio',
        levels: [{ id: k('balance'), off: 63 }],
      },
      {
        id: b('c26'),
        from: b('osc2'),
        to: b('mixer'),
        signal: 'audio',
        when: { all: [{ id: k('ring'), eq: false }, extOff] },
        levels: [{ id: k('balance'), off: -64 }],
      },
      {
        id: b('c27'),
        from: b('ring'),
        to: b('mixer'),
        signal: 'audio',
        when: ringOn,
        levels: [{ id: k('balance'), off: -64 }],
      },
      { id: b('c28'), from: b('mixer'), to: b('vcf'), signal: 'audio' },
      {
        id: b('c29'),
        from: b('env_filter'),
        to: b('vcf'),
        signal: 'cv',
        label: 'cutoff',
        levels: [bi('fDepth')],
      },
      {
        id: b('c30'),
        from: b('lfo1'),
        to: b('vcf'),
        signal: 'cv',
        label: 'cutoff',
        levels: [bi('vcfLfo')],
      },
      {
        id: b('c31'),
        from: b('lfo2'),
        to: b('vcf'),
        signal: 'cv',
        label: 'cutoff',
        levels: lfo2Depth('lfo2Filter'),
      },
      {
        id: b('c32'),
        from: 'kbd',
        to: b('vcf'),
        signal: 'cv',
        label: 'key follow',
        levels: [bi('keyFollow')],
      },
      { id: b('c33'), from: b('vcf'), to: b('vca'), signal: 'audio' },
      { id: b('c34'), from: b('env_amp'), to: b('vca'), signal: 'cv', label: 'loudness' },
      {
        id: b('c35'),
        from: b('lfo1'),
        to: b('vca'),
        signal: 'cv',
        label: 'tremolo',
        when: pick('pan', ['off']),
        levels: [bi('ampLfo')],
      },
      {
        id: b('c36'),
        from: b('lfo1'),
        to: b('vca'),
        signal: 'cv',
        label: 'auto pan',
        // the Lower part's own effects, its auto pan among them, run only when it plays alone
        when: lead ? pick('pan', ['auto']) : { all: [pick('pan', ['auto']), sounds] },
        levels: [bi('ampLfo')],
      },
      {
        id: b('c37'),
        from: b('lfo2'),
        to: b('vca'),
        signal: 'cv',
        label: 'tremolo',
        levels: lfo2Depth('lfo2Amp'),
      },
      { id: b('c38'), from: 'kbd', to: b('env_pitch'), signal: 'gate' },
      { id: b('c39'), from: 'kbd', to: b('env_filter'), signal: 'gate' },
      { id: b('c40'), from: 'kbd', to: b('env_amp'), signal: 'gate' },
      { id: b('c41'), from: 'kbd', to: b('lfo1'), signal: 'gate', label: 'fade' },
      { id: b('c52'), from: b('vca'), to: b('tone'), signal: 'audio', when: sounds },
      // in DUAL and SPLIT the Lower voice shares the Upper patch's effects
      ...(lead
        ? []
        : [{ id: 'lo_c52x', from: 'lo_vca', to: 'tone', signal: 'audio' as const, when: BOTH }]),
      { id: b('c53'), from: b('tone'), to: b('mfx'), signal: 'audio' },
      { id: b('c54'), from: b('mfx'), to: b('delay'), signal: 'audio' },
      {
        id: b('c55'),
        from: b('delay'),
        to: 'out',
        signal: 'audio',
        label: lead ? 'upper' : 'lower',
        levels: VOLUME,
      },
    ],
  };
}

/** The options of the enum controls the `when`s above negate. */
const OPTIONS: Record<string, string[]> = {
  osc1Wave: ['superSaw', 'triMod', 'noise', 'feedback', 'square', 'saw', 'tri'],
  osc2Wave: ['square', 'saw', 'tri', 'noise'],
};

const up = patch('up');
const lo = patch('lo');

export const routing: SynthRouting = {
  synth: 'jp-8080',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'MIDI in and the two parts',
      module: 'mode',
      symbol: 'midi',
      meter: 'gate',
      controls: [
        'perf.keyMode',
        'perf.panel',
        'up.mono',
        'up.legato',
        'up.unison',
        'lo.mono',
        'lo.legato',
        'lo.unison',
      ],
      description:
        'Notes arrive over MIDI (there is no keyboard) and go to the part PANEL SELECT picks (SINGLE), to both (DUAL), or to Lower below C4 and Upper from it (SPLIT), poly or mono as SOLO SW says.',
      specs: [
        { label: 'Voices', value: '10 (8 with the Voice Modulator on)' },
        { label: 'Parts', value: 'Upper and Lower' },
      ],
    },
    {
      id: 'arp',
      name: 'Arpeggiator',
      module: 'mode',
      controls: ['arp.on', 'arp.mode', 'arp.range', 'arp.hold', 'arp.tempo'],
      description:
        'Plays the held keys one at a time, up, down, both or at random, over one to four octaves.',
      specs: [
        { label: 'Modes', value: 'Up, down, up and down, random (and RPS)' },
        { label: 'Range', value: '1 to 4 octaves' },
        { label: 'Tempo', value: '20 to 250 BPM' },
      ],
    },
    ...up.blocks,
    ...lo.blocks,
    {
      id: 'out',
      name: 'Outputs',
      module: 'out',
      controls: ['out.volume'],
      description: 'VOLUME LEVEL to the stereo outputs and the headphones.',
      specs: [{ label: 'Outputs', value: 'L (mono) and R, 1/4-inch; headphones' }],
    },
  ],
  edges: [
    {
      id: 'c01',
      from: 'kbd',
      to: 'arp',
      signal: 'cv',
      label: 'notes',
      when: {
        all: [
          { id: 'arp.on', eq: true },
          { id: 'arp.mode', in: ['up', 'down', 'updown', 'random'] },
        ],
      },
    },
    {
      id: 'c03',
      from: 'arp',
      to: 'kbd',
      signal: 'cv',
      label: 'notes',
      when: {
        all: [
          { id: 'arp.on', eq: true },
          { id: 'arp.mode', in: ['up', 'down', 'updown', 'random'] },
        ],
      },
    },
    ...up.edges,
    ...lo.edges,
  ],
  jacks: {},
  omitted: {
    ext: 'The external inputs: the app has no audio input, so OSC 2’s EXT only silences it.',
    morph: 'Velocity and control morphing are drawn but not modelled.',
    rps: 'RPS, the phrase player, is drawn but not modelled.',
    motion: 'Motion control is drawn but not modelled.',
    vm_inst: 'The Voice Modulator is drawn but not modelled.',
    vm_robot: 'The Voice Modulator’s robot oscillator: not modelled.',
    vm_noise: 'The Voice Modulator’s noise: not modelled.',
    vm: 'The Voice Modulator’s filter bank: not modelled.',
    vm_morph: 'The vocal morph detector: not modelled.',
    vm_ens: 'The Voice Modulator’s ensemble: not modelled.',
    vm_dly: 'The Voice Modulator’s delay: not modelled.',
    c02: 'Notes to RPS: RPS is not modelled.',
    c04: 'RPS phrases to the parts: RPS is not modelled.',
    c06: 'Pitch bend: the app’s keyboard has no bender.',
    c22: 'The external input into OSC 2: the app has no audio input.',
    c42: 'The individual trigger to the filter envelope: not modelled.',
    c43: 'The individual trigger to the amp envelope: not modelled.',
    c44: 'The external input’s trigger to the filter envelope: not modelled.',
    c45: 'The external input’s trigger to the amp envelope: not modelled.',
    c46: 'Velocity to morphing: not modelled.',
    c47: 'Control Up to morphing: not modelled.',
    c48: 'Control Down to morphing: not modelled.',
    c49: 'Vocal morph: not modelled.',
    c50: 'Motion playback: not modelled.',
    c51: 'Morphing on the cutoff: not modelled.',
    c56: 'The delay’s right side: one edge (`c55`) carries both sides of each part to the outputs.',
    c57: 'The patch to the Voice Modulator: not modelled.',
    c58: 'The patch to the Voice Modulator’s vocal input: not modelled.',
    c59: 'The INST input to the Voice Modulator: not modelled.',
    c60: 'The VOCAL input to the Voice Modulator: not modelled.',
    c61: 'The VOCAL input to the vocal morph detector: not modelled.',
    c62: 'The robot oscillator: not modelled.',
    c63: 'The Voice Modulator’s noise: not modelled.',
    c64: 'The Voice Modulator’s instrument input: not modelled.',
    c65: 'The Voice Modulator to its ensemble: not modelled.',
    c66: 'The ensemble to the Voice Modulator delay: not modelled.',
    c67: 'The Voice Modulator delay to the outputs: not modelled.',
  },
};
