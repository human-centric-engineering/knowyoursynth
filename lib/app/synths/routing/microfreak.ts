/**
 * Arturia MicroFreak signal routing, projected from its spec (`.context/app/synth-data/microfreak/microfreak.synth.json`,
 * 0.13.0): block and edge ids are the spec's module and connection ids; switches, levels and controls are the
 * definition's (`defs/microfreak.ts`). The MicroFreak has no patch points on its panel, so the routing places no jacks.
 *
 * The voice: the keyboard or the arpeggiator gives notes to the voice assignment (`c001`–`c003`, `c008`), whose pitch
 * glides to the digital oscillator (`c017`, `c018`), through the analog filter and the VCA to the output (`c020`–`c022`).
 * The envelope sweeps the cutoff at Filter Amt (`c028`) and, with Amp Mod lit, opens the VCA; otherwise the key gate does
 * (`c026`, `c027`). The matrix's fixed columns are edges straight from each source to its destination, scaled by the
 * point (`c031`–`c053`); the Assign columns pass through the matrix block (`c035`, `c039`, `c044`, `c049`, `c054`) and on
 * to whichever destination their button picks (`c057`–`c090`). The keyboard's pressure is its velocity here, so Press
 * comes from the keyboard block.
 */
import type { RoutingEdge, RoutingLevel, SynthRouting } from '@/lib/app/synths/contract';

const SOURCES = ['cycenv', 'env', 'lfo', 'press', 'key'] as const;
type Source = (typeof SOURCES)[number];
/** The block each matrix source comes from. */
const FROM: Record<Source, string> = {
  cycenv: 'cyc',
  env: 'env',
  lfo: 'lfo',
  press: 'kbd',
  key: 'voice',
};
/** A matrix point as a level: nothing at 0, either way from it. */
const point = (s: Source, d: string): RoutingLevel => ({ id: `mx.${s}.${d}`, off: 0 });
/** The cycling envelope's points are scaled by its Amount too. */
const pointLevels = (s: Source, d: string): RoutingLevel[] =>
  s === 'cycenv' ? [point(s, d), 'cyc.amount'] : [point(s, d)];

/** The spec's fixed-column connections: source, destination, its id in order from `c031`. */
const FIXED: [string, Source, string, string, string][] = [
  ['c031', 'cycenv', 'pitch', 'osc', 'pitch'],
  ['c032', 'cycenv', 'wave', 'osc', 'Wave'],
  ['c033', 'cycenv', 'timbre', 'osc', 'Timbre'],
  ['c034', 'cycenv', 'cutoff', 'vcf', 'cutoff'],
  ['c036', 'env', 'pitch', 'osc', 'pitch'],
  ['c037', 'env', 'wave', 'osc', 'Wave'],
  ['c038', 'env', 'timbre', 'osc', 'Timbre'],
  ['c040', 'lfo', 'pitch', 'osc', 'pitch'],
  ['c041', 'lfo', 'wave', 'osc', 'Wave'],
  ['c042', 'lfo', 'timbre', 'osc', 'Timbre'],
  ['c043', 'lfo', 'cutoff', 'vcf', 'cutoff'],
  ['c045', 'press', 'pitch', 'osc', 'pitch'],
  ['c046', 'press', 'wave', 'osc', 'Wave'],
  ['c047', 'press', 'timbre', 'osc', 'Timbre'],
  ['c048', 'press', 'cutoff', 'vcf', 'cutoff'],
  ['c050', 'key', 'pitch', 'osc', 'pitch'],
  ['c051', 'key', 'wave', 'osc', 'Wave'],
  ['c052', 'key', 'timbre', 'osc', 'Timbre'],
  ['c053', 'key', 'cutoff', 'vcf', 'cutoff'],
];
/** Each source into the Assign columns, scaled by the sum of its three Assign points. */
const INTO_MX: [string, Source][] = [
  ['c035', 'cycenv'],
  ['c039', 'env'],
  ['c044', 'lfo'],
  ['c049', 'press'],
  ['c054', 'key'],
];
/**
 * Each Assign column's connections in the spec, from its first id: glide, type, wave, timbre, shape, cutoff,
 * resonance, the envelope, the LFO, the arp, the cycling envelope, a matrix point. The ones the app models are drawn,
 * the rest left out below.
 */
