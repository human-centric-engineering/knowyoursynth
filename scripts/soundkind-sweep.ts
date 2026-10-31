/**
 * Run the sound detector over every library sound, on worker threads, for the fit (`scripts/fit-soundkind.ts`) and
 * the library test (`tests/unit/lib/app/synths/lib/soundkind-library.test.ts`).
 *
 * Reads the catalogue's seed data, as `check:synths` does: the library's categories are the labels the detector is
 * fitted and measured against, and the seed data is what the library is seeded from. About 80 ms of rendering a sound,
 * so the sounds are dealt round the worker threads (each a copy of this file, run through tsx) and the rows come back
 * sorted, the same whatever the thread count.
 */
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { getSynthDef } from '@/lib/app/synths/defs';
import { firstLoop, defaultRole } from '@/lib/app/patterns/library-facts';
import { importPhrase } from '@/lib/app/sequencer/import';
import { PRESET_CATEGORIES, type PresetCategory } from '@/lib/app/synths/contract';
import { presetState } from '@/lib/app/synths/lib/patch';
import { validatePreset } from '@/lib/app/synths/validate';
import { engineOf } from '@/lib/app/synths/lib/predict';
import { soundFeatures } from '@/lib/app/synths/lib/soundkind';
import type { KindRow } from '@/lib/app/synths/lib/soundkind-fit';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

const isCategory = (x: string | undefined): x is PresetCategory =>
  PRESET_CATEGORIES.some((c) => c === x);

/** Every `of`-th library sound from the `shard`-th, read by the detector. */
export function sweepShard(shard: number, of: number): KindRow[] {
  const rows: KindRow[] = [];
  let k = 0;
  for (const file of loadCatalogueData().sounds) {
    const def = getSynthDef(file.synth);
    if (!def) throw new Error(`soundkind sweep: no definition for ${file.synth}`);
    for (const input of file.sounds) {
      if (k++ % of !== shard) continue;
      const checked = validatePreset(def, input);
      if (!checked.ok)
        throw new Error(`soundkind sweep: ${file.synth}/${String(input.id)} is not a valid sound`);
      const sound = checked.value;
      const category = sound.tags[0];
      if (!isCategory(category))
        throw new Error(`soundkind sweep: ${file.synth}/${sound.id} has no category`);
      const { notes, beats } = firstLoop(importPhrase(sound.phrase));
      const { values, cables } = presetState(def, sound);
      rows.push({
        synth: file.synth,
        id: sound.id,
        category,
        role: defaultRole(notes, beats),
        features: soundFeatures(engineOf(def, values, cables, 0)),
      });
    }
  }
  return rows;
}

/** A worker thread's orders: which shard of how many. The marker tells this file it is the worker. */
interface SweepOrders {
  soundkindSweep: true;
  shard: number;
  of: number;
}
const isOrders = (x: unknown): x is SweepOrders =>
  typeof x === 'object' && x !== null && 'soundkindSweep' in x;

/** Every library sound, read by the detector, sorted by synth and sound. */
export async function sweepLibrary(
  threads = Math.max(1, availableParallelism() - 1)
): Promise<KindRow[]> {
  const shards = await Promise.all(
    Array.from(
      { length: threads },
      (_, shard) =>
        new Promise<KindRow[]>((resolve, reject) => {
          const orders: SweepOrders = { soundkindSweep: true, shard, of: threads };
          const worker = new Worker(new URL(import.meta.url), {
            workerData: orders,
            execArgv: ['--import', 'tsx'],
          });
          // Our own worker posts exactly one message: its rows.
          worker.once('message', (rows: KindRow[]) => {
            resolve(rows);
            void worker.terminate();
          });
          worker.once('error', reject);
        })
    )
  );
  return shards
    .flat()
    .sort((a, b) =>
      a.synth === b.synth ? a.id.localeCompare(b.id) : a.synth.localeCompare(b.synth)
    );
}

if (!isMainThread && isOrders(workerData)) {
  parentPort?.postMessage(sweepShard(workerData.shard, workerData.of));
}
