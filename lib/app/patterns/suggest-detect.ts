/**
 * The sound detector, run in the browser (`f-pattern-library` t-125): what a patch sounds like, read in the probe
 * worker (`probe-worker-entry.ts`, a `kind` message) so the page's thread never renders the probe notes. Where the
 * host blocks workers, or the worker never answers its first reading, it reads on the page's thread instead, as the
 * sound map does. A patch the worker cannot read fails that reading alone.
 *
 * Why here and not on the server: only the browser has the panel, and rendering about 1.25 s of audio a reading is
 * work the server would otherwise do for every visitor. The server ranks (`suggest-read.ts`), because only it has the
 * whole library.
 *
 * One reader serves the page (`f-pattern-prefetch` t-263): the Play deck's picker and the sequencer's Patterns share it
 * through `createPatchReadings`, it reads one patch at a time, and a panel is read once whoever asks. Background work
 * asks with `background`, so it is never read on the page's thread, where it would take time from the code that
 * schedules notes; and with a `signal`, so a reading it has not started yet is not started once it is called off.
 */
import { logger } from '@/lib/logging';
import { PROBE_WORKER_URL, type ProbeWorkerRequest } from '@/lib/app/synths/audio/probe';
import { soundFeatures, type SoundFeatures } from '@/lib/app/synths/lib/soundkind';
import type { EngineParams, SynthDef } from '@/lib/app/synths/contract';
import { engineOf } from '@/lib/app/synths/lib/predict';
import type { PanelState } from '@/lib/app/synths/lib/patch';
import { SoundFeaturesSchema } from '@/lib/app/patterns/suggest';

/**
 * How long the worker has to answer its first reading before it is taken as blocked: loading the worker's script and
 * two readings, on a slow phone.
 */
export const KIND_WORKER_TIMEOUT_MS = 15000;

/**
 * A reading not made, rather than one that failed: `aborted`, its `signal` called it off before it started;
 * `page-thread`, it was background work and the reader reads on the page's thread.
 */
export class ReadSkipped extends Error {
  constructor(readonly reason: 'aborted' | 'page-thread') {
    super(`sound detector: reading skipped (${reason})`);
    this.name = 'ReadSkipped';
  }
}

export interface ReadOptions {
  /** Work nobody is waiting on: skipped (`ReadSkipped`) rather than read on the page's thread. */
  background?: boolean;
  /** Once aborted, a reading still waiting for its turn is skipped. One already started finishes. */
  signal?: AbortSignal;
}

export interface KindReader {
  /** What these engine parameters sound like. One reading at a time: the rest wait their turn. */
  read(params: EngineParams, opts?: ReadOptions): Promise<SoundFeatures>;
  /** Whether readings are made on the page's thread: the host blocks workers, or the worker gave up. */
  readonly onPageThread: boolean;
  /**
   * Starts the worker now rather than at the first reading, so a host that blocks workers is known (`onPageThread`)
   * before anything is asked of it: a first reading asked while something plays is then not read on the page's thread.
   */
  warm(): void;
  /** Lets the worker go and rejects every reading not finished. The reader can be used again after. */
  dispose(): void;
}

interface Pending {
  params: EngineParams;
  background: boolean;
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
  // One reading at a time: each waits on the one before it. A dispose starts a new epoch, so what was waiting goes.
  let queue: Promise<unknown> = Promise.resolve();
  let queued = 0;
  let epoch = 0;

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
    waiting.forEach((p) => (p.background ? p.reject(new ReadSkipped('page-thread')) : readHere(p)));
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

  const begin = (params: EngineParams, opts: ReadOptions, mine: number) =>
    new Promise<SoundFeatures>((resolve, reject) => {
      if (mine !== epoch) throw new Error('sound detector: disposed');
      if (opts.signal?.aborted) throw new ReadSkipped('aborted');
      const p: Pending = { params, background: !!opts.background, resolve, reject };
      const w = spawn();
      if (!w) {
        if (p.background) reject(new ReadSkipped('page-thread'));
        else readHere(p);
        return;
      }
      const id = next++;
      const msg: ProbeWorkerRequest = { type: 'kind', id, params };
      w.postMessage(msg); // throws (and rejects) before anything waits on it
      pending.set(id, p);
      if (!proven) {
        // From the first reading still unanswered: a later one does not put the deadline back.
        timer ??= setTimeout(() => giveUp('no answer'), KIND_WORKER_TIMEOUT_MS);
      }
    });

