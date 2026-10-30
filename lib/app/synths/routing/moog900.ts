/**
 * The routing the Behringer System 15, 35 and 55 share: one block per 900-series module, and no edges, because nothing
 * is wired between the modules (their specs list no connections). Every path on the diagram is a cable, so it is
 * drawn from the patch: `layoutRouting()` places the modules the cables join and leaves the rest in the spare grid.
 *
 * Built from the definition rather than written out per synth, as the three cases are built from the same module
 * functions (`defs/moog900/modules.ts`): each module's faceplate area is its block, with the spec's module id
 * (`m921b_1`), and its controls and jacks are the ones under its id (`m921b_1.frequency`, `j.m921b_1.sine`). The
 * app's output panel (`appout`, jacks `j.out.l` and `j.out.r`) is not on the hardware, so the spec has no module for
 * it; its block keeps the area's id. What each kind of module is, says and carries is written below, from the spec.
 *
 * Only the CM1A has a `meter`: the engine reports the key being held as its gate on the 900 path. The engine's `env1`
 * and `env2` are its own two envelopes, which the 900 sound path does not use (the 911s are separate slots in
 * `moog-core.ts`), and its oscillator and LFO meters describe no 921, so a live 911 or 921 follows the output's level
 * (`routingActivity()`). Each module following its own reading needs the engine to report one per module.
 */
import type {
  RoutingBlock,
  RoutingMeter,
  RoutingSymbol,
  SynthDef,
  SynthRouting,
} from '@/lib/app/synths/contract';

interface Kind {
  /** The block's name; `#` is the module's number in the case. */
  name: string;
  description: string;
  specs?: RoutingBlock['specs'];
  /** Makes no signal of its own (`RoutingBlock.passes`). */
  passes?: true;
  symbol?: RoutingSymbol;
  meter?: RoutingMeter;
  /** The jacks that carry audio, by what follows the module's id (`sine` in `j.m921b_1.sine`). */
  audio?: RegExp;
}

