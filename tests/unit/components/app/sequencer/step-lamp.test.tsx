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

function lessMotion(on: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: on && query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
  );
}

beforeEach(() => {
  frames = [];
  at = null;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => {
    frames.push(f);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  lessMotion(false);
});
afterEach(() => {
  vi.restoreAllMocks();
  HTMLElement.prototype.animate = ANIMATE;
});

describe('the Sequencer button’s step lamp', () => {
  const dot = () => screen.getByTestId('seq-step-lamp').firstElementChild as HTMLElement;
  const count = () => screen.getByTestId('seq-step-lamp').lastElementChild as HTMLElement;

  it('lights on each step heard and shows its number, brighter on every fourth', () => {
    render(<StepLamp position={position} />);
    runFrame();
    expect(dot().className).not.toContain('is-lit');
    expect(count().textContent).toBe('');

    at = { step: 0, part: 0 };
    runFrame();
    expect(dot().classList.contains('is-lit')).toBe(true);
    expect(dot().classList.contains('is-beat')).toBe(true);
    expect(count().textContent).toBe('1');

    at = { step: 1, part: 0 };
    runFrame();
    expect(dot().classList.contains('is-lit')).toBe(true);
    expect(dot().classList.contains('is-beat')).toBe(false);
    expect(count().textContent).toBe('2');

    at = { step: 4, part: 0 };
    runFrame();
    expect(dot().classList.contains('is-beat')).toBe(true);
    expect(count().textContent).toBe('5');
  });

  it('keeps the last step through a frame with no playhead (a loop being queued)', () => {
    render(<StepLamp position={position} />);
    at = { step: 2, part: 0 };
    runFrame();
    at = null;
    runFrame();
    expect(count().textContent).toBe('3');
    expect(dot().classList.contains('is-lit')).toBe(true);
  });

  it('lights again on the same step of the other part', () => {
    render(<StepLamp position={position} />);
    at = { step: 1, part: 0 };
    runFrame();
    dot().classList.remove('is-lit');
    at = { step: 1, part: 1 };
    runFrame();
    expect(dot().classList.contains('is-lit')).toBe(true);
  });

  it('is hidden from a screen reader, which would otherwise read every step out', () => {
    render(<StepLamp position={position} />);
    expect(screen.getByTestId('seq-step-lamp').getAttribute('aria-hidden')).toBe('true');
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
    lessMotion(true);
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
