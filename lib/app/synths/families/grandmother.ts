/**
 * The Grandmother family's map (t-319): Moog's Grandmother and Behringer's Model 15. Most controls share ids; the
 * mixer, the LFO's filter depth and a few options are named differently, the Model 15 adds a sub-oscillator, fine
 * tuning and a modulation depth, and most patch points are renamed.
 */
import type { FamilyMap, LossyOption } from '@/lib/app/synths/families/translate';

const NO_SUB = 'The Grandmother has no sub-oscillator';
const SUB_WAVES = ['tri+sub', 'saw+sub', 'sq+sub', 'narrow+sub'];
const withoutSub = (to: string): LossyOption => ({ to, lost: NO_SUB });

/** Grandmother jack → Model 15 jack, for those named differently. */
const JACKS: Record<string, string> = {
  'j.kb_out': 'j.note_cv',
  'j.vel_out': 'j.velocity',
  'j.rate_in': 'j.lfo_rate',
  'j.sync_in': 'j.lfo_trig',
  'j.osc1_pitch': 'j.osc1_cv',
  'j.osc2_pitch': 'j.osc2_cv',
  'j.trig_in': 'j.env_trig',
  'j.env_pos': 'j.env_out',
  'j.env_neg': 'j.env_inv',
  'j.m1': 'j.m1a',
  'j.m2': 'j.m1b',
  'j.m3': 'j.m1c',
};

export const GRANDMOTHER_FAMILY: FamilyMap = {
  family: 'grandmother',
  links: [
    {
      from: 'grandmother',
      to: 'model-15',
      controls: {
        'lfo.cutoff': { to: 'lfo.filter' },
        'mix.osc1': { to: 'mix.1' },
        'mix.osc2': { to: 'mix.2' },
        'mix.noise': { to: 'mix.3' },
        'arp.dir': { options: { fb: 'bf' } },
        'vca.mode': { options: { kbrls: 'release', drone: 'on' } },
      },
      jacks: JACKS,
      lacks: { 'j.m4': "The Model 15's mult has two outputs, not three" },
    },
    {
      from: 'model-15',
      to: 'grandmother',
      controls: {
        'lfo.filter': { to: 'lfo.cutoff' },
        'mix.1': { to: 'mix.osc1' },
        'mix.2': { to: 'mix.osc2' },
        'mix.3': {
          to: 'mix.noise',
          dropWhen: {
            when: { id: 'osc2.wave', in: SUB_WAVES },
            reason: `${NO_SUB}: MIX 3 was the sub's level`,
            // on SUB, the Model 15 has no noise in its mixer
            set: 0,
          },
        },
        'arp.dir': { options: { bf: 'fb' } },
        'vca.mode': { options: { release: 'kbrls', on: 'drone' } },
        'osc2.wave': {
          options: {
            'tri+sub': withoutSub('tri'),
            'saw+sub': withoutSub('saw'),
            'sq+sub': withoutSub('sq'),
            'narrow+sub': withoutSub('narrow'),
          },
        },
      },
      jacks: Object.fromEntries(Object.entries(JACKS).map(([g, m]) => [m, g])),
      lacks: {
        'osc.fine': 'The Grandmother has no fine tuning knob',
        'mod.amount':
          'The Grandmother has no MODULATION knob: its mod wheel sets how much of the LFO is used',
        'j.sub_out': NO_SUB,
        'j.m2*': 'The Grandmother has one mult, not two',
      },
    },
  ],
};
