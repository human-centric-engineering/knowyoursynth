/**
 * Super Gemini signal routing, projected from its spec (`.context/app/synth-data/super-gemini/super-gemini.synth.json`,
 * 0.13.0): block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/super-gemini.ts`). One voice of each layer is drawn, the upper and the lower, the same in every way, so one
 * builder draws both (`c04`–`c51` upper, `c54`–`c101` lower, as the spec numbers them), with the keyboard, the bender
 * and LFO 2 they share. The meters follow the engine's first voice, which is the upper layer unless KEYBOARD is SINGLE
 * with LAYER on LOWER, so only the upper layer's blocks carry one.
 *
 * Where the definition says more than the spec, it decides. KEYBOARD and LAYER pick which layers sound, so each layer's
 * way out (`c51`, `c101`) holds only while it plays. MIX is an equal-power crossfade inside each layer's oscillators in
 * `toEngine()`, so it scales DDS 1's way into the mixer (`c26`) and DDS 2's and the sub's (`c27`, `c28`) rather than the
 * mixer's way on (`c29`). DRIVE never silences the low-pass (`c30`), and SEND sets the echoes, not the dry sound
 * (`c50`). DDS 2 at LFO range ignores the keys (`c10`), and SYNC works only off LFO range, so CROSS MOD runs DDS 2 into
 * DDS 1 unless both hold (`c21`–`c23`). PW/WAVE with LFO 1 or ENV 1 moves DDS 2's pulse width only, so the wave-morph
 * connections are left out. LFO 1's RESET and ONCE both restart it on each key (`c48`). Velocity reaches the VCA only on
 * ENV 2 (`c47`). The DDS modulator's depths and LFO 2's pitch depth are squared, as `toEngine()` reads them; ENV LEVEL
 * and MASTER VOLUME are curved as it curves them.
 *
 * LFO 2 reaches the layers DEST names, at full depth with its trigger ON and otherwise by the bender's push, the app's
 * mod wheel. A level cannot tell AT from TRIG, so on AT its edges light without the push while the engine waits for it.
 *
 * Where it says less, it decides too. It has one arpeggiator for both layers, drawn as the upper one, and no ribbon,
 * pedals, aftertouch or left-right bend, so those modules and connections are left out, as is LFO 1's HF summing into
 * the oscillators (its HF modes are a fast LFO here).
 */
import type {
  RoutingBlock,
  RoutingEdge,
  RoutingLevel,
  RoutingWhen,
  SynthRouting,
} from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

type Side = 'up' | 'lo';

const BOTH_LAYERS: RoutingWhen = { id: 'kbd.mode', in: ['dual', 'split'] };
const AUDIO_RANGE = ['32', '16', '8', '4', '2'];
const ARP_MODES = ['up', 'down', 'updown', 'random'];
/** LFO 2's depth: full with its trigger ON, else the push (the mod wheel). */
const LFO2_DEPTH: RoutingLevel = { sum: [WHEEL, { id: 'lfo2.trig', off: 'trig' }] };
const PUSH: RoutingWhen = { id: 'lfo2.trig', in: ['trig', 'at'] };
const VOLUME: RoutingLevel[] = [{ id: 'out.volume', pow: 1.7 }];
const ENV_TIMES = { label: 'Times', value: '1 ms to 10 s' };

