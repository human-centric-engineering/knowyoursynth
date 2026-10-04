// Where the Model D names or does something differently from most synths: one short note per control, jack or area id.
// Shown under the general help as "Unusual on the Model D". See CONTRACT.md → Unusual notes for the writing rules.
const FEET = 'Feet come from pipe organs: a pipe half as long sounds an octave higher, so 8’ is an octave above 16’. Other synths show the same thing as an octave number or a transpose switch. LO is the unusual setting: it takes an audio oscillator down to LFO speeds.';
const SWITCHED = 'Separate on/off switches for each mixer source are rare now. They let you mute a source without losing its level, which is useful for checking one oscillator alone while you build a sound.';
const DECAY_TWICE = 'This knob does two jobs. It is the usual decay, and with the matching DECAY switch on it is also the release time, which most synths put on a fourth knob. The two cannot be set separately.';
const NO_RELEASE = 'A Minimoog contour has three knobs, not four: attack, decay and sustain. There is no release knob. This switch re-uses DECAY as the release, so release is either the same as decay or nothing at all.';

export default {
  'mod.mix': 'Most synths give each modulation source its own amount knob. Here two sources share one crossfader, so more of one means less of the other, and the overall amount is set elsewhere (MOD DEPTH and the mod wheel). The middle gives both at once: vibrato with some noise in it, for example.',
  'mod.srcA': 'The 1970s Minimoog had only the first choice on each of these switches: Oscillator 3 and noise. The filter envelope here, and the LFO on the other switch, were added later, so a pitch sweep or vibrato no longer costs you an oscillator.',
  'mod.srcB': 'The 1970s Minimoog had no LFO, so its second source was noise and nothing else. The LFO position is a later addition and is the one most players leave it on.',
  'mod.depth': 'On a Minimoog keyboard this job belongs to the mod wheel, and there is no knob for it. This desktop version has no wheel of its own, so it gets a knob. A mod wheel on a connected keyboard adds to it.',
  'lfo.rate': 'A dedicated LFO is an addition. On the original Minimoog, vibrato meant giving up Oscillator 3: set it to LO and take it off the keyboard. That method still works here and is worth knowing, because Oscillator 3 offers six wave shapes against the LFO’s two.',
  'osc3.kbd': 'Most synths only have "keyboard tracking" on the filter. Here it is on an oscillator: switched off, Oscillator 3 ignores the keys and becomes a fixed drone or a slow modulator. It is how a synth designed without an LFO got one.',
  'osc1.range': FEET,
  'osc2.range': FEET,
  'osc3.range': FEET,
  'osc1.wave': 'The second position, a triangle blended with a sawtooth, is a Moog speciality found on few other synths: softer than a sawtooth, brighter than a triangle. There is also no pulse-width knob. You choose one of three fixed widths, so the sweeping pulse-width sound of other synths is not available.',
  'osc2.wave': 'The second position, a triangle blended with a sawtooth, is a Moog speciality found on few other synths. Pulse width is a choice of three fixed settings, not a knob, so it cannot be modulated.',
  'osc3.wave': 'Oscillator 3 swaps the triangle-sawtooth for a reverse sawtooth. It is there for modulation: with Oscillator 3 used as an LFO it gives a ramp that falls instead of one that rises.',
  'osc2.freq': 'Oscillator 1 has no tuning knob of its own. It is the reference, and the other two are tuned against it. The range is wide enough to set a musical interval, not only a slight detune, so one key can play a fifth.',
  'osc3.freq': 'Oscillator 1 has no tuning knob of its own. It is the reference, and the other two are tuned against it. The range is wide enough to set a musical interval, not only a slight detune.',
  'mix.osc1On': SWITCHED,
  'mix.osc2On': SWITCHED,
  'mix.osc3On': SWITCHED,
  'mix.ext': 'Minimoog players found this trick by running a cable from the headphone socket back into the external input. This version wires the loop in, so it works with no cable, and on most other synths you would need a separate overdrive to get near it.',
  'mix.extOn': 'Minimoog players found this trick by running a cable from the headphone socket back into the external input. This version wires the loop in, so it works with no cable.',
  'filter.mode': 'The original Minimoog filter is low-pass only. The high-pass position is an addition on this version.',
  'filter.kbd1': 'Most synths have one key-tracking knob. The Minimoog has two switches worth one third and two thirds, which add up to four settings: none, a third, two thirds and full.',
  'filter.kbd2': 'Most synths have one key-tracking knob. The Minimoog has two switches worth one third and two thirds, which add up to four settings: none, a third, two thirds and full.',
  'env.filterDecay': NO_RELEASE,
  'env.loudDecay': NO_RELEASE,
  'fenv.decay': DECAY_TWICE,
  'aenv.decay': DECAY_TWICE,
  'filter.cutoff': 'The scale runs from −5 to +5, not 0 to 10. Each number is one octave, so 0 is the middle of the filter’s range and not "closed", and moving from 0 to 1 doubles the cutoff frequency.',
  'filter.emphasis': 'EMPHASIS is Moog’s word for what every other maker calls resonance, Q or peak. On the hardware, a Moog ladder filter also loses some bass as emphasis rises, which is why resonant Minimoog basses are often thinner than you expect.',
  'filter.contour': '"Contour" is Moog’s word for an envelope, so AMOUNT OF CONTOUR is what other synths call envelope amount or EG depth.',
  'out.a440': 'A built-in tuning tone dates from before synths stayed in tune by themselves. Analogue oscillators drift as they warm up, and players tuned by ear against this tone between songs.',
  'j.fcGate': 'FC GATE is short for filter contour gate; other gear would mark it GATE IN or TRIG IN. Separate gates for the two envelopes are unusual, and let you re-fire the filter while the loudness holds.',
  'j.lcGate': 'LC GATE is short for loudness contour gate; other gear would mark it GATE IN or TRIG IN. Separate gates for the two envelopes are unusual.',
  'j.filtCont': 'FILT CONT is the filter envelope output, which other gear marks ENV OUT.',
  'j.loudCont': 'LOUD CONT is the amplifier envelope output, which other gear marks ENV OUT.',
  controllers: 'On a Minimoog keyboard these controls sit to the left of the keys, beside the pitch and mod wheels. This desktop version has no wheels, so MOD DEPTH stands in for the mod wheel.',
  patch: 'The Minimoog had only a few sockets, on its top edge. The row of patch points on the front is what makes this version semi-modular: it plays with no cables, and each cable overrides or adds to a connection that is already made inside.',
  filter: 'Moog’s names differ from everyone else’s here: EMPHASIS is resonance, and a "contour" is an envelope. The three knobs on the lower row are the filter envelope.',
  loudness: 'Loudness contour is Moog’s name for the amplifier (VCA) envelope. It has three knobs, not the usual four: there is no release knob, and the loudness decay switch re-uses DECAY for that job.',
};
