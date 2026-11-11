// @vitest-environment happy-dom

/**
 * The playhead on the bar (t-225): the Sequencer button's step lamp, and Play's glow every fourth step, both drawn
 * from `useStepTick` reading the playhead once a frame. Frames are run by hand, the playhead is a value the test sets.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StepLamp } from '@/components/app/sequencer/step-lamp';
import { PlayButton } from '@/components/app/synth/player';
import type { SeqPosition } from '@/components/app/sequencer/use-sequencer';
import { glideMotion } from '@/components/app/synth/motion';

let frames: FrameRequestCallback[] = [];
const runFrame = () =>
  act(() => {
    const now = frames;
    frames = [];
    now.forEach((f) => f(0));
  });

const ANIMATE = HTMLElement.prototype.animate;
let at: SeqPosition | null = null;
const position = () => at;

beforeEach(() => {
  frames = [];
  at = null;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => {
    frames.push(f);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  // Motion on, as a browser that hasn't asked for less (the setup turns it off for every test).
  vi.mocked(glideMotion).mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  HTMLElement.prototype.animate = ANIMATE;
});

describe('the Sequencer button’s step strip', () => {
  const lamp = () => screen.getByTestId('seq-step-lamp');
  const cells = () => Array.from(lamp().firstElementChild?.children ?? []) as HTMLElement[];
  const cell = (i: number) => cells()[i];
  const lit = () => cells().flatMap((c, i) => (c.classList.contains('is-lit') ? [i] : []));
  const hidden = () => cells().filter((c) => c.classList.contains('is-off')).length;
  const count = () => lamp().lastElementChild as HTMLElement;

  it('lights the cell of each step heard and shows the step out of the part’s length, brighter on every fourth', () => {
    render(<StepLamp position={position} lengths={[16]} />);
    runFrame();
    expect(lit()).toEqual([]);
    expect(count().textContent).toBe('');

    at = { step: 0, part: 0 };
    runFrame();
    expect(lit()).toEqual([0]);
    expect(cell(0).classList.contains('is-beat')).toBe(true);
    expect(count().textContent).toBe('01/16');

    at = { step: 1, part: 0 };
    runFrame();
    expect(lit()).toEqual([1]);
    expect(cell(1).classList.contains('is-beat')).toBe(false);
    expect(count().textContent).toBe('02/16');

    at = { step: 4, part: 0 };
    runFrame();
    expect(lit()).toEqual([4]);
    expect(cell(4).classList.contains('is-beat')).toBe(true);
    expect(count().textContent).toBe('05/16');
  });

  it('marks the first cell of each beat, and shows only as many cells as the part has steps', () => {
    render(<StepLamp position={position} lengths={[6]} />);
    at = { step: 0, part: 0 };
    runFrame();
    expect(hidden()).toBe(10);
    expect(cells().flatMap((c, i) => (c.classList.contains('is-bar') ? [i] : []))).toEqual([
      0, 4, 8, 12,
    ]);
    expect(count().textContent).toBe('1/6');
  });

  it('shows the run of sixteen the playhead is in on a longer part', () => {
    render(<StepLamp position={position} lengths={[24]} />);
    at = { step: 18, part: 0 };
    runFrame();
    expect(lit()).toEqual([2]);
    expect(hidden()).toBe(8);
    expect(count().textContent).toBe('19/24');
  });

  it('keeps the last step through a frame with no playhead (a loop being queued)', () => {
    render(<StepLamp position={position} lengths={[16]} />);
    at = { step: 2, part: 0 };
    runFrame();
    at = null;
    runFrame();
    expect(count().textContent).toBe('03/16');
    expect(lit()).toEqual([2]);
  });

  it('pads the step to the part’s length, so the count keeps its width', () => {
    render(<StepLamp position={position} lengths={[8, 64]} />);
    at = { step: 4, part: 0 };
    runFrame();
    expect(count().textContent).toBe('A5/8');
    at = { step: 4, part: 1 };
    runFrame();
    expect(count().textContent).toBe('B05/64');
  });

  it('lights again on the same step of the other part', () => {
    render(<StepLamp position={position} lengths={[16, 16]} />);
    at = { step: 1, part: 0 };
    runFrame();
    cell(1).classList.remove('is-lit');
    at = { step: 1, part: 1 };
    runFrame();
    expect(lit()).toEqual([1]);
  });

  it('is brighter on every fourth step heard, whatever order the steps play in', () => {
    render(<StepLamp position={position} lengths={[16]} />);
    // Reversed: the first step heard is the last step.
    at = { step: 15, part: 0, slot: 0, loop: 0 };
    runFrame();
    expect(cell(15).classList.contains('is-beat')).toBe(true);
    expect(count().textContent).toBe('16/16');
    at = { step: 12, part: 0, slot: 3, loop: 0 };
    runFrame();
    expect(cell(12).classList.contains('is-beat')).toBe(false);
    at = { step: 11, part: 0, slot: 4, loop: 0 };
    runFrame();
    expect(cell(11).classList.contains('is-beat')).toBe(true);
  });

  it('lights again on a step heard twice running (random order, a one-step part)', () => {
    render(<StepLamp position={position} lengths={[16]} />);
    at = { step: 2, part: 0, slot: 0, loop: 0 };
    runFrame();
    cell(2).classList.remove('is-lit');
    at = { step: 2, part: 0, slot: 1, loop: 0 };
    runFrame();
    expect(lit()).toEqual([2]);
    cell(2).classList.remove('is-lit');
    at = { step: 2, part: 0, slot: 1, loop: 0 };
    runFrame();
    expect(lit()).toEqual([]);
    at = { step: 2, part: 0, slot: 1, loop: 1 };
    runFrame();
    expect(lit()).toEqual([2]);
  });

  it('names the part with the step where the pattern has more than one, out of that part’s length', () => {
    render(<StepLamp position={position} lengths={[16, 8]} />);
    at = { step: 2, part: 1 };
    runFrame();
    expect(count().textContent).toBe('B3/8');
    expect(hidden()).toBe(8);
  });

  it('is hidden from a screen reader, which would otherwise read every step out', () => {
    render(<StepLamp position={position} />);
    expect(lamp().getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Play while a pattern plays', () => {
  const play = () => screen.getByRole('button', { name: 'Stop' });

  it('glows on every fourth step heard, and no other', () => {
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate;
    render(<PlayButton playing onClick={() => undefined} position={position} />);
    expect(play().classList.contains('is-stepped')).toBe(true);
    for (const step of [0, 1, 2, 3, 4, 5]) {
      at = { step, part: 0 };
      runFrame();
    }
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('does not pulse where the browser asks for less motion', () => {
    vi.mocked(glideMotion).mockReturnValue(false);
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate;
    render(<PlayButton playing onClick={() => undefined} position={position} />);
    at = { step: 0, part: 0 };
    runFrame();
    expect(animate).not.toHaveBeenCalled();
  });

  it('breathes at its own pace, reading no playhead, while a riff plays (no pattern) or stopped', () => {
    const { rerender } = render(<PlayButton playing onClick={() => undefined} />);
    expect(play().classList.contains('is-stepped')).toBe(false);
    expect(frames).toHaveLength(0);
    rerender(<PlayButton playing={false} onClick={() => undefined} position={position} />);
    expect(screen.getByRole('button', { name: 'Play' }).classList.contains('is-stepped')).toBe(
      false
    );
    expect(frames).toHaveLength(0);
  });
});
