/**
 * The signal routing the Moog DFAM and the Behringer EDGE share. Their specs (`.context/app/synth-data/dfam/`,
 * `edge/`) give both the same fifteen modules with the same ids, and the same connections, numbered differently: the
 * EDGE's c02–c06 are its MIDI (clock, note pitch, gate and velocity), so its c07–c30 are the DFAM's c02–c25. Each
 * synth's routing (`routing/dfam.ts`, `routing/edge.ts`) calls `dfamRouting()` with its own variant; block and edge
 * ids are the spec's, and controls and jacks are the definitions' (`defs/dfam-kit.ts`).
 *
 * The sound path (b01): VCO 1, the noise (or EXT AUDIO) and VCO 2 into the mixer, the ladder filter, the VCA and the
 * output. The control side: the clock steps the sequencer, which fires the trigger bus and sets the velocity bus
 * (each normalled, and broken by its jack), which fire and scale the three envelopes; the step's pitch reaches the
 * VCOs by SEQ PITCH MOD. The envelopes are the DFAM core's (`audio/dfam-core.ts`), not the voice's own, so no block is
 * metered `env1` or `env2`.
 */
import type { RoutingBlock, RoutingEdge, SynthRouting } from '@/lib/app/synths/contract';
import type { Variant } from '@/lib/app/synths/defs/dfam-kit';

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8];

