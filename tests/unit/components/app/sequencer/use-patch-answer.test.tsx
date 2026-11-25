// @vitest-environment happy-dom

/**
 * Pattern suggestions found in the background (`f-pattern-prefetch` t-263), through both pickers' hooks: prepared with
 * the picker closed once the panel has settled and nothing has played for a while, so opening finds them; never while
 * anything plays, and not at all where the detector reads on the page's thread; found again on a far move and not on a
 * near one; an open picker's list held still, a newer one offered as `fresher`; and one reader for the page.
 *
 * The sound detector (`KindReader`) and the API are fakes; the panel readings over the detector are real.
 *
 * @see components/app/sequencer/use-patch-answer.ts
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRankedPatterns, type RankInput } from '@/components/app/synth/use-ranked-patterns';
import {
  useSuggestedPatterns,
  type SuggestInput,
} from '@/components/app/sequencer/use-suggested-patterns';
import { QUIET_MS, SETTLE_MS, usePatchReadings } from '@/components/app/sequencer/use-patch-answer';
import { apiClient } from '@/lib/api/client';
import {
  createPatchReadings,
  ReadSkipped,
  type PatchReadings,
  type ReadOptions,
} from '@/lib/app/patterns/suggest-detect';
import type { RankResult } from '@/lib/app/patterns/rank-read';
import type { SuggestResult } from '@/lib/app/patterns/suggest-read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import type { EngineParams } from '@/lib/app/synths/contract';
import type { SoundFeatures } from '@/lib/app/synths/lib/soundkind';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api/client', () => ({ apiClient: { post: vi.fn() } }));
const made = vi.hoisted(() => ({ dispose: vi.fn() }));
vi.mock('@/lib/app/patterns/suggest-detect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/app/patterns/suggest-detect')>()),
  // Only `usePatchReadings` makes its own; every other test hands the hooks readings over the fake below.
  createKindReader: () => ({ read: vi.fn(), dispose: made.dispose, onPageThread: false }),
}));

const post = apiClient.post as Mock;

const def = getSynthDef('model-d');
if (!def) throw new Error('model-d is not registered');
beforeAll(async () => {
  await loadSynthDef('model-d');
});

const FEATURES: SoundFeatures = {
  silent: false,
  attack: 0.01,
  decay: 0.3,
  sustain: 0.5,
  release: 0.2,
  pulses: 0,
  wobble: 0,
  brightness: 0,
  brightMove: 0,
  noise: 0,
  clarity: 1,
  pitch: 0,
  tracking: 1,
  drift: 0,
  levels: { low: -10, mid: -12, high: -30 },
  voices: 1,
};
/** A reading moved far from `FEATURES`. */
const FAR: SoundFeatures = { ...FEATURES, attack: 0.5 };
const R1: RankResult = { reading: null, category: null, sections: [] };
const R2: RankResult = { reading: null, category: 'bass', sections: [] };
const SUITS: SuggestResult = { category: null, reading: null, suggestions: [] };

const PANEL = { values: { ...def.init }, cables: [] };
const MOVED = { values: { ...def.init, 'filter.cutoff': 3 }, cables: [] };
const MOVED_MORE = { values: { ...def.init, 'filter.cutoff': 5 }, cables: [] };
const START = { slug: 'fat-bass', panel: () => PANEL };

/**
 * The detector: reads what `heard` says, one reading at a time as the real one does, and skips background work when it
 * is on the page's thread, as the real one does.
 */
const detector = {
  onPageThread: false,
  read: vi.fn<(p: EngineParams, opts?: ReadOptions) => Promise<SoundFeatures>>(),
  dispose: vi.fn(),
};
let heard: () => Promise<SoundFeatures>;
let readings: PatchReadings;

const ranked = (over: Partial<RankInput> = {}): RankInput => ({
  readings,
  synthId: 'model-d',
  def,
  panel: PANEL,
  start: START,
  open: false,
  busy: false,
  ...over,
});

