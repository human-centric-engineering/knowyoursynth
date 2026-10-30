/**
 * EMS VCS3 signal routing, projected from its spec (`.context/app/synth-data/ems-vcs3/ems-vcs3.synth.json`, 0.9.0):
 * block and edge ids are the spec's module and connection ids; switches, levels and jacks are the definition's
 * (`defs/ems-vcs3.ts`).
 *
 * Nothing is wired inside a VCS3 but the two output amplifiers into the outputs, so almost every path is a pin, and a
 * pin is a cable from a row jack (`r.*`) to a column jack (`c.*`): the diagram is drawn from the matrix. Each row's
 * numbered LEVEL knob is its jack's `gain`, so a pin in a row turned down to 0 carries nothing (`routingState()`).
 *
 * Where the definition decides: the output amplifiers' LEVEL opens only past 5 unless a voltage is pinned into
 * column O or P, which no level here can say, so their edges hold only to the mains switch (`toEngine()` sets the
 * volume to 0 with it off). The filter is drawn as passing signal on, though RESPONSE turned up makes it a sine
 * oscillator of its own: the diagram dims a filter with nothing pinned into it, the commoner case. The meter and its
 * SCOPE socket measure what is pinned into column A and are not heard, so its block has no way to the output and is
 * never lit. Input channel 2 has nothing plugged into it in this app, so its row's gain is 0 and its pins never carry.
 */
import type { SynthRouting } from '@/lib/app/synths/contract';

const POWER = { id: 'power', eq: true };

