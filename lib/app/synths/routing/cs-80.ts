/**
 * CS-80 signal routing, projected from its spec (`.context/app/synth-data/cs-80/cs-80.synth.json`, 0.13.0): block and
 * edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's (`defs/cs-80.ts`,
 * with its presets in `defs/cs-80-presets.ts`). One note's path is drawn: channel I and channel II, the same in every
 * way, so one builder draws both (`c01`–`c27` for channel I, `c28`–`c54` for channel II, as the spec numbers them),
 * then MIX and the sub oscillator, ring modulator and tremolo every voice shares. The meters follow the engine's first
 * voice, channel I (channel II is its `layer`), so only channel I's blocks carry one.
 *
 * Where the definition says more than the spec, it decides. A channel's panel sliders are heard only while its TONE
 * SELECTOR is on PANEL; on a preset the preset's own chart is heard. So each channel edge holds on a preset whose chart
 * has it (the square or sawtooth on, the level above zero), and on PANEL by the panel's switch or slider: the panel
 * slider plus "not PANEL" is its level. The filter envelope moves the cutoffs by IL plus AL (`c12`), so it carries
 * nothing with both at zero. MIX is an equal-power crossfade inside each channel's VCA in `toEngine()`, so it scales
 * each channel's way into the mix (`c27`, `c54`) rather than the mix's way on (`c56`); with MIX at the top channel II
 * is dark. The filters track the keys fully whatever KEYBOARD CONTROL BRILLIANCE says (`c17`, `c44`), and its LOW and
 * HIGH and the KEYBOARD CONTROL LEVEL levers tilt the cutoff and the VCA across the keys, which the spec draws no
 * connection for beyond `c17`, so they sit on the keyboard. The sub oscillator does nothing on EXT (printed only), and
 * on NOISE moves things with the noise generator. The ring modulator and tremolo pass the sound on untouched when off
 * (`c57`). VOLUME scales the way out, curved as `toEngine()` curves it (`c58`, `c59`).
 *
 * Where it says less, it decides too. It has no ribbon, aftertouch or foot pedal, so those modules and their
 * connections are left out.
 */
import type {
  RoutingBlock,
  RoutingEdge,
  RoutingWhen,
  SynthRouting,
} from '@/lib/app/synths/contract';
import { CS80_PRESETS, PANEL_COLS, type PanelCol } from '@/lib/app/synths/defs/cs-80-presets';

/** Each channel's TONE SELECTOR presets, as the definition names them. */
const TONES: Record<1 | 2, string[]> = {
  1: [
    'string1',
    'string2',
    'brass1',
    'flute',
    'epiano',
    'clav1',
    'harpsi1',
    'organ1',
    'guitar1',
    'funky1',
    'funky3',
  ],
  2: [
    'string3',
    'string4',
    'brass2',
    'brass3',
    'bass',
    'clav2',
    'harpsi2',
    'organ2',
    'guitar2',
    'funky2',
    'funky4',
  ],
};
const SUB_ON: RoutingWhen = {
  id: 'sub.function',
  in: ['sine', 'saw', 'rsaw', 'square', 'noise'],
};
const VOLUME = [{ id: 'out.volume', pow: 1.7 }];
const ENV_SPECS = [
  { label: 'Attack', value: '1 ms to 1 s' },
  { label: 'Decay', value: '10 ms to 10 s' },
  { label: 'Release', value: '10 ms to 10 s' },
];

/** The presets of channel `c` whose chart passes `test` for `col`. */
const presets = (c: 1 | 2, cols: PanelCol[], test: (x: number | boolean) => boolean): string[] =>
  TONES[c].filter((t) => cols.some((k) => test(CS80_PRESETS[t][PANEL_COLS.indexOf(k)])));

/** Holds on a preset with `col` on, or on PANEL with the panel's switch on. */
function wave(c: 1 | 2, col: 'square' | 'saw'): RoutingWhen {
  const panel: RoutingWhen = {
    all: [
      { id: `ch${c}.tone`, eq: 'panel' },
      { id: `ch${c}.${col}`, eq: 'on' },
    ],
  };
  const on = presets(c, [col], (x) => x === true);
  return on.length ? { any: [{ id: `ch${c}.tone`, in: on }, panel] } : panel;
}

