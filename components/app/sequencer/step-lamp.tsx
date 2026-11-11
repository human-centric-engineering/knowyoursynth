'use client';

/**
 * The Sequencer button's step strip (t-225): with a pattern playing and the sequencer closed, there is still a sign of
 * it on the bar — a row of cells, one per step, the one being heard lit (brighter on every fourth step heard), and the
 * step and the part's length beside it (5/16, B5/16). A part longer than `CELLS` steps shows the run of `CELLS` the
 * playhead is in, as a hardware sequencer pages its row of lamps. Drawn straight onto its elements from the playhead,
 * so the page does not render again once a step.
 *
 * The page draws it only while it should show: a pattern playing and the sequencer not on show. Unmounted, it is
 * gone; between steps (a loop being queued) it keeps the last one.
 */

import { useRef } from 'react';
import type { SeqPosition } from '@/components/app/sequencer/use-sequencer';
import { onBeat, PULSE_EVERY, useStepTick } from '@/components/app/sequencer/use-step-tick';
import { PART_NAMES } from '@/components/app/sequencer/labels';

/** How many cells the strip has: one bar of sixteenths. */
export const CELLS = 16;

export function StepLamp({
  position,
  lengths = [],
}: {
  position: () => SeqPosition | null;
  /** Each part's length in steps. More than one part, and the count names the part as well (B3/16). */
  lengths?: readonly number[];
}) {
  const strip = useRef<HTMLSpanElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  useStepTick(position, true, (at) => {
    const cells = strip.current?.children;
    if (cells && at) {
      const len = lengths[at.part] ?? CELLS;
      const page = Math.floor(at.step / CELLS);
      const shown = Math.min(CELLS, len - page * CELLS);
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i] as HTMLElement;
        // Restarted on each step, so it lights and fades in time; the class change alone would not restart it.
        cell.classList.remove('is-lit', 'is-beat');
        cell.classList.toggle('is-off', i >= shown);
        cell.classList.toggle('is-bar', (page * CELLS + i) % PULSE_EVERY === 0);
      }
      const cell = cells[at.step - page * CELLS] as HTMLElement | undefined;
      if (cell) {
        void cell.offsetWidth;
        cell.classList.add('is-lit');
        if (onBeat(at)) cell.classList.add('is-beat');
      }
    }
    if (count.current && at) {
      const part = lengths.length > 1 ? (PART_NAMES[at.part] ?? '') : '';
      const len = lengths[at.part];
      count.current.textContent = `${part}${at.step + 1}${len ? `/${len}` : ''}`;
    }
  });
  return (
    // What it shows changes every step, which a screen reader would read out each time: Play, named Stop, already says a pattern plays.
    <span className="kys-step-lamp" aria-hidden="true" data-testid="seq-step-lamp">
      <span ref={strip} className="kys-step-strip">
        {Array.from({ length: CELLS }, (_, i) => (
          <span key={i} className="kys-step-cell" />
        ))}
      </span>
      <span ref={count} className="kys-step-lamp-count" />
    </span>
  );
}
