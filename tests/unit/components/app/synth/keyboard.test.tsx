// @vitest-environment happy-dom

/**
 * The on-screen keyboard: keys, mod wheel, octave shift and hold.
 *
 * @see components/app/synth/keyboard.tsx
 */

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Keyboard, OCTAVE_MAX, OCTAVE_MIN, QWERTY } from '@/components/app/synth/keyboard';
import type { KeyboardProps } from '@/components/app/synth/keyboard';
import { notesStore } from '@/components/app/synth/stores';

beforeAll(() => {
  // happy-dom has no pointer capture; the wheel asks for it on press.
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });
});

afterEach(() => {
  notesStore.set([]);
});

function setup(over: Partial<KeyboardProps> = {}) {
  const props: KeyboardProps = {
    octave: 0,
    onOctave: vi.fn(),
    wheel: 0,
    onWheel: vi.fn(),
    hold: false,
    onHold: vi.fn(),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    ...over,
  };
  const utils = render(<Keyboard {...props} />);
  return { ...utils, props };
}

const key = (n: number) => screen.getByRole('button', { name: `Note ${n}` });

describe('Keyboard keys', () => {
  it('plays MIDI note 36 + 12 per octave from the first key (C), 3 octaves and a top C', () => {
    const { props } = setup({ octave: 1 });
    // Octave +1: the lowest key is C3 = 48, the top C is 48 + 36 = 84.
    expect(key(48)).toBeTruthy();
    expect(key(84)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Note 47' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Note 85' })).toBeNull();
    // 22 white keys + 15 sharps, which is 37 keys: 3 octaves of 12 plus the top C.
    expect(screen.getAllByRole('button', { name: /^Note / })).toHaveLength(37);

    fireEvent.pointerDown(key(52));
    expect(props.noteOn).toHaveBeenCalledExactlyOnceWith(52);
  });

  it('shifts the keys down for a negative octave', () => {
    const { props } = setup({ octave: -1 });
    fireEvent.pointerDown(key(24));
    expect(props.noteOn).toHaveBeenCalledWith(24);
  });

  it('sounds a note on pointer down and releases it on pointer up anywhere in the window', () => {
    const { props } = setup();
    fireEvent.pointerDown(key(36));
    expect(props.noteOn).toHaveBeenCalledExactlyOnceWith(36);
    expect(props.noteOff).not.toHaveBeenCalled();

    fireEvent.pointerUp(window);

    expect(props.noteOff).toHaveBeenCalledExactlyOnceWith(36);
  });

  it('releases the note on pointer cancel too, and only once', () => {
    const { props } = setup();
    fireEvent.pointerDown(key(36));
    fireEvent.pointerCancel(window);
    fireEvent.pointerUp(window);
    expect(props.noteOff).toHaveBeenCalledExactlyOnceWith(36);
  });

  it('does nothing on pointer up when no key is down', () => {
    const { props } = setup();
    fireEvent.pointerUp(window);
    expect(props.noteOff).not.toHaveBeenCalled();
  });

  it('slides to another key while held: releases the old note and sounds the new one', () => {
    const { props } = setup();
    fireEvent.pointerDown(key(36));

    fireEvent.pointerEnter(key(38), { buttons: 1 });

    expect(props.noteOff).toHaveBeenCalledExactlyOnceWith(36);
    expect(props.noteOn).toHaveBeenLastCalledWith(38);
    expect(props.noteOn).toHaveBeenCalledTimes(2);

    fireEvent.pointerUp(window);
    expect(props.noteOff).toHaveBeenLastCalledWith(38);
  });

  it('ignores hovering onto a key when no button is held', () => {
    const { props } = setup();
    fireEvent.pointerEnter(key(38), { buttons: 0 });
    expect(props.noteOn).not.toHaveBeenCalled();
  });

  it('ignores a button-held hover when the press did not start on a key', () => {
    const { props } = setup();
    fireEvent.pointerEnter(key(38), { buttons: 1 });
    expect(props.noteOn).not.toHaveBeenCalled();
  });

  it('does not re-sound the key that is already down', () => {
    const { props } = setup();
    fireEvent.pointerDown(key(36));
    fireEvent.pointerEnter(key(36), { buttons: 1 });
    expect(props.noteOn).toHaveBeenCalledTimes(1);
    expect(props.noteOff).not.toHaveBeenCalled();
  });

  it('prevents the default on a key press so the page does not select text or scroll', () => {
    setup();
    expect(fireEvent.pointerDown(key(36))).toBe(false);
  });

  it('shows the keys in notesStore as active, and only those', () => {
    setup();
    const plain = key(40).className;
    act(() => notesStore.set([40, 37]));

    expect(key(40).className).not.toBe(plain);
    expect(key(40).className).toContain('bg-(--kys-accent)');
    expect(key(37).className).toContain('bg-(--kys-accent)'); // a sharp
    expect(key(41).className).not.toContain('bg-(--kys-accent)');

    act(() => notesStore.set([]));
    expect(key(40).className).toBe(plain);
  });

  it('labels the C keys and the computer-key mapping', () => {
    setup({ octave: 0 });
    // The first key is C2 (note 36 = C2 in the C-1 convention).
    expect(key(36).textContent).toBe('C2');
    // The QWERTY row starts on the second octave's C: 'A' is note 48.
    expect(key(48).textContent).toBe('C3');
    expect(key(50).textContent).toBe('S');
    expect(key(49).textContent).toBe('W');
  });

  it('stops listening for pointer up when it unmounts', () => {
    const { props, unmount } = setup();
    fireEvent.pointerDown(key(36));
    unmount();
    fireEvent.pointerUp(window);
    expect(props.noteOff).not.toHaveBeenCalled();
  });
});

