/**
 * The Default patch (`f-default-patch`): the one starting point every synth shares, a plain sawtooth someone following
 * along on hardware can set their own synth to and check by ear.
 *
 * It lives on the definition (`SynthDef.defaultPatch`), not in the catalogue: lessons and the patch-loading sequence
 * build on it, so it is code nobody edits, and as no catalogue row it has no place in the library's order to keep. The
 * page lists it first in the library as a sound of its own, under a reserved id no catalogue sound can take, and its
 * sequencer pattern is a C major scale rather than a riff from the pattern library.
 */
import type { CatalogueSound } from '@/lib/app/catalogue/read';
import { patternFacts } from '@/lib/app/patterns/library-facts';
// Type only: this module reaches the browser, and the library module holds the database client.
import type { LibraryPatternView } from '@/lib/app/patterns/library';
import { importPhrase } from '@/lib/app/sequencer/import';
import type { Pattern } from '@/lib/app/sequencer/pattern';
import type { Phrase, PhraseNote, SynthDef } from '@/lib/app/synths/contract';
import { presetState, type PanelState } from '@/lib/app/synths/lib/patch';

/** The Default patch's id where a library sound's slug goes: the session, the library and the sequencer. */
export const DEFAULT_PATCH_ID = 'default-patch';
export const DEFAULT_PATCH_NAME = 'Default patch';

export const isDefaultPatch = (id: string | null | undefined): boolean => id === DEFAULT_PATCH_ID;

/** C3, an octave below middle C: where the scale starts and ends. */
const SCALE_ROOT = 48;
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];
/** How long each note is held, in beats: a little short of the beat, so every note is struck afresh. */
const SCALE_GATE = 0.9;

/** C major from C3 up to C4 and back down to C3. */
export const SCALE_NOTES: readonly number[] = [
  ...MAJOR_STEPS,
  ...MAJOR_STEPS.slice(0, -1).reverse(),
].map((n) => SCALE_ROOT + n);

/** The scale as a riff: one note a beat, slowly. What Play plays with the Default patch on the panel. */
export const SCALE_PHRASE: Phrase = {
  bpm: 70,
  loop: true,
  steps: SCALE_NOTES.map((note, i): PhraseNote => [i, note, SCALE_GATE]),
};

/** The scale as a sequencer pattern: the riff, laid out on the grid as every library riff is. */
export const SCALE_PATTERN: Pattern = importPhrase(SCALE_PHRASE);

/**
 * The scale as the sequencer's pattern picker lists a library pattern: the Default patch's own, and so its default.
 * It is no library row, so it credits nothing and has no sources.
 */
export const SCALE_PATTERN_VIEW: LibraryPatternView = {
  id: `${DEFAULT_PATCH_ID}:scale`,
  key: `${DEFAULT_PATCH_ID}:scale`,
  name: 'C major scale',
  pattern: SCALE_PATTERN,
  role: 'slow_melody',
  tempo: null,
  inspiredBy: {
    kind: 'genre',
    label: '',
    songId: null,
    partId: null,
    artistId: null,
    synthId: null,
  },
  fidelity: 'in_the_style_of',
  sources: [],
  origin: 'human_authored',
  facts: patternFacts(SCALE_PATTERN),
};

/**
 * The Default patch as the library lists a sound: one step, which sets the patch. A synth without a `defaultPatch` of
 * its own gets `init` with no cables.
 */
export function defaultPatchSound(def: SynthDef): CatalogueSound {
  const patch = def.defaultPatch;
  return {
    id: DEFAULT_PATCH_ID,
    version: def.version ?? 1,
    name: DEFAULT_PATCH_NAME,
    ref: 'The starting point every patch here is explained from',
    artist: 'Know Your Synth',
    tags: ['lead'],
    level: 1,
    blurb: `A plain sawtooth on the ${def.name}: set your own synth to this, and check it sounds the same.`,
    how: 'One oscillator’s sawtooth goes through the filter, left open, to the amplifier, which opens while a key is held. Every other patch here starts from this one.',
    phrase: SCALE_PHRASE,
    steps: [
      {
        title: DEFAULT_PATCH_NAME,
        module: 'osc',
        why: 'A plain sawtooth with nothing shaping it: what every patch here starts from. Play a few notes and listen for a bright, steady buzz that starts and stops with the key.',
        ...(patch ? { set: { ...patch.values } } : {}),
        ...(patch?.cables ? { cables: [...patch.cables] } : {}),
      },
    ],
    context: {},
    tweaks: [],
  };
}

/** The Default patch's panel: every control's value, and the cables in. */
export const defaultPatchState = (def: SynthDef): PanelState =>
  presetState(def, defaultPatchSound(def));
