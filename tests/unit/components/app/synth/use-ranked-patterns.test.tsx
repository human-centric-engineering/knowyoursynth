// @vitest-environment happy-dom

/**
 * The library ranked for the Play deck's pattern picker (`f-pattern-picker` t-213): nothing while the picker is closed;
 * once it is open and the panel has settled, one reading and one `POST /rank`; the answer held while it stays open,
 * and kept for each reading; a reading that fails asked for without features; a read that fails said, and tried again
 * on the next opening. The start sound is read once per start (t-255): a patch not moved far from it asks `asCame`, so
 * the library is limited to that sound's category; one moved far, or whose start could not be read, does not. A patch
 * still as it came is read once (t-263). The sound detector and the API are fakes, so these are about when it asks and
 * with what. When it is worked out in the background, and what an open picker offers, are `use-patch-answer.test.tsx`.
 *
 * @see components/app/synth/use-ranked-patterns.ts
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRankedPatterns, type RankInput } from '@/components/app/synth/use-ranked-patterns';
import { SETTLE_MS } from '@/components/app/sequencer/use-suggested-patterns';
import { apiClient } from '@/lib/api/client';
import type { RankResult } from '@/lib/app/patterns/rank-read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';
import type { SoundFeatures } from '@/lib/app/synths/lib/soundkind';
import { createPatchReadings, type PatchReadings } from '@/lib/app/patterns/suggest-detect';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api/client', () => ({ apiClient: { post: vi.fn() } }));
const detector = { read: vi.fn(), dispose: vi.fn(), onPageThread: false };
let readings: PatchReadings;

const post = apiClient.post as Mock;

const def = getSynthDef('model-d');
if (!def) throw new Error('model-d is not registered');
beforeAll(async () => {
  await loadSynthDef('model-d');
});

const RESULT: RankResult = { reading: null, category: null, sections: [] };
const PANEL = { values: { ...def.init }, cables: [] };
/** A panel moved from the start sound. */
const MOVED = { values: { ...def.init, 'filter.cutoff': 3 }, cables: [] };
/** The library sound the patch started as: the same object while it is the same sound. */
const START = { slug: 'fat-bass', panel: () => PANEL };
/** A whole reading, so how far the patch is from the start sound (`movedFar`) can be worked out. */
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

const base = (over: Partial<RankInput> = {}): RankInput => ({
  readings,
  // Busy unless a test says otherwise, so nothing is prepared in the background: these are about the open picker.
  busy: true,
  synthId: 'model-d',
  def,
  panel: PANEL,
  start: START,
  open: false,
  ...over,
});

