// @vitest-environment happy-dom

/**
 * The library ranked for the Play deck's pattern picker (`f-pattern-picker` t-213): nothing while the picker is closed;
 * once it is open and the panel has settled, one reading and one `POST /rank`; the answer held while it stays open,
 * and kept for each reading; a reading that fails asked for without features; a read that fails said, and tried again
 * on the next opening. The sound detector and the API are fakes, so these are about when it asks and with what.
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

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api/client', () => ({ apiClient: { post: vi.fn() } }));
const detector = vi.hoisted(() => ({ read: vi.fn(), dispose: vi.fn() }));
vi.mock('@/lib/app/patterns/suggest-detect', () => ({
  createKindReader: () => detector,
}));

const post = apiClient.post as Mock;

const def = getSynthDef('model-d');
if (!def) throw new Error('model-d is not registered');
beforeAll(async () => {
  await loadSynthDef('model-d');
});

const RESULT: RankResult = { reading: null, sections: [] };
const PANEL = { values: { ...def.init }, cables: [] };
const FEATURES = { silent: false, attack: 0.01 };

const base = (over: Partial<RankInput> = {}): RankInput => ({
  synthId: 'model-d',
  def,
  panel: PANEL,
  sound: 'fat-bass',
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
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useRankedPatterns', () => {
  it('reads nothing while the picker is closed, or while the panel is not settled', async () => {
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base(),
    });
    await settle(SETTLE_MS * 3);
    expect(result.current).toEqual({ state: 'off', result: null });
    rerender(base({ open: true, enabled: false }));
    await settle(SETTLE_MS * 3);
    expect(result.current.state).toBe('off');
    expect(detector.read).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('waits for the panel to settle, then reads it and ranks the library for it', async () => {
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base(),
    });
    rerender(base({ open: true }));
    expect(result.current.state).toBe('reading');
    await settle(SETTLE_MS - 1);
    expect(post).not.toHaveBeenCalled();
    await settle(1);
    expect(post).toHaveBeenCalledWith('/api/v1/library-patterns/rank', {
      body: { synthId: 'model-d', sound: 'fat-bass', features: FEATURES },
    });
    expect(result.current).toEqual({ state: 'ready', result: RESULT });
  });

  it('opens on a panel long settled without waiting, and names no sound when the patch started as none', async () => {
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ sound: null }),
    });
    await settle(SETTLE_MS * 2);
    rerender(base({ sound: null, open: true }));
    await settle(0);
    expect(post).toHaveBeenCalledWith('/api/v1/library-patterns/rank', {
      body: { synthId: 'model-d', features: FEATURES },
    });
    expect(result.current.state).toBe('ready');
  });

  it('holds its answer while open, and ranks again on opening once the patch has moved', async () => {
    const moved = { values: { ...def.init, 'filter.cutoff': 3 }, cables: [] };
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true }),
    });
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
    // a knob turned with the picker open changes nothing under the pointer
    rerender(base({ open: true, panel: moved }));
    await settle(SETTLE_MS * 2);
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('ready');

    detector.read.mockResolvedValue({ ...FEATURES, attack: 0.5 });
    rerender(base({ panel: moved }));
    rerender(base({ open: true, panel: moved }));
    await settle();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({
      body: { synthId: 'model-d', sound: 'fat-bass', features: { ...FEATURES, attack: 0.5 } },
    });
  });

  it('keeps the answer for a reading, so a patch that reads the same is not asked about again', async () => {
    const { rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true }),
    });
    await settle();
    rerender(base());
    rerender(base({ open: true }));
    await settle();
    expect(detector.read).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('asks for the library without features when the patch could not be read', async () => {
    detector.read.mockRejectedValue(new Error('no audio'));
    const { result } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true }),
    });
    await settle();
    expect(post).toHaveBeenCalledWith('/api/v1/library-patterns/rank', {
      body: { synthId: 'model-d', sound: 'fat-bass' },
    });
    expect(result.current.state).toBe('ready');
  });

  it('says the library could not be read, and asks again the next time it opens', async () => {
    post.mockRejectedValueOnce(new Error('Server error'));
    const { result, rerender } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true }),
    });
    await settle();
    expect(result.current).toEqual({ state: 'error', result: null });
    rerender(base());
    expect(result.current.state).toBe('off');
    rerender(base({ open: true }));
    await settle();
    expect(post).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ state: 'ready', result: RESULT });
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

  it('lets the detector go when it unmounts', async () => {
    const { unmount } = renderHook((p: RankInput) => useRankedPatterns(p), {
      initialProps: base({ open: true }),
    });
    await settle();
    unmount();
    expect(detector.dispose).toHaveBeenCalledTimes(1);
  });
});
