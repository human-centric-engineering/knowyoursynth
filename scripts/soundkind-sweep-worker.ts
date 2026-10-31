/**
 * One worker thread of the library sweep (`scripts/soundkind-sweep.ts`): reads its shard of the library and posts the
 * rows back. Started by `sweepLibrary`, never imported.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { z } from 'zod';
import { sweepShard } from '@/scripts/soundkind-sweep';

const orders = z
  .object({ shard: z.number().int().min(0), of: z.number().int().min(1) })
  .parse(workerData);
parentPort?.postMessage(sweepShard(orders.shard, orders.of));
