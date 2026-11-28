/**
 * Deckard's Dream signal routing, projected from its spec (`.context/app/synth-data/deckards-dream/deckards-dream.synth.json`,
 * 0.13.0): block and edge ids are the spec's module and connection ids; switches and levels are the definition's
 * (`defs/deckards-dream.ts`). One note's path is drawn: layer I and layer II, the same in every way, so one builder
 * draws both (`c01`–`c26` for layer I, `c27`–`c52` for layer II, as the spec numbers them), then MIX and the sub
 * oscillator every voice has. The meters follow the engine's first voice, layer I (layer II is its `layer`), so only
 * layer I's blocks carry one. Started from `routing/cs-80.ts`, without its presets: here the sliders are the sound.
 *
 * The filter envelope moves the cutoffs by IL plus AL (`c12`), so it carries nothing with both at zero. MIX is an
 * equal-power crossfade inside each layer's VCA in `toEngine()`, so it scales each layer's way into the mix (`c26`,
 * `c52`) rather than the mix's way on (`c57`); with MIX at the top layer II is dark. The filters track the keys fully
 * whatever KEYBOARD CONTROL says (`c17`, `c43`), and its BRILLIANCE and LEVEL sliders tilt the cutoff and the VCA
 * across the keys, which the spec draws no connection for beyond `c17`, so they sit on the MIDI input. On RND the sub
 * oscillator moves things with the noise generator. TOUCH SPEED (`c55`) is velocity here, as the manual's Touch
 * Response section says; the panel groups it under SUB OSC AFTER and the spec's connection names pressure.
 *
 * Where it says less, it decides too: it has no aftertouch, MIDI pitch bend wheel or mod wheel destinations, so those
 * connections are left out.
 */
import type { RoutingBlock, RoutingEdge, SynthRouting } from '@/lib/app/synths/contract';

const VOLUME = [{ id: 'out.volume', pow: 1.7 }];
const ENV_SPECS = [
  { label: 'Attack', value: '1 ms to 1 s (the menu’s default)' },
  { label: 'Decay', value: '10 ms to 15 s (the menu’s default)' },
  { label: 'Release', value: '10 ms to 15 s (the menu’s default)' },
];

