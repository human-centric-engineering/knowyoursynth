// Lineage of the System 55: the Moog modular line. Shape: see CONTRACT.md → Lineage.
import { TIMELINE, RELATIVES } from '@/synths/moog900/lineage.js';

export default {
  title: 'From the Moog modular to the Behringer System 55',
  intro: 'Moog’s modular synthesizers came first: cabinets of separate modules joined by patch cords, used by studios, universities and a few musicians from the mid-1960s. The System 55 was the largest of the three 1973 systems, with six oscillators under two drivers, the 960 sequencer and a wall of envelopes and amplifiers: the kind of system behind the sequenced records of the 1970s. Behringer’s version copies it in Eurorack size, with a CM1A MIDI module instead of the Moog keyboard.',
  timeline: TIMELINE.map((t) => (t.name === 'System 15, System 35, System 55' ? { ...t, tag: 'The original' } : t)).concat([
    { year: '2020s', name: 'Behringer System 55', tag: 'This synth', text: 'Thirty-eight modules in three rows: two 921A drivers with six 921B oscillators, a 921, the 960 sequencer and 962 sequential switch, the 904A, 904B, 914 and 923 filters, five 902 amplifiers, four 911 envelopes and the 911A, three CP3A-M mixers, three CP3A-O and the 992, two 995 attenuator banks, the CP35, the 903A, the 961 and the CM1A.' },
  ]),
  relatives: [{ name: 'Behringer System 15 and System 35', years: '2020s', text: 'The smaller systems built from the same modules. Both are in this app.' }, ...RELATIVES],
  note: 'The records listed are ones where a Moog modular is well documented. The Moog systems differed in size, not in their modules, so a record made on any Moog modular is listed here. The sounds they link to are only in that style.',
};
