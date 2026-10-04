// Lineage of the 2-XM: the Oberheim SEM and the instruments built from it. Shape: see CONTRACT.md → Lineage.
export default {
  title: 'From the Oberheim SEM to the 2-XM',
  intro: 'Tom Oberheim built the SEM as a single voice to add to other people’s synths. Put two of them beside a keyboard that could share notes between them and it became the Two Voice, one of the first synths able to play two notes at once, and stack enough of them and it became the first polyphonic synths. The 2-XM is two SEMs in one case again, laid out as the Two Voice’s pair of modules with a patchbay for each.',
  timeline: [
    { year: '1974', name: 'Oberheim SEM', text: 'The Synthesizer Expander Module: one complete voice with two VCOs, a 12 dB state-variable filter that sweeps from low-pass through notch to high-pass or switches to band-pass, two ADS envelopes and an LFO. Each XM panel on the 2-XM is this module.' },
    { year: '1975', name: 'Oberheim Two Voice', tag: 'The original', text: 'Two SEMs side by side, with a keyboard scanned by circuitry from E-mu’s Dave Rossum that could play them together, split or one note each, and a small sequencer. The 2-XM’s ASSIGN switch (UNI, SPLIT, DUO) is that keyboard’s job, done over MIDI.' },
    { year: '1975', name: 'Oberheim Four Voice', text: 'Four SEMs and a polyphonic keyboard in one cabinet: one of the first commercially available polyphonic synths. Every voice still had its own panel, so a sound had to be set up four times by hand.' },
    { year: '1976', name: 'Oberheim Eight Voice', text: 'The same idea with eight SEMs. Later came a programmer that could store settings for the modules, a step towards the patch memories of the OB-X.' },
    { year: '1979', name: 'Oberheim OB-X', text: 'Oberheim’s first integrated polysynth, with the SEM’s ideas rebuilt as one programmable instrument.' },
    { year: '2015', name: 'Tom Oberheim Two-Voice Pro', text: 'Tom Oberheim’s own return to the design: two SEM voices with MIDI, a digital sequencer and a full patch panel, made until 2018 and again as a special edition from 2021.' },
    { year: '2025', name: 'Behringer 2-XM', tag: 'This synth', text: 'Two SEM voices in a desktop or Eurorack case, with no keyboard: played over MIDI, with each module’s patchbay on the right. Poly chaining several units was added in a later firmware update.' },
  ],
  relatives: [
    { name: 'Oberheim SEM (Tom Oberheim reissue)', years: '2009 onwards', text: 'Tom Oberheim’s own remake of the single module, the same voice as one XM of the 2-XM.' },
    { name: 'Behringer UB-Xa', years: '2023', text: 'Behringer’s recreation of the OB-Xa, the polysynth that grew out of the SEM line. Its 2-pole filter mode descends from the SEM’s sound.' },
    { name: 'ARP 2600', years: '1971', text: 'A rival, not a relation: a single-voice semi-modular of the same years. Its filter is a 24 dB low-pass, where the SEM’s 12 dB filter sweeps through a notch to high-pass.' },
  ],
  note: 'The 2-XM is recent and its own use on records is not documented. These records were made on the Oberheim Two Voice it follows, or on SEM modules, and only well-documented cases are listed. Many records credited to the Two Voice were in fact made on the Four Voice or Eight Voice (Weather Report, Tangerine Dream, Styx, Lyle Mays), so they are left out.',
};
