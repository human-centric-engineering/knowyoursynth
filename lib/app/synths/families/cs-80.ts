/**
 * The CS-80 family's map (t-338): Yamaha's CS-80 and Black Corporation's Deckard's Dream, which was built on its voice
 * and keeps its control ids wherever a control does the same job (`defs/deckards-dream.ts`). What differs: the CS-80's
 * preset rows, ring modulator and tremolo/chorus, which the Deckard's Dream lacks; the sub oscillator's last two
 * positions (the CS-80's NOISE and EXT, the Deckard's Dream's RND and S/H); and the Deckard's Dream's P/G centre, where
 * nothing glides. The Behringer DS-80 is announced only, so it has no definition and no link.
 */
import type { ControlRule, FamilyMap } from '@/lib/app/synths/families/translate';

const NO_EXT =
  'The CS-80’s sub oscillator was on EXT, which this app leaves silent, and the Deckard’s Dream has no EXT';
/** On EXT the CS-80's sub oscillator moves nothing, so its depths come across at 0. */
const silentOnExt: ControlRule = {
  dropWhen: { when: { id: 'sub.function', eq: 'ext' }, reason: NO_EXT, set: 0 },
};

/**
 * TOUCH SPEED is the same lever on both, but the CS-80's answers to pressure, which the app cannot play, and the
 * Deckard's Dream's to velocity. So it never carries as a value: the condition holds on every FUNCTION, which makes
 * the drop unconditional (a rule drops only on a condition), and the lever arrives at 0 with the reason.
 */
const touchSpeed = (functions: string[], reason: string): ControlRule => ({
  dropWhen: { when: { id: 'sub.function', in: functions }, reason, set: 0 },
});

export const CS_80_FAMILY: FamilyMap = {
  family: 'cs-80',
  links: [
    {
      from: 'cs-80',
      to: 'deckards-dream',
      controls: {
        'sub.function': { options: { noise: 'rnd' } },
        'sub.vco': silentOnExt,
        'sub.vcf': silentOnExt,
        'sub.vca': silentOnExt,
        'touch.speed': touchSpeed(
          ['sine', 'saw', 'rsaw', 'square', 'noise', 'ext'],
          'The CS-80’s TOUCH SPEED answers to pressure, which the app cannot play; the Deckard’s Dream’s answers to velocity, so it starts at 0'
        ),
      },
      lacks: {
        'ch*.tone':
          'The Deckard’s Dream has no preset rows: its sliders are the sound, so the CS-80’s panel sliders come across, not a preset',
        'ring.*': 'The Deckard’s Dream has no ring modulator',
        'trem.*': 'The Deckard’s Dream has no tremolo or chorus',
      },
    },
    {
      from: 'deckards-dream',
      to: 'cs-80',
      controls: {
        'sub.function': {
          options: {
            rnd: 'noise',
            sh: {
              to: 'noise',
              lost: 'The CS-80’s sub oscillator has no S/H: NOISE is its nearest, a random wobble rather than steps',
            },
          },
        },
        'porta.mode': {
          options: {
            off: {
              to: 'porta',
              lost: 'The CS-80’s P/G rocker has no centre, so its PORTAMENTO / GLISSANDO lever goes to 0 instead',
            },
          },
        },
        'touch.speed': touchSpeed(
          ['sine', 'saw', 'rsaw', 'square', 'rnd', 'sh'],
          'The CS-80’s TOUCH SPEED answers to pressure, which the app cannot play, so a harder note no longer speeds the sub oscillator'
        ),
        'porta.time': {
          dropWhen: {
            when: { id: 'porta.mode', eq: 'off' },
            reason: 'The Deckard’s Dream’s P/G switch was at its centre, where nothing glides',
            set: 0,
          },
        },
      },
    },
  ],
};