/** Holds on a preset with any of `cols` above zero, or on PANEL; scaled by the panel's sliders there. */
function slider(c: 1 | 2, cols: PanelCol[]): Pick<RoutingEdge, 'when' | 'levels'> {
  const panel: RoutingWhen = { id: `ch${c}.tone`, eq: 'panel' };
  const on = presets(c, cols, (x) => Number(x) > 0);
  return {
    when: on.length ? { any: [{ id: `ch${c}.tone`, in: on }, panel] } : panel,
    levels: [{ sum: [...cols.map((k) => `ch${c}.${k}`), { id: `ch${c}.tone`, off: 'panel' }] }],
  };
}

/** One channel's blocks and edges: `c` = 1 or 2. */
function channel(c: 1 | 2): { blocks: RoutingBlock[]; edges: RoutingEdge[] } {
  const b = (s: string): string => `ch${c}_${s}`;
  const k = (s: string): string => `ch${c}.${s}`;
  /** Channel I's spec id `n`, or channel II's 27 on. */
  const id = (n: number): string => `c${String(c === 1 ? n : n + 27).padStart(2, '0')}`;
  const lead = c === 1;
  const N = c === 1 ? 'I' : 'II';
  return {
    blocks: [
      {
        id: b('vco'),
        name: `Channel ${N} VCO`,
        module: 'osc',
        ...(lead ? { meter: 'osc1' as const } : {}),
        controls: [
          k('tone'),
          k('feet'),
          ...(c === 2 ? ['tune.detune'] : []),
          k('square'),
          k('saw'),
          k('pw'),
        ],
        description:
          'A sawtooth VCO whose wave shape converter gives a square (with variable pulse width), the sawtooth and a sine. FEET sets the range; the TONE SELECTOR plays a preset or the panel.',
        specs: [
          { label: 'Waveforms', value: 'Square (variable width, PWM), sawtooth, sine' },
          { label: 'Feet', value: "16', 8', 5 1/3', 4', 2 2/3', 2'" },
          ...(c === 2 ? [{ label: 'Detune', value: '±1 semitone' }] : []),
        ],
      },
      {
        id: b('pwm'),
        name: `Channel ${N} PWM oscillator`,
        module: 'lfo',
        ...(lead ? { meter: 'lfo' as const } : {}),
        controls: [k('speed'), k('pwm')],
        description: 'The channel’s own modulator, sweeping the square’s pulse width.',
      },
      {
        id: b('noise'),
        name: `Channel ${N} noise`,
        module: 'mixer',
        symbol: 'noise',
        controls: [k('noise')],
        description: 'White noise into the channel’s mix.',
      },
      {
        id: b('mix'),
        name: `Channel ${N} VCO mix`,
        module: 'mixer',
        passes: true,
        description:
          'The square and sawtooth, each switched on or off, and the noise, into the filters.',
      },
      {
        id: b('vcf'),
        name: `Channel ${N} VCF`,
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
          'A high-pass then a low-pass filter, each with its own resonance, their cutoffs moved together by the filter envelope, velocity and the keys.',
        specs: [{ label: 'Stages', value: 'High-pass, then low-pass' }],
      },
      {
        id: b('fenv'),
        name: `Channel ${N} filter envelope`,
        module: 'env',
        ...(lead ? { meter: 'env1' as const } : {}),
        controls: [k('il'), k('al'), k('fa'), k('fd'), k('fr')],
        description:
          'Starts at IL below the set cutoffs, rises over A to AL above them, decays over D to the set cutoffs and releases over R back to IL.',
        specs: ENV_SPECS,
      },
      {
        id: b('vca'),
        name: `Channel ${N} VCA`,
        module: 'amp',
        controls: [k('vcfLevel'), k('sine'), k('level'), k('initLevel')],
        description:
          'Mixes the filtered sound (VCF LEVEL) with the unfiltered sine (SINE), shaped by its ADSR. LEVEL sets the most it gives.',
      },
      {
        id: b('aenv'),
        name: `Channel ${N} VCA envelope`,
        module: 'env',
        ...(lead ? { meter: 'env2' as const } : {}),
        controls: [k('a'), k('d'), k('s'), k('r')],
        description: 'An ADSR for the channel’s VCA, raised by velocity.',
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
        when: SUB_ON,
        levels: [{ id: 'sub.vco', pow: 2 }],
      },
      {
        id: id(6),
        from: b('pwm'),
        to: b('vco'),
        signal: 'cv',
        label: 'pulse width',
        ...slider(c, ['pwm']),
      },
      {
        id: id(7),
        from: b('vco'),
        to: b('mix'),
        signal: 'audio',
        label: 'square',
        when: wave(c, 'square'),
      },
      {
        id: id(8),
        from: b('vco'),
        to: b('mix'),
        signal: 'audio',
        label: 'sawtooth',
        when: wave(c, 'saw'),
      },
      { id: id(9), from: b('noise'), to: b('mix'), signal: 'audio', ...slider(c, ['noise']) },
      { id: id(10), from: b('mix'), to: b('vcf'), signal: 'audio' },
      { id: id(11), from: 'kbd', to: b('fenv'), signal: 'gate' },
      {
        id: id(12),
        from: b('fenv'),
        to: b('vcf'),
        signal: 'cv',
        label: 'cutoff',
        ...slider(c, ['il', 'al']),
      },
      {
        id: id(13),
        from: 'kbd',
        to: b('vcf'),
        signal: 'cv',
        label: 'velocity',
        ...slider(c, ['initBrill']),
      },
      {
        id: id(15),
        from: 'subosc',
        to: b('vcf'),
        signal: 'cv',
        label: 'cutoff',
        when: SUB_ON,
        levels: ['sub.vcf'],
      },
      { id: id(17), from: 'kbd', to: b('vcf'), signal: 'cv', label: 'key tracking' },
      { id: id(20), from: b('vcf'), to: b('vca'), signal: 'audio', ...slider(c, ['vcfLevel']) },
      {
        id: id(21),
        from: b('vco'),
        to: b('vca'),
        signal: 'audio',
        label: 'sine',
        ...slider(c, ['sine']),
      },
      { id: id(22), from: 'kbd', to: b('aenv'), signal: 'gate' },
      {
        id: id(23),
        from: 'kbd',
        to: b('aenv'),
        signal: 'cv',
        label: 'velocity',
        ...slider(c, ['initLevel']),
      },
      {
        id: id(25),
        from: b('aenv'),
        to: b('vca'),
        signal: 'cv',
        label: 'loudness',
        ...slider(c, ['level']),
      },
      {
        id: id(26),
        from: 'subosc',
        to: b('vca'),
        signal: 'cv',
        label: 'loudness',
        when: SUB_ON,
        levels: ['sub.vca'],
      },
      {
        id: id(27),
        from: b('vca'),
        to: 'chmix',
        signal: 'audio',
        levels: [c === 1 ? { id: 'mix.mix', off: 10 } : 'mix.mix'],
      },
    ],
  };
}