/** One layer's blocks and edges. */
function layer(s: Side): { blocks: RoutingBlock[]; edges: RoutingEdge[] } {
  const b = (x: string): string => `${s}_${x}`;
  const k = (x: string): string => `${s}.${x}`;
  /** The upper layer's spec id `n`, or the lower layer's 50 on. */
  const id = (n: number): string => `c${String(s === 'up' ? n : n + 50).padStart(2, '0')}`;
  const lead = s === 'up';
  const L = s === 'up' ? 'Upper' : 'Lower';
  const pick = (ctl: string, values: string[]): RoutingWhen => ({ id: k(ctl), in: values });
  const lfo2On: RoutingWhen = {
    id: 'perf.modLayer',
    in: ['both', s === 'up' ? 'upper' : 'lower'],
  };
  const dds2Audio = pick('dds2Range', AUDIO_RANGE);
  const syncOn: RoutingWhen = { all: [{ id: k('dds2Mode'), eq: 'sync' }, dds2Audio] };
  return {
    blocks: [
      {
        id: b('dds1'),
        name: `${L} DDS 1`,
        module: 'osc',
        ...(lead ? { meter: 'osc1' as const } : {}),
        controls: [
          k('dds1Wave'),
          k('dds1Range'),
          k('super'),
          k('pwDetune'),
          k('drift'),
          k('xmod'),
          k('modLfo'),
          k('modEnv'),
          k('modDest'),
        ],
        description:
          'The super-wave core: a centre oscillator and its detuned sisters, SUPER on, half or off. PW/WAVE morphs it to the next wave along.',
        specs: [
          {
            label: 'Waveforms',
            value: 'Sine, sawtooth, square, triangle, noise, alternative waves',
          },
          { label: 'Range', value: "64' to 2'" },
        ],
      },
      {
        id: b('dds2'),
        name: `${L} DDS 2`,
        module: 'osc',
        ...(lead ? { meter: 'osc4' as const } : {}),
        controls: [
          k('dds2Wave'),
          k('dds2Range'),
          k('dds2Tune'),
          k('dds2Mode'),
          k('pwDetune'),
          k('pwWave'),
          k('pwSrc'),
        ],
        description:
          'A second oscillator that plays beside DDS 1, ring-modulates it (RING) or syncs to it (SYNC). At LFO range it leaves the keys and becomes a modulator, and the sub oscillator takes its place.',
        specs: [
          { label: 'Waveforms', value: 'Sine, sawtooth, square, triangle, noise, pulse' },
          { label: 'Range', value: "32' to 2', or LFO (0.1 to 100 Hz)" },
          { label: 'Tune', value: '±7 semitones' },
          { label: 'Modes', value: 'NORM, RING, SYNC' },
        ],
      },
      {
        id: b('sub'),
        name: `${L} sub oscillator`,
        module: 'osc',
        description:
          'A square (RING) or sine (SYNC) an octave below DDS 1, in DDS 2’s place while DDS 2 is at LFO range.',
        specs: [{ label: 'Waveforms', value: 'Square, sine' }],
      },
      {
        id: b('mix'),
        name: `${L} mixer`,
        module: 'mixer',
        controls: [k('mix')],
        passes: true,
        description: 'MIX balances DDS 1 against DDS 2, its ring modulation or the sub oscillator.',
      },
      {
        id: b('hpf'),
        name: `${L} high-pass filter`,
        module: 'filter',
        controls: [k('hpf')],
        description: 'A gentle analogue high-pass before the low-pass.',
        specs: [{ label: 'Slope', value: '6 dB per octave (1 pole)' }],
      },
      {
        id: b('lpf'),
        name: `${L} low-pass filter`,
        module: 'filter',
        controls: [
          k('lpf'),
          k('res'),
          k('drive'),
          k('vcfKey'),
          k('vcfSrc'),
          k('vcfEnv'),
          k('vcfLfo'),
          k('vcfDds2'),
        ],
        description:
          'A resonant analogue low-pass that self-oscillates, with drive, swept by the envelopes, LFO 1, DDS 2 and the keys.',
        specs: [
          { label: 'Slope', value: '24 dB per octave (4 poles, SSI)' },
          { label: 'Drive', value: 'Off, 1, 2' },
          { label: 'Key tracking', value: 'Off, half, full' },
        ],
      },
      {
        id: b('vca'),
        name: `${L} VCA`,
        module: 'amp',
        controls: [k('vcaMode'), k('vcaEnv'), k('vcaLfo'), k('vcaDds2'), k('dyn')],
        description:
          'The layer’s amplifier, on ENV 2 or one of two fixed envelopes, with tremolo from LFO 1 and DDS 2. DYNAMICS adds velocity.',
      },
      {
        id: b('env1'),
        name: `${L} ENV 1`,
        module: 'env',
        // Only the upper layer's envelopes are the voice's own, so only they light. ATTACK HOLD is the wait before
        // the attack, DECAY HOLD the stay at the peak.
        ...(lead
          ? {
              meter: 'env1' as const,
              stages: {
                delay: k('e1ah'),
                attack: k('e1a'),
                hold: k('e1dh'),
                decay: k('e1d'),
                sustain: k('e1s'),
                release: k('e1r'),
              },
            }
          : {}),
        controls: [
          k('e1ah'),
          k('e1a'),
          k('e1dh'),
          k('e1d'),
          k('e1s'),
          k('e1r'),
          k('env1Mode'),
          k('env1Key'),
        ],
        description:
          'An envelope with attack and decay holds, normal, inverted or looping, for the filter, the oscillators’ pitch and DDS 2’s pulse width.',
        specs: [
          { label: 'Stages', value: 'Attack hold, attack, decay hold, decay, sustain, release' },
          ENV_TIMES,
          { label: 'Modes', value: 'Normal, inverted, loop' },
        ],
      },
      {
        id: b('env2'),
        name: `${L} ENV 2`,
        module: 'env',
        ...(lead
          ? {
              meter: 'env2' as const,
              stages: {
                attack: k('e2a'),
                hold: k('e2dh'),
                decay: k('e2d'),
                sustain: k('e2s'),
                release: k('e2r'),
              },
            }
          : {}),
        controls: [k('e2a'), k('e2dh'), k('e2d'), k('e2s'), k('e2r')],
        description: 'An envelope with a decay hold, for the VCA and the filter.',
        specs: [
          { label: 'Stages', value: 'Attack, decay hold, decay, sustain, release' },
          ENV_TIMES,
        ],
      },
      {
        id: b('lfo1'),
        name: `${L} LFO 1`,
        module: 'lfo',
        ...(lead ? { meter: 'lfo' as const } : {}),
        controls: [k('lfoRate'), k('lfoDelay'), k('lfoWave'), k('lfoMode')],
        description:
          'The layer’s LFO, free-running or restarted by each key, with a delay; its HF waves run at audio rate.',
        specs: [
          {
            label: 'Waveforms',
            value: 'Triangle, reverse sawtooth, sample and hold, square, HF, HF TRK',
          },
          { label: 'HF range', value: '20 Hz to 20 kHz' },
          { label: 'Modes', value: 'Free, once, reset' },
        ],
      },
      {
        id: b('chorus'),
        name: `${L} chorus`,
        module: 'fx',
        controls: ['chorus.i', 'chorus.ii'],
        passes: true,
        description: 'Chorus I, II or both, or bypassed with neither on.',
        specs: [{ label: 'Modes', value: 'I, II, I + II' }],
      },
      {
        id: b('delay'),
        name: `${L} delay`,
        module: 'fx',
        controls: [k('send'), 'dly.time', 'dly.feedback'],
        passes: true,
        description: 'A delay the layer reaches by its SEND; the dry sound passes straight on.',
        specs: [
          { label: 'Time', value: '1 ms to 1 s' },
          { label: 'Feedback', value: 'Up to infinite' },
        ],
      },
    ],
    edges: [
      { id: id(4), from: 'kbd', to: b('dds1'), signal: 'cv', label: 'pitch' },
      {
        id: id(5),
        from: b('lfo1'),
        to: b('dds1'),
        signal: 'cv',
        label: 'pitch',
        when: pick('modDest', ['dds1', 'both']),
        levels: [{ id: k('modLfo'), pow: 2 }],
      },
      {
        id: id(6),
        from: b('env1'),
        to: b('dds1'),
        signal: 'cv',
        label: 'pitch',
        when: pick('modDest', ['dds1', 'both']),
        levels: [{ id: k('modEnv'), pow: 2 }],
      },
      {
        id: id(8),
        from: 'lfo2',
        to: b('dds1'),
        signal: 'cv',
        label: 'pitch',
        when: { all: [lfo2On, { id: 'perf.oscDest', in: ['dds1', 'both'] }] },
        levels: [{ id: 'lfo2.dds', pow: 2 }, LFO2_DEPTH],
      },
      {
        id: id(10),
        from: 'kbd',
        to: b('dds2'),
        signal: 'cv',
        label: 'pitch',
        when: dds2Audio,
      },
      {
        id: id(11),
        from: b('lfo1'),
        to: b('dds2'),
        signal: 'cv',
        label: 'pitch',
        when: pick('modDest', ['dds2', 'both']),
        levels: [{ id: k('modLfo'), pow: 2 }],
      },
      {
        id: id(12),
        from: b('env1'),
        to: b('dds2'),
        signal: 'cv',
        label: 'pitch',
        when: pick('modDest', ['dds2', 'both']),
        levels: [{ id: k('modEnv'), pow: 2 }],
      },
      {
        id: id(14),
        from: 'lfo2',
        to: b('dds2'),
        signal: 'cv',
        label: 'pitch',
        when: { all: [lfo2On, { id: 'perf.oscDest', in: ['dds2', 'both'] }] },
        levels: [{ id: 'lfo2.dds', pow: 2 }, LFO2_DEPTH],
      },
      { id: id(16), from: 'kbd', to: b('sub'), signal: 'cv', label: 'pitch' },
      {
        id: id(17),
        from: b('lfo1'),
        to: b('dds2'),
        signal: 'cv',
        label: 'pulse width',
        when: { id: k('pwSrc'), eq: 'lfo1' },
        levels: [k('pwWave')],
      },
      {
        id: id(18),
        from: b('env1'),
        to: b('dds2'),
        signal: 'cv',
        label: 'pulse width',
        when: { id: k('pwSrc'), eq: 'env1' },
        levels: [k('pwWave')],
      },
      {
        id: id(21),
        from: b('dds2'),
        to: b('dds1'),
        signal: 'audio',
        label: 'cross mod',
        when: {
          any: [pick('dds2Mode', ['ring', 'norm']), { id: k('dds2Range'), eq: 'lfo' }],
        },
        levels: [{ id: k('xmod'), pow: 2 }],
      },
      {
        id: id(22),
        from: b('dds1'),
        to: b('dds2'),
        signal: 'audio',
        label: 'cross mod',
        when: syncOn,
        levels: [{ id: k('xmod'), pow: 2 }],
      },
      { id: id(23), from: b('dds1'), to: b('dds2'), signal: 'audio', label: 'sync', when: syncOn },
      {
        id: id(26),
        from: b('dds1'),
        to: b('mix'),
        signal: 'audio',
        levels: [{ id: k('mix'), off: 10 }],
      },
      {
        id: id(27),
        from: b('dds2'),
        to: b('mix'),
        signal: 'audio',
        when: dds2Audio,
        levels: [k('mix')],
      },
      {
        id: id(28),
        from: b('sub'),
        to: b('mix'),
        signal: 'audio',
        when: {
          all: [{ id: k('dds2Range'), eq: 'lfo' }, pick('dds2Mode', ['ring', 'sync'])],
        },
        levels: [k('mix')],
      },
      { id: id(29), from: b('mix'), to: b('hpf'), signal: 'audio' },
      { id: id(30), from: b('hpf'), to: b('lpf'), signal: 'audio' },
      { id: id(31), from: 'kbd', to: b('env1'), signal: 'gate' },
      {
        id: id(32),
        from: b('env1'),
        to: b('lpf'),
        signal: 'cv',
        label: 'cutoff',
        when: pick('vcfSrc', ['env1', 'both']),
        levels: [k('vcfEnv')],
      },
      { id: id(33), from: 'kbd', to: b('env2'), signal: 'gate' },
      {
        id: id(34),
        from: b('env2'),
        to: b('lpf'),
        signal: 'cv',
        label: 'cutoff',
        when: pick('vcfSrc', ['env2', 'both']),
        levels: [k('vcfEnv')],
      },
      {
        id: id(35),
        from: b('lfo1'),
        to: b('lpf'),
        signal: 'cv',
        label: 'cutoff',
        levels: [k('vcfLfo')],
      },
      {
        id: id(36),
        from: b('dds2'),
        to: b('lpf'),
        signal: 'cv',
        label: 'cutoff',
        levels: [k('vcfDds2')],
      },
      {
        id: id(37),
        from: 'kbd',
        to: b('lpf'),
        signal: 'cv',
        label: 'key tracking',
        when: pick('vcfKey', ['on', 'half']),
      },
      {
        id: id(39),
        from: 'lfo2',
        to: b('lpf'),
        signal: 'cv',
        label: 'cutoff',
        when: lfo2On,
        levels: ['lfo2.vcf', LFO2_DEPTH],
      },
      {
        id: id(40),
        from: 'kbd',
        to: b('lpf'),
        signal: 'cv',
        label: 'velocity',
        when: pick('dyn', ['on', 'half']),
      },
      { id: id(41), from: b('lpf'), to: b('vca'), signal: 'audio' },
      {
        id: id(42),
        from: b('env2'),
        to: b('vca'),
        signal: 'cv',
        label: 'loudness',
        when: { id: k('vcaMode'), eq: 'env2' },
        levels: [{ id: k('vcaEnv'), pow: 1.7 }],
      },
      {
        id: id(43),
        from: 'kbd',
        to: b('vca'),
        signal: 'gate',
        label: 'fixed envelope',
        when: pick('vcaMode', ['fixed1', 'fixed2']),
        levels: [{ id: k('vcaEnv'), pow: 1.7 }],
      },
      {
        id: id(44),
        from: b('lfo1'),
        to: b('vca'),
        signal: 'cv',
        label: 'tremolo',
        levels: [k('vcaLfo')],
      },
      {
        id: id(45),
        from: b('dds2'),
        to: b('vca'),
        signal: 'cv',
        label: 'amplitude',
        levels: [k('vcaDds2')],
      },
      {
        id: id(46),
        from: 'lfo2',
        to: b('vca'),
        signal: 'cv',
        label: 'tremolo',
        when: lfo2On,
        levels: ['lfo2.vca', LFO2_DEPTH],
      },
      {
        id: id(47),
        from: 'kbd',
        to: b('vca'),
        signal: 'cv',
        label: 'velocity',
        when: { all: [pick('dyn', ['on', 'half']), { id: k('vcaMode'), eq: 'env2' }] },
      },
      {
        id: id(48),
        from: 'kbd',
        to: b('lfo1'),
        signal: 'gate',
        label: 'reset',
        when: pick('lfoMode', ['reset', 'once']),
      },
      { id: id(49), from: b('vca'), to: b('chorus'), signal: 'audio' },
      { id: id(50), from: b('chorus'), to: b('delay'), signal: 'audio' },
      {
        id: id(51),
        from: b('delay'),
        to: 'out',
        signal: 'audio',
        label: s === 'up' ? 'upper' : 'lower',
        when: { any: [BOTH_LAYERS, { id: 'layer.select', eq: s === 'up' ? 'upper' : 'lower' }] },
        levels: VOLUME,
      },
    ],
  };
}