describe('Keyboard octave and hold', () => {
  it('shifts the octave by one each way', () => {
    const { props } = setup({ octave: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Octave up' }));
    expect(props.onOctave).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Octave down' }));
    expect(props.onOctave).toHaveBeenLastCalledWith(-1);
  });

  it('clamps the octave at the lowest and highest', () => {
    const low = setup({ octave: OCTAVE_MIN });
    fireEvent.click(screen.getByRole('button', { name: 'Octave down' }));
    expect(low.props.onOctave).toHaveBeenCalledWith(OCTAVE_MIN);
    low.unmount();

    const high = setup({ octave: OCTAVE_MAX });
    fireEvent.click(screen.getByRole('button', { name: 'Octave up' }));
    expect(high.props.onOctave).toHaveBeenCalledWith(OCTAVE_MAX);
  });

  it('shows the octave with a sign', () => {
    const { rerender, props } = setup({ octave: 2 });
    expect(screen.getByText('+2')).toBeTruthy();
    rerender(<Keyboard {...props} octave={-1} />);
    expect(screen.getByText('-1')).toBeTruthy();
    rerender(<Keyboard {...props} octave={0} />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('toggles hold through onHold with the opposite of the current state', () => {
    const off = setup({ hold: false });
    const holdBtn = screen.getByRole('button', { name: 'Hold' });
    expect(holdBtn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(holdBtn);
    expect(off.props.onHold).toHaveBeenCalledWith(true);
    off.unmount();

    const on = setup({ hold: true });
    const pressed = screen.getByRole('button', { name: 'Hold' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pressed);
    expect(on.props.onHold).toHaveBeenCalledWith(false);
  });
});

describe('Keyboard mod wheel', () => {
  it('exposes its value as a percentage', () => {
    setup({ wheel: 0.4 });
    const wheel = screen.getByRole('slider', { name: 'Mod wheel' });
    expect(wheel.getAttribute('aria-valuenow')).toBe('40');
  });

  it('nudges up and down by 5% with the arrow keys', () => {
    const { props } = setup({ wheel: 0.5 });
    const wheel = screen.getByRole('slider', { name: 'Mod wheel' });
    fireEvent.keyDown(wheel, { key: 'ArrowUp' });
    expect(props.onWheel).toHaveBeenLastCalledWith(0.55);
    fireEvent.keyDown(wheel, { key: 'ArrowDown' });
    expect(props.onWheel).toHaveBeenLastCalledWith(0.45);
  });

  it('stays within 0 and 1 at the ends', () => {
    const top = setup({ wheel: 0.99 });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Mod wheel' }), { key: 'ArrowUp' });
    expect(top.props.onWheel).toHaveBeenCalledWith(1);
    top.unmount();

    const bottom = setup({ wheel: 0.02 });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Mod wheel' }), { key: 'ArrowDown' });
    expect(bottom.props.onWheel).toHaveBeenCalledWith(0);
  });

  it('reads a pointer press as position: the top of the wheel is 1, the bottom 0', () => {
    const { props } = setup();
    const wheel = screen.getByRole('slider', { name: 'Mod wheel' });
    wheel.getBoundingClientRect = () => new DOMRect(0, 100, 36, 100);

    fireEvent.pointerDown(wheel, { clientY: 125 });
    expect(props.onWheel).toHaveBeenLastCalledWith(0.75);

    fireEvent.pointerDown(wheel, { clientY: 50 }); // above the wheel: clamped
    expect(props.onWheel).toHaveBeenLastCalledWith(1);
    fireEvent.pointerDown(wheel, { clientY: 400 }); // below: clamped
    expect(props.onWheel).toHaveBeenLastCalledWith(0);
  });

  it('follows a drag only while a button is held', () => {
    const { props } = setup();
    const wheel = screen.getByRole('slider', { name: 'Mod wheel' });
    wheel.getBoundingClientRect = () => new DOMRect(0, 0, 36, 100);

    fireEvent.pointerMove(wheel, { clientY: 20, buttons: 0 });
    expect(props.onWheel).not.toHaveBeenCalled();

    fireEvent.pointerMove(wheel, { clientY: 20, buttons: 1 });
    expect(props.onWheel).toHaveBeenCalledExactlyOnceWith(0.8);
  });
});

describe('QWERTY', () => {
  it('starts on a at 0 and runs a one-octave-and-a-bit row to the semicolon', () => {
    expect(QWERTY.a).toBe(0);
    expect(QWERTY.k).toBe(12);
    expect(QWERTY[';']).toBe(16);
  });

  it('maps every key to its own distinct semitone from 0 to 16', () => {
    const semis = Object.values(QWERTY).sort((a, b) => a - b);
    expect(semis).toEqual(Array.from({ length: 17 }, (_, i) => i));
  });

  it('puts the black keys on the row above, one semitone above their white neighbour', () => {
    expect(QWERTY.w).toBe(QWERTY.a + 1);
    expect(QWERTY.e).toBe(QWERTY.d - 1);
    expect(QWERTY.t).toBe(QWERTY.f + 1);
    expect(QWERTY.u).toBe(QWERTY.j - 1);
  });
});
