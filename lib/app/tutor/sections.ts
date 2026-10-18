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
import type { SynthDef } from '@/lib/app/synths/contract';

/** The most `describe_synth` returns in one call. A synth, section or prefix that describes in more gets an index. */
export const DESCRIBE_MAX_CHARS = 8000;

const wholeSizes = new WeakMap<SynthDef, number>();

/** Whether `describe_synth` with no section returns the whole synth (true) or its section index. */
export function describesWhole(def: SynthDef): boolean {
  let size = wholeSizes.get(def);
  if (size === undefined) {
    size = describeSynth(def, def.init, []).length;
    wholeSizes.set(def, size);
  }
  return size <= DESCRIBE_MAX_CHARS;
}

/** One line per section: `id | name | controls`, in the definition's order. */
export function sectionIndex(def: SynthDef): string {
  const rows = def.areas.map(
    (a) => `${a.id} | ${a.label} | ${areaMembers(def, a).controls.length}`
  );
  return `SECTIONS (id | name | controls)\n${rows.join('\n')}`;
}
