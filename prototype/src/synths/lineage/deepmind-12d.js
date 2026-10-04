// Lineage of the DeepMind 12D: Behringer's first analogue polysynth, and the Roland Juno voice it resembles. Shape: see CONTRACT.md → Lineage.
export default {
  title: 'From the Jupiter and Juno to the DeepMind',
  intro: 'The DeepMind 12 was Behringer’s first synthesizer of its own design. Its voice follows the Roland Juno pattern: an oscillator with a sawtooth and a pulse that switch on separately, a low-pass filter per voice, and a high-pass filter on the whole sound. The manual does not say so; the resemblance is in the layout. Around that voice Behringer added far more modulation than a Juno had. Behind the Junos stand Roland’s first polysynths, the Jupiter-4 and Jupiter-8, which share the filter chip and set out the arpeggiator and two-oscillator voice the DeepMind also has.',
  timeline: [
    { year: '1978', name: 'Roland Jupiter-4', text: 'Roland’s first self-contained polyphonic synthesizer: four voices, each with one oscillator and a sub-oscillator, a low-pass and a high-pass filter, a stereo chorus and an arpeggiator that plays up, down, up/down or at random. Its analogue circuits were set by a microprocessor, which gave it memories. The DeepMind’s arpeggiator has the same four orders, plus AS PLAYED.' },
    { year: '1981', name: 'Roland Jupiter-8', tag: 'The flagship', text: 'Eight voices, each with two oscillators, cross-modulation, sync and a low-pass filter built on Roland’s IR3109 chip, the chip later used in the Juno-6, Juno-60 and Juno-106. It was expensive, and the Junos were Roland’s cheaper answer: one oscillator per voice instead of two. The DeepMind puts the second oscillator back.' },
    { year: '1982', name: 'Roland Juno-6 and Juno-60', text: 'Six-voice polysynths with one digitally controlled oscillator per voice, sawtooth and pulse switched on separately, a sub-oscillator and noise, a four-pole filter, and a high-pass filter after the voices are mixed. The Juno-60 added memories.' },
    { year: '1984', name: 'Roland Juno-106', tag: 'The pattern', text: 'The same voice with MIDI and 128 memories, and faders for nearly every parameter. It became one of the most common analogue polysynths, and the fader-per-parameter panel is the one the DeepMind follows.' },
    { year: '1985', name: 'Roland Alpha Juno 1 and 2', text: 'The last Junos: the same one-oscillator voice, with a sawtooth, a pulse and a sub-oscillator mixed together, and a single dial for editing in place of the faders. A factory sound on the Alpha Juno 2 became the "hoover" of early-90s rave.' },
    { year: '2016', name: 'Behringer DeepMind 12', text: 'A twelve-voice analogue polysynth with a 49-key keyboard, designed at Behringer’s own development teams in the UK. Each voice has two oscillators rather than a Juno’s one, three envelopes, two LFOs, an eight-slot modulation matrix, and a digital effects section from TC Electronic, a company in the same group.' },
    { year: '2017', name: 'DeepMind 12D', tag: 'This synth', text: 'The same twelve voices and the same panel in a desktop case, with no keyboard. It is played over MIDI or USB.' },
    { year: '2017', name: 'DeepMind 6', text: 'A six-voice version with a 37-key keyboard and a smaller panel.' },
  ],
  relatives: [
    { name: 'Roland Juno-60 and Juno-106', years: '1982–84', text: 'The instruments whose layout the DeepMind follows most closely: sawtooth and pulse buttons, a filter with ENV, LFO and KYBD faders, and a common high-pass filter.' },
    { name: 'Korg Minilogue', years: '2016', text: 'A rival, not a relation: a four-voice analogue polysynth launched in the same year at a lower price, with fewer voices and less modulation.' },
    { name: 'Sequential Prophet Rev2', years: '2017', text: 'A rival, not a relation: an eight- or sixteen-voice analogue polysynth with a modulation matrix, at a much higher price.' },
  ],
  note: 'The DeepMind is recent, and its own use on records is not well documented. These records were made on its ancestors, the Roland Jupiter-4, Jupiter-8, Juno-60, Juno-106 and Alpha Juno, and each links to a sound in the library in the same style.',
};
