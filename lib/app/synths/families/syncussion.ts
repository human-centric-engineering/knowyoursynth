/**
 * The Syncussion SY-1 family's map (t-319): Pearl's original and Behringer's recreation. Their voice controls share
 * ids; Pearl's has a power switch, and Behringer's adds fine tuning, trigger sensitivity and patch points.
 */
import type { FamilyMap } from '@/lib/app/synths/families/translate';

export const SYNCUSSION_FAMILY: FamilyMap = {
  family: 'syncussion-sy-1',
  links: [
    {
      from: 'pearl-syncussion',
      to: 'behringer-syncussion',
      lacks: { 'sys.power': "Behringer's SY-1 has no power switch on its panel" },
    },
    {
      from: 'behringer-syncussion',
      to: 'pearl-syncussion',
      lacks: {
        'ch*.fine': "Pearl's SY-1 has no FINE tuning knob",
        'ch*.sense': "Pearl's SY-1 has no SENSE knob",
        'j.*': "Pearl's SY-1 has no patch points",
      },
    },
  ],
};
