// What the Roland TB-303 names or does differently from most synths. Attached with annotate() in the SynthDef.
export default {
  'amp.accent': 'Accent is not velocity: it is an on/off mark on each step of a pattern, and this knob sets how strong every accented step is. Accented notes also ignore DECAY and close the filter quickly.',
  'filter.res': 'RESONANCE also sets how far accented notes push the filter, so the "wow" of an acid line comes from RESONANCE and ACCENT together. On most synths resonance only affects the filter peak.',
  'filter.envMod': 'Turning ENV MOD up also lowers the filter’s resting point a little, so the knob changes where the sweep starts as well as how big it is.',
  'env.decay': 'This is the only envelope knob. The attack is fixed and almost instant, and the volume envelope has no control at all: note length comes from the timing written into the pattern.',
  'seq.slide': 'Slide is a mark on a step, not a glide-time knob. The glide time is fixed and short, and a slid note does not restart the envelopes. Other synths call this legato portamento.',
  'osc.wave': 'The waveform switch is on the back edge, next to SYNC IN, not on the front panel.',
  'out.volume': 'VOLUME is also the power switch: the first click of the knob turns the TB-303 on.',
  'j.sync': 'This is Roland’s DIN sync from before MIDI existed: it carries tempo, start and stop from Roland drum machines such as the TR-606.',
  timemode: 'Patterns are written in two passes: all the pitches first in PITCH MODE, then the timing of every step in TIME MODE. Most step sequencers enter pitch and timing together, one step at a time.',
};