export function dfamRouting(variant: Variant): SynthRouting {
  const edge = variant === 'edge';
  const o = (n: 1 | 2): string => (edge ? `OSC ${n}` : `VCO ${n}`);
  /** The spec's id for what is the DFAM's connection `n`. */
  const c = (n: number): string => `c${String(n === 1 || !edge ? n : n + 5).padStart(2, '0')}`;
  const eg = (id: string, name: string, controls: string[], what: string): RoutingBlock => ({
    id,
    name,
    module: 'env',
    controls,
    description: `Attack 1 ms${id === 'vca_eg' ? ' (or 100 ms on SLOW)' : ''}, then a decay set by its knob and its decay CV. Its peak is the velocity bus, which also lengthens the decay a little. ${what}`,
    specs: [
      { label: 'Decay', value: '10 ms to 10 s' },
      { label: 'Output', value: '0 to +8 V' },
    ],
  });

  const blocks: RoutingBlock[] = [
    ...(edge
      ? [
          {
            id: 'midi',
            name: 'MIDI / USB',
            module: 'mode' as const,
            symbol: 'midi' as const,
            meter: 'gate' as const,
            description:
              'MIDI notes play the voice: their pitch moves both oscillators, and they strike the envelopes at their velocity (owner reports; the guide gives an outline). MIDI or USB clock runs the sequencer with CLOCK set to it. Here the app’s keys are the notes and its Play the clock.',
          },
        ]
      : []),
    {
      id: 'clock',
      name: 'Sequencer clock',
      module: 'mod',
      symbol: 'lfo',
      controls: ['clock.tempo', ...(edge ? ['clock.source', 'clock.scale'] : [])],
      description: edge
        ? 'An oscillator, 0.7 to 700 Hz, its input 1 V an octave into audio rate; or MIDI or USB clock divided by SCALE. It runs while PLAY/STOP is lit.'
        : 'An oscillator, 0.7 to 700 Hz (about 10 to 10,000 BPM in sixteenths), its input 1 V an octave into audio rate. It runs while RUN / STOP is lit.',
      specs: [{ label: 'Rate', value: '0.7 to 700 Hz' }],
    },
    {
      id: 'seq',
      name: '8-step sequencer',
      module: 'mod',
      symbol: 'mod',
      controls: [
        ...STEPS.map((i) => `seq.pitch${i}`),
        ...STEPS.map((i) => `seq.vel${i}`),
        'seq.pitch_mod',
        'seq.run',
      ],
      description:
        'Eight steps, each a PITCH (±5 V) and a VELOCITY (0 to 5 V). Each clock moves it on a step and fires the trigger bus; SEQ PITCH MOD sends its pitch to both oscillators, the second only, or neither.',
      specs: [
        { label: 'Steps', value: '8' },
        { label: 'Pitch', value: '±5 V (about 10 octaves)' },
        { label: 'Velocity', value: '0 to 5 V' },
      ],
    },
    {
      id: 'trig',
      name: 'Trigger bus',
      module: 'mod',
      symbol: 'util',
      passes: true,
      description:
        'Fires all three envelopes, and TRIGGER OUT (a 1 ms, +5 V pulse). The sequencer is wired to it until a cable goes into TRIGGER.',
    },
    {
      id: 'vel',
      name: 'Velocity bus',
      module: 'mod',
      symbol: 'util',
      passes: true,
      description:
        'Sets the three envelopes’ peak. The step’s VELOCITY is wired to it until a cable goes into VELOCITY.',
    },
    eg(
      'vco_eg',
      edge ? 'OSC EG' : 'VCO EG',
      ['vco_eg.decay'],
      'It bends both oscillators’ pitch by their EG amounts.'
    ),
    eg('vcf_eg', 'VCF EG', ['vcf_eg.decay'], 'It moves the cutoff by VCF EG AMOUNT.'),
    eg('vca_eg', 'VCA EG', ['vca_eg.attack', 'vca_eg.decay'], 'It opens the VCA.'),
    {
      id: 'vco1',
      name: o(1),
      module: 'osc',
      meter: 'osc1',
      controls: ['vco1.freq', 'vco1.wave', 'vco1.eg_amt'],
      description: `An analogue VCO over ten octaves, triangle or square, bent by the ${edge ? 'OSC' : 'VCO'} EG.`,
      specs: [
        { label: 'Range', value: '10 octaves' },
        { label: 'Waves', value: 'Triangle, square' },
      ],
    },
    {
      id: 'vco2',
      name: o(2),
      module: 'osc',
      meter: 'osc2',
      controls: ['vco2.freq', 'vco2.wave', 'vco2.eg_amt', 'vco2.sync', 'vco2.fm_amt'],
      description: `As ${o(1)}, and ${o(1)} can hard-sync it and frequency-modulate it (linear FM).`,
      specs: [
        { label: 'Range', value: '10 octaves' },
        { label: 'Waves', value: 'Triangle, square' },
      ],
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'mixer',
      symbol: 'noise',
      ...(edge ? { controls: ['noise.color'] } : {}),
      description: edge
        ? 'White or pink noise: a sound source, and the cutoff’s modulator.'
        : 'White noise: a sound source, and the cutoff’s modulator.',
    },
    {
      id: 'mixer',
      name: 'Mixer',
      module: 'mixer',
      passes: true,
      controls: ['mix.vco1', 'mix.noise', 'mix.vco2'],
      description:
        'Three levels into the filter. The noise channel takes EXT AUDIO in its place, and its level takes the NOISE LEVEL input too. High levels clip pleasantly.',
    },
    {
      id: 'vcfmod',
      name: 'VCF modulation',
      module: 'filter',
      symbol: 'util',
      passes: true,
      controls: ['vcfmod.amt'],
      description:
        'Scales the noise, or the VCF MOD input in its place, into the cutoff: the only direct way in.',
    },
    {
      id: 'vcf',
      name: 'VCF',
      module: 'filter',
      passes: true,
      controls: ['vcf.mode', 'vcf.cutoff', 'vcf.resonance', 'vcf_eg.amt'],
      description:
        'A 4-pole ladder, low-pass or high-pass, self-oscillating from about 3 o’clock in LP. VCF EG AMOUNT sends the VCF EG either way.',
      specs: [
        { label: 'Slope', value: '−24 dB/octave' },
        { label: 'Cutoff', value: '20 Hz to 20 kHz' },
      ],
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      passes: true,
      description: 'Opened by the VCA EG, added to the VCA CV input.',
      specs: [{ label: 'VCA CV', value: '0 to +8 V' }],
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      passes: true,
      controls: ['out.volume'],
      description: edge
        ? 'VOLUME, to the VCA jack (modular level) and PHONES.'
        : 'VOLUME, to the VCA jack (modular level) and the rear 1/4-inch output.',
    },
  ];

  const egs = ['vco_eg', 'vcf_eg', 'vca_eg'];
  const edges: RoutingEdge[] = [
    { id: c(1), from: 'clock', to: 'seq', signal: 'gate', label: 'clock', breaks: 'j.adv_clock' },
    { id: c(2), from: 'seq', to: 'trig', signal: 'gate', label: 'steps', breaks: 'j.trigger_in' },
    ...egs.map((to, k) => ({ id: c(3 + k), from: 'trig', to, signal: 'gate' as const })),
    { id: c(6), from: 'seq', to: 'vel', signal: 'cv', label: 'velocity', breaks: 'j.velocity_in' },
    ...egs.map((to, k) => ({
      id: c(7 + k),
      from: 'vel',
      to,
      signal: 'cv' as const,
      label: 'peak',
    })),
    {
      id: c(10),
      from: 'seq',
      to: 'vco1',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'seq.pitch_mod', eq: 'vco12' },
    },
    {
      id: c(11),
      from: 'seq',
      to: 'vco2',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'seq.pitch_mod', in: ['vco12', 'vco2'] },
    },
    {
      id: c(12),
      from: 'vco_eg',
      to: 'vco1',
      signal: 'cv',
      label: 'pitch',
      levels: [{ id: 'vco1.eg_amt', off: 0 }],
    },
    {
      id: c(13),
      from: 'vco_eg',
      to: 'vco2',
      signal: 'cv',
      label: 'pitch',
      levels: [{ id: 'vco2.eg_amt', off: 0 }],
    },
    { id: c(14), from: 'vco1', to: 'vco2', signal: 'audio', label: 'FM', levels: ['vco2.fm_amt'] },
    {
      id: c(15),
      from: 'vco1',
      to: 'vco2',
      signal: 'gate',
      label: 'sync',
      when: { id: 'vco2.sync', eq: 'on' },
    },
    { id: c(16), from: 'vco1', to: 'mixer', signal: 'audio', levels: ['mix.vco1'] },
    { id: c(17), from: 'vco2', to: 'mixer', signal: 'audio', levels: ['mix.vco2'] },
    {
      id: c(18),
      from: 'noise',
      to: 'mixer',
      signal: 'audio',
      levels: ['mix.noise'],
      breaks: 'j.ext_audio',
    },
    { id: c(19), from: 'noise', to: 'vcfmod', signal: 'cv', breaks: 'j.vcf_mod' },
    { id: c(20), from: 'vcfmod', to: 'vcf', signal: 'cv', label: 'cutoff', levels: ['vcfmod.amt'] },
    { id: c(21), from: 'mixer', to: 'vcf', signal: 'audio' },
    {
      id: c(22),
      from: 'vcf_eg',
      to: 'vcf',
      signal: 'cv',
      label: 'cutoff',
      levels: [{ id: 'vcf_eg.amt', off: 0 }],
    },
    { id: c(23), from: 'vcf', to: 'vca', signal: 'audio' },
    { id: c(24), from: 'vca_eg', to: 'vca', signal: 'cv' },
    { id: c(25), from: 'vca', to: 'out', signal: 'audio', levels: ['out.volume'] },
    ...(edge
      ? [
          {
            id: 'c02',
            from: 'midi',
            to: 'clock',
            signal: 'gate' as const,
            label: 'clock',
            when: { id: 'clock.source', in: ['midi', 'usb'] },
          },
          { id: 'c03', from: 'midi', to: 'vco1', signal: 'cv' as const, label: 'pitch' },
          { id: 'c04', from: 'midi', to: 'vco2', signal: 'cv' as const, label: 'pitch' },
          { id: 'c05', from: 'midi', to: 'trig', signal: 'gate' as const, label: 'gate' },
          { id: 'c06', from: 'midi', to: 'vel', signal: 'cv' as const, label: 'velocity' },
        ]
      : []),
  ];

  const jacks: Record<string, string> = {
    'j.trigger_in': 'trig',
    'j.vca_cv': 'vca',
    'j.vca_out': 'out',
    'j.velocity_in': 'vel',
    'j.vca_decay': 'vca_eg',
    'j.vca_eg_out': 'vca_eg',
    'j.ext_audio': 'mixer',
    'j.vcf_decay': 'vcf_eg',
    'j.vcf_eg_out': 'vcf_eg',
    'j.noise_level': 'mixer',
    'j.vco_decay': 'vco_eg',
    'j.vco_eg_out': 'vco_eg',
    'j.vcf_mod': 'vcfmod',
    'j.vco1_cv': 'vco1',
    'j.vco1_out': 'vco1',
    'j.fm_amt': 'vco2',
    'j.vco2_cv': 'vco2',
    'j.vco2_out': 'vco2',
    'j.tempo': 'clock',
    'j.run_stop': 'clock',
    'j.adv_clock': 'seq',
    'j.trigger_out': 'trig',
    'j.velocity_out': 'seq',
    'j.pitch_out': 'seq',
    ...(edge ? { 'j.phones': 'out', 'j.midi_in': 'midi', 'j.midi_out': 'midi' } : {}),
  };

  return { synth: variant, out: 'out', blocks, edges, jacks };
}
