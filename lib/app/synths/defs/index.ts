/**
 * The definition registry: every synth the app can play, by id (D1).
 *
 * Ported from `prototype/src/synths/index.js`, which was also the catalogue. Here it holds the
 * instrument only. Which synths are listed, and in what order, is the `Synth` table's job (m2),
 * and a synth's "Heard on" list comes from the databank (`f-databank`), not from this file.
 *
 * A synth joins by adding its module under `defs/` and one line below (`.context/app/synths.md`).
 */
import type { SynthDef } from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';

/** A definition as the app holds it: always versioned. */
export type AppSynthDef = SynthDef & { version: number };

/** Every ported definition. Order carries no meaning. */
export const SYNTH_DEFS: readonly AppSynthDef[] = [modelD];

const byId = new Map(SYNTH_DEFS.map((d) => [d.id, d]));

/** The definition for an id, or `null` when no synth has that id. */
export function getSynthDef(id: string): AppSynthDef | null {
  return byId.get(id) ?? null;
}
