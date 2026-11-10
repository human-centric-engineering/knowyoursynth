// @vitest-environment happy-dom

/**
 * The player's sound picker, whose library closes on a press outside, Escape, Tab out of it or its close button, and the full-screen
 * button, which logs a refusal rather than throwing.
 *
 * @see components/app/synth/player.tsx
 */

import { useRef } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  Chapters,
  FullscreenButton,
  SoundDesign,
  SoundPicker,
  SoundsDrawer,
  Wordmark,
} from '@/components/app/synth/player';
import { stepIds } from '@/components/app/synth/lesson';
import { faceRoles } from '@/components/app/synth/face-roles';
import { highlightStore } from '@/components/app/synth/stores';
import { getSynthDef } from '@/lib/app/synths/defs';
import { START_STEP, startStep } from '@/lib/app/synths/default-patch';
import type { PresetStep } from '@/lib/app/synths/contract';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { warn } }));

/** The patch picker and the drawer it opens, sharing the picker's button as the page does (t-207). */
function PickerWithDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pickRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <SoundPicker
        buttonRef={pickRef}
        soundName="Night bass"
        soundRef={null}
        onChooseSound={vi.fn()}
        soundsOpen={open}
      />
      <SoundsDrawer open={open} onClose={onClose} pickRef={pickRef}>
        <input type="search" aria-label="Search sounds" />
      </SoundsDrawer>
      <button type="button">Elsewhere</button>
    </>
  );
}

function picker(open = true) {
  const onClose = vi.fn();
  render(<PickerWithDrawer open={open} onClose={onClose} />);
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
  it("is the patch's name, saying whether the drawer is open and when a patch is loading (t-207)", () => {
    const onChoose = vi.fn();
    const { rerender } = render(
      <SoundPicker
        soundName="Night bass"
        soundRef="In the style of a 303"
        onChooseSound={onChoose}
      />
    );
    const pick = screen.getByRole('button', { name: 'Choose a patch (now: Night bass)' });
    expect(pick.textContent).toBe('Night bass');
    expect(pick).toHaveAttribute('aria-expanded', 'false');
    expect(pick).toHaveAttribute('title', 'Night bass: In the style of a 303');
    fireEvent.click(pick);
    expect(onChoose).toHaveBeenCalledTimes(1);
    rerender(
      <SoundPicker
        soundName="Night bass"
        soundRef={null}
        onChooseSound={onChoose}
        soundsOpen
        loading
      />
    );
    expect(pick).toHaveAttribute('aria-label', 'Choose a patch (now: Night bass, loading)');
    expect(pick).toHaveAttribute('aria-expanded', 'true');
    expect(pick.querySelector('.kys-led.kys-pulse')).not.toBeNull();
    // Without an "In the style of…", the tooltip is the whole name, which the box may cut short.
    expect(pick).toHaveAttribute('title', 'Night bass');
  });

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

  it('closes from its own close button, as the drawer covers the picker, and puts focus back on the picker', () => {
    const { onClose, pick, pop } = picker();
    fireEvent.click(within(pop).getByRole('button', { name: 'Close the patches' }));
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

describe('SoundDesign: the drawer', () => {
  it('names its tab, says whether it is up, and asks the page to toggle it', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <SoundDesign steps={[]} step={null} onStep={vi.fn()} hasLesson={false} onToggle={onToggle} />
    );
    const tab = screen.getByRole('button', { name: 'Learn sound design' });
    expect(tab).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(tab);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(
      <SoundDesign
        steps={[]}
        step={null}
        onStep={vi.fn()}
        hasLesson={false}
        open
        onToggle={onToggle}
      />
    );
    expect(tab).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(tab.getAttribute('aria-controls') ?? '')).not.toBeNull();
  });
});

describe('SoundDesign: what it is for (t-227)', () => {
  const aim = /Follow along on your own synth and experiment/;

  it('says so above a walkthrough', () => {
    render(<SoundDesign steps={[]} step={null} onStep={vi.fn()} hasLesson open />);
    expect(screen.getByText(aim)).toBeTruthy();
  });

  it('says nothing of following along on a patch with no walkthrough to follow', () => {
    render(<SoundDesign steps={[]} step={null} onStep={vi.fn()} hasLesson={false} open />);
    expect(screen.getByText(/This patch has no walkthrough/)).toBeTruthy();
    expect(screen.queryByText(aim)).toBeNull();
  });
});

