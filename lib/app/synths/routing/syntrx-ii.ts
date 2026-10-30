/**
 * Erica Synths SYNTRX II signal routing, projected from its spec
 * (`.context/app/synth-data/syntrx-ii/syntrx-ii.synth.json`, 0.12.0): block and edge ids are the spec's module and
 * connection ids; switches, levels and jacks are the definition's (`defs/syntrx-ii.ts`).
 *
 * Like the VCS3 it re-imagines, its sound goes through the pin matrix: a pin is a cable from a row jack (`r.*`) to a
 * column jack (`c.*`), so the main line is drawn from the matrix, and a row's LEVEL knob is its jack's `gain`. The
 * edges are what is wired behind the matrix: the keyboard's pitch and gate, the switches that pick a row's source, the
 * outputs.
 *
 * Where the definition decides:
 * - The rear jacks (CV1, CV2, GATE, INPUT 1 and 2) are not in the app, so the normals they would break are fixed:
 *   CV1 always plays Oscillator 2 (`c02`, so CV2's own `c03` is left out), and the SCOPE output always feeds both
 *   inputs (`c21`, `c22`).
 * - MIDI CCs and the sequencer's stepped lanes into the joystick (`c08`–`c11`), and velocity and key tracking into the
 *   filter (`c13`, `c14`), are not modelled; the mod wheel into the filter is (`c12`).
 * - The shape column reaches Oscillator 1 unless its SHAPE switch is on SINE, and Oscillator 2 only on PWM: in this app
 *   the column moves pulse width alone (`toEngine()`), so SINE and SAW give no change.
 * - Row 5 carries Oscillator 3's pulse or the S&H, as SELECT says, so their edges into the selector are switched.
 * - The ring modulator's B is chosen inside, by SOURCE B, from six sources the spec does not list; the definition
 *   does, so each is an edge with an id of its own (`ring_b_osc2` …). SIGN gives no B in this app.
 * - The output channels' edges carry their LEVEL, as the spec says, though a voltage pinned into column O or P opens
 *   a channel the knob has shut.
 * - The filter and the S&H are drawn as passing signal on: the filter self-oscillates from RESONANCE 7, and the S&H
 *   has nothing to sample until a pin reaches it.
 */
import type { RoutingEdge, SynthRouting } from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

/** SOURCE B's positions that pick a block, from the definition's `SOURCE_B`. */
const RING_B: [value: string, block: string][] = [
  ['osc2', 'osc2'],
  ['osc3', 'osc3'],
  ['in1', 'in1'],
  ['in2', 'in2'],
  ['noise', 'noise'],
  ['vcf', 'vcf'],
];

