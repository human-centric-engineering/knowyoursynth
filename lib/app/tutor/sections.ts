/**
 * A synth's sections as the tutor sees them, and how big a description `describe_synth` hands over in one call.
 *
 * Sections are the definition's `areas`: named regions of the faceplate, each holding every control and jack inside it.
 * The size limit is in characters of `describeSynth` output, measured, not guessed: every synth but four describes in
 * under 7,000 characters (Model D 3,398), and the four that do not (System 15 9,505, System 35 14,489, System 55 23,848,
 * DeepMind 12 96,811) are the ones worth narrowing. The token counts behind it are in `.context/app/tutor.md`.
 */
import { areaMembers } from '@/lib/app/synths/lib/areas';
import { describeSynth } from '@/lib/app/synths/lib/patch';
import type { Jack, SynthDef } from '@/lib/app/synths/contract';

/** The most `describe_synth` returns in one call. A synth, section or prefix that describes in more gets an index. */
export const DESCRIBE_MAX_CHARS = 8000;

const wholeSizes = new WeakMap<SynthDef, number>();

/** A jack the sound engine models, which is every jack `describeSynth` lists: an output with a signal, an input with a destination. */
export const modelled = (j: Jack): boolean => (j.dir === 'out' ? !!j.signal : !!j.dest);

/**
 * Whether the synth is small enough for `describe_synth` with no arguments to return it whole: measured on the init
 * patch. On a heavily patched panel the answer can still be the section index, because the cables are part of it.
 */
export function describesWhole(def: SynthDef): boolean {
  let size = wholeSizes.get(def);
  if (size === undefined) {
    size = describeSynth(def, def.init, []).length;
    wholeSizes.set(def, size);
  }
  return size <= DESCRIBE_MAX_CHARS;
}

/**
 * One line per section: `id | name | controls | jacks`, in the definition's order. Jacks are counted too: a section
 * can hold only jacks (a modular's output panel), and a 0 there would read as empty.
 */
export function sectionIndex(def: SynthDef): string {
  const rows = def.areas.map((a) => {
    const { controls, jacks } = areaMembers(def, a);
    return `${a.id} | ${a.label} | ${controls.length} | ${jacks.filter(modelled).length}`;
  });
  return `SECTIONS (id | name | controls | jacks)\n${rows.join('\n')}`;
}
