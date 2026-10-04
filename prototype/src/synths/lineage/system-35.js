// Lineage of the System 35: the Moog modular line. Shape: see CONTRACT.md → Lineage.
import { TIMELINE, RELATIVES } from '@/synths/moog900/lineage.js';

export default {
  title: 'From the Moog modular to the Behringer System 35',
  intro: 'Moog’s modular synthesizers came first: cabinets of separate modules joined by patch cords, used by studios, universities and a few musicians from the mid-1960s. The System 35 was the middle size of the three 1973 systems, with two banks of oscillators so two different sounds can be patched at once. Behringer’s version copies it in Eurorack size, with a CM1A MIDI module instead of the Moog keyboard.',
  timeline: TIMELINE.map((t) => (t.name === 'System 15, System 35, System 55' ? { ...t, tag: 'The original' } : t)).concat([
    { year: '2020s', name: 'Behringer System 35', tag: 'This synth', text: 'Twenty-five modules in two rows: two 921A drivers with four 921B oscillators and a 921, the 904A, 904B, 914 and 923 filters, the 992 and two CP3A-O control switchers, two CP3A-M mixers, the CP35, the 961, three 911 envelopes, three 902 amplifiers and the CM1A.' },
  ]),
  relatives: [{ name: 'Behringer System 15 and System 55', years: '2020s', text: 'The smaller and larger systems built from the same modules. Both are in this app.' }, ...RELATIVES],
  note: 'The records listed are ones where a Moog modular is well documented. The Moog systems differed in size, not in their modules, so a record made on any Moog modular is listed here. The sounds they link to are only in that style.',
};