const KINDS: Record<string, Kind> = {
  m914: {
    name: '914 Fixed Filter Bank',
    description:
      'Fourteen fixed filters side by side, each with its own level: a low-pass, twelve narrow band-passes and a high-pass. It shapes a sound’s tone like a graphic equaliser.',
    specs: [{ label: 'Bands', value: '125 Hz to 5.6 kHz, plus low-pass and high-pass' }],
    passes: true,
    audio: /^(in|out)_\d$/,
  },
  m923: {
    name: '923 Filters and Noise',
    description:
      'A gentle low-pass and high-pass filter, which in series make a band-pass, and white and pink noise outputs.',
    specs: [
      { label: 'Slope', value: '6 dB per octave' },
      { label: 'Range', value: '10 Hz to 10 kHz each' },
    ],
    audio: /^(lp_in|lp_out|hp_in|hp_out|white_\d|pink_\d)$/,
  },
  m904a: {
    name: '904A Low Pass Filter',
    description:
      'The Moog ladder filter: a steep low-pass whose cutoff follows its control inputs, with REGENERATION up to self-oscillation.',
    specs: [
      { label: 'Slope', value: '24 dB per octave' },
      { label: 'Control', value: 'Three summed inputs, 1 V per octave' },
    ],
    passes: true,
    audio: /^sig_(in|out)$/,
  },
  m904b: {
    name: '904B High Pass Filter',
    description: 'A steep high-pass filter whose cutoff follows its control inputs.',
    specs: [
      { label: 'Slope', value: '24 dB per octave' },
      { label: 'Control', value: 'Three summed inputs, 1 V per octave' },
    ],
    passes: true,
    audio: /^sig_(in|out)$/,
  },
  m902: {
    name: '902 Amplifier #',
    description:
      'A voltage-controlled amplifier: its control inputs set how much of the signal gets through, linearly or exponentially.',
    specs: [{ label: 'Outputs', value: 'Positive and negative' }],
    passes: true,
    audio: /^(sig_in_pos|sig_in_neg|out_pos|out_neg)$/,
  },
  m911: {
    name: '911 Envelope #',
    description:
      'An envelope: fired and held by an S-trigger, it rises over T1, falls over T2 to E SUS, and falls over T3 once released.',
    specs: [{ label: 'Stages', value: 'T1 attack, T2 initial decay, E SUS, T3 final decay' }],
  },
  m911a: {
    name: '911A Trigger Delay',
    description:
      'Two trigger delays, used apart, side by side or one after the other: a trigger in comes out later.',
    specs: [{ label: 'Delay', value: '2 ms to 10 s' }],
    passes: true,
    symbol: 'util',
  },
  m921a: {
    name: '921A Driver #',
    description:
      'The controller for a bank of 921B oscillators. It makes no sound: it adds its FREQUENCY and WIDTH knobs to its inputs and sends the pitch and pulse width down the link jacks.',
    specs: [{ label: 'Range', value: '±6 octaves or ±12 semitones' }],
    symbol: 'pitch',
  },
  m921b: {
    name: '921B Oscillator #',
    description:
      'An oscillator played from a 921A over its link jacks, with sine, triangle, sawtooth and rectangular outputs.',
    specs: [
      { label: 'Frequency', value: '1 Hz to 40 kHz' },
      { label: 'Waveforms', value: 'Sine, triangle, sawtooth, rectangular' },
    ],
    audio: /^(sine|triangle|sawtooth|rectangular)$/,
  },
  m921: {
    name: '921 Oscillator',
    description:
      'A stand-alone oscillator that doubles as an LFO, with a waveform reset from a trigger and an AUX output.',
    specs: [
      { label: 'Frequency', value: '0.01 to 800 Hz sub-audio, 1 Hz to 80 kHz audio' },
      { label: 'Waveforms', value: 'Sine, triangle, sawtooth, rectangular' },
    ],
    symbol: 'osc',
    audio: /^(sine|triangle|sawtooth|rectangular|aux_\d)$/,
  },
  m960: {
    name: '960 Sequencer',
    description:
      'An eight-stage sequencer with its own clock: three rows of knobs, so each stage sends three voltages.',
    specs: [{ label: 'Stages', value: '8, each play, skip or stop' }],
  },
  cm1a: {
    name: 'CM1A MIDI to CV',
    description:
      'The keyboard: MIDI in, pitch voltages and triggers out. Patch its CV to an oscillator to play it.',
    specs: [{ label: 'Notes', value: 'C0 to C9' }],
    symbol: 'midi',
    meter: 'gate',
  },
  cp3ao: {
    name: 'CP3A-O Controller #',
    description:
      'Control lines for the oscillators: three switched inputs and an attenuated EXT INPUT, summed to three outputs.',
    passes: true,
  },
  m992: {
    name: '992 Control Voltages',
    description:
      'Control lines for the filters: three switched inputs and an EXT INPUT through an inverting attenuator, summed to three outputs.',
    passes: true,
  },
  cp3am: {
    name: 'CP3A-M Mixer #',
    description:
      'A four-channel mixer with a master gain and positive and negative outputs, plus two multiples. It mixes audio or control voltages.',
    specs: [{ label: 'Channels', value: '4' }],
    passes: true,
    audio: /^(in\d|out_pos_\d|out_neg_\d|mult_[ab](_out_\d)?)$/,
  },
  m995: {
    name: '995 Attenuators #',
    description: 'Three passive attenuators, to turn a signal down.',
    passes: true,
  },
  cp35: {
    name: 'CP35 Attenuators',
    description:
      'Four attenuators whose inputs are half-normalled (IN 1 feeds all four until you patch the ones below it), steady +6 V and −6 V, and two multiples.',
    symbol: 'util',
    audio: /^mult_[ab](_out_\d)?$/,
  },
  m903a: {
    name: '903A Noise',
    description: 'White and pink noise.',
    symbol: 'noise',
    audio: /^(white|pink)_\d$/,
  },
  m961: {
    name: '961 Interface',
    description:
      'Turns one kind of trigger into another: audio into a V-trigger, S-triggers into V-triggers and back, with timed inputs.',
    passes: true,
    symbol: 'util',
    audio: /^audio_in$/,
  },
  m962: {
    name: '962 Sequential Switch',
    description:
      'A three-way switch: each trigger at SHIFT passes the next of its three inputs to the output.',
    passes: true,
    symbol: 'util',
    audio: /^(sig_\d|out_\d)$/,
  },
  appout: {
    name: 'Output',
    description:
      'What you hear. Not on the hardware, which has no master output: it is the far end of the cable you would patch to a mixer.',
    passes: true,
    audio: /^[lr]$/,
  },
};

/** The output panel's jacks are `j.out.*`, under no module's id. */
const OUT = 'appout';
const jackModule = (id: string) => {
  const m = id.split('.')[1];
  return m === 'out' ? OUT : m;
};

/**
 * The routing of a System 15, 35 or 55: one block per module of `def`, its cables the only paths. A module this file
 * does not know is left out rather than thrown on, since this runs as the synth page renders: `routingProblems` then
 * names its controls and jacks as on no block, which fails the routing test.
 */
export function moog900Routing(def: SynthDef): SynthRouting {
  const areas = def.areas ?? [];
  const blocks = areas.flatMap((a): RoutingBlock[] => {
    const kind = a.id.replace(/_\d+$/, '');
    const k = KINDS[kind];
    if (!k) return [];
    const n = a.id.slice(kind.length + 1);
    const block: RoutingBlock = {
      id: a.id,
      name: k.name.replace('#', n).trim(),
      module: a.module,
      description: k.description,
      controls: def.controls.filter((c) => c.id.split('.')[0] === a.id).map((c) => c.id),
    };
    if (k.specs) block.specs = k.specs;
    if (k.passes) block.passes = true;
    if (k.symbol) block.symbol = k.symbol;
    if (k.meter) block.meter = k.meter;
    return [block];
  });
  const placed = new Set(blocks.map((b) => b.id));
  const audio = (id: string) => {
    const k = KINDS[jackModule(id).replace(/_\d+$/, '')];
    return !!k?.audio?.test(id.split('.').slice(2).join('.'));
  };
  return {
    synth: def.id,
    blocks,
    edges: [],
    out: OUT,
    jacks: Object.fromEntries(
      def.jacks.filter((j) => placed.has(jackModule(j.id))).map((j) => [j.id, jackModule(j.id)])
    ),
    audioJacks: def.jacks
      .filter((j) => placed.has(jackModule(j.id)) && audio(j.id))
      .map((j) => j.id),
  };
}
