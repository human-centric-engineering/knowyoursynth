// The history the three 900-series systems share (CONTRACT.md → Lineage). Each system's lineage file adds its own
// entries and marks itself as "This synth".
export const TIMELINE = [
  { year: '1964', name: 'The first Moog modules', text: 'Robert Moog, working with the composer Herb Deutsch, builds oscillators and amplifiers whose pitch and level are set by a control voltage. One module can now play another, and pitch follows 1 V per octave: the idea every module on this panel is built on.' },
  { year: '1967', name: 'Complete Moog systems', text: 'Moog starts selling ready-made cabinets of modules, the Synthesizers I, II and III. The 900-series modules on this panel (921 oscillators, 904 filters, 902 amplifiers, 911 envelopes) are the ones they were built from.' },
  { year: '1968', name: 'Switched-On Bach', text: 'Wendy Carlos’s album of Bach played on a Moog modular, one line at a time, becomes a hit and makes “Moog” the word for a synthesizer.' },
  { year: '1973', name: 'System 15, System 35, System 55', text: 'Moog replaces its older systems with three new sizes: the System 15 in one portable cabinet, the System 35, and the large System 55 with the 960 sequencer. The modules are the same 900 series, arranged differently.' },
  { year: '2014', name: 'Moog’s own reissues', text: 'Moog Music rebuilds the System 55, the System 35 and the Model 15 in small numbers from the original documents, by hand and at a high price.' },
  { year: '2020s', name: 'Behringer’s 900 series', text: 'Behringer recreates the modules in Eurorack size, sold singly and as the System 15, System 35 and System 55, at a fraction of the cost of an original. A CM1A MIDI-to-CV module stands in for the Moog keyboard.' },
];
export const RELATIVES = [
  { name: 'Minimoog Model D', years: '1970', text: 'The same ideas fixed into one portable instrument with no patch cords: three oscillators, the ladder filter and two envelopes. The Behringer Model D, its copy, is in this app.' },
  { name: 'ARP 2500', years: '1970', text: 'Moog’s rival in large studio modulars, connected with matrix switches instead of patch cords. Its smaller sibling, the 2600, is in this app.' },
  { name: 'Buchla 100 series', years: '1963', text: 'Don Buchla’s modular, built at the same time on the American west coast, with different ideas: no keyboard, sequencers and low-pass gates. The Buchla Music Easel in this app comes from it.' },
];
