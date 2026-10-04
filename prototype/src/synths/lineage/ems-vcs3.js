// Lineage of the EMS VCS3. Shape: see CONTRACT.md → Lineage.
export default {
  title: 'From the VCS3 to the Synthi family',
  intro: 'Electronic Music Studios was founded in London by Peter Zinovieff, Tristram Cary and David Cockerell. The VCS3, designed by Cockerell, came out in 1969 as a small, affordable studio rather than a keyboard instrument: no keyboard, no fixed signal path, and a pin matrix in place of patch cables. It became Britain’s first widely sold synthesizer.',
  timeline: [
    { year: '1969', name: 'EMS VCS3', tag: 'This synth', text: 'The original, in a wooden cabinet with a sloping panel. This app follows the first version, the Mk 1, as its manual describes it: separate matrix rows for each of Oscillator 1’s and 2’s waveforms and the meter on column A.' },
    { year: 'Around 1970', name: 'EMS DK1 keyboard', text: 'A separate keyboard that plugs into the KEYBOARD socket, sending a pitch voltage to an input channel and a trigger to the envelope shaper. The keyboard in this app stands in for it.' },
    { year: '1971', name: 'EMS Synthi A', text: 'The VCS3’s circuits in a briefcase, often called the Portabella. The same matrix idea, laid flat in the lid.' },
    { year: 'Early 1970s', name: 'VCS3 Mk 2', text: 'A revised matrix: Oscillators 1 and 2 each on one mixed row, output channels on rows of their own, and the meter moved to column B. Patches written for one version need re-pinning on the other.' },
    { year: '1972', name: 'EMS Synthi AKS', text: 'A Synthi A with a flat touch keyboard and a digital sequencer built into the lid. Its sequencer played the line on Pink Floyd’s “On the Run”.' },
    { year: '1974', name: 'Filter change', text: 'EMS changed the filter to a steeper 24 dB per octave slope. Earlier units, like the one modelled here, fall at 12 dB in the first octave and 18 dB after.' },
  ],
  relatives: [
    { name: 'EMS Synthi 100', years: '1971', text: 'EMS’s studio-sized system, with many more oscillators and a much larger pin matrix. The BBC Radiophonic Workshop had one.' },
    { name: 'Moog Minimoog', years: '1970', text: 'An honest rival from the same year, and its opposite in design: a keyboard instrument with a fixed signal path and no patching at all.' },
    { name: 'ARP 2600', years: '1971', text: 'Another rival: semi-modular, with its signal path wired inside and patch cables to change it, where the VCS3 has nothing wired until a pin goes in.' },
  ],
  users: ['Brian Eno', 'Pink Floyd', 'Hawkwind (Dik Mik, Del Dettmar)', 'Jean-Michel Jarre', 'Pete Townshend (The Who)', 'Tangerine Dream', 'BBC Radiophonic Workshop'],
  note: 'EMS instruments were often listed together in studio notes, so a VCS3, a Synthi A and a Synthi AKS are easy to confuse. Each entry names the instrument that is documented for that record.',
};