/** Lets the waits end and the readings and requests settle. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset().mockResolvedValue(R1);
  heard = async () => FEATURES;
  detector.onPageThread = false;
  detector.read.mockReset().mockImplementation(async (_p, opts) => {
    if (opts?.background && detector.onPageThread) throw new ReadSkipped('page-thread');
    return heard();
  });
  detector.dispose.mockReset();
  made.dispose.mockReset();
  readings = createPatchReadings(detector);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('found in the background', () => {
  it('prepares the answer with the picker closed, so opening shows it with nothing more asked', async () => {
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: ranked(),
    });
    await wait(SETTLE_MS + 1);
    // the patch as it came: one reading, for the start sound and the panel alike
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(detector.read.mock.calls[0][1]).toMatchObject({ background: true });
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('off');

    rerender(ranked({ open: true }));
    expect(result.current).toMatchObject({ state: 'ready', result: R1, fresher: null });
    await wait(SETTLE_MS * 3);
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('reads and asks nothing while busy, and starts once it has been quiet a while', async () => {
    const { rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: ranked({ busy: true }),
    });
    await wait(SETTLE_MS * 5);
    expect(detector.read).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();

    rerender(ranked({ busy: false }));
    await wait(QUIET_MS - 1);
    expect(detector.read).not.toHaveBeenCalled();
    // and then at idle
    await wait(2);
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not start a request it has not started when something starts playing', async () => {
    let answer: (f: SoundFeatures) => void = () => undefined;
    heard = () => new Promise((r) => (answer = r));
    const { rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: ranked(),
    });
    await wait(SETTLE_MS + 1);
    expect(detector.read).toHaveBeenCalledTimes(1);
    // a key goes down while the patch is being read: the reading finishes, the request is not made
    rerender(ranked({ busy: true }));
    await act(async () => answer(FEATURES));
    await wait(SETTLE_MS * 5);
    expect(post).not.toHaveBeenCalled();

    // once quiet again, the reading it has is asked about
    rerender(ranked({ busy: false }));
    await wait(QUIET_MS + 1);
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not start a reading still waiting its turn when something starts playing', async () => {
    let answer: (f: SoundFeatures) => void = () => undefined;
    heard = () => new Promise((r) => (answer = r));
    // the start sound and a moved panel: two readings, the second waiting on the first
    const queue = createPatchReadings({
      ...detector,
      // one at a time, as the real reader: the second begins only when the first has answered
      read: (() => {
        let ahead: Promise<unknown> = Promise.resolve();
        return (p: EngineParams, opts?: ReadOptions) => {
          const turn = ahead.then(() => {
            if (opts?.signal?.aborted) throw new ReadSkipped('aborted');
            return detector.read(p, opts);
          });
          ahead = turn.catch(() => undefined);
          return turn;
        };
      })(),
    });
    const { rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: ranked({ readings: queue, panel: MOVED }),
    });
    await wait(SETTLE_MS + 1);
    expect(detector.read).toHaveBeenCalledTimes(1);
    rerender(ranked({ readings: queue, panel: MOVED, busy: true }));
    await act(async () => answer(FEATURES));
    await wait(SETTLE_MS * 5);
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
  });

  it('asks again for a patch moved far from what its answer was found for, and not for one moved a little', async () => {
    post.mockResolvedValueOnce(R1).mockResolvedValueOnce(R2);
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: ranked(),
    });
    await wait(SETTLE_MS + 1);
    expect(post).toHaveBeenCalledTimes(1);

    // moved, but it reads near what the answer was found for: the answer stands
    rerender(ranked({ panel: MOVED }));
    await wait(SETTLE_MS + 1);
    expect(detector.read).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(1);

    heard = async () => FAR;
    rerender(ranked({ panel: MOVED_MORE }));
    await wait(SETTLE_MS + 1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({
      body: { synthId: 'model-d', sound: 'fat-bass', features: FAR },
    });
    // the closed picker took it: opening shows it at once
    rerender(ranked({ panel: MOVED_MORE, open: true }));
    expect(result.current).toMatchObject({ state: 'ready', result: R2 });
  });

  it('waits on the browser being idle where it can', async () => {
    const idle: Array<() => void> = [];
    vi.stubGlobal('requestIdleCallback', (run: () => void) => idle.push(run));
    vi.stubGlobal('cancelIdleCallback', () => undefined);
    const { unmount } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: ranked(),
    });
    await wait(SETTLE_MS * 3);
    expect(idle).toHaveLength(1);
    expect(detector.read).not.toHaveBeenCalled();
    await act(async () => idle[0]());
    await wait(0);
    expect(detector.read).toHaveBeenCalledTimes(1);
    // while the stubs are still in place
    unmount();
  });
});

describe('an open picker', () => {
  it('holds its list when a newer answer lands, and offers it as fresher', async () => {
    post.mockResolvedValueOnce(R1).mockResolvedValueOnce(R2);
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: ranked({ open: true }),
    });
    await wait(SETTLE_MS);
    expect(result.current).toMatchObject({ state: 'ready', result: R1, fresher: null });

    // moved a little with the picker open: nothing to offer
    rerender(ranked({ open: true, panel: MOVED }));
    await wait(SETTLE_MS);
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.fresher).toBeNull();

    heard = async () => FAR;
    rerender(ranked({ open: true, panel: MOVED_MORE }));
    await wait(SETTLE_MS);
    expect(post).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ state: 'ready', result: R1, fresher: R2 });

    act(() => result.current.take());
    expect(result.current).toMatchObject({ state: 'ready', result: R2, fresher: null });
  });

  it('reads at once in the worker when opened while something plays', async () => {
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: ranked({ busy: true }),
    });
    await wait(SETTLE_MS * 2);
    expect(detector.read).not.toHaveBeenCalled();
    rerender(ranked({ busy: true, open: true }));
    await wait(0);
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(detector.read.mock.calls[0][1]).toMatchObject({ background: false });
    expect(result.current.state).toBe('ready');
  });
});

describe('with the detector on the page’s thread', () => {
  it('works nothing out in the background', async () => {
    detector.onPageThread = true;
    renderHook((p: RankInput) => useRankedPatterns(p), { initialProps: ranked() });
    await wait(SETTLE_MS * 5 + QUIET_MS);
    expect(detector.read).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('lets go quietly of background work it finds it cannot do off the page’s thread', async () => {
    // Not known until the first reading tries the worker: the start sound and a moved panel, both skipped.
    detector.read.mockImplementation(async (_p, opts) => {
      if (opts?.background) {
        detector.onPageThread = true;
        throw new ReadSkipped('page-thread');
      }
      return FEATURES;
    });
    const { result } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: ranked({ panel: MOVED }),
    });
    await wait(SETTLE_MS * 5 + QUIET_MS);
    expect(post).not.toHaveBeenCalled();
    expect(result.current.state).toBe('off');
  });

  it('ranks without a reading when opened while something plays, and offers the list for the patch once quiet', async () => {
    detector.onPageThread = true;
    post.mockResolvedValueOnce(R1).mockResolvedValueOnce(R2);
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: ranked({ busy: true }),
    });
    await wait(SETTLE_MS * 2);
    rerender(ranked({ busy: true, open: true }));
    await wait(0);
    // by role and name, within the start sound's category: nothing read on the page's thread meanwhile
    expect(detector.read).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith('/api/v1/library-patterns/rank', {
      body: { synthId: 'model-d', sound: 'fat-bass', asCame: true },
    });
    expect(result.current).toMatchObject({ state: 'ready', result: R1 });
    await wait(SETTLE_MS * 5);
    expect(detector.read).not.toHaveBeenCalled();

    rerender(ranked({ busy: false, open: true }));
    await wait(QUIET_MS - 1);
    expect(detector.read).not.toHaveBeenCalled();
    await wait(1);
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ state: 'ready', result: R1, fresher: R2 });
  });

  it('waits for quiet before reading for "Suits this sound" opened while something plays', async () => {
    detector.onPageThread = true;
    post.mockResolvedValue(SUITS);
    const { result, rerender } = renderHook((p: SuggestInput) => useSuggestedPatterns(p), {
      initialProps: { readings, synthId: 'model-d', def, panel: MOVED, start: null, busy: true },
    });
    act(() => result.current.want(true));
    await wait(SETTLE_MS * 3);
    expect(detector.read).not.toHaveBeenCalled();
    expect(result.current.state).toBe('reading');
    rerender({ readings, synthId: 'model-d', def, panel: MOVED, start: null, busy: false });
    await wait(QUIET_MS);
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ state: 'ready', result: SUITS });
  });
});

describe('one detector for the page', () => {
  it('reads the patch once for both pickers, through the same reader', async () => {
    post.mockImplementation(async (path: string) => (path.endsWith('/rank') ? R1 : SUITS));
    renderHook(() => {
      const panelInput = { readings, synthId: 'model-d', def, panel: MOVED, start: null };
      return {
        ranked: useRankedPatterns({ ...panelInput, open: false }),
        suggested: useSuggestedPatterns(panelInput),
      };
    });
    await wait(SETTLE_MS + 1);
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.map(([path]) => path).sort()).toEqual([
      '/api/v1/library-patterns/rank',
      '/api/v1/library-patterns/suggest',
    ]);
  });

  it('lets the reader go when the page does', () => {
    const { unmount } = renderHook(() => usePatchReadings());
    unmount();
    expect(made.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('"Suits this sound"', () => {
  it('reads a panel still for longer than the settle wait without waiting', async () => {
    post.mockResolvedValue(SUITS);
    const { result } = renderHook((p: SuggestInput) => useSuggestedPatterns(p), {
      initialProps: { readings, synthId: 'model-d', def, panel: MOVED, start: null, busy: true },
    });
    await wait(SETTLE_MS * 2);
    expect(detector.read).not.toHaveBeenCalled();
    act(() => result.current.want(true));
    await wait(0);
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ state: 'ready', result: SUITS });
  });
});