const ASSIGN_FIRST = [55, 67, 79];
const ASSIGN_DRAWN: [number, string, string, string][] = [
  [2, 'osc_wave', 'osc', 'Wave'],
  [3, 'osc_timbre', 'osc', 'Timbre'],
  [4, 'osc_shape', 'osc', 'Shape'],
  [5, 'cutoff', 'vcf', 'cutoff'],
  [6, 'resonance', 'vcf', 'resonance'],
  [7, 'env_decay', 'env', 'Decay/Rel'],
  [8, 'lfo_rate', 'lfo', 'rate'],
];
const cid = (n: number): string => `c${String(n).padStart(3, '0')}`;

const edges: RoutingEdge[] = [
  { id: 'c001', from: 'kbd', to: 'voice', signal: 'gate', when: { id: 'arp.mode', eq: 'off' } },
  { id: 'c002', from: 'kbd', to: 'arp', signal: 'gate', when: { id: 'arp.mode', eq: 'arp' } },
  { id: 'c003', from: 'kbd', to: 'voice', signal: 'gate', when: { id: 'arp.mode', eq: 'seq' } },
  { id: 'c008', from: 'arp', to: 'voice', signal: 'gate' },
  { id: 'c017', from: 'voice', to: 'glide', signal: 'cv', label: 'pitch' },
  { id: 'c018', from: 'glide', to: 'osc', signal: 'cv', label: 'pitch' },
  { id: 'c020', from: 'osc', to: 'vcf', signal: 'audio' },
  { id: 'c021', from: 'vcf', to: 'vca', signal: 'audio' },
  { id: 'c022', from: 'vca', to: 'out', signal: 'audio', levels: ['out.master'] },
  { id: 'c023', from: 'voice', to: 'env', signal: 'gate' },
  { id: 'c024', from: 'voice', to: 'cyc', signal: 'gate' },
  {
    id: 'c026',
    from: 'voice',
    to: 'vca',
    signal: 'gate',
    label: 'gate',
    when: { id: 'env.amp_mod', eq: false },
  },
  { id: 'c027', from: 'env', to: 'vca', signal: 'cv', when: { id: 'env.amp_mod', eq: true } },
  {
    id: 'c028',
    from: 'env',
    to: 'vcf',
    signal: 'cv',
    label: 'cutoff',
    levels: [{ id: 'env.filter_amt', off: 0 }],
  },
  ...FIXED.map(([id, s, d, to, label]): RoutingEdge => ({
    id,
    from: FROM[s],
    to,
    signal: 'cv',
    label,
    levels: pointLevels(s, d),
  })),
  ...INTO_MX.map(([id, s]): RoutingEdge => ({
    id,
    from: FROM[s],
    to: 'mx',
    signal: 'cv',
    levels: [
      { sum: [point(s, 'assign1'), point(s, 'assign2'), point(s, 'assign3')] },
      ...(s === 'cycenv' ? ['cyc.amount'] : []),
    ],
  })),
  ...ASSIGN_FIRST.flatMap((first, col) =>
    ASSIGN_DRAWN.map(([k, target, to, label]): RoutingEdge => ({
      id: cid(first + k),
      from: 'mx',
      to,
      signal: 'cv',
      label,
      when: { id: `mx.assign${col + 1}`, eq: target },
      levels: [{ sum: SOURCES.map((s) => point(s, `assign${col + 1}`)) }],
    }))
  ),
];

/** The Assign connections the app does not model, by their place in each column (see `ASSIGN_DRAWN`). */
const ASSIGN_LEFT_OUT: [number, string][] = [
  [0, 'An Assign column on Glide: the app’s glide time has no modulation input.'],
  [1, 'An Assign column on Type: the model is chosen by the knob alone here.'],
  [9, 'An Assign column on the Arp/Seq rate: the app’s arpeggiator rate has no modulation input.'],
  [
    10,
    'An Assign column on a cycling envelope knob: the app’s cycling envelope has no modulation inputs.',
  ],
  [11, 'An Assign column on another point’s amount: not modelled (spec `modelling_gaps`).'],
];
const assignOmitted: Record<string, string> = Object.fromEntries(
  ASSIGN_FIRST.flatMap((first) => ASSIGN_LEFT_OUT.map(([k, why]) => [cid(first + k), why]))
);

