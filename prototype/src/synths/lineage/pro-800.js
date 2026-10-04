// Lineage of the PRO-800: the Sequential Prophets it follows and the open-source firmware it runs. Shape: see CONTRACT.md → Lineage.
export default {
  title: 'From the Prophet-5 to the PRO-800',
  intro: 'Sequential Circuits’ Prophet-5 was the first polysynth that could store every knob setting in memory. The cheaper Prophet-600 kept its voice and its Poly-Mod, and was the first synth with MIDI. Decades later an open-source replacement for the Prophet-600’s processor, by a programmer known as GliGli, rewrote how it played; the PRO-800 is a Prophet-600 with eight voices running firmware descended from that project.',
  timeline: [
    { year: '1978', name: 'Sequential Circuits Prophet-5', text: 'Five voices, each with two oscillators, a 24 dB filter and two envelopes, and memory for every knob. It introduced Poly-Mod: the filter envelope and oscillator B modulating each voice’s oscillator A and filter, which is where the PRO-800’s POLY-MOD section comes from.' },
    { year: '1982', name: 'Sequential Circuits Prophet-600', tag: 'The original', text: 'A cheaper six-voice Prophet built around synthesizer chips (3340 oscillators and a 4-pole filter), with its knobs read by a microprocessor that also generated the envelopes and LFO. In January 1983 it was one of the two synths in the first public MIDI connection, with a Roland Jupiter-6. The PRO-800’s panel is its panel.' },
    { year: '2013–15', name: 'GliGli Prophet-600 firmware', text: 'An open-source replacement processor board and firmware for the Prophet-600. It rewrote the envelopes and LFO, made the envelope amounts bipolar, and added an arpeggiator, a sequencer, better MIDI and the menu of extra settings. Later versions were continued by other developers.' },
    { year: '2023', name: 'Behringer PRO-800', tag: 'This synth', text: 'The Prophet-600 voice with eight voices instead of six, in a desktop or Eurorack case with no keyboard, running firmware descended from GliGli’s. Behringer’s launch text says it includes all the GliGli changes.' },
  ],
  relatives: [
    { name: 'Sequential Pro-One', years: '1981', text: 'The Prophet-5’s monophonic little sibling, with the same kind of voice and a smaller modulation section. The Behringer Pro-1 in this app is its recreation.' },
    { name: 'Sequential Prophet-5 Rev 4', years: '2020', text: 'Dave Smith’s own reissue of the Prophet-5, with switchable original and later filters.' },
    { name: 'Roland Jupiter-6', years: '1983', text: 'A rival, not a relation: the synth on the other end of the first public MIDI cable, at the 1983 NAMM show.' },
  ],
  note: 'The PRO-800 is recent and its own use on records is not well documented, and neither is the Prophet-600’s. These records were made on the Prophet-5, whose voice and Poly-Mod the Prophet-600 kept; only well-documented cases are listed.',
};
