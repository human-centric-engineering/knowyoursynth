/**
 * The kept public library (`f-pattern-prefetch` t-262): no call waits on a read after the first.
 *
 * - Within `KEEP_MS` the kept copy is served and nothing is read.
 * - After it, the call still gets the kept copy at once, one refresh starts behind it, and the next call gets the
 *   refreshed copy.
 * - A refresh that fails keeps the old copy, and it is not tried again until another `KEEP_MS` has passed.
 * - A refreshed copy is stamped with the caller's clock plus the time the read took, so it is fresh for `KEEP_MS` after
 *   it lands; no refresh starts while the first read is on its way; a refresh that fails after a forget reports nothing.
 * - The kept copy is shared across module graphs (`globalThis`), so the boot warm in `instrumentation.ts` reaches the
 *   routes.
 * - `forgetSuggestLibrary()` makes the next call read afresh, and a refresh that began before it is not kept.
 * - `warmPublicLibrary()` fills the kept copy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRead = vi.hoisted(() => ({
  listAllPublicPatterns: vi.fn(),
  listPublicPatternCategories: vi.fn(),
  categoryOfTags: vi.fn(),
}));
vi.mock('@/lib/app/patterns/library-read', () => mockRead);
vi.mock('@/lib/db/client', () => ({ prisma: {} }));
const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import {
  forgetSuggestLibrary,
  KEEP_MS,
  publicLibrary,
  warmPublicLibrary,
} from '@/lib/app/patterns/suggest-read';

/** A promise and the means to settle it, so a read can be held in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const viewsOf = (id: string) => [{ id }];
/** Lets every settled promise's callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  // The real clock only measures how long a refresh took; held still, a read takes no time unless a test says so.
  vi.spyOn(Date, 'now').mockReturnValue(0);
  forgetSuggestLibrary();
  mockRead.listPublicPatternCategories.mockResolvedValue(new Map());
});

describe('publicLibrary', () => {
  it('reads once, then serves the kept copy within KEEP_MS without reading', async () => {
    mockRead.listAllPublicPatterns.mockResolvedValue(viewsOf('first'));
    const t0 = 1_000_000;
    const a = await publicLibrary(t0);
    const b = await publicLibrary(t0 + KEEP_MS - 1);
    expect(a.views).toEqual([{ id: 'first' }]);
    expect(b).toBe(a);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(1);
  });

  it('after KEEP_MS serves the kept copy at once, starts one refresh, and the next call gets it', async () => {
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('first'));
    const t0 = 1_000_000;
    await publicLibrary(t0);

    const refresh = deferred<{ id: string }[]>();
    mockRead.listAllPublicPatterns.mockReturnValueOnce(refresh.promise);
    // The refresh is still on its way: the call is answered from the kept copy, not held behind the read.
    const stale = await publicLibrary(t0 + KEEP_MS);
    expect(stale.views).toEqual([{ id: 'first' }]);
    // A second stale call while it is on its way starts no other read.
    await publicLibrary(t0 + KEEP_MS + 5);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(2);

    refresh.resolve(viewsOf('second'));
    await flush();
    const fresh = await publicLibrary(t0 + KEEP_MS + 10);
    expect(fresh.views).toEqual([{ id: 'second' }]);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(2);
  });

  it('keeps the old copy when a refresh fails, logs it, and tries again only after another KEEP_MS', async () => {
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('first'));
    const t0 = 1_000_000;
    await publicLibrary(t0);

    mockRead.listAllPublicPatterns.mockRejectedValueOnce(new Error('db down'));
    await publicLibrary(t0 + KEEP_MS);
    await flush();
    expect(mockLog.warn).toHaveBeenCalledWith(
      'pattern suggestions: the public library could not be read again',
      expect.objectContaining({ err: 'Error: db down' })
    );

    // Within KEEP_MS of the failed try: the old copy, and no other read.
    expect((await publicLibrary(t0 + 2 * KEEP_MS - 1)).views).toEqual([{ id: 'first' }]);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(2);

    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('third'));
    const after = await publicLibrary(t0 + 2 * KEEP_MS);
    expect(after.views).toEqual([{ id: 'first' }]);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(3);
    await flush();
    expect((await publicLibrary(t0 + 2 * KEEP_MS + 1)).views).toEqual([{ id: 'third' }]);
  });

  it("stamps a refreshed copy with the caller's clock, so it is refreshed again KEEP_MS later", async () => {
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('first'));
    const t0 = 1_000_000;
    await publicLibrary(t0);

    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('second'));
    await publicLibrary(t0 + KEEP_MS);
    await flush();

    // Fresh until KEEP_MS after the call that started the refresh: no read.
    expect((await publicLibrary(t0 + 2 * KEEP_MS - 1)).views).toEqual([{ id: 'second' }]);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(2);

    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('third'));
    await publicLibrary(t0 + 2 * KEEP_MS);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(3);
    await flush();
    expect((await publicLibrary(t0 + 2 * KEEP_MS + 1)).views).toEqual([{ id: 'third' }]);
  });

  it('stamps a slow refresh with when it landed, so it is fresh for KEEP_MS after it', async () => {
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('first'));
    const t0 = 1_000_000;
    await publicLibrary(t0);

    const refresh = deferred<{ id: string }[]>();
    mockRead.listAllPublicPatterns.mockReturnValueOnce(refresh.promise);
    await publicLibrary(t0 + KEEP_MS);
    // The read takes 50 s.
    vi.mocked(Date.now).mockReturnValue(50_000);
    refresh.resolve(viewsOf('second'));
    await flush();

    // Landed at t0 + KEEP_MS + 50 s: still fresh 59 s later, so no read.
    expect((await publicLibrary(t0 + 2 * KEEP_MS + 49_000)).views).toEqual([{ id: 'second' }]);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(2);
  });

  it('starts no refresh while the first read is still on its way', async () => {
    const first = deferred<{ id: string }[]>();
    mockRead.listAllPublicPatterns.mockReturnValueOnce(first.promise);
    const t0 = 1_000_000;
    const pending = publicLibrary(t0);
    // Past KEEP_MS with the first read still out: the same read, no second.
    expect(publicLibrary(t0 + KEEP_MS)).toBe(pending);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(1);

    first.resolve(viewsOf('first'));
    await flush();
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('second'));
    await publicLibrary(t0 + KEEP_MS + 1);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(2);
  });

  it('reports nothing when a refresh fails after the copy it would replace was forgotten', async () => {
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('first'));
    const t0 = 1_000_000;
    await publicLibrary(t0);

    const refresh = deferred<{ id: string }[]>();
    mockRead.listAllPublicPatterns.mockReturnValueOnce(refresh.promise);
    await publicLibrary(t0 + KEEP_MS);
    forgetSuggestLibrary();
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('edited'));
    await publicLibrary(t0 + KEEP_MS + 1);

    refresh.reject(new Error('db down'));
    await flush();
    expect(mockLog.warn).not.toHaveBeenCalled();
    expect((await publicLibrary(t0 + KEEP_MS + 2)).views).toEqual([{ id: 'edited' }]);
  });

  it('is shared with another module graph, so the boot warm reaches the routes', async () => {
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('warm'));
    await warmPublicLibrary();

    // A fresh evaluation of the module, as the route bundle has: it sees the copy the boot warm kept.
    vi.resetModules();
    const other = await import('@/lib/app/patterns/suggest-read');
    expect((await other.publicLibrary()).views).toEqual([{ id: 'warm' }]);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(1);
  });

  it('does not keep a first read that fails', async () => {
    mockRead.listAllPublicPatterns.mockRejectedValueOnce(new Error('db down'));
    await expect(publicLibrary(1)).rejects.toThrow('db down');
    await flush();
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('retry'));
    expect((await publicLibrary(2)).views).toEqual([{ id: 'retry' }]);
  });

  it('reads afresh after forgetSuggestLibrary, and drops a refresh that began before it', async () => {
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('first'));
    const t0 = 1_000_000;
    await publicLibrary(t0);

    const refresh = deferred<{ id: string }[]>();
    mockRead.listAllPublicPatterns.mockReturnValueOnce(refresh.promise);
    await publicLibrary(t0 + KEEP_MS);

    forgetSuggestLibrary();
    mockRead.listAllPublicPatterns.mockResolvedValueOnce(viewsOf('edited'));
    expect((await publicLibrary(t0 + KEEP_MS + 1)).views).toEqual([{ id: 'edited' }]);

    // The older refresh lands last: it read the library from before the edit, so it is not kept.
    refresh.resolve(viewsOf('before-edit'));
    await flush();
    expect((await publicLibrary(t0 + KEEP_MS + 2)).views).toEqual([{ id: 'edited' }]);
  });
});

describe('warmPublicLibrary', () => {
  it('fills the kept copy, so the next call reads nothing', async () => {
    mockRead.listAllPublicPatterns.mockResolvedValue(viewsOf('warm'));
    await warmPublicLibrary();
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(1);
    expect((await publicLibrary()).views).toEqual([{ id: 'warm' }]);
    expect(mockRead.listAllPublicPatterns).toHaveBeenCalledTimes(1);
  });
});
