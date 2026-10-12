/**
 * One synth as `GET /api/v1/admin/synths/[id]` answers for the catalogue editor (`f-catalogue-admin`): its details,
 * one library sound, a history section, a note of each kind and a shared limit. Small on purpose; each test overrides
 * the part it is about.
 */

import type { AdminSound, AdminSynthDetail } from '@/lib/app/catalogue/edit';

export const STORED_SOUND = {
  id: 'funk-bass',
  name: 'Rubber Funk Bass',
  ref: 'In the style of Parliament — "Flash Light"',
  artist: 'Bernie Worrell',
  tags: ['bass', 'funk'],
  level: 1,
  blurb: 'Fat, round synth bass.',
  how: 'Three saws through a closing filter.',
  phrase: { bpm: 104, loop: true, steps: [[0, 36, 0.4]] },
  steps: [
    { title: 'Stack three sawtooths', module: 'osc', why: 'Thick raw tone.' },
    { title: 'Patch the filter', module: 'filter', why: 'Shape it.', set: { cutoff: 2 } },
  ],
  context: { cutoff: 'Almost closed' },
  tweaks: [{ id: 'cutoff', try: 'Open it', hear: 'Brighter' }],
};

export const adminSound = (overrides: Partial<AdminSound> = {}): AdminSound => ({
  slug: 'funk-bass',
  definitionVersion: 1,
  order: 0,
  editedAt: null,
  sound: STORED_SOUND,
  problems: [],
  ...overrides,
});

export function adminSynthDetail(overrides: Partial<AdminSynthDetail> = {}): AdminSynthDetail {
  return {
    synth: {
      id: 'model-d',
      name: 'Model D',
      maker: 'Moog',
      year: 1970,
      heritage: 'Monophonic, three oscillators',
      summary: 'The classic.',
      listed: true,
      order: 0,
      editedAt: null,
      playable: true,
    },
    definitionVersion: 1,
    sounds: [adminSound()],
    lineage: {
      title: 'Where the Model D comes from',
      intro: 'A modular, made portable.',
      timeline: [{ year: '1964', name: 'Moog modular', tag: 'The ancestor', text: 'Patch cords.' }],
      relatives: [{ name: 'ARP Odyssey', years: '1972–81', text: 'The rival.' }],
      users: ['Bernie Worrell'],
      note: null,
      editedAt: null,
    },
    notes: [
      {
        id: 'unusual-1',
        kind: 'UNUSUAL',
        target: 'osc1.range',
        title: null,
        text: 'Footage, not octaves.',
        order: 0,
        editedAt: null,
      },
      {
        id: 'intro-1',
        kind: 'LIMIT_INTRO',
        target: null,
        title: null,
        text: 'What this panel leaves out.',
        order: 0,
        editedAt: null,
      },
    ],
    sharedLimits: [
      {
        id: 'shared-1',
        kind: 'LIMIT',
        target: null,
        title: 'No polyphony',
        text: 'One voice at a time.',
        order: 0,
        editedAt: null,
      },
    ],
    ...overrides,
  };
}
