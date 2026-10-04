// What the UB-Xa D (and the OB-Xa it follows) names or does differently from most synths. Attached with annotate() in the SynthDef.
export default {
  'osc1.saw': 'Switching on both of OSC 1’s waves does not mix them: it gives a triangle. OSC 2 works the other way round and plays a triangle with both switched off.',
  'osc2.pulse': 'With both of OSC 2’s wave switches off, OSC 2 plays a triangle rather than falling silent. To take OSC 2 out of the sound, switch off HALF and FULL in the filter section.',
  'osc.pw': 'One PULSE WIDTH knob serves both oscillators. Only the LFO sweep of the width can be set for each oscillator separately, with OSC 1 PWM and OSC 2 PWM.',
  'osc1.freq': 'OSC 1 moves only in whole octaves, OSC 2 in semitones. Fine tuning between them is on its own knob, OSC 2 DETUNE, in the CONTROL section.',
  'osc2.detune': 'Most synths put fine tuning next to the oscillator. Here it sits in the CONTROL section, and a lamp shows whenever OSC 2 is not exactly in tune.',
  'osc2.fenv': 'Most synths with an envelope-to-pitch route give it its own depth knob. Here the depth comes from the filter’s MODULATION knob, so the filter and the OSC 2 sweep always move together.',
  'mix.half': 'There are no oscillator level knobs. OSC 1 is on or off, OSC 2 is off, HALF or FULL, and NOISE is the only continuous level.',
  'vcf.fourPole': 'Most synths default to a 24 dB filter. The OB-Xa family defaults to the brighter 12 dB (2-pole) mode, and 4 POLE is the option.',
  'vcf.mod': 'MODULATION is the filter envelope amount. The Quick Start Guide says it sets modulation "by the LFO", but the LFO reaches the filter through the FILTER FREQ switch and DEPTH 1.',
  'mlfo.depth1': 'One LFO has two depth knobs. DEPTH 1 serves the three frequency switches beside it and DEPTH 2 the width and volume switches below, so vibrato and PWM can run at different depths from the same LFO. The guide swaps the two; the panel is followed here.',
  'mlfo.shape': 'Two of the seven positions are not shapes. TRIG restarts the LFO on each key (what most synths call key sync) and SMP samples the performance LFO.',
  perf: 'Most synths have one LFO for everything. The OB-Xa layout keeps a separate performance LFO for vibrato, so the modulation LFO stays free for PWM, wah or tremolo.',
  'voice.unison': 'UNISON takes every voice of the patch rather than a set number, and plays low-note priority, like a vintage mono synth.',
  'glide.time': 'Portamento is polyphonic: each voice glides on its own from the last note it played, so moving from one chord to another slides every note separately.',
};
