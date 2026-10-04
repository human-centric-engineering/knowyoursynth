// What the Behringer TD-3 (and the TB-303 it copies) names or does differently from most synths. Attached with annotate() in the SynthDef.
export default {
  'amp.accent': 'Accent is not velocity: it is an on/off mark on each step of a pattern, and this knob sets how strong every accented step is. Accented notes also ignore DECAY and close the filter quickly.',
  'filter.res': 'RESONANCE also sets how far accented notes push the filter, so the "wow" of an acid line comes from RESONANCE and ACCENT together. On most synths resonance only affects the filter peak.',
  'filter.envMod': 'Printed ENVELOPE, but it is an envelope amount, not an envelope: on the TB-303 the same knob is ENV MOD. Turning it up also lowers the filter’s resting point a little.',
  'env.decay': 'This is the only envelope knob. The attack is fixed and almost instant, and the volume envelope has no control at all: note length comes from the timing written into the pattern.',
  'seq.slide': 'Slide is a mark on a step, not a glide-time knob. The glide time is fixed and short, and a slid note does not restart the envelopes. Other synths call this legato portamento.',
  'osc.tune': 'TUNE covers about an octave either way, much wider than the TB-303’s TUNING, which moves about five semitones.',
  'dist.drive': 'The TB-303 has no distortion; acid players ran it into guitar pedals. The TD-3 builds one in after the VCA, and its drive knob is printed DISTORTION, the same as the section name.',
  'j.filterIn': 'FILTER IN lets outside audio through the 303-style filter, envelope and accent. On a TB-303 that needed a modification.',
  timemode: 'Patterns are written in two passes: all the pitches first in PITCH MODE, then the timing of every step in TIME MODE. Most step sequencers enter pitch and timing together, one step at a time.',
};
