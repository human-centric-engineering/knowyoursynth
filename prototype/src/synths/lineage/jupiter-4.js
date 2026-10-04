// Lineage of the Jupiter-4: Roland's first self-contained polysynth, between the SH and System-100 monosynths and the
// Jupiter-8. Shape: see CONTRACT.md → Lineage.
export default {
  title: 'From Roland’s monosynths to the Jupiter-4',
  intro: 'Before 1978 Roland’s synthesizers played one note at a time: the SH series and the System-100 modular. The Jupiter-4 put four of those voices in one keyboard, with a microprocessor to share keys among them, run an arpeggio and remember eight sounds. It was Roland’s first self-contained polyphonic synthesizer, and its ideas led straight to the Jupiter-8.',
  timeline: [
    { year: '1973–78', name: 'Roland SH-series and System-100', text: 'Single-voice synthesizers with one or two VCOs, a sub-oscillator, a resonant low-pass filter and ADSR envelopes. The Jupiter-4’s voice is built from the same parts: one VCO with a sub-octave square, noise, a filter and a VCA.' },
    { year: '1978', name: 'Roland Jupiter-4 Compuphonic', tag: 'This synth', text: 'Four voices, each with two envelopes, under microprocessor control. The processor assigns keys in four modes, runs the arpeggio and stores eight sounds beside ten fixed presets; the MODIFIER and CONTROLLER sections stay live. A stereo ensemble finishes the sound.' },
    { year: '1979', name: 'Roland Promars (MRS-2)', text: 'A monophonic synth built on the Jupiter-4’s voice and memory, with two VCOs per note.' },
    { year: '1981', name: 'Roland Jupiter-8', text: 'Roland’s flagship: eight voices, each with two VCOs, cross modulation and sync, a 12/24 dB filter, split and dual keyboard modes and 64 memories.' },
    { year: '2022', name: 'Roland JUPITER-4 PLUG-OUT', text: 'A software recreation for Roland’s SYSTEM-8 and computers, with effects and other additions. This app’s panel is laid out after it, with the original’s controls.' },
  ],
  relatives: [
    { name: 'Roland Jupiter-6', years: '1983', text: 'The cheaper successor to the Jupiter-8, with six voices, a multimode filter and early MIDI.' },
    { name: 'Sequential Circuits Prophet-5', years: '1978', text: 'A rival, not a relation: the first fully programmable polysynth, out the same year with five voices and two oscillators each.' },
    { name: 'Roland Juno-6', years: '1982', text: 'A later, cheaper Roland polysynth with one oscillator and a sub-oscillator per voice, like the Jupiter-4, and a chorus.' },
  ],
  users: ['Nick Rhodes (Duran Duran)'],
  note: 'The Jupiter-4 sold in small numbers and is often confused with the Jupiter-8 in credits. Only well-documented use is listed; the other sounds here are general techniques.',
};
