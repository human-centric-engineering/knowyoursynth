// @vitest-environment happy-dom

/**
 * The note that the full panel wants a landscape tablet or a bigger screen.
 *
 * @see components/app/synth/rotate-prompt.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  PORTRAIT_TABLET_QUERY,
  RotatePrompt,
  SMALL_QUERY,
} from '@/components/app/synth/rotate-prompt';
import { STORAGE_KEYS } from '@/components/app/synth/storage';

/** A screen whose media queries match as `matches` says, with a way to fire a change. */
function screenWith(matches: Record<string, boolean>) {
  const listeners = new Set<() => void>();
  let added = 0;
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: matches[query] ?? false,
        media: query,
        addEventListener: (_: string, fn: () => void) => {
          added += 1;
          listeners.add(fn);
        },
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      }) as unknown as MediaQueryList
  );
  return {
    /** How many listeners have been added so far. */
    added: () => added,
    change(next: Record<string, boolean>) {
      Object.assign(matches, next);
      act(() => listeners.forEach((fn) => fn()));
    },
  };
}

const TURN = /Turn your tablet sideways/;
const BIGGER = /made for a landscape tablet or a bigger screen/;

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('RotatePrompt', () => {
  it('says nothing at landscape-tablet width and wider', () => {
    screenWith({ [SMALL_QUERY]: false, [PORTRAIT_TABLET_QUERY]: false });
    render(<RotatePrompt />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('tells a tablet held upright to turn it', () => {
    screenWith({ [SMALL_QUERY]: true, [PORTRAIT_TABLET_QUERY]: true });
    render(<RotatePrompt />);
    expect(screen.getByRole('note').textContent).toMatch(TURN);
    expect(screen.getByRole('note').textContent).not.toMatch(BIGGER);
  });

  it('tells a phone the panel wants a landscape tablet or a bigger screen', () => {
    screenWith({ [SMALL_QUERY]: true, [PORTRAIT_TABLET_QUERY]: false });
    render(<RotatePrompt />);
    expect(screen.getByRole('note').textContent).toMatch(BIGGER);
    expect(screen.getByRole('note').textContent).not.toMatch(TURN);
  });

  it('follows the screen: it goes once the tablet is turned to landscape', () => {
    const s = screenWith({ [SMALL_QUERY]: true, [PORTRAIT_TABLET_QUERY]: true });
    render(<RotatePrompt />);
    expect(screen.getByRole('note')).toBeTruthy();
    s.change({ [SMALL_QUERY]: false, [PORTRAIT_TABLET_QUERY]: false });
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('stays put away for this viewer once dismissed', () => {
    screenWith({ [SMALL_QUERY]: true, [PORTRAIT_TABLET_QUERY]: false });
    const { unmount } = render(<RotatePrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.rotateSeen)).toBe('true');

    unmount();
    render(<RotatePrompt />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('never draws the note once put away, not even on the first render', () => {
    window.localStorage.setItem(STORAGE_KEYS.rotateSeen, 'true');
    screenWith({ [SMALL_QUERY]: true, [PORTRAIT_TABLET_QUERY]: false });
    const drawn: boolean[] = [];
    function Probe() {
      return (
        <div
          ref={(el) => {
            if (el) drawn.push(el.querySelector('[role="note"]') !== null);
          }}
        >
          <RotatePrompt />
        </div>
      );
    }
    render(<Probe />);
    expect(drawn).toEqual([false]);
  });

  /** A screen that answers each `and`-joined feature of a query from what it is. */
  function device(d: { width: number; portrait: boolean; touch: boolean }) {
    const feature = (f: string): boolean => {
      const max = /max-width: (\d+)px/.exec(f);
      if (max) return d.width <= Number(max[1]);
      const min = /min-width: (\d+)px/.exec(f);
      if (min) return d.width >= Number(min[1]);
      if (f.includes('orientation: portrait')) return d.portrait;
      if (f.includes('any-pointer: coarse')) return d.touch;
      throw new Error(`no answer for ${f}`);
    };
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.split(' and ').every(feature),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList
    );
  }

  it('tells an upright touch screen 600 px or wider to turn it', () => {
    device({ width: 820, portrait: true, touch: true });
    render(<RotatePrompt />);
    expect(screen.getByRole('note').textContent).toMatch(TURN);
  });

  it('does not tell a tall, narrow desktop window to turn: it has no touch screen', () => {
    device({ width: 960, portrait: true, touch: false });
    render(<RotatePrompt />);
    expect(screen.getByRole('note').textContent).toMatch(BIGGER);
  });

  it('subscribes to each query once, not again on every render', () => {
    const s = screenWith({ [SMALL_QUERY]: true, [PORTRAIT_TABLET_QUERY]: false });
    const { rerender } = render(<RotatePrompt />);
    expect(s.added()).toBe(2);
    rerender(<RotatePrompt />);
    rerender(<RotatePrompt />);
    expect(s.added()).toBe(2);
  });

  it('shows again when what was stored is not a dismissal', () => {
    window.localStorage.setItem(STORAGE_KEYS.rotateSeen, '"yes"');
    screenWith({ [SMALL_QUERY]: true, [PORTRAIT_TABLET_QUERY]: false });
    render(<RotatePrompt />);
    expect(screen.getByRole('note')).toBeTruthy();
  });
});
