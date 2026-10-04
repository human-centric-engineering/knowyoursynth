// Where the Poly D names or does something differently from most synths: one short note per control, jack or area id.
// Shown under the general help as "Unusual on the Poly D". See CONTRACT.md → Unusual notes for the writing rules.
const FEET = 'Feet come from pipe organs: a pipe half as long sounds an octave higher, so 8’ is an octave above 16’. Other synths show the same thing as an octave number. LO is the unusual setting: it takes an audio oscillator down to LFO speeds.';
const SWITCHED = 'On most chord-playing synths every voice is a complete copy of the synth. Here each note is one of these four oscillators, so this switch can silence one note in four when you play chords in POLY.';
const DECAY_TWICE = 'There is no release knob. DECAY is the usual decay and, with the DECAY switch on, also the release, so the two cannot be set separately.';
const TRACK = 'Most synths have one key-tracking knob. The Minimoog layout has two switches worth one third and two thirds, which add up to four settings: none, a third, two thirds and full.';

export default {
  'voice.mode': 'This is paraphonic, not polyphonic. A polyphonic synth gives each note its own filter and envelopes; here four notes share one filter and one pair of contours, so every note of a chord opens and closes together, and a new key restarts the contours for the notes already held.',
  'voice.damp': 'This switch exists because the notes share one envelope, which cannot release them one at a time. On a fully polyphonic synth each note simply fades on its own when you let go.',
  voices: 'The voice logic is adapted from the Korg Mono/Poly (Behringer says so), not the Minimoog, which plays one note. In POLY each new key takes the next oscillator in turn, so even a single-note line steps round all four.',
  'mod.mix': 'Most synths give each modulation source its own amount knob. Here two sources share one crossfader, and there is no depth knob at all: the mod wheel sets how much modulation you hear, as on the 1970 Minimoog.',
  'mod.srcA': 'OSC 4 here is the Minimoog’s third oscillator: the Poly D has four, and the last one doubles as a modulation source.',
  'mod.srcB': 'NOISE is the Minimoog’s original second source. On the hardware a cable in the rear MOD SOURCE jack takes its place.',
  'osc4.kbd': 'Most synths only have keyboard tracking on the filter. Here it is on an oscillator: switched off, Oscillator 4 ignores the keys and becomes a fixed drone or a slow modulator.',
  'osc1.range': FEET,
  'osc2.range': FEET,
  'osc3.range': FEET,
  'osc4.range': FEET,
  'osc1.wave': 'The second position, a triangle blended with a sawtooth, is a Moog speciality. There is no pulse-width knob: you choose one of three fixed widths, so pulse-width modulation is not available.',
  'osc4.wave': 'Oscillator 4 swaps the triangle-sawtooth for a reverse sawtooth, a ramp that falls instead of rising, for when it is used as a modulator.',
  'osc2.freq': 'Oscillator 1 has no tuning knob of its own. It is the reference and the others are tuned against it, in marked semitones, far enough for a musical interval.',
  'mix.osc1On': SWITCHED,
  'mix.osc2On': SWITCHED,
  'mix.osc3On': SWITCHED,
  'mix.osc4On': SWITCHED,
  'filter.mode': 'The Minimoog filter is low-pass only. The HI position (high-pass) is Behringer’s addition.',
  'filter.kbd1': TRACK,
  'filter.kbd2': TRACK,
  'filter.emphasis': 'EMPHASIS is Moog’s word for resonance.',
  'filter.contour': 'Contour is Moog’s word for envelope. This is the envelope amount, usually called ENV AMOUNT or ENV DEPTH.',
  'env.decay': 'The Minimoog has one of these switches per contour; the Poly D has one for both.',
  'fenv.decay': DECAY_TWICE,
  'aenv.decay': DECAY_TWICE,
  'glide.on': 'Glide has its on/off switch beside the keys and its time knob on the main panel, so a player can switch it in mid-phrase with the left hand, as on a Minimoog.',
  'fx.chorusOn': 'The chorus is modelled on the one in the Roland Juno-60, with the same two buttons that can be pressed together. A Minimoog has no effects at all.',
  'arp.order': 'On the hardware there is no order switch: KYBD and STEP step through the eight orders while the arpeggiator runs, and the LOCATION lamps show which one is chosen.',
};
