/**
 * The DFAM family's map (t-269, t-270): Moog's DFAM and Behringer's EDGE, which recreates it. Their definitions are
 * built from one kit (`defs/dfam-kit.ts`), so every control and jack the two share has the same id and carries as it
 * is. The EDGE adds NOISE COLOR, its CLOCK switch and SCALE, PHONES and MIDI, which the DFAM lacks.
 */
import type { FamilyMap } from '@/lib/app/synths/families/translate';

export const DFAM_FAMILY: FamilyMap = {
  family: 'dfam',
  links: [
    { from: 'dfam', to: 'edge' },
    {
      from: 'edge',
      to: 'dfam',
      lacks: {
        'noise.color': 'The DFAM’s noise is white only',
        'clock.*': 'The DFAM has no MIDI or USB clock: its TEMPO always runs it',
        'j.phones':
          'The DFAM has no PHONES jack on its panel: its headphones go in the rear output',
        'j.midi_*': 'The DFAM has no MIDI',
      },
    },
  ],
};
