/**
 * The per-synth loader when a definition's chunk fails to arrive: the failure is not kept, so the next render
 * tries again rather than failing for the rest of the visit.
 *
 * @see lib/app/synths/defs/load.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@/lib/app/synths/defs/model-d');
  vi.resetModules();
});

describe('loadSynthDef after a failed load', () => {
  it('rejects, keeps nothing, and loads afresh on the next call', async () => {
    vi.resetModules();
    vi.doMock('@/lib/app/synths/defs/model-d', () => {
      throw new Error('chunk lost');
    });
    const { loadSynthDef, loadedSynthDef } = await import('@/lib/app/synths/defs/load');

    const failed = loadSynthDef('model-d');
    await expect(failed).rejects.toThrow();
    expect(loadedSynthDef('model-d')).toBeUndefined();

    vi.doUnmock('@/lib/app/synths/defs/model-d');
    const retry = loadSynthDef('model-d');
    expect(retry).not.toBe(failed);
    await expect(retry).resolves.toMatchObject({ id: 'model-d' });
    expect(loadedSynthDef('model-d')?.id).toBe('model-d');
  });
});
