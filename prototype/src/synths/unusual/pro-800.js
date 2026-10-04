// Where the PRO-800 names or does something differently from most synths: one short note per control, jack or area id.
// Shown under the general help as "Unusual on the PRO-800". See CONTRACT.md → Unusual notes for the writing rules.
const SHAPES = 'Most synths have one waveform selector per oscillator. Here each wave has its own on/off switch, so two or all three can play at once, and with all three off the oscillator is silent.';
const STEPS = 'This knob steps in whole octaves, not smoothly: it is a range switch, not a tuning knob. A menu setting can make it step in semitones or turn freely instead.';
const LEVEL = 'The mixer levels double as drive. Past about 5 they push the filter input harder, so turning an oscillator up adds grit as well as volume.';
const ENVS = 'The envelopes are worked out by the synth’s processor and sent to the analogue voices as control voltages, as on the Prophet-600. That is why the menu can choose each envelope’s curve (exponential or linear) and a fast or slow range.';

export default {
  pmod: 'Poly-Mod is the Prophet’s own name for modulation inside each voice. A normal LFO or mod matrix moves every voice the same way; here each voice’s own filter envelope and OSC B move that voice’s OSC A, so frequency modulation and sync sweeps stay in tune across a chord.',
  'pmod.env': 'Zero is in the middle, so the envelope can be turned upside down. On the original Prophet-600 this knob only went one way; the bipolar knob comes from the GliGli firmware the PRO-800’s is based on.',
  'vcf.env': 'Zero is in the middle: right opens the filter as the envelope rises, left closes it. Many synths have a one-way envelope amount knob and a separate invert switch.',
  'osc1.sync': 'OSC A is the one that is synced, to OSC B. Many synths sync the second oscillator to the first, so the roles here are the other way round.',
  'osc1.saw': SHAPES,
  'osc1.tri': SHAPES,
  'osc1.pulse': SHAPES,
  'osc2.saw': SHAPES,
  'osc2.tri': SHAPES,
  'osc2.pulse': SHAPES,
  'osc1.freq': STEPS,
  'osc2.freq': STEPS,
  'osc1.level': LEVEL,
  'osc2.level': LEVEL,
  'lfo.amount': 'INITIAL AMOUNT is Sequential’s name for the LFO depth you get without touching the mod wheel. The wheel adds to it, rather than being the only way to bring the LFO in.',
  'lfo.shape': 'The switch picks a group rather than a shape: triangle or pulse. A menu setting then picks the shape within the group, which is what the small glyphs above and below it show: triangle, sine or sawtooth, and square, random or noise.',
  'voice.unison': 'One switch does three jobs on the hardware, depending on what you hold when you switch it on: nothing gives unison on all eight voices, one key gives a single-voice mono synth, and a chord gives chord memory, which plays that chord from each key.',
  'vcf.kbd': 'Sequential calls filter key tracking KEYBOARD. FULL makes a self-oscillating filter play in tune, so it can be used as a third, sine-like oscillator.',
  fenv: ENVS,
  aenv: ENVS,
  program: 'The knobs are read by the processor rather than wired straight into the circuit, as on the Prophet-600. In preset mode moving a knob changes the stored sound; to make the sound follow the panel exactly, the hardware has a manual mode (the display shows P800).',
};
