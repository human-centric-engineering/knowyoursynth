/**
 * Music Easel signal routing, projected from its spec (`.context/app/synth-data/buchla-easel/buchla-easel.synth.json`,
 * 0.10.0): block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/buchla-easel.ts`).
 *
 * Where the definition says more than the spec, it decides. AM happens inside the complex oscillator, whose output
 * already carries it (the engine's `osc1`), so Gate 1 is fed by the complex oscillator in every mode (`c01`, broken by
 * GATE1 IN) and the modulation oscillator reaches it for FM or AM (`c06`); the balanced modulator is the preamp's ring
 * modulator only. The modulation oscillator's sends carry its INDEX (`c05`, `c06`), and the mix carries channel A and
 * B, curved as `toEngine()` curves them (`c11`, `c12`). GATE2 SIG replaces whichever source the gate 2 switch picks, so
 * it is drawn without breaking one of the four. The pulser ignores its triggers when off (`c23`, `c24`).
 *
 * Where it says less, it decides too. It has no program card, so the CONTROL switch decides nothing and no edge waits
 * on it. The case's own normals with no spec connection (the 218e's pulse, pressure and pitch into the keyboard
 * inputs, noise into the preamp, the mix into the reverb) are not drawn, so the keyboard inputs stand for the keys and
 * the preamp for its noise. The random source's sequencer trigger has no spec connection either.
 *
 * Structural, not heard: a lowpass gate with its LEVEL at 0 and nothing patched to it is shut, but still on the path,
 * so Gate 1 reads live at the panel's defaults although the Easel is silent until a cord opens it.
 */
import type { RoutingWhen, SynthRouting } from '@/lib/app/synths/contract';

const INDEX = ['mosc.index'];
const PULSER_ON: RoutingWhen = { id: 'pulser.mode', in: ['sus', 'trans'] };
const TIMES = { label: 'Times', value: '2 ms to 10 s' };
const GATE_SPECS = [
  { label: 'Element', value: 'Vactrol (lamp and photocell)' },
  { label: 'Modes', value: 'Voltage-controlled amp, lowpass filter, combination' },
  { label: 'Lowpass slope', value: '12 dB per octave' },
];

