// @vitest-environment happy-dom

/**
 * The player's sound picker, whose library closes on a press outside, Escape or Tab out of it, and the full-screen
 * button, which logs a refusal rather than throwing.
 *
 * @see components/app/synth/player.tsx
 */

import { useRef } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FullscreenButton, SoundPicker } from '@/components/app/synth/player';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { warn } }));

function picker(open = true) {
  const onClose = vi.fn();
  render(
    <>
      <SoundPicker
        soundName="Night bass"
        soundRef={null}
        onChooseSound={vi.fn()}
        soundsOpen={open}
        onCloseSounds={onClose}
        sounds={<input type="search" aria-label="Search sounds" />}
      />
      <button type="button">Elsewhere</button>
    </>
  );
  const search = screen.getByRole('searchbox', { name: 'Search sounds', hidden: true });
  const pop = search.closest('[role="dialog"]');
  if (!(pop instanceof HTMLElement)) throw new Error('the library is in a dialog');
  return {
    onClose,
    pick: screen.getByRole('button', { name: 'Choose a patch (now: Night bass)' }),
    search,
    pop,
    elsewhere: screen.getByRole('button', { name: 'Elsewhere' }),
  };
}

describe('SoundPicker', () => {
  it('closes the library on a press outside it', () => {
    const { onClose, elsewhere } = picker();
    fireEvent.pointerDown(elsewhere);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open on a press inside the library or on the picker, which toggles it itself', () => {
    const { onClose, pick, search } = picker();
    fireEvent.pointerDown(search);
    fireEvent.pointerDown(pick);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape inside it and puts focus back on the picker', () => {
    const { onClose, pick, search } = picker();
    search.focus();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(pick);
  });

  it('leaves an Escape another handler already took, and other keys, alone', () => {
    const { onClose, search } = picker();
    search.addEventListener('keydown', (e) => e.preventDefault());
    fireEvent.keyDown(search, { key: 'Escape' });
    fireEvent.keyDown(search, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when Tab takes focus somewhere else on the page', () => {
    const { onClose, search, elsewhere } = picker();
    fireEvent.focusOut(search, { relatedTarget: elsewhere });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when focus moves within it, back to the picker, or nowhere (a press on its own padding)', () => {
    const { onClose, search, pick, pop } = picker();
    fireEvent.focusOut(search, { relatedTarget: pop });
    fireEvent.focusOut(search, { relatedTarget: pick });
    fireEvent.focusOut(search, { relatedTarget: null });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('listens for none of this while the library is closed', () => {
    const { onClose, elsewhere, search } = picker(false);
    fireEvent.pointerDown(elsewhere);
    fireEvent.focusOut(search, { relatedTarget: elsewhere });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('FullscreenButton', () => {
  const enabled = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
  afterEach(() => {
    if (enabled) Object.defineProperty(document, 'fullscreenEnabled', enabled);
    warn.mockClear();
  });

  function Player() {
    const ref = useRef<HTMLElement>(null);
    return (
      <section ref={ref}>
        <FullscreenButton target={ref} />
      </section>
    );
  }

  it('logs a refused request instead of throwing, and leaves the page as it was', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    const requestFullscreen = vi.fn(() => Promise.reject(new Error('not allowed')));
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    render(<Player />);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Full screen' }));
    });
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith('synth page: full screen refused', {
        leaving: false,
        err: 'Error: not allowed',
      })
    );
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeTruthy();
  });
});