export const routing: SynthRouting = {
  synth: 'syntrx-ii',
  out: 'master',
  blocks: [
    {
      id: 'ctl',
      name: 'Keyboard',
      module: 'util',
      description:
        'The keyboard’s pitch to all three oscillators and its gate to the trapezoid, plus the mod wheel to the filter.',
      symbol: 'midi',
      meter: 'gate',
    },
    {
      id: 'osc1',
      name: 'Oscillator 1',
      module: 'osc',
      description:
        'A sine and a pulse, each with its own level on its own matrix row. SHAPE sets the pulse width and bends the sine towards a sharkfin.',
      specs: [
        { label: 'Range', value: 'About C0 to C8' },
        { label: 'Waveforms', value: 'Sine (shaped), pulse' },
      ],
      controls: [
        'osc1.tune',
        'osc1.octave',
        'osc1.shape',
        'osc1.pulse',
        'osc1.sine',
        'osc1.shapeCv',
      ],
      meter: 'osc1',
    },
    {
      id: 'osc2',
      name: 'Oscillator 2',
      module: 'osc',
      description:
        'A pulse and a saw mixed onto one row, SHAPE widening the saw into a detuned super saw. It can be hard-synced to Oscillator 1.',
      specs: [
        { label: 'Range', value: 'About C0 to C8' },
        { label: 'Waveforms', value: 'Pulse, saw to super saw' },
      ],
      controls: [
        'osc2.tune',
        'osc2.octave',
        'osc2.shape',
        'osc2.pulse',
        'osc2.saw',
        'osc2.sync',
        'osc2.shapeCv',
      ],
      meter: 'osc2',
    },
    {
      id: 'osc3',
      name: 'Oscillator 3',
      module: 'lfo',
      description:
        'An LFO that reaches into audio, with a triangle that SHAPE turns into a ramp and a pulse. It runs free or follows the keyboard.',
      specs: [
        { label: 'Rate', value: '0.05 to 500 Hz' },
        { label: 'Waveforms', value: 'Triangle to ramp, pulse' },
      ],
      controls: ['osc3.tune', 'osc3.shape', 'osc3.keyFol', 'osc3.tri', 'osc3.pulse'],
      symbol: 'osc',
      meter: 'osc3',
    },
    {
      id: 'snh',
      name: 'Random',
      module: 'mod',
      description:
        'Sample and hold: samples what is pinned into the S&H column at its own rate, or on each key.',
      controls: ['snh.rate', 'snh.clock', 'snh.level'],
      passes: true,
    },
    {
      id: 'osc3sel',
      name: 'Row 5 Select',
      module: 'mod',
      description: 'Puts Oscillator 3’s pulse or the sample and hold on matrix row 5.',
      controls: ['snh.select'],
      passes: true,
      symbol: 'util',
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'osc',
      description: 'White noise with a TONE control.',
      controls: ['noise.tone', 'noise.level'],
      symbol: 'noise',
    },
    {
      id: 'in1',
      name: 'Input 1',
      module: 'util',
      description:
        'An outside signal on row 7, and an envelope follower that turns its loudness into a voltage on row 8 and, if set, a gate. In this app it carries the SCOPE output.',
      controls: ['in1.level', 'in1.thresh', 'in1.decay', 'in1.toGate', 'in1.ef'],
      passes: true,
      symbol: 'input',
    },
    {
      id: 'in2',
      name: 'Input 2',
      module: 'util',
      description:
        'An outside signal on row 9, line or mic gain, direct or inverted. In this app it carries the SCOPE output.',
      controls: ['in2.level', 'in2.gain', 'in2.polarity'],
      passes: true,
      symbol: 'input',
    },
    {
      id: 'vcf',
      name: 'Filter',
      module: 'filter',
      description:
        'A high-pass and a low-pass in series, so band-pass between them. Resonance self-oscillates into a pure sine from 7.',
      controls: ['vcf.hpf', 'vcf.lpf', 'vcf.cvTarget', 'vcf.res', 'vcf.level'],
      passes: true,
    },
    {
      id: 'ring',
      name: 'Ring Modulator',
      module: 'util',
      description:
        'Multiplies A, from the matrix, by B, which SOURCE B picks inside the instrument.',
      controls: ['ring.sourceB', 'ring.level'],
      passes: true,
      symbol: 'mixer',
    },
    {
      id: 'shapebus',
      name: 'Shape CV',
      module: 'mod',
      description:
        'The Oscillator Shape column, sent to Oscillators 1 and 2 as their SHAPE switches say.',
      passes: true,
      symbol: 'mod',
    },
    {
      id: 'trap',
      name: 'Trapezoid',
      module: 'env',
      description:
        'A looping envelope of attack, on, decay and off. OFF above 9 stops the loop, and then a key or the GATE button fires it.',
      specs: [
        { label: 'Times', value: 'Attack 6–850 ms, on 0–1.5 s, decay 16 ms–2 s, off 14 ms–1.3 s' },
      ],
      controls: ['trap.attack', 'trap.on', 'trap.decay', 'trap.off', 'trap.level', 'trap.gate'],
    },
    {
      id: 'trapvca',
      name: 'Trapezoid VCA',
      module: 'amp',
      description:
        'An amplifier the trapezoid opens: what is pinned into the Envelope Signal column comes out shaped on row 12.',
      controls: ['trap.signal'],
      passes: true,
    },
    {
      id: 'fx',
      name: 'Effects',
      module: 'fx',
      description:
        'A delay or a reverb, wet only, with TIME and FEEDBACK; feedback at the top keeps it going.',
      specs: [{ label: 'Delay', value: '5 ms to 3 s' }],
      controls: ['fx.time', 'fx.feedback', 'fx.type', 'fx.level'],
      passes: true,
    },
    {
      id: 'joy',
      name: 'Joystick',
      module: 'mod',
      description: 'Two voltages from one stick, each with its level, on rows 15 and 16.',
      specs: [{ label: 'Range', value: '±5 V' }],
      controls: ['joy.yLevel', 'joy.xLevel', 'joy.x', 'joy.y'],
    },
    {
      id: 'scope',
      name: 'Scope',
      module: 'util',
      description:
        'A meter for what is pinned into the Scope column, with an output normalled to both inputs.',
      passes: true,
      symbol: 'util',
    },
    {
      id: 'out1',
      name: 'Output 1',
      module: 'amp',
      description:
        'Output channel 1: an amplifier with LEVEL (plus column O), a tone filter and pan.',
      controls: ['out1.level', 'out1.pan', 'out1.filter'],
      passes: true,
    },
    {
      id: 'out2',
      name: 'Output 2',
      module: 'amp',
      description:
        'Output channel 2: an amplifier with LEVEL (plus column P), a tone filter and pan.',
      controls: ['out2.level', 'out2.pan', 'out2.filter'],
      passes: true,
    },
    {
      id: 'master',
      name: 'Outputs',
      module: 'out',
      description: 'Both channels, panned, to the outputs and headphones.',
      passes: true,
    },
  ],
  edges: [
    { id: 'c01', from: 'ctl', to: 'osc1', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'ctl', to: 'osc2', signal: 'cv', label: 'pitch' },
    {
      id: 'c04',
      from: 'ctl',
      to: 'osc3',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'osc3.keyFol', eq: 'key' },
    },
    { id: 'c05', from: 'ctl', to: 'trap', signal: 'gate' },
    { id: 'c06', from: 'ctl', to: 'snh', signal: 'gate', when: { id: 'snh.clock', eq: 'gate' } },
    { id: 'c07', from: 'in1', to: 'ctl', signal: 'gate', when: { id: 'in1.toGate', eq: 'on' } },
    { id: 'c12', from: 'ctl', to: 'vcf', signal: 'cv', label: 'cutoff', levels: [WHEEL] },
    {
      id: 'c15',
      from: 'osc1',
      to: 'osc2',
      signal: 'audio',
      label: 'sync',
      when: { id: 'osc2.sync', eq: 'sync' },
    },
    {
      id: 'c16',
      from: 'osc3',
      to: 'osc3sel',
      signal: 'cv',
      when: { id: 'snh.select', eq: 'osc3' },
    },
    { id: 'c17', from: 'snh', to: 'osc3sel', signal: 'cv', when: { id: 'snh.select', eq: 'snh' } },
    { id: 'c18', from: 'trap', to: 'trapvca', signal: 'cv' },
    {
      id: 'c19',
      from: 'shapebus',
      to: 'osc1',
      signal: 'cv',
      label: 'shape',
      when: { id: 'osc1.shapeCv', in: ['pwm', 'both'] },
    },
    {
      id: 'c20',
      from: 'shapebus',
      to: 'osc2',
      signal: 'cv',
      label: 'shape',
      when: { id: 'osc2.shapeCv', eq: 'pwm' },
    },
    { id: 'c21', from: 'scope', to: 'in1', signal: 'audio' },
    { id: 'c22', from: 'scope', to: 'in2', signal: 'audio' },
    { id: 'c23', from: 'out1', to: 'master', signal: 'audio', levels: ['out1.level'] },
    { id: 'c24', from: 'out2', to: 'master', signal: 'audio', levels: ['out2.level'] },
    ...RING_B.map(([value, from]): RoutingEdge => ({
      id: `ring_b_${value}`,
      from,
      to: 'ring',
      signal: 'audio',
      label: 'B',
      when: { id: 'ring.sourceB', eq: value },
    })),
  ],
  jacks: {
    'r.osc1pulse': 'osc1',
    'r.osc1sine': 'osc1',
    'r.osc2': 'osc2',
    'r.osc3tri': 'osc3',
    'r.osc3sh': 'osc3sel',
    'r.noise': 'noise',
    'r.in1': 'in1',
    'r.ef': 'in1',
    'r.in2': 'in2',
    'r.vcf': 'vcf',
    'r.trap': 'trap',
    'r.envsig': 'trapvca',
    'r.ring': 'ring',
    'r.fx': 'fx',
    'r.joyy': 'joy',
    'r.joyx': 'joy',
    'c.out1': 'out1',
    'c.scope': 'scope',
    'c.out2': 'out2',
    'c.env': 'trapvca',
    'c.ringA': 'ring',
    'c.fx': 'fx',
    'c.vcf': 'vcf',
    'c.osc1': 'osc1',
    'c.osc2': 'osc2',
    'c.osc3': 'osc3',
    'c.shape': 'shapebus',
    'c.decay': 'trap',
    'c.sh': 'snh',
    'c.cutoff': 'vcf',
    'c.lvl1': 'out1',
    'c.lvl2': 'out2',
  },
  audioJacks: [
    'r.osc1pulse',
    'r.osc1sine',
    'r.osc2',
    'r.osc3tri',
    'r.osc3sh',
    'r.noise',
    'r.in1',
    'r.in2',
    'r.vcf',
    'r.envsig',
    'r.ring',
    'r.fx',
    'c.out1',
    'c.scope',
    'c.out2',
    'c.env',
    'c.ringA',
    'c.fx',
    'c.vcf',
  ],
  omitted: {
    c03: 'CV2 is a rear jack the app does not have, so CV1 always plays Oscillator 2 (c02).',
    c08: 'MIDI CCs into the joystick are not modelled.',
    c09: 'MIDI CCs into the joystick are not modelled.',
    c10: 'The sequencer’s stepped lanes are not modelled.',
    c11: 'The sequencer’s stepped lanes are not modelled.',
    c13: 'Velocity into the filter is a configuration setting the app does not model.',
    c14: 'Key tracking of the filter is a configuration setting the app does not model.',
  },
};
