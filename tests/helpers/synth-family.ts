/**
 * A synth family as `GET /api/v1/synths/families` serves it, for the picker, toggle and page tests (`f-synth-families`).
 */
import type { SynthFamily } from '@/lib/app/families/read';

/** The TB-303 family: Behringer's TD-3 (the default) and Roland's original, and an unmodelled third for the toggle. */
export const TB_303_FAMILY: SynthFamily = {
  id: 'tb-303',
  name: 'TB-303',
  defaultMember: 'td-3',
  members: [
    {
      slug: 'td-3',
      label: 'TD-3',
      synthId: 'td-3',
      instrument: { id: 'behringer-td-3', name: 'TD-3', maker: 'Behringer', year: '2019' },
      differences: 'A copy with a distortion.',
    },
    {
      slug: 'tb-303',
      label: 'TB-303',
      synthId: 'tb-303',
      instrument: { id: 'roland-tb-303', name: 'TB-303', maker: 'Roland', year: '1981' },
      differences: 'The original.',
    },
    {
      slug: 'rebirth',
      label: 'Unmodelled',
      synthId: null,
      instrument: { id: 'unmodelled-303', name: 'Unmodelled', maker: 'Nobody', year: '1997' },
      differences: 'Not modelled.',
    },
  ],
};

/** The synths the picker offers for that family, and one synth with no family. */
export const FAMILY_SYNTHS = [
  { id: 'model-d', name: 'Model D', maker: 'Behringer', year: 2018, heritage: 'A Minimoog copy' },
  { id: 'td-3', name: 'TD-3', maker: 'Behringer', year: 2019, heritage: 'A TB-303 copy' },
  { id: 'tb-303', name: 'TB-303', maker: 'Roland', year: 1981, heritage: 'The bass line' },
];
