// @vitest-environment happy-dom

/**
 * The sound patterns hook (`f-pattern-library` t-123): a library sound's patterns are read once the sequencer opens,
 * and the Default patch's (`f-default-patch`), which are in code, are offered without a read.
 *
 * @see components/app/sequencer/use-sound-patterns.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSoundPatterns } from '@/components/app/sequencer/use-sound-patterns';
import { SCALE_PATTERN_VIEW } from '@/lib/app/synths/default-patch';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiClient: api }));

beforeEach(() => {
  api.get.mockReset();
});

describe('useSoundPatterns', () => {
  it('offers the Default patch its scale, and reads nothing', () => {
    const sound = {
      synthId: 'pro-1',
      slug: 'default-patch',
      name: 'Default patch',
      defaultId: SCALE_PATTERN_VIEW.id,
    };
    const { result } = renderHook(() => useSoundPatterns(sound, true));

    expect(result.current).toMatchObject({ sound, patterns: [SCALE_PATTERN_VIEW], error: false });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('offers the Model D’s Default patch its groove first, then the scale, the same list each render (t-303)', () => {
    const sound = {
      synthId: 'model-d',
      slug: 'default-patch',
      name: 'Default Saw',
      defaultId: 'default-patch:groove:model-d',
    };
    const { result, rerender } = renderHook(() => useSoundPatterns(sound, true));
    const first = result.current?.patterns;
    expect(first?.map((p) => p.id)).toEqual([
      'default-patch:groove:model-d',
      SCALE_PATTERN_VIEW.id,
    ]);
    rerender();
    expect(result.current?.patterns).toBe(first);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('reads a library sound’s patterns once the sequencer is open', async () => {
    api.get.mockResolvedValue([SCALE_PATTERN_VIEW]);
    const sound = { synthId: 'model-d', slug: 'fat-bass', name: 'Fat bass', defaultId: null };
    const { result, rerender } = renderHook(({ open }) => useSoundPatterns(sound, open), {
      initialProps: { open: false },
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current?.patterns).toBeNull();

    rerender({ open: true });

    await waitFor(() => expect(result.current?.patterns).toEqual([SCALE_PATTERN_VIEW]));
    expect(api.get).toHaveBeenCalledWith('/api/v1/synths/model-d/sounds/fat-bass/patterns');
  });
});
