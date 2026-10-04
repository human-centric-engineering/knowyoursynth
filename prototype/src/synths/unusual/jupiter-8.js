// Where the Jupiter-8 names or does something differently from most synths: one short note per control, jack or area id.
// Shown under the general help as "Unusual on the Jupiter-8". See CONTRACT.md → Unusual notes for the writing rules.
const KEYFOLLOW = 'KEY FOLLOW here is not filter tracking: it changes the envelope’s times with the note, so high notes have shorter attacks, decays and releases. Few synths of its time could do this.';

export default {
  'vco1.xmod': 'Roland calls frequency modulation CROSS MOD. It only goes one way, VCO-2 into VCO-1, so VCO-2 is the modulator and its RANGE sets the colour of the result.',
  'vco2.sync': 'Here VCO-2 is synced to VCO-1, as on most synths, but the switch sits on VCO-2’s side of the panel and is labelled only SYNC.',
  'vco2.lowFreq': 'A switch that turns the second oscillator into a sub-audio modulator is unusual on a polysynth: with it VCO-2 acts as a second LFO, reaching VCO-1 through CROSS MOD.',
  'vco2.range': 'VCO-2’s RANGE steps in semitones over four octaves, while VCO-1’s steps in octaves. Most synths give both the same kind of range control.',
  'vco2.wave': 'The noise source is one of VCO-2’s waveforms rather than a separate mixer channel, so choosing noise takes VCO-2’s tone away.',
  'mix.balance': 'One knob balances the two oscillators instead of a level control for each. At the centre both are at full level.',
  'hpf.cutoff': 'The high-pass filter has no resonance and no modulation: it is a tone control for thinning the sound, set once per patch.',
  'env1.polarity': 'One switch inverts ENV-1 for every destination at once (filter, pitch and pulse width), rather than a separate amount or invert per destination.',
  'env1.kf': KEYFOLLOW,
  'env2.kf': KEYFOLLOW,
  'vca.lfo': 'Tremolo depth is a four-position switch (0 to 3), not a continuous slider.',
  'vcf.envSel': 'Either envelope can drive the filter. ENV-2, which shapes the volume, is the choice when the brightness should follow the loudness exactly.',
  'arp.mode': 'There is no separate on/off switch for the arpeggio: pressing a MODE button starts it, and pressing the lit one again stops it.',
  'plfo.on': 'A second LFO kept for performance vibrato, brought in with a button beside the keys. It has its own RISE TIME, so vibrato can bloom on held notes without touching the patch.',
  keymode: 'KEY MODE splits the eight voices between two patches. In DUAL every key plays both, which halves the polyphony to four.',
};
