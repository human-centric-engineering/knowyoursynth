// What the Behringer Model 15 names or does differently from most synths. Attached with annotate() in the SynthDef.
export default {
  'osc2.wave': 'The switch has eight positions. The four round the right, under a dashed SUB bracket, repeat the four shapes and bring in the sub-oscillator. The guide does not say how; here they hand mixer channel 3 to the sub in place of the white noise.',
  'mix.3': 'Behringer’s own guide calls this channel both ‘OSC 3 / White Noise’ and ‘sub / white noise’; there is no third oscillator. The panel prints ‘3 / W NOISE’.',
  'osc2.oct': 'The two oscillators have different footage ranges: Oscillator 1 runs 32’ to 4’, Oscillator 2 16’ to 2’. Most synths give both the same range.',
  'vca.mode': 'A three-way VCA switch. ENV and ON (a drone) are common; RELEASE is not. The guide calls it ‘keyboard release’ without explaining it. Here it gives full level while the key is held and the envelope’s release when it is let go, so the one envelope can shape the filter alone.',
  'mod.amount': 'The LFO has a separate depth for each destination plus this master depth, as on the Moog Grandmother. On most synths each depth knob works on its own; here nothing moves until MODULATION is turned up.',
  'lfo.rate': 'The LFO reaches 1.3 kHz, well into audio, so it can work as a third oscillator for clangy modulation of the pitch or filter. Most LFOs stop at a few tens of hertz.',
  'att.amount': 'With nothing patched into ATT INPUT the attenuator reads an internal positive voltage, so it doubles as a manual control voltage, positive or negative, as on the Grandmother.',
  'j.sh_out': 'The sample and hold has no clock or input jack on the panel: it reads the noise once on each LFO cycle, so LFO RATE sets how often it steps.',
  'j.env_inv': 'Most semi-modulars need a separate inverter to turn an envelope upside down. Here it has its own output.',
  'j.osc1_cv': 'Pitch inputs add to the keyboard rather than replacing it, so the oscillators still play the keys with a cable in.',
  'j.vca_in': 'The filter reaches the VCA through this jack’s switch. It is the one normal the Model 15 guide states; the others here follow the Grandmother.',
  'j.rev_out': 'The reverb sits after the VCA with its own input and output in the patch bay, so it can be used on another signal or another instrument.',
  hpf: 'The high-pass filter is a separate module, out of the sound until patched. Most synths that have one put it in series with the low-pass filter.',
  arp: 'The arpeggiator and sequencer share one set of switches, and the buttons have two names: PLAY, HOLD and TAP while playing, TIE, REST and ACCENT while recording a sequence.',
};
