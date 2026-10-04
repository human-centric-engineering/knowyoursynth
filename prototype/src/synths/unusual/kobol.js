// What the Kobol Expander (and the RSF Kobol it follows) names or does differently from most synths. Attached with annotate() in the SynthDef.
const WAVE = 'Most synths pick a waveform with a switch. Here one knob turns the shape smoothly from triangle through ramp and sawtooth to square and a narrowing pulse, and every position in between is usable. It also has its own CV input, so the shape can be swept like a filter.';
const VCA = 'There is no mixer. Each VCO goes through its own VCA, and this VOLUME knob sets it. Because each VCA has a CV input, an envelope or the LFO can move the balance of the two oscillators, which most mixers cannot do.';
const ADS = 'The envelopes are ADS: DECAY sets both the decay and the release, so a note that decays slowly also dies away slowly after you let go.';
export default {
  'vco1.wave': WAVE,
  'vco2.wave': WAVE,
  'vca1.level': VCA,
  'vca2.level': VCA,
  'ads1.decay': ADS,
  'ads2.decay': ADS,
  'vco1.freq': 'There is no octave switch. FREQUENCY sweeps about ten octaves, from 10 Hz to 10 kHz, so octaves and intervals are set by ear.',
  'vcf.env': 'The filter envelope amount is bipolar and off at the centre: left of centre ADS 2 closes the filter instead of opening it. On most synths this knob starts at 0 on the left.',
  'vcf.kbd': 'Keyboard tracking goes up to 200 % (printed 2V/OC), so the cutoff can move twice as far as the notes. The panel also prints STEP LENGTH here, which the guide does not explain.',
  'lfo.volume': 'The LFO is wired to the pitch of both VCOs, and this knob is the vibrato depth. There is no mod wheel: vibrato is either set here or patched in.',
  'mod.pwm': 'The pulse width is only moved at the far end of each WAVEFORM knob. With WAVEFORM anywhere else, this switch makes no difference.',
  'ads1.decayOff': 'The Kobol’s version of a release on/off switch: on, notes stop dead instead of fading over the DECAY time.',
  'j.vco2Out': 'Unlike VCO 1 OUT, this jack is an insert: plugging in takes VCO 2 out of the filter’s input. To hear VCO 2 through the filter as well, patch it back in at VCF AUDIO IN.',
  'j.vcoModIn': 'A cable here replaces the LFO as the pitch modulation, rather than adding to it. Even a cable carrying nothing switches the LFO’s vibrato off.',
  'j.vpIn1': 'With nothing plugged in, this input carries a steady +10 V, so the voltage processor is a manual control voltage out of the box.',
  noise: 'The noise generator is not wired into the sound and has no level knob. It is only heard through a cable from NOISE OUT.',
};
