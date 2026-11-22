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
import type { Pattern, PatternFx } from '@/lib/app/sequencer/pattern';
import type {
  DefaultPatch,
  DefaultPatchStep,
  Phrase,
  PhraseNote,
  Preset,
  PresetStep,
  SynthDef,
} from '@/lib/app/synths/contract';
import { checklistControls, controlLine } from '@/lib/app/synths/lib/checklist';
import { jackMap, presetState, type PanelState } from '@/lib/app/synths/lib/patch';
import { START_STEP } from '@/lib/app/sounds/preference-data';

/** The Default patch's id where a library sound's slug goes: the session, the library and the sequencer. */
export const DEFAULT_PATCH_ID = 'default-patch';
/** What the Default patch is called where it is not a sawtooth (it has `listen`). */
export const DEFAULT_PATCH_NAME = 'Default patch';
/** What it is called where it is: most synths. */
export const DEFAULT_SAW_NAME = 'Default Saw';

/** Whether a synth's Default patch is a plain sawtooth: it is unless it says what to listen for instead. */
export const isSawDefault = (def: SynthDef): boolean => !def.defaultPatch?.listen?.trim();

/** The Default patch's name on this synth: "Default Saw" where it is a sawtooth, "Default patch" where it is not. */
export const defaultPatchName = (def: SynthDef): string =>
  isSawDefault(def) ? DEFAULT_SAW_NAME : DEFAULT_PATCH_NAME;

export const isDefaultPatch = (id: string | null | undefined): boolean => id === DEFAULT_PATCH_ID;

/** What choosing a patch does to what plays along with it and the effects rack (t-277, t-295, t-302). */
export interface ChosenPatch {
  /** The drums: on Match, or off. */
  drums: 'auto' | 'off';
  /** The effects its default pattern comes with; none turns the rack off. */
  fx: PatternFx | null;
}

/**
 * A library sound (or the Default patch) as it is chosen: the drums on Match, except the Default Saw's, which plays
 * its scale with none (t-295); and the rack to the effects its default comes with, or off.
 */
export const chosenSound = (
  def: SynthDef,
  sound: Pick<CatalogueSound, 'id' | 'defaultPattern'>
): ChosenPatch => ({
  drums: isDefaultPatch(sound.id) && isSawDefault(def) ? 'off' : 'auto',
  fx: sound.defaultPattern?.fx ?? null,
});

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
  role: 'lead_line',
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

/** What to listen for once the Default patch is set: the patch's own words, or a sawtooth's. */
const listenFor = (def: SynthDef): string =>
  def.defaultPatch?.listen?.trim() ||
  'Play a few notes and listen for a bright, steady buzz that starts and stops with the key.';

/**
 * The checklist as lesson steps (`DefaultPatch.checklist`): each step's text, then a line per control it covers saying
 * where to put it, then its cables and what to listen for. Each step sets its controls to the Default patch's values,
 * so the panel stays on the Default patch from the first step to the last and only the lit controls move along.
 */
function checklistSteps(
  def: SynthDef,
  patch: DefaultPatch,
  checklist: DefaultPatchStep[]
): PresetStep[] {
  const values = defaultPatchState(def).values;
  const groups = checklistControls(def, checklist);
  const jacks = jackMap(def);
  const jack = (id: string): string => {
    const j = jacks[id];
    return j ? j.name || j.label : id;
  };
  const notSaw = patch.listen?.trim() ? patch.notSaw?.trim() : undefined;
  // a pin matrix joins a row to a column with a pin (or sets a point on a lamp grid), not a cable
  const link = !def.matrix ? 'Cable' : def.matrix.look === 'led' ? 'Point' : 'Pin';
  return checklist.map((s, i): PresetStep => {
    const cs = groups[i].filter((c) => values[c.id] !== undefined);
    const cables = s.cables ? [...(patch.cables ?? [])] : [];
    const why = [
      ...(i === 0 && notSaw ? [notSaw] : []),
      s.why,
      ...cs.map((c) => controlLine(def, c, values[c.id], values)),
      ...cables.map(([from, to]) => `- ${link}: ${jack(from)} to ${jack(to)}`),
      ...(s.listen ? [`- Listen for: ${s.listen}`] : []),
    ].join('\n');
    return {
      title: s.title,
      module: s.module,
      why,
      set: Object.fromEntries(cs.map((c) => [c.id, values[c.id]])),
      ...(cables.length ? { cables } : {}),
    };
  });
}