export const routing: SynthRouting = {
  synth: 'buchla-easel',
  out: 'out',
  blocks: [
    {
      id: 'kbd',
      name: 'Touch keyboard (218e)',
      module: 'util',
      symbol: 'midi',
      meter: 'gate',
      controls: [
        'kbd.porta',
        'kbd.arp',
        'kbd.arpRate',
        'kbd.add',
        'kbd.plate',
        'kbd.p1',
        'kbd.p2',
        'kbd.p3',
        'kbd.p4',
      ],
      description:
        'A touch keyboard with no moving parts: key voltage, pressure and a pulse for each touch, with portamento, an arpeggiator and preset voltages. Inside the case its signals arrive at the keyboard inputs.',
      specs: [{ label: 'Voltage keys', value: '29' }],
    },
    {
      id: 'kbd_in',
      name: 'Signals from keyboard',
      module: 'util',
      symbol: 'input',
      description:
        'The pulse, pressure and pitch inputs that bring the keyboard into the sound source. Pitch reaches the oscillators’ KEYBOARD switches, the pulse every trigger switch set to keyboard, and pressure the violet jacks.',
    },
    {
      id: 'seq',
      name: 'Sequential voltage source',
      module: 'mod',
      controls: [
        'seq.trig',
        'seq.stages',
        'seq.l1',
        'seq.l2',
        'seq.l3',
        'seq.l4',
        'seq.l5',
        'seq.p1',
        'seq.p2',
        'seq.p3',
        'seq.p4',
        'seq.p5',
      ],
      description:
        'Five stages, each with its own level, stepped by the keyboard or the pulser. Each stage sends a pulse unless its switch is down.',
      specs: [
        { label: 'Stages', value: '5' },
        { label: 'Cycle', value: '3, 4 or 5 stages' },
      ],
    },
    {
      id: 'env',
      name: 'Envelope generator',
      module: 'env',
      meter: 'env1',
      controls: ['env.trig', 'env.mode', 'env.attack', 'env.sustain', 'env.decay'],
      description:
        'Attack, duration and decay, fired by the keyboard, the pulser or the sequencer. It reaches the sound only by patch cord.',
      specs: [{ label: 'Stages', value: 'Attack, duration, decay' }, TIMES],
    },
    {
      id: 'pulser',
      name: 'Pulser',
      module: 'lfo',
      controls: ['pulser.trig', 'pulser.mode', 'pulser.one', 'pulser.period', 'pulser.periodCv'],
      description:
        'On each trigger a falling ramp, and a trigger when it reaches zero. On self it restarts itself, like a clock.',
      specs: [{ label: 'Period', value: '2 ms to 10 s' }],
    },
    {
      id: 'rvs',
      name: 'Random voltage source',
      module: 'mod',
      controls: ['rvs.trig'],
      description: 'Four new random voltages on each trigger, held until the next.',
      specs: [{ label: 'Outputs', value: '4' }],
    },
    {
      id: 'mosc',
      name: 'Modulation oscillator',
      module: 'osc',
      controls: [
        'mosc.mode',
        'mosc.wave',
        'mosc.range',
        'mosc.freq',
        'mosc.freqCv',
        'mosc.fine',
        'mosc.kbd',
        'mosc.index',
        'mosc.indexCv',
        'mosc.fmIn',
      ],
      description:
        'Sawtooth, square or triangle. Its MODULATION switch sends it to FM or AM of the complex oscillator, or ring modulation of the preamp, at the depth of INDEX. It can also sound through Gate 2.',
      specs: [
        { label: 'Waveshapes', value: 'Sawtooth, square, triangle' },
        { label: 'Index', value: '0 to 1.0' },
      ],
    },
    {
      id: 'balmod',
      name: 'Balanced modulator',
      module: 'mod',
      passes: true,
      description:
        'A multiplier that ring-modulates the preamp with the modulation oscillator. Index 1.0 suppresses the carrier and leaves only the sidebands.',
    },
    {
      id: 'cosc',
      name: 'Complex oscillator',
      module: 'osc',
      controls: [
        'cosc.pitch',
        'cosc.pitchCv',
        'cosc.sign',
        'cosc.fine',
        'cosc.kbd',
        'cosc.shape',
        'cosc.wave',
        'cosc.timbre',
        'cosc.timbreCv',
      ],
      description:
        'The main sound source: a sine mixed with a spike, square or triangle, and TIMBRE, which adds harmonics rather than taking them away. Always feeds Gate 1.',
      specs: [
        { label: 'Waveshapes', value: 'Sine, with spike, square or triangle' },
        { label: 'Fine tune', value: 'Half an octave' },
      ],
    },
    {
      id: 'inverter',
      name: 'Inverter',
      module: 'util',
      description:
        'Turns a control voltage upside down on the 0 to 10 scale: 10 becomes 0, 6 becomes 4.',
    },
    {
      id: 'preamp',
      name: 'Preamp',
      module: 'mixer',
      symbol: 'input',
      controls: ['preamp.gain'],
      description:
        'An outside signal in, or the Easel’s own noise with nothing plugged in. Reaches Gate 2, the balanced modulator and the envelope detector.',
    },
    {
      id: 'envdet',
      name: 'Envelope detector',
      module: 'util',
      passes: true,
      description: 'A control voltage that follows the loudness of the preamp signal.',
    },
    {
      id: 'gate1',
      name: 'Lopass Gate 1',
      module: 'amp',
      controls: ['lpg1.mode', 'lpg1.level', 'lpg1.levelCv'],
      description:
        'A vactrol gate on the complex oscillator: an amplifier, a lowpass filter, or both at once, opened by LEVEL. Slow to close, which gives struck, ringing decays.',
      specs: GATE_SPECS,
    },
    {
      id: 'gate2',
      name: 'Lopass Gate 2',
      module: 'amp',
      controls: ['lpg.src', 'lpg2.mode', 'lpg2.level', 'lpg2.levelCv'],
      description:
        'A second vactrol gate, on the preamp, the modulation oscillator or Gate 1 by its source switch.',
      specs: GATE_SPECS,
    },
    {
      id: 'reverb',
      name: 'Reverberation',
      module: 'fx',
      controls: ['out.rev'],
      passes: true,
      description: 'Spring reverb on the mix, returned at REVERBERATION LEVEL.',
      specs: [{ label: 'Type', value: 'Spring' }],
    },
    {
      id: 'out',
      name: 'Output section',
      module: 'out',
      controls: ['out.a', 'out.b', 'out.master', 'out.monitor'],
      description:
        'Mixes Gate 1 (channel A) and Gate 2 (channel B), adds the reverb, and drives the outputs and headphones at their own levels.',
      specs: [
        { label: 'Program outputs', value: '2, nominally 1 V rms' },
        { label: 'Monitor', value: 'Headset or small speaker, about 2 W' },
      ],
    },
    {
      id: 'card',
      name: 'Program card',
      module: 'util',
      controls: ['card.control'],
      description:
        'The program card slot and its CONTROL switch, which sets the sound from the card, the panel or both. The app has no card, so the panel always decides.',
    },
  ],
  edges: [
    { id: 'c01', from: 'cosc', to: 'gate1', signal: 'audio', breaks: 'j.gate1In' },
    {
      id: 'c04',
      from: 'preamp',
      to: 'balmod',
      signal: 'audio',
      label: 'carrier',
      when: { id: 'mosc.mode', eq: 'bal' },
    },
    {
      id: 'c05',
      from: 'mosc',
      to: 'balmod',
      signal: 'audio',
      label: 'modulator',
      when: { id: 'mosc.mode', eq: 'bal' },
      levels: INDEX,
    },
    {
      id: 'c06',
      from: 'mosc',
      to: 'cosc',
      signal: 'audio',
      label: 'FM or AM',
      when: { id: 'mosc.mode', in: ['fm', 'am'] },
      levels: INDEX,
    },
    {
      id: 'c07',
      from: 'preamp',
      to: 'gate2',
      signal: 'audio',
      when: {
        all: [
          { id: 'lpg.src', eq: 'ext' },
          { id: 'mosc.mode', in: ['fm', 'am'] },
        ],
      },
    },
    {
      id: 'c08',
      from: 'balmod',
      to: 'gate2',
      signal: 'audio',
      when: {
        all: [
          { id: 'lpg.src', eq: 'ext' },
          { id: 'mosc.mode', eq: 'bal' },
        ],
      },
    },
    {
      id: 'c09',
      from: 'mosc',
      to: 'gate2',
      signal: 'audio',
      when: { id: 'lpg.src', eq: 'mosc' },
    },
    {
      id: 'c10',
      from: 'gate1',
      to: 'gate2',
      signal: 'audio',
      label: 'series',
      when: { id: 'lpg.src', eq: 'series' },
    },
    {
      id: 'c11',
      from: 'gate1',
      to: 'out',
      signal: 'audio',
      label: 'channel A',
      levels: [{ id: 'out.a', pow: 1.5 }],
    },
    {
      id: 'c12',
      from: 'gate2',
      to: 'out',
      signal: 'audio',
      label: 'channel B',
      levels: [{ id: 'out.b', pow: 1.5 }],
    },
    { id: 'c13', from: 'out', to: 'reverb', signal: 'audio', label: 'send' },
    { id: 'c14', from: 'reverb', to: 'out', signal: 'audio', label: 'return', levels: ['out.rev'] },
    { id: 'c15', from: 'preamp', to: 'envdet', signal: 'audio' },
    {
      id: 'c16',
      from: 'kbd_in',
      to: 'cosc',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'cosc.kbd', eq: true },
    },
    {
      id: 'c17',
      from: 'kbd_in',
      to: 'mosc',
      signal: 'cv',
      label: 'pitch',
      when: { id: 'mosc.kbd', eq: true },
    },
    {
      id: 'c18',
      from: 'kbd_in',
      to: 'seq',
      signal: 'gate',
      when: { id: 'seq.trig', eq: 'kbd' },
    },
    {
      id: 'c19',
      from: 'pulser',
      to: 'seq',
      signal: 'gate',
      when: { id: 'seq.trig', eq: 'pulser' },
    },
    { id: 'c20', from: 'kbd_in', to: 'env', signal: 'gate', when: { id: 'env.trig', eq: 'kbd' } },
    {
      id: 'c21',
      from: 'pulser',
      to: 'env',
      signal: 'gate',
      when: { id: 'env.trig', eq: 'pulser' },
    },
    { id: 'c22', from: 'seq', to: 'env', signal: 'gate', when: { id: 'env.trig', eq: 'seq' } },
    {
      id: 'c23',
      from: 'kbd_in',
      to: 'pulser',
      signal: 'gate',
      when: { all: [{ id: 'pulser.trig', eq: 'kbd' }, PULSER_ON] },
    },
    {
      id: 'c24',
      from: 'seq',
      to: 'pulser',
      signal: 'gate',
      when: { all: [{ id: 'pulser.trig', eq: 'seq' }, PULSER_ON] },
    },
    { id: 'c25', from: 'kbd_in', to: 'rvs', signal: 'gate', when: { id: 'rvs.trig', eq: 'kbd' } },
    {
      id: 'c26',
      from: 'pulser',
      to: 'rvs',
      signal: 'gate',
      when: { id: 'rvs.trig', eq: 'pulser' },
    },
  ],
  jacks: {
    'j.fmIn': 'mosc',
    'j.mosc': 'mosc',
    'j.modOut': 'mosc',
    'j.moFreq': 'mosc',
    'j.freq': 'mosc',
    'j.index': 'mosc',
    'j.fromCard': 'card',
    'j.card1': 'card',
    'j.card2': 'card',
    'j.invIn': 'inverter',
    'j.invOut': 'inverter',
    'j.ws': 'cosc',
    'j.cosc': 'cosc',
    'j.pitch': 'cosc',
    'j.timbre': 'cosc',
    'j.gate1In': 'gate1',
    'j.lvl1': 'gate1',
    'j.gate2In': 'gate2',
    'j.lvl2': 'gate2',
    'j.aux': 'preamp',
    'j.envOut': 'envdet',
    'j.out1': 'out',
    'j.out2': 'out',
    'j.phones': 'out',
    'j.kPulse': 'kbd_in',
    'j.kPress': 'kbd_in',
    'j.kPitch': 'kbd_in',
    'j.prs1': 'kbd_in',
    'j.prs2': 'kbd_in',
    'j.prs3': 'kbd_in',
    'j.prs4': 'kbd_in',
    'j.envA': 'env',
    'j.envS': 'env',
    'j.envD': 'env',
    'j.env1': 'env',
    'j.env2': 'env',
    'j.env3': 'env',
    'j.seq1': 'seq',
    'j.seq2': 'seq',
    'j.rnd1': 'rvs',
    'j.rnd2': 'rvs',
    'j.rnd3': 'rvs',
    'j.rnd4': 'rvs',
    'j.pul1': 'pulser',
    'j.pul2': 'pulser',
    'j.pul3': 'pulser',
    'j.period': 'pulser',
    'j.kPulseOut': 'kbd',
    'j.kPressOut': 'kbd',
    'j.kPitchOut': 'kbd',
    'j.vel': 'kbd',
    'j.kRed': 'kbd',
    'j.kBlue': 'kbd',
    'j.portaIn': 'kbd',
    'j.arpIn': 'kbd',
    'j.arpB': 'kbd',
    'j.presetPulse': 'kbd',
    'j.presetOut': 'kbd',
  },
  omitted: {
    c02: 'The balanced modulator into Gate 1 in AM: the engine applies AM inside the complex oscillator, so Gate 1 is fed by `c01` in every mode.',
    c03: 'The complex oscillator into the balanced modulator in AM: AM happens inside the complex oscillator, drawn as `c06`.',
  },
};
