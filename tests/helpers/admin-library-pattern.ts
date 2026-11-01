/**
 * A library pattern as the admin API serves it (`f-pattern-library` t-126), for the admin page's component tests: a
 * real pattern imported from a riff, with the facts read from it.
 */
import { importPhrase } from '@/lib/app/sequencer/import';
import { patternFacts } from '@/lib/app/patterns/library-facts';
import type { AdminLibraryPattern } from '@/lib/app/patterns/library-edit';
import type { Phrase } from '@/lib/app/synths/contract';

/** C3, D♯3, G3 and a held C4: two beats, eight sixteenths, on steps 1, 3, 5 and 7. */
export const RIFF: Phrase = {
  bpm: 120,
  loop: true,
  steps: [
    [0, 48, 0.25],
    [0.5, 51, 0.25],
    [1, 55, 0.25, 0.6],
    [1.5, 60, 0.5],
  ],
};

export function adminLibraryPattern(over: Partial<AdminLibraryPattern> = {}): AdminLibraryPattern {
  const pattern = importPhrase(RIFF);
  return {
    id: 'cpat000000000000000000001',
    key: 'riff:model-d/funk-bass',
    name: 'Funk bass',
    pattern,
    role: 'bass_line',
    tempo: null,
    inspiredBy: {
      kind: 'synth',
      label: 'Minimoog Model D',
      songId: null,
      partId: null,
      artistId: null,
      synthId: 'model-d',
    },
    fidelity: 'in_the_style_of',
    sources: [],
    origin: 'ai_generated',
    facts: patternFacts(pattern),
    editedAt: null,
    sounds: [
      { synthId: 'model-d', slug: 'funk-bass', name: 'Funk bass', order: 0, isDefault: true },
    ],
    ...over,
  };
}
