// What the Moog Grandmother names or does differently from most synths. Attached with annotate() in the SynthDef.
export default {
  'lfo.pitch': 'There is no LFO depth knob that works on its own: PITCH AMT, CUTOFF AMT and PULSE WIDTH AMT set the most the LFO can do, and the MOD wheel brings it in. With the wheel down they do nothing.',
  'osc2.oct': 'The two oscillators have different footage ranges: Oscillator 1 runs 32’ to 4’, Oscillator 2 16’ to 2’. Most synths give both the same range.',
  'osc2.freq': 'With SYNC on, the knob’s range widens to sweep the synced tone. The manual does not give the new range; here it is three times the ±7 semitones.',
  'vca.mode': 'A three-way VCA switch. ENV and DRONE are common; KB RLS is Moog’s variant of a keyboard gate: full level while the key is held and the envelope’s release when it is let go, so the one envelope can shape the filter alone.',
  'mix.osc1': 'The mixer is DC coupled and overdrives past about 1 o’clock, gently at first and harder further round. Moog intends the high settings to be used for a thicker tone, not avoided.',
  'lfo.rate': 'The LFO reaches 1.3 kHz, well into audio, so it can work as a third oscillator for clangy modulation of the pitch or filter. Most LFOs stop at a few tens of hertz.',
  'att.amount': 'With nothing patched into its INPUT the attenuator reads an internal positive voltage, so it doubles as a manual control voltage, positive or negative.',
  'j.sh_out': 'The sample and hold has no input or clock jack: it reads the noise generator at each zero crossing of the LFO, so LFO RATE sets how often it steps, and SYNC IN steps it too.',
  'j.env_neg': 'Most semi-modulars need a separate inverter to turn an envelope upside down. Here it has its own output.',
  'j.osc1_pitch': 'Pitch inputs add to the keyboard rather than replacing it, so the oscillators still play the keys with a cable in.',
  'j.vel_out': 'The keyboard senses how hard each key is played, but nothing inside uses it. It only reaches the sound through this jack, or over MIDI.',
  'j.rev_in': 'The spring tank has its own input, so it can be fed another signal, or another instrument, while the dry sound stays the VCA’s.',
  hpf: 'The high-pass filter is a separate module, out of the sound until patched. Most synths that have one put it in series with the low-pass filter.',
  reverb: 'The reverb is a real 6-inch spring tank in the case, not a digital effect. Like any spring it rattles if the case is knocked.',
  lhc: 'The buttons have two names: PLAY, HOLD and TAP while playing, TIE, REST and ACCENT while recording a sequence. The names in brackets above them, ◀ KB, SHIFT and KB ▶, are a third set: hold the middle one to move the keyboard by octaves with the other two.',
};