export const routing: SynthRouting = {
  synth: 'ems-vcs3',
  out: 'output',
  blocks: [
    {
      id: 'osc1',
      name: 'Oscillator 1',
      module: 'osc',
      description:
        'A sine and a ramp, each with its own level on its own matrix row. SHAPE bends the sine towards a rectified shape.',
      specs: [
        { label: 'Frequency', value: '1 Hz to 10 kHz' },
        { label: 'Waveforms', value: 'Sine (shaped), ramp' },
      ],
      controls: ['osc1.freq', 'osc1.shape', 'osc1.sine', 'osc1.ramp'],
      meter: 'osc1',
    },
    {
      id: 'osc2',
      name: 'Oscillator 2',
      module: 'osc',
      description:
        'A square and a triangle on rows 3 and 4. One SHAPE knob turns the square into a pulse and the triangle into a ramp together.',
      specs: [
        { label: 'Frequency', value: '1 Hz to 10 kHz' },
        { label: 'Waveforms', value: 'Square to pulse, triangle to ramp' },
      ],
      controls: ['osc2.freq', 'osc2.shape', 'osc2.square', 'osc2.tri'],
      meter: 'osc2',
    },
    {
      id: 'osc3',
      name: 'Oscillator 3',
      module: 'lfo',
      description:
        'Oscillator 2 about twenty times slower: mainly a control source, the part an LFO plays elsewhere, and audible only at the top of its range.',
      specs: [
        { label: 'Frequency', value: '0.015 Hz to 500 Hz' },
        { label: 'Waveforms', value: 'Square to pulse, triangle to ramp' },
      ],
      controls: ['osc3.freq', 'osc3.shape', 'osc3.square', 'osc3.tri'],
      symbol: 'osc',
      meter: 'osc3',
    },
    {
      id: 'noise',
      name: 'Noise',
      module: 'osc',
      description: 'Noise on row 7, its COLOUR from dark through white to light.',
      controls: ['noise.colour', 'noise.level'],
      symbol: 'noise',
    },
    {
      id: 'in_amp1',
      name: 'Input 1',
      module: 'util',
      description:
        'Brings an outside signal onto row 8. In this app the keyboard is plugged into it, so the row carries the pitch of the last key.',
      specs: [{ label: 'Gain', value: '×2, inverting' }],
      controls: ['in.ch1'],
      symbol: 'input',
    },
    {
      id: 'in_amp2',
      name: 'Input 2',
      module: 'util',
      description:
        'Brings an outside signal onto row 9. Nothing is plugged into it in this app, so the row is always silent.',
      specs: [{ label: 'Gain', value: '×2, inverting' }],
      controls: ['in.ch2'],
      symbol: 'input',
    },
    {
      id: 'ring_mod',
      name: 'Ring Modulator',
      module: 'util',
      description:
        'Multiplies what is pinned into columns E and F, giving their sum and difference frequencies: output only while both carry signal.',
      specs: [{ label: 'Coupling', value: 'AC, so steady voltages do nothing' }],
      controls: ['ring.level'],
      passes: true,
      symbol: 'mixer',
    },
    {
      id: 'vcf',
      name: 'Filter / Oscillator',
      module: 'filter',
      description:
        'A low-pass filter whose RESPONSE narrows it to a resonant peak and then, a little further, into a pure sine oscillator.',
      specs: [
        { label: 'Cutoff', value: '5 Hz to 10 kHz' },
        { label: 'Slope', value: '12 dB in the first octave, then 18 dB per octave' },
      ],
      controls: ['vcf.freq', 'vcf.response', 'vcf.level'],
      passes: true,
    },
    {
      id: 'env',
      name: 'Envelope Shaper',
      module: 'env',
      description:
        'A trapezoid that repeats on its own, or waits for a key once OFF is turned up, with an amplifier of its own: what is pinned into column D comes out shaped on row 12.',
      specs: [
        { label: 'Times', value: 'Attack 2 ms–1 s, on 0–2.5 s, decay 3 ms–15 s, off 10 ms–5 s' },
      ],
      controls: [
        'env.attack',
        'env.on',
        'env.decay',
        'env.off',
        'env.trapLevel',
        'env.sigLevel',
        'env.button',
      ],
    },
    {
      id: 'reverb',
      name: 'Reverberation',
      module: 'fx',
      description: 'A twin spring line, with MIX from dry to almost all spring.',
      specs: [
        { label: 'Springs', value: '25 and 30 ms' },
        { label: 'Reverberation', value: 'Over 2 s' },
      ],
      controls: ['rev.mix', 'rev.level'],
      passes: true,
    },
    {
      id: 'joystick',
      name: 'Joystick',
      module: 'mod',
      description:
        'Two voltages from one stick, left-right on row 15 and up-down on row 16, each with its RANGE.',
      specs: [{ label: 'Range', value: '0 V at centre, up to ±2 V' }],
      controls: ['joy.rangeX', 'joy.rangeY', 'joy.x', 'joy.y'],
    },
    {
      id: 'meter',
      name: 'Meter',
      module: 'util',
      description:
        'Measures what is pinned into column A, as does the SCOPE socket on the same column. Measured, not heard.',
      passes: true,
      symbol: 'util',
    },
    {
      id: 'out_amp1',
      name: 'Output Amplifier 1',
      module: 'amp',
      description:
        'Column B’s amplifier and tone filter. Its LEVEL knob is itself a control voltage: alone it opens the channel only past 5, and column O adds to it.',
      controls: ['out1.level', 'out1.filter', 'out1.pan', 'out1.speaker'],
      passes: true,
    },
    {
      id: 'out_amp2',
      name: 'Output Amplifier 2',
      module: 'amp',
      description:
        'Column C’s amplifier and tone filter, set by its LEVEL knob and anything pinned into column P.',
      controls: ['out2.level', 'out2.filter', 'out2.pan', 'out2.speaker'],
      passes: true,
    },
    {
      id: 'output',
      name: 'Outputs',
      module: 'out',
      description:
        'The two channels to the speakers, headphones and the panned stereo output, behind the mains switch.',
      controls: ['power'],
      passes: true,
    },
  ],
  edges: [
    { id: 'c01', from: 'out_amp1', to: 'output', signal: 'audio', when: POWER },
    { id: 'c02', from: 'out_amp2', to: 'output', signal: 'audio', when: POWER },
  ],
  jacks: {
    'r.osc1sine': 'osc1',
    'r.osc1ramp': 'osc1',
    'r.osc2sq': 'osc2',
    'r.osc2tri': 'osc2',
    'r.osc3sq': 'osc3',
    'r.osc3tri': 'osc3',
    'r.noise': 'noise',
    'r.in1': 'in_amp1',
    'r.in2': 'in_amp2',
    'r.vcf': 'vcf',
    'r.trap': 'env',
    'r.envsig': 'env',
    'r.ring': 'ring_mod',
    'r.rev': 'reverb',
    'r.joyx': 'joystick',
    'r.joyy': 'joystick',
    'c.meter': 'meter',
    'c.out1': 'out_amp1',
    'c.out2': 'out_amp2',
    'c.env': 'env',
    'c.ringA': 'ring_mod',
    'c.ringB': 'ring_mod',
    'c.rev': 'reverb',
    'c.vcf': 'vcf',
    'c.osc1': 'osc1',
    'c.osc2': 'osc2',
    'c.osc3': 'osc3',
    'c.decay': 'env',
    'c.revMix': 'reverb',
    'c.cutoff': 'vcf',
    'c.lvl1': 'out_amp1',
    'c.lvl2': 'out_amp2',
  },
  audioJacks: [
    'r.osc1sine',
    'r.osc1ramp',
    'r.osc2sq',
    'r.osc2tri',
    'r.osc3sq',
    'r.osc3tri',
    'r.noise',
    'r.vcf',
    'r.envsig',
    'r.ring',
    'r.rev',
    'c.out1',
    'c.out2',
    'c.env',
    'c.ringA',
    'c.ringB',
    'c.rev',
    'c.vcf',
  ],
};