const up = layer('up');
const lo = layer('lo');

export const routing: SynthRouting = {
  synth: 'super-gemini',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Keyboard and layers',
      module: 'mode',
      symbol: 'midi',
      meter: 'gate',
      controls: [
        'kbd.mode',
        'layer.select',
        'voice.mode',
        'voice.unison',
        'voice.binaural',
        'hold.upper',
        'hold.lower',
        'perf.octave',
        'perf.porta',
        'perf.portaLayer',
        'perf.detune',
        'perf.lowerDetune',
        'kbd.fine',
      ],
      description:
        'Plays one layer (SINGLE, the one LAYER picks), both on every key (DUAL) or one each side of the split (SPLIT), and hands the notes to the voices, with portamento and octave on the layers chosen.',
      specs: [
        { label: 'Keys', value: '61, velocity, polyphonic aftertouch' },
        { label: 'Voices', value: '20 (10 binaural)' },
        { label: 'Layers', value: '2' },
      ],
    },
    {
      id: 'up_arp',
      name: 'Arpeggiator',
      module: 'mode',
      controls: ['arp.on', 'arp.mode', 'arp.range', 'arp.div', 'arp.tempo'],
      description:
        'Plays the held keys one at a time, up, down, both or at random, over one to four octaves.',
      specs: [
        { label: 'Modes', value: 'Up, down, up and down, random' },
        { label: 'Range', value: '1 to 4 octaves' },
      ],
    },
    {
      id: 'bender',
      name: 'Bender',
      module: 'mod',
      controls: ['perf.oscDest', 'perf.modLayer'],
      description:
        'Pushed up, it brings in LFO 2 and speeds it up, on the oscillators DEST picks and the layers it names. Here the push is the mod wheel.',
    },
    {
      id: 'lfo2',
      name: 'LFO 2',
      module: 'lfo',
      controls: [
        'lfo2.wave',
        'lfo2.rate',
        'lfo2.delay',
        'lfo2.trig',
        'lfo2.rateMod',
        'lfo2.dds',
        'lfo2.vcf',
        'lfo2.vca',
      ],
      description:
        'The performance LFO, brought in by the bender’s push or always on, to the oscillators’ pitch, the cutoff and the VCA of either layer or both.',
      specs: [
        {
          label: 'Waveforms',
          value: 'Sine, reverse sawtooth, sample and hold, square, sawtooth, sample and glide',
        },
      ],
    },
    ...up.blocks,
    ...lo.blocks,
    {
      id: 'out',
      name: 'Outputs',
      module: 'out',
      controls: ['out.volume'],
      description:
        'MASTER VOLUME to the mix, upper and lower outputs and the two headphone sockets.',
      specs: [
        { label: 'Outputs', value: 'Mix, upper and lower, left and right, 1/4-inch unbalanced' },
        { label: 'Phones', value: '1/4-inch and 3.5 mm' },
      ],
    },
  ],
  edges: [
    {
      id: 'c02',
      from: 'up_arp',
      to: 'kbd',
      signal: 'cv',
      label: 'notes',
      when: {
        all: [
          { id: 'arp.on', eq: true },
          { id: 'arp.mode', in: ARP_MODES },
        ],
      },
    },
    ...up.edges,
    ...lo.edges,
    {
      id: 'c102',
      from: 'bender',
      to: 'lfo2',
      signal: 'cv',
      label: 'trigger',
      when: PUSH,
      levels: [WHEEL],
    },
    {
      id: 'c104',
      from: 'bender',
      to: 'lfo2',
      signal: 'cv',
      label: 'rate',
      when: PUSH,
      levels: ['lfo2.rateMod', WHEEL],
    },
  ],
  jacks: {},
  omitted: {
    ribbon: 'The definition has no ribbon: it is drawn and explained only.',
    pedals: 'The definition has no pedal inputs.',
    lo_arp: 'The definition has one arpeggiator for both layers, drawn as the upper one.',
    c01: 'The volume pedal: the definition has no pedal inputs.',
    c03: 'Delay freeze on the upper delay: the definition has no footswitches.',
    c07: 'The bender’s left-right bend to upper DDS 1: not modelled.',
    c09: 'The ribbon to upper DDS 1: the definition has no ribbon.',
    c13: 'The bender’s left-right bend to upper DDS 2: not modelled.',
    c15: 'The ribbon to upper DDS 2: the definition has no ribbon.',
    c19: 'LFO 1 morphing upper DDS 1’s wave: the definition morphs it only by hand.',
    c20: 'ENV 1 morphing upper DDS 1’s wave: the definition morphs it only by hand.',
    c24: 'Upper LFO 1 at HF summed into DDS 1: the definition’s HF modes are a fast LFO only.',
    c25: 'Upper LFO 1 at HF summed into DDS 2: the definition’s HF modes are a fast LFO only.',
    c38: 'The bender’s left-right bend to the upper cutoff: not modelled.',
    c52: 'The lower arpeggiator: the definition has one arpeggiator for both layers.',
    c53: 'Delay freeze on the lower delay: the definition has no footswitches.',
    c57: 'The bender’s left-right bend to lower DDS 1: not modelled.',
    c59: 'The ribbon to lower DDS 1: the definition has no ribbon.',
    c63: 'The bender’s left-right bend to lower DDS 2: not modelled.',
    c65: 'The ribbon to lower DDS 2: the definition has no ribbon.',
    c69: 'LFO 1 morphing lower DDS 1’s wave: the definition morphs it only by hand.',
    c70: 'ENV 1 morphing lower DDS 1’s wave: the definition morphs it only by hand.',
    c74: 'Lower LFO 1 at HF summed into DDS 1: the definition’s HF modes are a fast LFO only.',
    c75: 'Lower LFO 1 at HF summed into DDS 2: the definition’s HF modes are a fast LFO only.',
    c88: 'The bender’s left-right bend to the lower cutoff: not modelled.',
    c103: 'Aftertouch triggering LFO 2: the app has no aftertouch.',
  },
};