/**
 * The Default patch as one step: everything it sets, and what to listen for. It is step 0 of every other lesson, and
 * the Default patch's own lesson on a synth whose patch has no checklist.
 */
function wholeStep(def: SynthDef, own: boolean): PresetStep {
  const patch = def.defaultPatch;
  const name = defaultPatchName(def);
  const what = isSawDefault(def)
    ? 'A plain sawtooth with nothing shaping it: what every patch here starts from.'
    : 'The plainest tone this synth makes: what every patch here starts from.';
  const more =
    !own && patch?.checklist?.length
      ? ` The ${name} in the library sets it up one part of the panel at a time.`
      : '';
  return {
    title: name,
    module: 'osc',
    why: `${what} ${listenFor(def)}${more}`,
    ...(patch ? { set: { ...patch.values } } : {}),
    ...(patch?.cables ? { cables: [...patch.cables] } : {}),
  };
}

/**
 * The Default patch as the library lists a sound. Its lesson is the patch's checklist, a part of the panel at a time,
 * or one step that sets the whole patch where it has none. A synth without a `defaultPatch` of its own gets `init`
 * with no cables. A patch that is not a sawtooth (it has `listen`) is called the Default patch rather than the Default
 * Saw, says why (`notSaw`), and says what to listen for in its own words. It lists as a lead unless it names its own
 * category.
 */
export function defaultPatchSound(def: SynthDef): CatalogueSound {
  const patch = def.defaultPatch;
  const saw = isSawDefault(def);
  const notSaw = saw ? '' : `${patch?.notSaw?.trim() ?? ''} `.trimStart();
  return {
    id: DEFAULT_PATCH_ID,
    version: def.version ?? 1,
    name: defaultPatchName(def),
    ref: 'The starting point every patch here is explained from',
    artist: 'Know Your Synth',
    tags: [patch?.category ?? 'lead'],
    level: 1,
    blurb: `${saw ? 'A plain sawtooth' : 'The plainest tone'} on the ${def.name}: set your own synth to this, a step at a time, and check it sounds the same.`,
    how: saw
      ? 'One oscillator’s sawtooth goes through the filter, left open, to the amplifier, which opens while a key is held. Every other patch here starts from this one.'
      : `${notSaw}The plainest tone the synth makes, with no modulation and no effects. Every other patch here starts from this one.`,
    phrase: SCALE_PHRASE,
    steps: patch?.checklist?.length
      ? checklistSteps(def, patch, patch.checklist)
      : [wholeStep(def, true)],
    context: {},
    tweaks: [],
    // its one pattern is the riff it plays (t-224)
    defaultPattern: { id: SCALE_PATTERN_VIEW.id, name: SCALE_PATTERN_VIEW.name },
  };
}

/**
 * The Default patch's panel: every control's value, and the cables in. It is what every sound builds on, so it is a
 * sound of no steps, playing the scale (which sets a tempo knob to the scale's speed).
 */
export const defaultPatchState = (def: SynthDef): PanelState =>
  presetState(def, { steps: [], phrase: SCALE_PHRASE });

/**
 * Step 0 of a lesson (`f-default-patch` t-173): the Default patch, set before step 1 so someone following along on
 * hardware starts from the same place as the panel. It is no step of the lesson's own: the session holds it as
 * `START_STEP`, and it counts toward no progress.
 */
export { START_STEP };

/** Whether a lesson has step 0: every one but the Default patch's own, which sets that patch already. */
export const hasStartStep = (preset: { id: string } | null | undefined): boolean =>
  !!preset && !isDefaultPatch(preset.id);

/** Step 0 as a step: the whole Default patch, what to listen for, and where its checklist is. */
export const startStep = (def: SynthDef): PresetStep => wholeStep(def, false);

/** The panel at a lesson's step: step 0 is the Default patch, the rest are the sound as far as that step. */
export const lessonState = (
  def: SynthDef,
  preset: Pick<Preset, 'steps' | 'phrase'> | null | undefined,
  step: number | null
): PanelState => (step === START_STEP ? defaultPatchState(def) : presetState(def, preset, step));
