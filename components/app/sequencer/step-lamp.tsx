'use client';

/**
 * The Sequencer button's lamp (t-225): with a pattern playing and the sequencer closed, there is still a sign of it on
 * the bar — a lamp lit on each step, brighter on every fourth, and the step's number beside it. Drawn straight onto
 * its elements from the playhead, so the page does not render again once a step.
 *
 * The page draws it only while it should show: a pattern playing and the sequencer not on show. Unmounted, it is
 * gone; between steps (a loop being queued) it keeps the last one.
 */

import { useRef } from 'react';
import type { SeqPosition } from '@/components/app/sequencer/use-sequencer';
import { PULSE_EVERY, useStepTick } from '@/components/app/sequencer/use-step-tick';

export function StepLamp({ position }: { position: () => SeqPosition | null }) {
  const lamp = useRef<HTMLSpanElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  useStepTick(position, true, (at) => {
    const dot = lamp.current;
    if (dot) {
      // Restarted on each step, so it lights and fades in time; the class change alone would not restart it.
      dot.classList.remove('is-lit', 'is-beat');
      if (at) {
        void dot.offsetWidth;
        dot.classList.add('is-lit');
        if (at.step % PULSE_EVERY === 0) dot.classList.add('is-beat');
      }
    }
    if (count.current) count.current.textContent = at ? String(at.step + 1) : '';
  });
  return (
    // What it shows changes every step, which a screen reader would read out each time: Play, named Stop, already says a pattern plays.
    <span className="kys-step-lamp" aria-hidden="true" data-testid="seq-step-lamp">
      <span ref={lamp} className="kys-step-lamp-dot" />
      <span ref={count} className="kys-step-lamp-count" />
    </span>
  );
}
