// @vitest-environment happy-dom

/**
 * The panel top rail's fit (`useTopFit`, t-284): `data-fit` from whether its buttons sit on one line. Each step is tried
 * in turn (`short`, then `short icons`) until they do; if none fits, the rail wraps at the last. Written on the next
 * frame after a resize, as the foot's (`useFootFit`).
 *
 * The rail's layout is simulated: each step needs a width, and while the rail has less room than that its second
 * button drops onto a line below the first.
 *
 * @see components/app/synth/player-tools.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useTopFit } from '@/components/app/synth/player-tools';

let observed: (() => void) | null;
let observedCount: number;
let room: number;
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

/** The width each fit needs to sit on one line. */
const NEEDS: Record<string, number> = { none: 1000, short: 900, 'short icons': 700 };

function Rail({ buttons = 2 }: { buttons?: number }) {
  const ref = useTopFit();
  return (
    <div ref={ref} data-testid="rail">
      <div>
        {Array.from({ length: buttons }, (_, i) => (
          <button key={i} type="button" data-i={i} />
        ))}
      </div>
    </div>
  );
}

beforeEach(() => {
  observed = null;
  observedCount = 0;
  room = 1200;
  frames.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        observed = cb;
      }
      observe() {
        observedCount += 1;
      }
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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const rail = this.closest<HTMLElement>('[data-testid="rail"]');
    const needs = NEEDS[rail?.dataset.fit ?? 'none'];
    const wrapped = room < needs && this.dataset.i === '1';
    if (this.hidden) return { top: 0, height: 0, width: 0 } as DOMRect;
    return { top: wrapped ? 40 : 0, height: 30, width: 30 } as DOMRect;
  });
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

describe('useTopFit', () => {
  it('leaves a rail that fits as it is', () => {
    const { getByTestId } = render(<Rail />);
    expect(getByTestId('rail').dataset.fit).toBeUndefined();
  });

  it('packs closer, with the tour’s short name, when that is enough', () => {
    room = 950;
    const { getByTestId } = render(<Rail />);
    expect(getByTestId('rail').dataset.fit).toBe('short');
  });

  it('drops the toggles’ words when packing closer is not enough', () => {
    room = 800;
    const { getByTestId } = render(<Rail />);
    expect(getByTestId('rail').dataset.fit).toBe('short icons');
  });

  it('stays at the last step, and wraps, when nothing fits', () => {
    room = 500;
    const { getByTestId } = render(<Rail />);
    expect(getByTestId('rail').dataset.fit).toBe('short icons');
  });

  it('measures again from the start on a resize, on the next frame', () => {
    room = 800;
    const { getByTestId } = render(<Rail />);
    const rail = getByTestId('rail');
    expect(rail.dataset.fit).toBe('short icons');
    room = 1200;
    act(() => observed?.());
    expect(rail.dataset.fit).toBe('short icons');
    flush();
    expect(rail.dataset.fit).toBeUndefined();
  });

  it('observes the rail and each of its parts, so a part coming or going measures it again', () => {
    render(<Rail />);
    expect(observedCount).toBe(2);
  });

  it('observes a part that comes later, and measures the rail again with it', async () => {
    room = 950;
    const { getByTestId } = render(<Rail />);
    const rail = getByTestId('rail');
    expect(rail.dataset.fit).toBe('short');
    room = 1200;
    rail.appendChild(document.createElement('div'));
    // The MutationObserver's records are delivered as a microtask.
    await act(async () => Promise.resolve());
    expect(observedCount).toBe(2 + 2);
    flush();
    expect(rail.dataset.fit).toBeUndefined();
  });

  it('leaves out a button that is not drawn: it has no box, and would read as at the top', () => {
    function WithHidden() {
      const ref = useTopFit();
      return (
        <div ref={ref} data-testid="rail">
          <button type="button" data-i="0" />
          <button type="button" hidden />
        </div>
      );
    }
    room = 100;
    const { getByTestId } = render(<WithHidden />);
    // Wrapped only by a hidden button, it would have dropped to its last step.
    expect(getByTestId('rail').dataset.fit).toBeUndefined();
  });

  it('takes a rail with no buttons as fitting', () => {
    room = 100;
    const { getByTestId } = render(<Rail buttons={0} />);
    expect(getByTestId('rail').dataset.fit).toBeUndefined();
  });

  it('drops a pending write when it goes', () => {
    const { unmount } = render(<Rail />);
    act(() => observed?.());
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(observed).toBeNull();
  });
});