/** Lets the settle wait end and the reading and the request settle. */
async function settle(ms = SETTLE_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset().mockResolvedValue(RESULT);
  detector.read.mockReset().mockResolvedValue(FEATURES);
  detector.dispose.mockReset();
  readings = createPatchReadings(detector);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useRankedPatterns', () => {
  it('reads nothing while the panel is not settled yet, open or closed', async () => {
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ enabled: false, busy: false }),
    });
    await settle(SETTLE_MS * 3);
    expect(result.current.state).toBe('off');
    rerender(base({ open: true, enabled: false }));
    await settle(SETTLE_MS * 3);
    expect(result.current.state).toBe('off');
    expect(detector.read).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('waits for the panel to settle, then reads it once, as it came, and ranks the library for it', async () => {
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base(),
    });
    rerender(base({ open: true }));
    expect(result.current.state).toBe('reading');
    await settle(SETTLE_MS - 1);
    expect(post).not.toHaveBeenCalled();
    await settle(1);
    // the panel is the start sound's: one reading serves for both
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/v1/library-patterns/rank', {
      body: { synthId: 'model-d', sound: 'fat-bass', features: FEATURES, asCame: true },
    });
    expect(result.current).toMatchObject({ state: 'ready', result: RESULT, fresher: null });
  });

  it('opens on a panel long settled without waiting, and names no sound when the patch started as none', async () => {
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ start: null }),
    });
    await settle(SETTLE_MS * 2);
    rerender(base({ start: null, open: true }));
    await settle(0);
    expect(post).toHaveBeenCalledWith('/api/v1/library-patterns/rank', {
      body: { synthId: 'model-d', features: FEATURES },
    });
    expect(result.current.state).toBe('ready');
  });

  it('opens on the answer it has for a panel it has read, and ranks again on opening once the patch moved far', async () => {
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true }),
    });
    await settle();
    rerender(base());
    rerender(base({ open: true }));
    // nothing more to read or ask: the answer is there as it opens
    expect(result.current).toMatchObject({ state: 'ready', result: RESULT });
    expect(detector.read).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);

    detector.read.mockResolvedValue({ ...FEATURES, attack: 0.5 });
    rerender(base({ panel: MOVED }));
    rerender(base({ open: true, panel: MOVED }));
    expect(result.current.state).toBe('reading');
    await settle();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({
      body: { synthId: 'model-d', sound: 'fat-bass', features: { ...FEATURES, attack: 0.5 } },
    });
    expect(result.current.state).toBe('ready');
  });

  it('asks nothing new of a patch that reads the same', async () => {
    const { rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true }),
    });
    await settle();
    rerender(base());
    // moved, but it reads as it did: its answer is the one kept
    rerender(base({ open: true, panel: MOVED }));
    await settle();
    expect(detector.read).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('waits again when the panel changes before it has settled, then reads it as it settled', async () => {
    const { rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base(),
    });
    rerender(base({ open: true }));
    await settle(SETTLE_MS - 100);
    // a patch's glide, still moving the panel as the picker opened
    rerender(base({ open: true, panel: MOVED }));
    await settle(100);
    expect(detector.read).not.toHaveBeenCalled();
    await settle(SETTLE_MS - 100);
    // the start sound, and the panel as it settled
    expect(detector.read).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('reads the panel again on the next opening when it could not be read', async () => {
    // the start sound's reading first, then the panel's
    detector.read.mockResolvedValueOnce(FEATURES).mockRejectedValueOnce(new Error('no audio'));
    const { rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true, panel: MOVED }),
    });
    await settle();
    expect(post.mock.calls[0][1]).toEqual({
      body: { synthId: 'model-d', sound: 'fat-bass', asCame: true },
    });
    rerender(base({ panel: MOVED }));
    rerender(base({ open: true, panel: MOVED }));
    await settle();
    // the panel twice; the start sound, read the first time, is not read again
    expect(detector.read).toHaveBeenCalledTimes(3);
    expect(post.mock.calls[1][1]).toEqual({
      body: { synthId: 'model-d', sound: 'fat-bass', features: FEATURES, asCame: true },
    });
  });

  it('asks for the library without features when the patch could not be read', async () => {
    detector.read.mockRejectedValue(new Error('no audio'));
    const { result } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true }),
    });
    await settle();
    // nothing heard to go by, so the start sound's category is
    expect(post).toHaveBeenCalledWith('/api/v1/library-patterns/rank', {
      body: { synthId: 'model-d', sound: 'fat-bass', asCame: true },
    });
    expect(result.current.state).toBe('ready');
  });

  it('takes the patch to be the sound as it came when the start sound could not be read', async () => {
    // the start sound's reading first, then the panel's
    detector.read.mockRejectedValueOnce(new Error('no audio')).mockResolvedValueOnce(FEATURES);
    renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true, panel: MOVED }),
    });
    await settle();
    expect(post).toHaveBeenCalledWith('/api/v1/library-patterns/rank', {
      body: { synthId: 'model-d', sound: 'fat-bass', features: FEATURES, asCame: true },
    });
  });

  it('says the library could not be read, and asks again the next time it opens', async () => {
    post.mockRejectedValueOnce(new Error('Server error'));
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true }),
    });
    await settle();
    expect(result.current).toMatchObject({ state: 'error', result: null });
    rerender(base());
    expect(result.current.state).toBe('off');
    rerender(base({ open: true }));
    await settle();
    expect(post).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ state: 'ready', result: RESULT });
  });

  it('lets go of an answer that arrives after the picker has closed', async () => {
    let answer: (r: RankResult) => void = () => undefined;
    post.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true }),
    });
    await settle();
    rerender(base());
    await act(async () => answer(RESULT));
    expect(result.current.state).toBe('off');
  });
});
