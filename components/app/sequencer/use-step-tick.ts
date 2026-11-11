'use client';

/**
 * The playhead's steps, as they are heard (t-225): `onStep` is called once each time the step (or the part) playing
 * changes, read once a frame from `position` while `active`. It is the caller's to draw with — a lamp lit, a glow —
 * straight onto an element it holds, so a pattern playing renders nothing again once a step.
 *
 * Stopped, or `active` turned off, it calls `onStep(null)` once, so whatever was lit can be put out.
 */

import { useEffect, useRef } from 'react';
import type { SeqPosition } from '@/components/app/sequencer/use-sequencer';

/** How many steps apart the stronger pulse comes (Play's glow, the brighter lamp): a beat of 16ths, a bar of quarters. */
export const PULSE_EVERY = 4;

export function useStepTick(
  position: (() => SeqPosition | null) | undefined,
  active: boolean,
  onStep: (at: SeqPosition | null) => void
): void {
  // The latest handler, so a new one each render doesn't restart the loop (or count as a step).
  const handler = useRef(onStep);
  useEffect(() => {
    handler.current = onStep;
  });

  useEffect(() => {
    if (!active || !position) return undefined;
    let last: SeqPosition | null = null;
    let raf = 0;
    const tick = () => {
      const now = position();
      if (now && (!last || !sameStep(now, last))) handler.current(now);
      // Between loops (or before the first is heard) the position is null for a moment: the step is still the last one.
      if (now) last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      handler.current(null);
    };
  }, [active, position]);
}

/**
 * The same step heard, not only the same step: in random order (or a one-step part) a step can come round again, and
 * is lit again. Compared on the playhead's loop and place in it where it gives them.
 */
const sameStep = (a: SeqPosition, b: SeqPosition): boolean =>
  a.step === b.step && a.part === b.part && a.slot === b.slot && a.loop === b.loop;

/**
 * Whether this step heard is on the beat: every `PULSE_EVERY` steps heard from the loop's start, so a pattern played
 * in reverse or at random pulses in time as a forward one does. Without the place heard, the step's own number.
 */
export const onBeat = (at: SeqPosition): boolean => (at.slot ?? at.step) % PULSE_EVERY === 0;