/** One layer's blocks and edges: `c` = 1 or 2. */
function layer(c: 1 | 2): { blocks: RoutingBlock[]; edges: RoutingEdge[] } {
  const b = (s: string): string => `ch${c}_${s}`;
  const k = (s: string): string => `ch${c}.${s}`;
  /** Layer I's spec id `n`, or layer II's 26 on. */
  const id = (n: number): string => `c${String(c === 1 ? n : n + 26).padStart(2, '0')}`;
  const lead = c === 1;
  const N = c === 1 ? 'I' : 'II';
  return {
    blocks: [
      {
        id: b('vco'),
        name: `Layer ${N} VCO`,
        module: 'osc',
        ...(lead ? { meter: 'osc1' as const } : {}),
        controls: [k('feet'), ...(c === 2 ? ['tune.detune'] : []), k('square'), k('saw'), k('pw')],
        description:
          'A VCO giving a square (with variable pulse width), a sawtooth and a sine. FEET sets the range.',
        specs: [
          { label: 'Waveforms', value: 'Square (50 % to 90 %, PWM), sawtooth, sine' },
          { label: 'Feet', value: "16', 8', 5 1/3', 4', 2 2/3', 2'" },
          ...(c === 2 ? [{ label: 'Detune', value: '±1 semitone' }] : []),
        ],
      },
      {
        id: b('pwm'),
        name: `Layer ${N} PWM LFO`,
        module: 'lfo',
        ...(lead ? { meter: 'lfo' as const } : {}),
        controls: [k('speed'), k('pwm')],
        description: 'The layer’s own LFO, sweeping the square’s pulse width.',
        specs: [{ label: 'Speed', value: '0.7 to 70 Hz (the menu’s default)' }],
      },
      {
        id: b('noise'),
        name: `Layer ${N} noise`,
        module: 'mixer',
        symbol: 'noise',
        controls: [k('noise')],
        description: 'White noise into the layer’s mix.',
      },
      {
        id: b('mix'),
        name: `Layer ${N} VCO mix`,
        module: 'mixer',
        passes: true,
        description:
          'The square and sawtooth, each switched on or off, and the noise, into the filters.',
      },
      {
        id: b('vcf'),
        name: `Layer ${N} VCF`,
        module: 'filter',
        controls: [
          k('hpf'),
          k('resH'),
          k('lpf'),
          k('resL'),
          k('initBrill'),
          'global.brilliance',
          'global.resonance',
        ],
        description:
          'A 12 dB high-pass then a 12 dB low-pass filter, each with its own resonance, their cutoffs moved by the filter envelope, velocity and the keys.',
        specs: [
          { label: 'Stages', value: 'High-pass, then low-pass, 12 dB each' },
          { label: 'Resonance', value: 'No self-oscillation' },
        ],
      },
      {
        id: b('fenv'),
        name: `Layer ${N} filter envelope`,
        module: 'env',
        // Only layer I's envelopes are the voice's own, so only they light. The level it sustains at is the set
        // cutoffs, which IL and AL scale between: no knob of its own.
        ...(lead
          ? {
              meter: 'env1' as const,
              stages: { attack: k('fa'), decay: k('fd'), release: k('fr') },
            }
          : {}),
        controls: [k('il'), k('al'), k('fa'), k('fd'), k('fr')],
        description:
          'Starts at IL, thinner than the set cutoffs, opens over A to AL, fuller than them, comes back over D to the set cutoffs and returns over R to IL.',
        specs: ENV_SPECS,
      },
      {
        id: b('vca'),
        name: `Layer ${N} VCA`,
        module: 'amp',
        controls: [k('vcfLevel'), k('sine'), k('level'), k('initLevel')],
        description:
          'Mixes the filtered sound (VCF LEVEL) with the unfiltered sine, shaped by its ADSR. LEVEL sets the most it gives.',
      },
      {
        id: b('aenv'),
        name: `Layer ${N} VCA envelope`,
        module: 'env',
        ...(lead
          ? {
              meter: 'env2' as const,
              stages: { attack: k('a'), decay: k('d'), sustain: k('s'), release: k('r') },
            }
          : {}),
        controls: [k('a'), k('d'), k('s'), k('r')],
        description: 'An ADSR for the layer’s VCA, raised by velocity.',
        specs: ENV_SPECS,
      },
    ],
    edges: [
      { id: id(1), from: 'kbd', to: b('vco'), signal: 'cv', label: 'pitch' },
      {
        id: id(3),
        from: 'kbd',
        to: b('vco'),
        signal: 'cv',
        label: 'velocity pitchbend',
        levels: ['touch.pitchbend'],
      },
      {
        id: id(4),
        from: 'subosc',
        to: b('vco'),
        signal: 'cv',
        label: 'pitch',
        levels: [{ id: 'sub.vco', pow: 2 }],
      },
      {
        id: id(6),
        from: b('pwm'),
        to: b('vco'),
        signal: 'cv',
        label: 'pulse width',
        when: { id: k('square'), eq: 'on' },
        levels: [k('pwm')],
      },
      {
        id: id(7),
        from: b('vco'),
        to: b('mix'),
        signal: 'audio',
        label: 'square',
        when: { id: k('square'), eq: 'on' },
      },
      {
        id: id(8),
        from: b('vco'),
        to: b('mix'),
        signal: 'audio',
        label: 'sawtooth',
        when: { id: k('saw'), eq: 'on' },
      },
      { id: id(9), from: b('noise'), to: b('mix'), signal: 'audio', levels: [k('noise')] },
      { id: id(10), from: b('mix'), to: b('vcf'), signal: 'audio' },
      { id: id(11), from: 'kbd', to: b('fenv'), signal: 'gate' },
      {
        id: id(12),
        from: b('fenv'),
        to: b('vcf'),
        signal: 'cv',
        label: 'cutoff',
        levels: [{ sum: [k('il'), k('al')] }],
      },
      {
        id: id(13),
        from: 'kbd',
        to: b('vcf'),
        signal: 'cv',
        label: 'velocity',
        levels: [k('initBrill')],
      },
      {
        id: id(15),
        from: 'subosc',
        to: b('vcf'),
        signal: 'cv',
        label: 'cutoff',
        levels: ['sub.vcf'],
      },
      { id: id(17), from: 'kbd', to: b('vcf'), signal: 'cv', label: 'key tracking' },
      { id: id(19), from: b('vcf'), to: b('vca'), signal: 'audio', levels: [k('vcfLevel')] },
      {
        id: id(20),
        from: b('vco'),
        to: b('vca'),
        signal: 'audio',
        label: 'sine',
        levels: [k('sine')],
      },
      { id: id(21), from: 'kbd', to: b('aenv'), signal: 'gate' },
      {
        id: id(22),
        from: 'kbd',
        to: b('aenv'),
        signal: 'cv',
        label: 'velocity',
        levels: [k('initLevel')],
      },
      {
        id: id(24),
        from: b('aenv'),
        to: b('vca'),
        signal: 'cv',
        label: 'loudness',
        levels: [k('level')],
      },
      {
        id: id(25),
        from: 'subosc',
        to: b('vca'),
        signal: 'cv',
        label: 'loudness',
        levels: ['sub.vca'],
      },
      {
        id: id(26),
        from: b('vca'),
        to: 'chmix',
        signal: 'audio',
        levels: [c === 1 ? { id: 'mix.mix', off: 10 } : 'mix.mix'],
      },
    ],
  };
}