describe('Wordmark: its lamp (t-204)', () => {
  const lamp = (lit: boolean, lesson?: boolean) => {
    const { container, unmount } = render(<Wordmark lit={lit} lesson={lesson} />);
    const led = container.querySelector('.kys-led');
    const cls = [led?.classList.contains('is-lit'), led?.classList.contains('is-lesson')];
    unmount();
    return cls;
  };

  it("is the sound's amber while it is on, and dark while it is off", () => {
    expect(lamp(true)).toEqual([true, false]);
    expect(lamp(false)).toEqual([false, false]);
  });

  it('is yellow while a lesson is being walked, whether the sound is on or not', () => {
    expect(lamp(true, true)).toEqual([false, true]);
    expect(lamp(false, true)).toEqual([false, true]);
  });
});

describe('SoundDesign: the faceplate (t-201)', () => {
  const strip = () =>
    screen.getByRole('heading', { name: 'Learn sound design' }).closest('section');

  it("is drawn in the face's colours when the page gives them", () => {
    const face = faceRoles('#f2b21c', '#e3a40f', '#2b2213');
    render(<SoundDesign steps={[]} step={null} onStep={vi.fn()} hasLesson={false} face={face} />);
    expect(strip()).toHaveClass('kys-face');
    expect(strip()?.style.getPropertyValue('--kys-surface')).toBe('#f2b21c');
    expect(strip()?.style.getPropertyValue('--kys-accent')).toBe('#2b2213');
  });

  it("keeps the stage's colours without them", () => {
    render(<SoundDesign steps={[]} step={null} onStep={vi.fn()} hasLesson={false} />);
    expect(strip()).not.toHaveClass('kys-face');
    expect(strip()?.style.getPropertyValue('--kys-surface')).toBe('');
  });
});

describe('Chapters: step 0', () => {
  const found = getSynthDef('model-d');
  if (!found) throw new Error('model-d is not registered');
  const start = startStep(found);
  const steps: PresetStep[] = [
    { title: 'Open the mixer', module: 'mixer', why: 'Loud.', set: { 'mix.osc1': 9 } },
  ];
  const chapter0 = () => screen.getByRole('button', { name: 'Lesson step 0: Default patch' });

  afterEach(() => act(() => highlightStore.set([])));

  it('comes first, a short Start chapter that sets the Default patch and lights its controls', () => {
    const onStep = vi.fn();
    render(<Chapters steps={steps} start={start} step={0} onStep={onStep} lit={['mix.osc1']} />);
    const li = chapter0().closest('li');
    expect(li).toHaveClass('kys-chapter-start');
    expect(li?.textContent).toBe('0StartDefault patch');
    // Past it, it is done; the step the panel is at is current.
    expect(li).toHaveAttribute('data-state', 'done');
    expect(chapter0()).not.toHaveAttribute('aria-current');
    fireEvent.pointerEnter(chapter0());
    expect(highlightStore.get()).toEqual(stepIds(start));
    fireEvent.pointerLeave(chapter0());
    expect(highlightStore.get()).toEqual(['mix.osc1']);
    fireEvent.click(chapter0());
    expect(onStep).toHaveBeenLastCalledWith(START_STEP);
  });

  it('is the step the panel is at, with every step after it still to do', () => {
    render(<Chapters steps={steps} start={start} step={START_STEP} onStep={vi.fn()} />);
    expect(chapter0()).toHaveAttribute('aria-current', 'step');
    expect(chapter0().closest('li')).toHaveAttribute('data-state', 'now');
    const step1 = screen.getByRole('button', { name: 'Lesson step 1: Open the mixer' });
    expect(step1.closest('li')).toHaveAttribute('data-state', 'todo');
  });

  it('is not drawn for a lesson without it, as the Sound Design strip passes none', () => {
    render(<SoundDesign steps={steps} step={null} onStep={vi.fn()} hasLesson />);
    expect(screen.queryByRole('button', { name: /Lesson step 0/ })).toBeNull();
  });
});
