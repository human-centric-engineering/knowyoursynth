// Where the Jupiter-4 names or does something differently from most synths: one short note per control or area id.
// Shown under the general help as "Unusual on the Jupiter-4". See CONTRACT.md → Unusual notes for the writing rules.
export default {
  'vco.waveform': 'Each voice has only one VCO. Thickness comes from the sub-oscillator, the unison modes and the ensemble rather than from a second oscillator.',
  'vco.pw': 'At MAN the slider does not move smoothly: it steps through four fixed widths, 50, 40, 20 and 10 %. Most synths have a continuous pulse-width knob.',
  'vco.sub': 'A switch, not a level: the sub-octave square is either in at a fixed level or out.',
  'noise.on': 'Noise is a switch with no level control, unlike most mixers.',
  'hpf.cutoff': 'A separate high-pass filter in front of the low-pass one, as on the later Juno-60. Few synths of its time had one.',
  'vcf.kybd': 'Keyboard follow has four fixed steps (10, 40, 70 and 100 %) on a rotary switch, not a continuous knob.',
  'kbd.tuning': 'The centre of the TUNING knob is A = 442 Hz on the hardware, not the usual 440 Hz.',
  modifier: 'The MODIFIER section is never stored with a sound: it acts live on whatever is playing, memories included. The manual asks you to reset it after use.',
  'lfo.bend': 'LFO BEND bends the LFO rate stored in a sound up or down by hand, a performance control most synths do not have.',
  'trig.rate': 'One clock drives both the arpeggio and the filter sample-and-hold, so the random filter steps land in time with the arpeggio notes.',
  lever: 'One lever does pitch bend and modulation: each of VCO, VCF and VCA is switched to BEND, OFF or LFO, so the same push can bend one destination and bring in the LFO on another.',
  'kbd.assign': 'Voice assignment is chosen on a rotary switch with two unison and two poly modes, set by the microprocessor. In POLY 1 voices rotate in turn; in POLY 2 a key reuses its own voice, which suits portamento.',
};
