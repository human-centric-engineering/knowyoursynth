// What the Behringer CAT (and the Octave CAT it follows) names or does differently from most synths. Attached with annotate() in the SynthDef.
const SRC1 = 'There are no fixed modulation routings and no matrix: each VCO and the filter has its own pair of source switches and depth knobs. This left switch picks the LFO sine, the LFO square or the sample and hold.';
const SRC2 = 'The right-hand switch offers the envelopes and the other oscillator. With the other VCO selected it frequency-modulates at audio rate, which on most synths needs a patch cable or a dedicated cross-mod knob.';
export default {
  'pitch.kbdCtrl': 'The CAT is duophonic. On POLY, holding two keys splits them: VCO 1 plays the higher and VCO 2 the lower, through one shared filter and VCA, so both notes share one envelope. Most two-oscillator synths put both oscillators on the same key.',
  'vco1.sync': 'The SYNC switch is printed in the VCO 2 section but it acts on VCO 1, the oscillator that is synced. It has two modes. Behringer does not document them; owners describe MODE B as ordinary hard sync and MODE A as hard sync with VCO 1 cut off for half of each VCO 2 cycle.',
  'vco1.mod1Src': SRC1,
  'vco2.mod1Src': SRC1,
  'vcf.mod1Src': SRC1,
  'vco1.mod2Src': SRC2,
  'vco2.mod2Src': SRC2,
  'vcf.mod2Src': 'The filter envelope amount is not a fixed knob: this switch picks the ADSR, the AR or VCO 1 for the depth knob below. VCO 1 at audio rate on the cutoff gives a rough, growling edge that most synths cannot make without patching.',
  'vco1.saw': 'Each VCO runs all its waves at once, and each wave has its own level slider. Instead of a waveform switch and a mixer, the sliders are both: raise several to blend them.',
  'vcf.vco1Audio': 'An on/off switch for VCO 1 in the audio path, separate from its sliders. With it off, VCO 1 still runs and can still modulate VCO 2 or the filter, or feed the sample and hold.',
  'vco1.pw': 'Only VCO 1 has a variable pulse width. VCO 2’s square is always 50 %.',
  'lfo.rate': 'One fader sets the LFO, the sample-and-hold clock and the ADSR repeat together, so they cannot run at different speeds.',
  'lfo.delay': 'LFO DELAY only fades in the LFO sine, wherever a switch selects it (a VCO, the filter or the pulse width). The square and the sample and hold are at full depth straight away. Every new note restarts the delay.',
  'trig.repeat': 'The LFO doubles as a clock for the envelopes: GATED fires them again every LFO cycle while a key is held, AUTO all the time, so the CAT can play a rhythm by itself.',
  'sh.src': 'In its VCO 1 position the sample and hold measures VCO 1’s mix of waves, not a single wave. With all of VCO 1’s sliders down there is nothing to sample.',
  'vca.mode': 'The VCA can be switched between the two envelopes, or to BYPASS, which holds it open so the synth drones.',
  'pitch.glide': 'The glide is made digitally, on the notes coming in over MIDI, so a pitch voltage patched into VCO1 CV or VCO2 CV does not glide.',
  'pitch.bend': 'Pitch bend is a slider on the panel rather than a wheel. MIDI pitch bend also works on the hardware.',
  'vco2.fine': 'VCO 2 has only a FINE TUNE knob, but it spans about two and a half octaves, so it sets intervals as well as detuning.',
  ar: 'A second envelope with only attack and release: it rises, holds at full level while the key is held, and falls. Having it beside the ADSR means one can shape the loudness while the other shapes the filter or a pitch sweep.',
};
