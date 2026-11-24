// @vitest-environment happy-dom

/**
 * How closely the hand rides the wheel along with a pattern (`f-performance-wheels` t-311): the hand's wheels sampled
 * against the ghost while play-along is on, and the sign that comes of it.
 *
 * @see components/app/sequencer/use-play-along.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { FOLLOW_SAMPLE_MS, usePlayAlong } from '@/components/app/sequencer/use-play-along';
import { FOLLOW_MIN_SAMPLES } from '@/lib/app/sequencer/play-along';
import type { ControlValues } from '@/lib/app/synths/contract';
import { BEND } from '@/lib/app/synths/lib/performance';
import { WHEEL } from '@/lib/app/synths/lib/patch';

type Props = Parameters<typeof usePlayAlong>[0];

const samples = (n: number) => act(() => void vi.advanceTimersByTime(n * FOLLOW_SAMPLE_MS));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const mount = (props: Props) => renderHook((p: Props) => usePlayAlong(p), { initialProps: props });

describe('usePlayAlong', () => {
  it('says nothing until enough samples, then that the hand is with the ghost', () => {
    const { result } = mount({ on: true, ghost: { [WHEEL]: 0.5 }, wheel: 0.5, bend: 0 });
    samples(FOLLOW_MIN_SAMPLES - 1);
    expect(result.current).toBeNull();
    samples(1);
    expect(result.current?.level).toBe('with');
  });

  it('says the hand is off when it is far from the ghost, both wheels counted', () => {
    const ghost: ControlValues = { [WHEEL]: 1, [BEND]: 1 };
    const { result } = mount({ on: true, ghost, wheel: 0, bend: -1 });
    samples(FOLLOW_MIN_SAMPLES);
    expect(result.current?.level).toBe('off');
  });

  it('follows the hand as it moves onto the ghost', () => {
    const { result, rerender } = mount({ on: true, ghost: { [WHEEL]: 1 }, wheel: 0, bend: 0 });
    samples(FOLLOW_MIN_SAMPLES);
    expect(result.current?.level).toBe('off');
    rerender({ on: true, ghost: { [WHEEL]: 1 }, wheel: 1, bend: 0 });
    samples(30);
    expect(result.current?.level).toBe('with');
  });

  it('does not count a step with no ghost', () => {
    const { result } = mount({ on: true, ghost: null, wheel: 0, bend: 0 });
    samples(20);
    expect(result.current).toBeNull();
  });

  it('starts afresh when another pattern is played along with', () => {
    const a: Props = { on: true, ghost: { [WHEEL]: 0.5 }, wheel: 0.5, bend: 0, run: 'a' };
    const { result, rerender } = mount(a);
    samples(FOLLOW_MIN_SAMPLES);
    expect(result.current).not.toBeNull();
    rerender({ ...a, run: 'b' });
    expect(result.current).toBeNull();
    samples(FOLLOW_MIN_SAMPLES - 1);
    expect(result.current).toBeNull();
  });

  it('is cleared when play-along stops, and starts afresh', () => {
    const on: Props = { on: true, ghost: { [WHEEL]: 0.5 }, wheel: 0.5, bend: 0 };
    const { result, rerender } = mount(on);
    samples(FOLLOW_MIN_SAMPLES);
    expect(result.current).not.toBeNull();
    rerender({ ...on, on: false });
    expect(result.current).toBeNull();
    rerender(on);
    samples(FOLLOW_MIN_SAMPLES - 1);
    expect(result.current).toBeNull();
  });
});