const ch1 = channel(1);
const ch2 = channel(2);

export const routing: SynthRouting = {
  synth: 'cs-80',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Keyboard',
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
        'kbd.brillLow',
        'kbd.brillHigh',
        'kbd.levelLow',
        'kbd.levelHigh',
      ],
      description:
        'Hands each note to a voice, which plays both channels. Sets their pitch, with portamento or glissando, their gates and velocity; KEYBOARD CONTROL tilts brilliance and level across the keys.',
      specs: [
        { label: 'Keys', value: '61, C to C, velocity and polyphonic pressure' },
        { label: 'Polyphony', value: '8 notes × 2 channels' },
      ],
    },
    ...ch1.blocks,
    ...ch2.blocks,
    {
      id: 'chmix',
      name: 'Channel mix',
      module: 'mixer',
      controls: ['mix.mix'],
      passes: true,
      description:
        'Blends channel I and channel II of every note: channel I at the top, channel II at the bottom.',
    },
    {
      id: 'subosc',
      name: 'Sub oscillator',
      module: 'lfo',
      controls: ['sub.function', 'sub.speed', 'sub.vco', 'sub.vcf', 'sub.vca'],
      description:
        'One modulator for every voice, sent by its levers to the VCOs’ pitch, the filters’ cutoff and the VCAs’ level.',
      specs: [
        { label: 'Functions', value: 'Sine, sawtooth, inverted sawtooth, square, white noise' },
      ],
    },
    {
      id: 'ringmod',
      name: 'Ring modulator',
      module: 'fx',
      controls: ['ring.mod', 'ring.speed', 'ring.attack', 'ring.decay', 'ring.depth'],
      passes: true,
      description:
        'Sine-wave ring modulation of both channels and every note, with an attack and decay envelope on its speed. Off at zero MODULATION.',
    },
    {
      id: 'tremolo',
      name: 'Tremolo / chorus',
      module: 'fx',
      controls: ['trem.on', 'trem.tremolo', 'trem.chorus', 'trem.speed', 'trem.depth'],
      passes: true,
      description:
        'Swings the level and phase of the two sides: fast as TREMOLO or slow as CHORUS, like a rotary speaker in stereo.',
      specs: [{ label: 'Modes', value: 'Tremolo, chorus' }],
    },
    {
      id: 'out',
      name: 'Outputs',
      module: 'out',
      controls: ['out.volume'],
      description: 'Master volume to the left, right and general outputs and the headphones.',
      specs: [
        { label: 'Left, right, general', value: '1/4-inch, 600 Ω' },
        { label: 'Phones', value: '1/4-inch TRS, 250 mV' },
      ],
    },
  ],
  edges: [
    ...ch1.edges,
    ...ch2.edges,
    { id: 'c56', from: 'chmix', to: 'ringmod', signal: 'audio' },
    { id: 'c57', from: 'ringmod', to: 'tremolo', signal: 'audio' },
    { id: 'c58', from: 'tremolo', to: 'out', signal: 'audio', label: 'left', levels: VOLUME },
    { id: 'c59', from: 'tremolo', to: 'out', signal: 'audio', label: 'right', levels: VOLUME },
  ],
  jacks: {},
  omitted: {
    ribbon: 'The app has no ribbon controller; the definition draws it only.',
    pedal: 'The definition has no foot pedal: FOOT PEDAL SELECTOR changes nothing.',
    c02: 'The ribbon into channel I’s pitch: the app has no ribbon.',
    c05: 'Pressure vibrato on channel I: the app has no aftertouch.',
    c14: 'Pressure into channel I’s cutoff: the app has no aftertouch.',
    c16: 'Pressure-controlled sub oscillator on channel I’s cutoff: the app has no aftertouch.',
    c18: 'The wah pedal into channel I’s cutoff: the definition has no foot pedal.',
    c19: 'The wah pedal into channel I’s resonance: the definition has no foot pedal.',
    c24: 'Pressure into channel I’s VCA envelope: the app has no aftertouch.',
    c29: 'The ribbon into channel II’s pitch: the app has no ribbon.',
    c32: 'Pressure vibrato on channel II: the app has no aftertouch.',
    c41: 'Pressure into channel II’s cutoff: the app has no aftertouch.',
    c43: 'Pressure-controlled sub oscillator on channel II’s cutoff: the app has no aftertouch.',
    c45: 'The wah pedal into channel II’s cutoff: the definition has no foot pedal.',
    c46: 'The wah pedal into channel II’s resonance: the definition has no foot pedal.',
    c51: 'Pressure into channel II’s VCA envelope: the app has no aftertouch.',
    c55: 'Pressure on the sub oscillator’s speed: the app has no aftertouch.',
    c60: 'The expression pedal on the volume: the definition has no foot pedal.',
  },
};
