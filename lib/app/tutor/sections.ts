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

const sectionSizes = new WeakMap<SynthDef, Map<string, number>>();

/** How many characters a section describes in on the init patch, cached per definition. */
function sectionSize(def: SynthDef, areaId: string): number {
  let sizes = sectionSizes.get(def);
  if (!sizes) sectionSizes.set(def, (sizes = new Map<string, number>()));
  let size = sizes.get(areaId);
  if (size === undefined) {
    const area = def.areas.find((a) => a.id === areaId);
    const members = area ? areaMembers(def, area) : { controls: [], jacks: [] };
    size = describeSynth({ ...def, ...members }, def.init, []).length;
    sizes.set(areaId, size);
  }
  return size;
}

/**
 * For each section too big for `describe_synth` to return at once, the prefixes inside it: `section | prefix |
 * controls`. A turn gets five model calls, so naming these up front lets the model go straight to a prefix (the
 * DeepMind's `fx1`) instead of spending a call on the section first. Empty for a synth with no such section.
 */
export function largeSectionPrefixes(def: SynthDef): string {
  const rows = def.areas
    .filter((a) => sectionSize(def, a.id) > DESCRIBE_MAX_CHARS)
    .flatMap((a) => {
      const counts = new Map<string, number>();
      for (const c of areaMembers(def, a).controls) {
        const key = c.id.split('.')[0];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts].map(([prefix, n]) => `${a.id} | ${prefix} | ${n}`);
    });
  return rows.length
    ? `PREFIXES IN LARGE SECTIONS (section | prefix | controls)\n${rows.join('\n')}`
    : '';
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