const ch1 = layer(1);
const ch2 = layer(2);

export const routing: SynthRouting = {
  synth: 'deckards-dream',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'MIDI input',
      module: 'mode',
      symbol: 'midi',
      meter: 'gate',
      controls: [
        'tune.coarse',
        'tune.fine',
        'porta.time',
        'porta.mode',
        'sustain.time',
        'touch.pitchbend',
        'touch.speed',
        'kbd.brillLow',
        'kbd.brillHigh',
        'kbd.levelLow',
        'kbd.levelHigh',
      ],
      description:
        'Hands each MIDI note to a voice card, which plays both layers. Sets their pitch, with portamento or glissando, their gates and velocity; KEYBOARD CONTROL tilts brilliance and level across the keys, and SUSTAIN lengthens every release.',
      specs: [
        { label: 'Input', value: 'MIDI DIN and USB, poly aftertouch and MPE' },
        { label: 'Polyphony', value: '8 notes × 2 layers' },
      ],
    },
    ...ch1.blocks,
    ...ch2.blocks,
    {
      id: 'chmix',
      name: 'Layer mix',
      module: 'mixer',
      controls: ['mix.mix'],
      passes: true,
      description:
        'Crossfades layer I and layer II of every note: layer I at the top, layer II at the bottom.',
    },
    {
      id: 'subosc',
      name: 'Sub oscillator',
      module: 'lfo',
      controls: ['sub.function', 'sub.speed', 'sub.vco', 'sub.vcf', 'sub.vca'],
      description:
        'The modulator of every voice, sent by its sliders to the VCOs’ pitch, the filters’ cutoff and the VCAs’ level.',
      specs: [
        { label: 'Functions', value: 'Sine, saw, reverse saw, square, random, sample and hold' },
        { label: 'Speed', value: '0.7 to 25 Hz (the menu’s default)' },
      ],
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      controls: ['out.volume'],
      description: 'All the voices summed, to the mono AUDIO OUT and the headphones.',
      specs: [{ label: 'Outputs', value: '1/4-inch mono out, front headphones' }],
    },
  ],
  edges: [
    ...ch1.edges,
    ...ch2.edges,
    {
      id: 'c55',
      from: 'kbd',
      to: 'subosc',
      signal: 'cv',
      label: 'velocity speed',
      when: { id: 'sub.function', in: ['sine', 'saw', 'rsaw', 'square', 'sh'] },
      levels: ['touch.speed'],
    },
    { id: 'c57', from: 'chmix', to: 'out', signal: 'audio', levels: VOLUME },
  ],
  jacks: {},
  omitted: {
    c02: 'MIDI pitch bend into layer I’s pitch: the app’s keyboard has no pitch bend for this synth.',
    c05: 'Aftertouch vibrato on layer I: the app has no aftertouch.',
    c14: 'Aftertouch into layer I’s cutoff: the app has no aftertouch.',
    c16: 'Aftertouch-controlled sub oscillator on layer I’s cutoff: the app has no aftertouch.',
    c18: 'The mod wheel into layer I’s cutoff: the definition has no MOD WHEEL DESTINATION menu.',
    c23: 'Aftertouch into layer I’s VCA envelope: the app has no aftertouch.',
    c28: 'MIDI pitch bend into layer II’s pitch: the app’s keyboard has no pitch bend for this synth.',
    c31: 'Aftertouch vibrato on layer II: the app has no aftertouch.',
    c40: 'Aftertouch into layer II’s cutoff: the app has no aftertouch.',
    c42: 'Aftertouch-controlled sub oscillator on layer II’s cutoff: the app has no aftertouch.',
    c44: 'The mod wheel into layer II’s cutoff: the definition has no MOD WHEEL DESTINATION menu.',
    c49: 'Aftertouch into layer II’s VCA envelope: the app has no aftertouch.',
    c53: 'The mod wheel on layer I’s PWM speed: the definition has no MOD WHEEL DESTINATION menu.',
    c54: 'The mod wheel on layer II’s PWM speed: the definition has no MOD WHEEL DESTINATION menu.',
    c56: 'The mod wheel on the sub oscillator’s depth: the definition has no MOD WHEEL DESTINATION menu.',
  },
};
