// Lineage of the Neutron: an original design, so its lineage is by parts. Shape: see CONTRACT.md → Lineage.
export default {
  title: 'A new design made of old ideas',
  intro: 'The Neutron is not a copy of anything. Behringer designed it in the UK in 2018. But every block on the panel has a clear ancestor: the pre-wired patch bay comes from the ARP 2600, the oscillators are a 1979 chip design, the multimode filter is the kind of circuit the Oberheim SEM made popular, and the delay uses the same kind of chip as 70s echo pedals. Its lineage is best read part by part.',
  timeline: [
    { year: '1963–64', name: 'Modular synthesis', text: 'Don Buchla in California and Robert Moog in New York each build synthesizers from separate modules joined by patch cables. Nothing is connected until you connect it. Every jack on the Neutron’s patch bay comes from this idea.' },
    { year: '1969', name: 'EMS VCS3', text: 'A small British synth that replaces cables with a pin matrix: any output to any input by pushing in a pin. It showed that a patchable synth could be portable.' },
    { year: '1971', name: 'ARP 2600', tag: 'Closest ancestor', text: 'The first well-known semi-modular. The signal path is already wired inside (oscillators to filter to amplifier), so it plays with no cables, but every connection has a jack, and plugging a cable in overrides the internal wire. The Neutron works in exactly this way: the app’s cable explanations say "inside the synth this input is fed by…" because of the 2600. It also carried the utilities that fill the Neutron’s right-hand side: sample-and-hold, a slew ("lag") processor, an inverter, attenuators and a multiple.' },
    { year: '1972', name: 'ARP Odyssey', text: 'A two-oscillator synth that could play two notes at once, one per oscillator, through a single filter. That is what the Neutron’s PARAPHONIC button does.' },
    { year: '1974', name: 'Oberheim SEM', text: 'Tom Oberheim’s expander module uses a 12 dB-per-octave state-variable filter that gives low-pass, band-pass and high-pass from one circuit. It is gentler and more open than Moog’s ladder. The Neutron’s filter is the same kind of circuit, which is why it can offer two filter types at once on VCF 1 and VCF 2.' },
    { year: '1976', name: 'Bucket-brigade delay', text: 'Chips that pass an audio signal along a chain of thousands of tiny capacitors make echo possible without tape. They arrive in effects such as the Electro-Harmonix Memory Man and later the Boss DM-2. Each repeat comes back duller and grainier, and changing the time bends the pitch. The Neutron’s delay uses this kind of chip.' },
    { year: '1978', name: 'Korg MS-20', text: 'A cheap semi-modular with a patch panel, two filters and an external input that could follow the pitch of a guitar or voice. It kept the semi-modular idea alive through the preset-synth years.' },
    { year: '1979', name: 'The CEM3340 oscillator chip', text: 'Doug Curtis puts a complete, temperature-compensated oscillator on one chip. It appears in the Prophet-5, Pro-One, Oberheim OB-Xa, Roland SH-101 and Jupiter-6 and the Memorymoog. The Neutron’s two oscillators use a modern copy of it, and the panel says so: "3340 VCO" is printed under each SHAPE knob.' },
    { year: '1995', name: 'Eurorack', text: 'Dieter Doepfer’s A-100 system sets a small modular format: 3U high, 3.5 mm jacks, a shared power bus. Hundreds of makers adopt it. The Neutron’s jacks and voltage levels follow it, and the unit can be taken out of its case and bolted into a Eurorack frame.' },
    { year: '2015–16', name: 'The semi-modular returns', text: 'The Moog Mother-32 and Make Noise 0-Coast put a complete pre-wired voice and a patch bay in a small desktop box at a moderate price, and a new market opens.' },
    { year: '2018', name: 'Behringer Neutron', tag: 'This synth', text: 'Two 3340 oscillators whose waveform morphs continuously between five shapes (the one really new idea on the panel), a self-oscillating multimode filter, overdrive, a bucket-brigade delay, two envelopes, a wide-range LFO and a 56-point patch bay with the ARP-style utilities.' },
  ],
  relatives: [
    { name: 'ARP 2600', years: '1971–81', text: 'The model for the whole layout: pre-wired path, a jack on everything, utilities on the side.' },
    { name: 'Korg MS-20', years: '1978–83', text: 'The other classic semi-modular: smaller patch bay, harsher filters, the same "plays without cables, changes with them" idea.' },
    { name: 'Roland SH-101, Sequential Pro-One', years: '1981–82', text: 'Share the 3340 oscillator. A Neutron set to one sawtooth into a low-pass filter is in the same tonal family. The Pro-1 in this app is the Pro-One’s clone.' },
    { name: 'Oberheim SEM', years: '1974', text: 'The reference point for 12 dB multimode filters.' },
    { name: 'Moog Mother-32, Make Noise 0-Coast, Arturia MiniBrute 2', years: '2015–18', text: 'The Neutron’s direct competitors: modern desktop semi-modulars in or near Eurorack format.' },
  ],
  note: 'The Neutron itself is too recent to have a history on record, so this list follows its ancestors. Each entry names the instrument that was actually used.',
};