const MATRIX_CONTROLS = [
  ...SOURCES.flatMap((s) =>
    ['pitch', 'wave', 'timbre', 'cutoff', 'assign1', 'assign2', 'assign3']
      .filter((d) => !(s === 'env' && d === 'cutoff'))
      .map((d) => `mx.${s}.${d}`)
  ),
  'mx.assign1',
  'mx.assign2',
  'mx.assign3',
];

export const routing: SynthRouting = {
  synth: 'microfreak',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Keyboard',
      module: 'mode',
      symbol: 'midi',
      meter: 'gate',
      description:
        'The 25-key touch keyboard: its notes, and Press, which is the key’s velocity here (the hardware’s aftertouch or velocity, per preset).',
      specs: [
        { label: 'Keys', value: '25, capacitive, with pressure' },
        { label: 'Octave shift', value: '±3 octaves' },
      ],
    },
    {
      id: 'arp',
      name: 'Arpeggiator',
      module: 'mode',
      symbol: 'util',
      controls: ['arp.mode', 'arp.pattern', 'arp.octave', 'arp.rate', 'arp.sync'],
      description:
        'Plays the keys held one after another, Up, in the order pressed or at random, through one to four octaves, at Rate.',
      specs: [
        { label: 'Orders', value: 'Up, Order, Random, Pattern' },
        { label: 'Range', value: '1 to 4 octaves' },
      ],
    },
    {
      id: 'voice',
      name: 'Voice assignment',
      module: 'mode',
      symbol: 'util',
      controls: ['voice.paraphonic'],
      description:
        'Gives each note to the oscillator: one at a time, or with Paraphonic lit up to four, each with its own loudness envelope. Key/Arp, the note’s distance from middle C, is a matrix source.',
      specs: [{ label: 'Voices', value: 'Mono, or 4 paraphonic through one filter' }],
    },
    {
      id: 'glide',
      name: 'Glide',
      module: 'glide',
      passes: true,
      controls: ['glide.amount'],
      description:
        'Slides the pitch from one note to the next, off at 0 and up to about 10 seconds.',
    },
    {
      id: 'osc',
      name: 'Digital oscillator',
      module: 'osc',
      meter: 'osc1',
      controls: ['osc.type', 'osc.wave', 'osc.timbre', 'osc.shape'],
      description:
        'One oscillator running one of twelve models, chosen by Type; Wave, Timbre and Shape are the model’s three settings.',
      specs: [
        { label: 'Models', value: '12, seven from Mutable Instruments Plaits' },
        { label: 'Range', value: 'C−2 to G8' },
      ],
    },
    {
      id: 'vcf',
      name: 'Analog filter',
      module: 'filter',
      passes: true,
      controls: ['vcf.type', 'vcf.cutoff', 'vcf.resonance'],
      description:
        'An analog state-variable filter shared by every note: low-, band- or high-pass, self-oscillating at full resonance.',
      specs: [
        { label: 'Slope', value: '12 dB per octave' },
        { label: 'Cutoff', value: 'About 30 Hz to above 15 kHz' },
      ],
    },
    {
      id: 'vca',
      name: 'VCA',
      module: 'amp',
      passes: true,
      controls: ['env.amp_mod'],
      description:
        'The analog amplifier: opened by the key gate, or with Amp Mod lit by the envelope. In paraphonic mode each note has its own copy of it.',
    },
    {
      id: 'env',
      name: 'Envelope',
      module: 'env',
      meter: 'env1',
      controls: ['env.attack', 'env.decay', 'env.sustain', 'env.filter_amt'],
      stages: {
        attack: 'env.attack',
        decay: 'env.decay',
        sustain: 'env.sustain',
        release: 'env.decay',
      },
      description:
        'Attack, Decay/Rel and Sustain, fired by each note. It sweeps the cutoff at Filter Amt, and the loudness with Amp Mod lit.',
      specs: [
        { label: 'Attack', value: '0 to 10 s' },
        { label: 'Decay / release', value: '0 to 13 s, one knob' },
      ],
    },
    {
      id: 'cyc',
      name: 'Cycling envelope',
      module: 'env',
      meter: 'env2',
      controls: [
        'cyc.mode',
        'cyc.rise',
        'cyc.rise_shape',
        'cyc.fall',
        'cyc.fall_shape',
        'cyc.hold',
        'cyc.amount',
      ],
      stages: {
        attack: 'cyc.rise',
        hold: { id: 'cyc.hold', when: { id: 'cyc.mode', in: ['run', 'loop'] } },
        decay: 'cyc.fall',
        sustain: { id: 'cyc.hold', when: { id: 'cyc.mode', eq: 'env' } },
        release: 'cyc.fall',
      },
      description:
        'Rise, Hold/Sustain and Fall, once per note (Env), free-running (Run) or cycling from each note (Loop). It reaches the sound only through the matrix, at Amount.',
      specs: [{ label: 'Modes', value: 'Env, Run, Loop' }],
    },
    {
      id: 'lfo',
      name: 'LFO',
      module: 'lfo',
      meter: 'lfo',
      controls: ['lfo.shape', 'lfo.rate', 'lfo.sync'],
      description:
        'Six shapes, free from 0.06 to 100 Hz or synced. It reaches the sound only through the matrix.',
      specs: [
        { label: 'Shapes', value: 'Sine, triangle, saw, square, random, random glide' },
        { label: 'Rate', value: '0.06 to 100 Hz, or 8/1 to 1/32' },
      ],
    },
    {
      id: 'mx',
      name: 'Matrix',
      module: 'mod',
      passes: true,
      controls: MATRIX_CONTROLS,
      description:
        'Five sources by seven destinations, each point an amount either way. The points of the four fixed columns are the edges straight to Pitch, Wave, Timbre and Cutoff; the three Assign columns go on from here to wherever their buttons point.',
      specs: [{ label: 'Points', value: '35, bipolar (−100 to +100)' }],
    },
    {
      id: 'out',
      name: 'Output',
      module: 'out',
      passes: true,
      controls: ['out.master'],
      description: 'Master volume to the line and headphone outputs, both mono.',
    },
  ],
  edges,
  jacks: {},
  omitted: {
    strip:
      'The touch strip: its Bend is the app’s pitch wheel, and Spice and Dice are not modelled.',
    midi: 'MIDI in and out: the app’s keyboard and MIDI input stand in for it, drawn as the keyboard.',
    clock:
      'The tempo clock: the arpeggiator’s and LFO’s Rate set their own speeds here (Sync divides 120 BPM).',
    seq: 'The sequencer: its sequences and modulation tracks are not modelled.',
    cvout: 'The rear CV, gate and pressure outputs: not on the panel, and not modelled.',
    ui: 'The display, presets, Save, Utility and Panel: not modelled; the display shows the Type.',
    c004: 'Keyboard into the sequencer for recording: the sequencer is not modelled.',
    c005: 'MIDI notes into the voice: the app plays the keyboard block for any note in.',
    c006: 'MIDI notes into the arpeggiator: the keyboard block stands for them.',
    c007: 'MIDI notes into the sequencer: the sequencer is not modelled.',
    c009: 'The sequencer into the voice: the sequencer is not modelled.',
    c010: 'The keyboard to MIDI out: not modelled.',
    c011: 'The arpeggiator to MIDI out: not modelled.',
    c012: 'The sequencer to MIDI out: not modelled.',
    c013: 'MIDI clock into the tempo clock: not modelled.',
    c014: 'The clock into the arpeggiator: its Rate sets its own tempo (drawn on the block).',
    c015: 'The clock into the sequencer: the sequencer is not modelled.',
    c016: 'The clock into the LFO when synced: LFO Sync divides the tempo, drawn on the LFO block.',
    c019: 'The strip’s Bend into the pitch: the app’s pitch wheel does it, which no block draws.',
    c025: 'The gate restarting the LFO: LFO retrigger is a Utility setting, off here.',
    c029: 'The voice to the rear CV and gate outputs: not modelled.',
    c030: 'The keyboard’s pressure to the rear pressure output: not modelled.',
    ...assignOmitted,
  },
};