  return {
    read(params, opts = {}) {
      const mine = epoch;
      // Begun at once with nothing ahead of it, so a reading the page waits on starts in the same turn it is asked.
      const turn =
        queued === 0 ? begin(params, opts, mine) : queue.then(() => begin(params, opts, mine));
      queued += 1;
      queue = turn
        .catch(() => undefined)
        .then(() => {
          queued -= 1;
        });
      return turn;
    },
    get onPageThread() {
      return worker === null;
    },
    warm() {
      spawn();
    },
    dispose() {
      epoch += 1;
      clearTimeout(timer);
      timer = undefined;
      worker?.terminate();
      worker = undefined;
      proven = false;
      const waiting = [...pending.values()];
      pending.clear();
      waiting.forEach((p) => p.reject(new Error('sound detector: disposed')));
    },
  };
}

// ─── The patch, read once whoever asks ───────────────────────────────────────

/** The library sound a patch started as: its panel is worked out only when it is read. */
export interface PatchStart {
  slug: string;
  panel: () => PanelState;
}

/** Whether two panels hold the same values and cables, whatever objects hold them. */
export function samePanel(a: PanelState, b: PanelState): boolean {
  if (a.values !== b.values) {
    const ka = Object.keys(a.values);
    if (ka.length !== Object.keys(b.values).length) return false;
    if (ka.some((k) => !Object.is(a.values[k], b.values[k]))) return false;
  }
  return a.cables === b.cables || JSON.stringify(a.cables) === JSON.stringify(b.cables);
}

/** The panel readings shared by the page's pattern pickers, over one `KindReader`. */
export interface PatchReadings {
  readonly onPageThread: boolean;
  /** What this panel sounds like: a panel read before (the same values and cables) is not read again. */
  panel(def: SynthDef, panel: PanelState, opts?: ReadOptions): Promise<SoundFeatures>;
  /** The start sound's panel as it came, worked out once per start. Throws where it cannot be worked out. */
  startPanel(start: PatchStart): PanelState;
  /** What the start sound sounds like as it came, read once per start. */
  start(def: SynthDef, start: PatchStart, opts?: ReadOptions): Promise<SoundFeatures>;
  dispose(): void;
}

/** How many panels' readings are kept; the oldest goes first. */
const KEEP_PANELS = 8;

interface Kept {
  def: SynthDef;
  panel: PanelState;
  features: Promise<SoundFeatures>;
}

export function createPatchReadings(reader: KindReader): PatchReadings {
  let panels: Kept[] = [];
  let starts = new WeakMap<PatchStart, { panel?: PanelState; features?: Promise<SoundFeatures> }>();

  /**
   * A reading kept for whoever asks next. One that fails is let go, so the next ask tries again. One skipped for
   * someone else (their signal, or their being background work) is read again for this caller, unless this caller
   * would be skipped too.
   */
  const shared = (
    find: () => Promise<SoundFeatures> | undefined,
    make: () => Promise<SoundFeatures>,
    opts: ReadOptions
  ): Promise<SoundFeatures> => {
    const go = (): Promise<SoundFeatures> =>
      (find() ?? make()).catch((err: unknown) => {
        const again =
          err instanceof ReadSkipped &&
          !opts.signal?.aborted &&
          (err.reason === 'aborted' || !opts.background);
        if (again) return go();
        throw err;
      });
    return go();
  };
  const readOf = (def: SynthDef, p: () => PanelState, opts: ReadOptions) =>
    // Working out a panel (presetState) or its sound (engineOf) can throw: that is a reading that failed.
    Promise.resolve().then(() => {
      const { values, cables } = p();
      return reader.read(engineOf(def, values, cables, 0), opts);
    });

  const startPanel = (start: PatchStart) => {
    let kept = starts.get(start);
    if (!kept) starts.set(start, (kept = {}));
    return (kept.panel ??= start.panel());
  };

  return {
    get onPageThread() {
      return reader.onPageThread;
    },
    panel(def, panel, opts = {}) {
      return shared(
        () => panels.find((k) => k.def === def && samePanel(k.panel, panel))?.features,
        () => {
          const k: Kept = { def, panel, features: readOf(def, () => panel, opts) };
          k.features.catch(() => (panels = panels.filter((x) => x !== k)));
          panels = [...panels, k].slice(-KEEP_PANELS);
          return k.features;
        },
        opts
      );
    },
    startPanel,
    start(def, start, opts = {}) {
      return shared(
        () => starts.get(start)?.features,
        () => {
          const features = readOf(def, () => startPanel(start), opts);
          const kept = starts.get(start) ?? {};
          kept.features = features;
          starts.set(start, kept);
          features.catch(() => {
            if (starts.get(start)?.features === features) delete kept.features;
          });
          return features;
        },
        opts
      );
    },
    dispose() {
      reader.dispose();
      panels = [];
      starts = new WeakMap();
    },
  };
}
