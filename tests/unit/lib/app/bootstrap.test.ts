/**
 * The app boot seam (`lib/app/bootstrap.ts`): it reads the public pattern library ahead (`f-pattern-prefetch` t-262),
 * without start-up waiting on it, and a failed read is logged, not thrown.
 *
 * FORK NOTE: this is Know Your Synth's own test of the boot seam it fills, so it reads `initApp` for real on purpose.
 * Upstream's no-op row for the seam is re-pinned in `tests/unit/lib/app/defaults.test.ts` (ledger row 9). A boot job
 * added to `initApp` later belongs in both: its behaviour here, and its pin there.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockWarm = vi.hoisted(() => vi.fn());
vi.mock('@/lib/app/patterns/suggest-read', () => ({ warmPublicLibrary: mockWarm }));
const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import { initApp } from '@/lib/app/bootstrap';

/** Lets the dynamic imports and the warm's callbacks run. */
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initApp', () => {
  it('reads the public pattern library ahead', async () => {
    mockWarm.mockResolvedValue(undefined);
    await initApp();
    await settle();
    expect(mockWarm).toHaveBeenCalledTimes(1);
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it('does not wait on the read: it resolves while the read is still on its way', async () => {
    mockWarm.mockReturnValue(new Promise(() => {}));
    await expect(initApp()).resolves.toBeUndefined();
  });

  it('logs a read that fails, and does not throw', async () => {
    mockWarm.mockRejectedValue(new Error('db down'));
    await expect(initApp()).resolves.toBeUndefined();
    await settle();
    expect(mockLog.warn).toHaveBeenCalledWith(
      'app boot: the public pattern library could not be read ahead',
      { err: 'Error: db down' }
    );
  });
});
