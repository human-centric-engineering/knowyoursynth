/**
 * The TB-303 family's map (t-319): the Roland TB-303 and Behringer's TD-3. The two share their control ids but for
 * the tuning knob; the TD-3 adds a distortion, and their few jacks are named differently.
 */
import type { FamilyMap } from '@/lib/app/synths/families/translate';

export const TB_303_FAMILY: FamilyMap = {
  family: 'tb-303',
  links: [
    {
      from: 'td-3',
      to: 'tb-303',
      controls: { 'osc.tune': { to: 'osc.tuning' } },
      jacks: { 'j.cvOut': 'j.cv', 'j.gateOut': 'j.gate' },
      lacks: {
        'dist.*': 'The TB-303 has no distortion',
        'j.filterIn':
          'The TB-303 has no FILTER IN: its MIX IN adds a sound after the filter, not into it',
      },
    },
    {
      from: 'tb-303',
      to: 'td-3',
      controls: { 'osc.tuning': { to: 'osc.tune' } },
      jacks: { 'j.cv': 'j.cvOut', 'j.gate': 'j.gateOut' },
      lacks: {
        'j.mixIn':
          'The TD-3 has no MIX IN: its FILTER IN takes a sound into the filter in place of the oscillator',
        'j.output': 'The TD-3 has only its PHONES output',
      },
    },
  ],
};
