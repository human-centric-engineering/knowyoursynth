/**
 * The definition registry as the browser reaches it: one definition at a time, by id.
 *
 * The synth page is a client component, and a definition holds functions (`toEngine`, `fmt`), so the server cannot
 * hand one over as props: the page has to import it. Importing `defs/index.ts` would put every registered definition
 * in the page's bundle, the 1.3 MB DeepMind included, to play one of them. Here each definition is its own dynamic
 * `import()`, so the bundler gives each one its own chunk and the page fetches only the one it shows.
 *
 * Server code (the read layer, the seed, `check:synths`) keeps using `defs/index.ts`, which holds every definition
 * at once. A synth joins both: one line in `SYNTH_DEFS` there and one line in `LOADERS` here. `registry.test.ts`
 * fails when the two disagree, and `load-chunks.test.ts` fails when a definition reaches the page's own bundle.
 */
import type { AppSynthDef } from '@/lib/app/synths/defs';

/** One literal `import()` per definition: a path the bundler cannot see is a path it cannot split. */
const LOADERS: Record<string, () => Promise<{ default: AppSynthDef }>> = {
  'model-d': () => import('@/lib/app/synths/defs/model-d'),
};

/** Every id a loader exists for. */
export const LOADABLE_SYNTH_IDS: readonly string[] = Object.keys(LOADERS);

const pending = new Map<string, Promise<AppSynthDef>>();
const loaded = new Map<string, AppSynthDef>();

/**
 * The definition for an id, loading it on first call, or `null` when no synth has that id. Every call for one id
 * returns the same promise, which React's `use()` needs to tell one load from the next.
 */
export function loadSynthDef(id: string): Promise<AppSynthDef> | null {
  if (!Object.hasOwn(LOADERS, id)) return null;
  let promise = pending.get(id);
  if (!promise) {
    promise = LOADERS[id]().then((m) => {
      loaded.set(id, m.default);
      return m.default;
    });
    // A failed load (a chunk the network lost) is not kept, so the next render tries again.
    promise.catch(() => pending.delete(id));
    pending.set(id, promise);
  }
  return promise;
}

/** The definition for an id if it has already loaded, so a page that has it renders without suspending. */
export function loadedSynthDef(id: string): AppSynthDef | undefined {
  return loaded.get(id);
}
