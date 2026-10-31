/**
 * The sound detector, run in the browser (`f-pattern-library` t-125): what a patch sounds like, read in the probe
 * worker (`probe-worker-entry.ts`, a `kind` message) so the page's thread never renders the probe notes. Where the
 * host blocks workers, or the worker never answers its first reading, it reads on the page's thread instead, as the
 * sound map does. A patch the worker cannot read fails that reading alone.
 *
 * Why here and not on the server: only the browser has the panel, and rendering about 1.25 s of audio a reading is
 * work the server would otherwise do for every visitor. The server ranks (`suggest-read.ts`), because only it has the
 * whole library.
 */
import { logger } from '@/lib/logging';
import { PROBE_WORKER_URL, type ProbeWorkerRequest } from '@/lib/app/synths/audio/probe';
import { soundFeatures, type SoundFeatures } from '@/lib/app/synths/lib/soundkind';
import type { EngineParams } from '@/lib/app/synths/contract';
import { SoundFeaturesSchema } from '@/lib/app/patterns/suggest';

/**
 * How long the worker has to answer its first reading before it is taken as blocked: loading the worker's script and
 * two readings, on a slow phone.
 */
export const KIND_WORKER_TIMEOUT_MS = 15000;

export interface KindReader {
  /** What these engine parameters sound like. */
  read(params: EngineParams): Promise<SoundFeatures>;
  dispose(): void;
}

interface Pending {
  params: EngineParams;
  resolve: (f: SoundFeatures) => void;
  reject: (err: unknown) => void;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

export function createKindReader(): KindReader {
  let worker: Worker | null | undefined; // undefined = not tried, null = blocked: read on the page's thread
  let proven = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let next = 0;
  const pending = new Map<number, Pending>();

  /** On the page's thread, after a turn of the event loop so the caller's frame paints first. */
  const readHere = (p: Pending) =>
    setTimeout(() => {
      try {
        p.resolve(soundFeatures(p.params));
      } catch (err) {
        p.reject(err);
      }
    }, 0);

  const giveUp = (why: string) => {
    if (worker === null) return;
    logger.warn('Sound detector worker failed; reading on the main thread', {
      url: PROBE_WORKER_URL,
      error: why,
    });
    worker?.terminate();
    worker = null;
    clearTimeout(timer);
    const waiting = [...pending.values()];
    pending.clear();
    waiting.forEach(readHere);
  };

  const spawn = (): Worker | null => {
    if (worker !== undefined) return worker;
    try {
      const w = new Worker(PROBE_WORKER_URL);
      w.onmessage = (m: MessageEvent<unknown>) => {
        const msg = m.data;
        if (!isObj(msg) || msg.type !== 'kind' || typeof msg.id !== 'number') return;
        proven = true;
        clearTimeout(timer);
        timer = undefined;
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        // It crosses a thread boundary: read it as the endpoint will.
        const features = SoundFeaturesSchema.safeParse(msg.features);
        if (features.success) p.resolve(features.data);
        else p.reject(new Error('sound detector: the worker sent something that is not a reading'));
      };
      w.onerror = (e) => giveUp(e.message || 'error');
      worker = w;
    } catch (err) {
      worker = null;
      logger.warn('Sound detector worker blocked; reading on the main thread', {
        url: PROBE_WORKER_URL,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return worker;
  };

  return {
    read(params) {
      return new Promise<SoundFeatures>((resolve, reject) => {
        const p: Pending = { params, resolve, reject };
        const w = spawn();
        if (!w) {
          readHere(p);
          return;
        }
        const id = next++;
        pending.set(id, p);
        const msg: ProbeWorkerRequest = { type: 'kind', id, params };
        w.postMessage(msg);
        if (!proven) {
          // From the first reading still unanswered: a later one does not put the deadline back.
          timer ??= setTimeout(() => giveUp('no answer'), KIND_WORKER_TIMEOUT_MS);
        }
      });
    },
    dispose() {
      clearTimeout(timer);
      worker?.terminate();
      worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      waiting.forEach((p) => p.reject(new Error('sound detector: disposed')));
    },
  };
}
