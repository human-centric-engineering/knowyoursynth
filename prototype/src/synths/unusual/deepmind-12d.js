// What the DeepMind 12D names or does differently from most synths. Attached with annotate() in the SynthDef.
export default {
  'osc1.pwm': 'With PWM SRC set to anything but MANUAL, this fader stops setting the width and sets how far the source moves it. There is then no separate width control.',
  'osc2.toneMod': 'TONE MOD is not pulse-width modulation. It cuts a gap into the start of each half of OSC 2’s square, so the wave stays symmetrical and changes colour in a different way from OSC 1’s PWM.',
  'osc2.level': 'OSC 1 has no level fader. The balance is set by bringing OSC 2 and NOISE up against a fixed OSC 1; to hear OSC 2 alone, switch OSC 1’s two waveform buttons off.',
  'osc1.pitchMod': 'The pitch modulation source is chosen in a menu, not on the panel, and by default this fader moves OSC 2 as well as OSC 1.',
  'vcf.lfo': 'The filter’s LFO fader uses LFO 2 by default, not LFO 1, so vibrato and filter wobble can run at different speeds without any menu work.',
  'hpf.freq': 'The high-pass filter acts on the mix of all twelve voices, not on each voice, as on a Roland Juno. BOOST sits in the same place in the signal path.',
  'env.select': 'One set of A, D, S and R faders serves three envelopes. These buttons choose which envelope the faders move; the other two keep their settings, even though the faders no longer show them.',
  'env.curves': 'Most synths have fixed envelope curves. Here every stage has a shape of its own, set with the same four faders once CURVES is on.',
  'voice.detune': 'On most polysynths unison is a single switch. Here it is a POLYPHONY setting in the POLY EDIT menu, with a choice of how many voices to stack.',
  'arp.gate': 'GATE TIME at zero plays no notes at all: the arpeggiator runs silently.',
  display: 'Much of the DeepMind is set from the display rather than from dedicated controls. Each section’s amber EDIT button opens its own menu, and the FX button a whole effects processor with four slots.',
  'fx.routing': 'Most synths with effects have a fixed chain (chorus, then delay, then reverb). Here the four slots can be wired ten ways, including two that feed an effect’s output back through the others: an octave pitch shifter in the loop of a reverb gives the "shimmer" sound.',
  'fx.mode': 'Most synth effects are inserts only. SEND mode works like an aux send on a mixing desk: the dry synth goes straight out and the effects are added alongside, fully wet.',
};
