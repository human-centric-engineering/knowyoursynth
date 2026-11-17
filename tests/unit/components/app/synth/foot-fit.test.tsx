// @vitest-environment happy-dom

/**
 * The panel foot rail's fit (`useFootFit`, t-226): `data-fit` from the rail's width. A resize writes it on the next
 * frame, outside the ResizeObserver's delivery (t-268): written in the callback, the height change it causes was an
 * undeliverable notification, reported as a ResizeObserver loop error.
 *
 * @see components/app/synth/player-tools.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useFootFit } from '@/components/app/synth/player-tools';

let observed: (() => void) | null;
let width: number;
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

function Rail({ four = false }: { four?: boolean }) {
  const ref = useFootFit(four);
  return <div ref={ref} data-testid="rail" />;
}

beforeEach(() => {
  observed = null;
  width = 1400;
  frames.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        observed = cb;
      }
      observe() {}
      disconnect() {
        observed = null;
      }
    }
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => void frames.delete(id));
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => width);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flush = () =>
  act(() => {
    const due = [...frames.values()];
    frames.clear();
    due.forEach((cb) => cb(0));
  });

describe('useFootFit', () => {
  it('fits the rail at once on mount', () => {
    width = 1000;
    const { getByTestId } = render(<Rail />);
    expect(getByTestId('rail').dataset.fit).toBe('close short');
  });

  it('writes a resize on the next frame, not in the observer’s callback', () => {
    const { getByTestId } = render(<Rail />);
    const rail = getByTestId('rail');
    expect(rail.dataset.fit).toBeUndefined();
    width = 800;
    act(() => observed?.());
    expect(rail.dataset.fit).toBeUndefined();
    flush();
    expect(rail.dataset.fit).toBe('close short narrow');
  });

  it('writes once for several resizes in a frame, from the last width', () => {
    const { getByTestId } = render(<Rail />);
    width = 800;
    act(() => observed?.());
    width = 1100;
    act(() => observed?.());
    expect(frames.size).toBe(1);
    flush();
    expect(getByTestId('rail').dataset.fit).toBe('close');
  });

  it('drops a pending write when it goes', () => {
    const { unmount } = render(<Rail />);
    width = 800;
    act(() => observed?.());
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(observed).toBeNull();
  });
});
