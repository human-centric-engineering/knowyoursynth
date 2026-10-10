/**
 * The definition registry: every synth the app can play, by id (D1).
 *
 * Ported from the prototype file `src/synths/index.js`, which was also the catalogue. Here it
 * holds the instrument only. Which synths are listed, and in what order, is the `Synth` table's
 * job (m2), and a synth's "Heard on" list comes from the databank (`f-databank`), not from this
 * file.
 *
 * Every definition at once, for server code: the read layer, the seed and `check:synths`. The synth page loads only
 * the one it shows, through `defs/load.ts`; it must not import this file, which would bundle them all.
 *
 * A synth joins by adding its module under `defs/`, one line below and one line in `defs/load.ts`
 * (`.context/app/synths.md`).
 */
import type { SynthDef } from '@/lib/app/synths/contract';
import modelD from '@/lib/app/synths/defs/model-d';
import neutron from '@/lib/app/synths/defs/neutron';
import pro1 from '@/lib/app/synths/defs/pro-1';
import k2 from '@/lib/app/synths/defs/k2';
import b2600 from '@/lib/app/synths/defs/b2600';
import kobol from '@/lib/app/synths/defs/kobol';
import waspDeluxe from '@/lib/app/synths/defs/wasp-deluxe';
import tb303 from '@/lib/app/synths/defs/tb-303';
import td3 from '@/lib/app/synths/defs/td-3';
import model15 from '@/lib/app/synths/defs/model-15';
import grandmother from '@/lib/app/synths/defs/grandmother';

/** A definition as the app holds it: always versioned. */
export type AppSynthDef = SynthDef & { version: number };

/** Every ported definition. Order carries no meaning. */
export const SYNTH_DEFS: readonly AppSynthDef[] = [
  modelD,
  neutron,
  pro1,
  k2,
  b2600,
  kobol,
  waspDeluxe,
  tb303,
  td3,
  model15,
  grandmother,
];

const byId = new Map(SYNTH_DEFS.map((d) => [d.id, d]));

/** The definition for an id, or `null` when no synth has that id. */
export function getSynthDef(id: string): AppSynthDef | null {
  return byId.get(id) ?? null;
}
