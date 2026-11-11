/**
 * Make Noise 0-COAST signal routing, projected from its spec (`.context/app/synth-data/0-coast/0-coast.synth.json`,
 * 0.13.0): block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/0-coast.ts`).
 *
 * The normalled voice (`b01`): MIDI A's pitch and gate (`c01`, `c02`), the oscillator into OVERTONE and on to MULTIPLY
 * (`c03`, `c04`, `c06`), BALANCE between the plain triangle and the overtones (`c08`, `c09`), DYNAMICS opened by
 * CONTOUR (`c11`, `c12`) and the line output (`c13`). SLOPE reaches MULTIPLY through its CV attenuverter (`c07`) and the
 * audio path at full OVERTONE (`c05`), which the routing cannot tell from the rest of OVERTONE's turn, so it is drawn
 * at OVERTONE's level. BALANCE's FUND share falls as the knob turns, which a level cannot say, so `c09` carries no level.
 * Voltage MATH, the clock and the stepped random reach the voice only by cables.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';

export const routing: SynthRouting = {
  synth: '0-coast',
  out: 'out',
  blocks: [
    {
      id: 'midi',
      name: 'MIDI A and MIDI B',
      module: 'mode',
      symbol: 'midi',
      meter: 'gate',
      description:
        'Two MIDI-to-CV converters. MIDI A always sets the oscillator’s pitch and fires CONTOUR; MIDI B has its own CV and GATE jacks.',
      specs: [
        { label: 'Channels', value: 'A and B, all channels as it comes' },
        { label: 'MIDI B as it comes', value: 'CV velocity, GATE mod wheel over 50 %' },
      ],
    },
    {
      id: 'clock',
      name: 'Clock',
      module: 'mod',
      symbol: 'lfo',
      meter: 'lfo',
      description:
        'Gates at a tempo tapped on PGM_B, taken from TEMPO or from MIDI clock on the hardware; a steady 120 BPM here.',
    },
    {
      id: 'random',
      name: 'Stepped random',
      module: 'mod',
      symbol: 'util',
      description: 'A new random voltage on each clock, or on each pulse at TEMPO.',
      specs: [{ label: 'Range', value: '0 to +10 V' }],
    },
    {
      id: 'vmath',
      name: 'Voltage MATH',
      module: 'util',
      symbol: 'util',
      controls: ['vmath.ch2'],
      description:
        'CH1 plus CH2 through an attenuverter, at two identical outputs; with CH2 empty the knob is a steady offset.',
    },
    {
      id: 'osc',
      name: 'Oscillator',
      module: 'osc',
      meter: 'osc1',
      controls: ['osc.pitch', 'osc.fine', 'osc.linfm'],
      description:
        'One triangle-core oscillator, its pitch from MIDI A, the knobs and 1V/OCT, with linear FM. Its triangle and square both feed OVERTONE.',
      specs: [
        { label: 'Waves', value: 'Triangle and square, about 10 Vpp' },
        { label: 'Tracking', value: 'About 4 octaves at 1 V/oct' },
      ],
    },
    {
      id: 'overtone',
      name: 'Overtone',
      module: 'osc',
      passes: true,
      controls: ['overtone.amount', 'overtone.cv'],
      description:
        'Adds one harmonic to the triangle, odd to even as it turns, and blends in SLOPE at full clockwise.',
    },
    {
      id: 'multiply',
      name: 'Multiply',
      module: 'osc',
      passes: true,
      controls: ['multiply.amount', 'multiply.cv'],
      description:
        'A wavefolder: multiplies OVERTONE’s harmonic into more, brighter as it turns. SLOPE moves it with nothing patched.',
    },
    {
      id: 'slope',
      name: 'Slope',
      module: 'env',
      meter: 'env2',
      controls: ['slope.cycle', 'slope.rise', 'slope.fall', 'slope.response'],
      stages: { attack: 'slope.rise', decay: 'slope.fall', release: 'slope.fall' },
      description:
        'A rise and fall from 0 to +8 V, fired by SLOPE TRIG or cycling with CYCLE lit, up to audio rate. EOC is high except while it falls.',
      specs: [
        { label: 'Range', value: '0 to +8 V' },
        { label: 'Response', value: 'Log, linear or expo' },
      ],
    },
    {
      id: 'contour',
      name: 'Contour',
      module: 'env',
      meter: 'env1',
      controls: ['contour.onset', 'contour.sustain', 'contour.decay', 'contour.response'],
      stages: {
        attack: 'contour.onset',
        decay: 'contour.decay',
        sustain: 'contour.sustain',
        release: 'contour.decay',
      },
      description:
        'The envelope MIDI A fires: ONSET, DECAY and SUSTAIN, DECAY also the release. EON is high from the end of the onset until it has fallen away.',
      specs: [
        { label: 'Range', value: '0 to +8 V' },
        { label: 'Response', value: 'Linear to expo' },
      ],
    },
    {
      id: 'balance',
      name: 'Balance',
      module: 'mixer',
      passes: true,
      controls: ['balance.amount'],
      description:
        'Crossfades the plain triangle (FUND) against the overtones (OVRTN). A cable in BALANCE CV makes the knob its depth.',
    },
    {
      id: 'dynamics',
      name: 'Dynamics',
      module: 'amp',
      passes: true,
      controls: ['dynamics.amount'],
      description:
        'A low-pass gate, transistor rather than vactrol: one CV makes the sound louder and brighter together. CONTOUR opens it with nothing patched.',
      specs: [{ label: 'Element', value: 'Transistor, after the Buchla 292' }],
    },
    {
      id: 'out',
      name: 'Line output',
      module: 'out',
      passes: true,
      controls: ['out.level'],
      description: 'LEVEL into the line output, 3 Vpp; DYNMC OUT is the same sound at 10 Vpp.',
    },
  ],
  edges: [
    { id: 'c01', from: 'midi', to: 'osc', signal: 'cv', label: 'pitch' },
    { id: 'c02', from: 'midi', to: 'contour', signal: 'gate', breaks: 'j.contour_gate' },
    { id: 'c03', from: 'osc', to: 'overtone', signal: 'audio', label: 'triangle' },
    { id: 'c04', from: 'osc', to: 'overtone', signal: 'audio', label: 'square' },
    {
      id: 'c05',
      from: 'slope',
      to: 'overtone',
      signal: 'audio',
      label: 'blend',
      levels: ['overtone.amount'],
    },
    { id: 'c06', from: 'overtone', to: 'multiply', signal: 'audio' },
    {
      id: 'c07',
      from: 'slope',
      to: 'multiply',
      signal: 'cv',
      levels: [{ id: 'multiply.cv', off: 0 }],
      breaks: 'j.multiply_cv',
    },
    {
      id: 'c08',
      from: 'multiply',
      to: 'balance',
      signal: 'audio',
      label: 'OVRTN',
      levels: ['balance.amount'],
    },
    {
      id: 'c09',
      from: 'osc',
      to: 'balance',
      signal: 'audio',
      label: 'FUND',
      breaks: 'j.balance_in',
    },
    { id: 'c11', from: 'balance', to: 'dynamics', signal: 'audio' },
    {
      id: 'c12',
      from: 'contour',
      to: 'dynamics',
      signal: 'cv',
      levels: ['dynamics.amount'],
      breaks: 'j.dynamics_cv',
    },
    { id: 'c13', from: 'dynamics', to: 'out', signal: 'audio', levels: ['out.level'] },
    { id: 'c15', from: 'clock', to: 'random', signal: 'gate' },
  ],
  jacks: {
    'j.midi_in': 'midi',
    'j.midi_b_cv': 'midi',
    'j.midi_b_gate': 'midi',
    'j.tempo': 'random',
    'j.clk': 'clock',
    'j.random': 'random',
    'j.vmath_ch1': 'vmath',
    'j.vmath_ch2': 'vmath',
    'j.vmath_out1': 'vmath',
    'j.vmath_out2': 'vmath',
    'j.tri': 'osc',
    'j.square': 'osc',
    'j.voct': 'osc',
    'j.linfm': 'osc',
    'j.overtone_cv': 'overtone',
    'j.multiply_cv': 'multiply',
    'j.slope_time': 'slope',
    'j.eoc': 'slope',
    'j.slope_trig': 'slope',
    'j.slope_out': 'slope',
    'j.decay_cv': 'contour',
    'j.contour_gate': 'contour',
    'j.eon': 'contour',
    'j.contour_out': 'contour',
    'j.balance_in': 'balance',
    'j.balance_cv': 'balance',
    'j.dynamics_cv': 'dynamics',
    'j.dynamics_out': 'dynamics',
    'j.line_out': 'out',
  },
  omitted: {
    c10: 'BALANCE’s internal offset into its own CV input: drawn as the BALANCE knob on the block, broken by BALANCE CV.',
    c14: 'Voltage MATH’s internal offset into its own CH2: drawn as the CH2 knob on the block, broken by CH2.',
    c16: 'The clock into the arpeggiator and portamento timing: neither is modelled (MIDI settings).',
    c17: 'MIDI clock into the clock: switched on in a program page, which is not modelled.',
  },
};
