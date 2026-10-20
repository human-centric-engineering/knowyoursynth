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
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: matches[query] ?? false,
        media: query,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      }) as unknown as MediaQueryList
  );
  return {
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

  it('shows again when what was stored is not a dismissal', () => {
    window.localStorage.setItem(STORAGE_KEYS.rotateSeen, '"yes"');
    screenWith({ [SMALL_QUERY]: true, [PORTRAIT_TABLET_QUERY]: false });
    render(<RotatePrompt />);
    expect(screen.getByRole('note')).toBeTruthy();
  });
});
