/**
 * What a pattern picker shows while patterns are being found for the patch, and when a newer list is ready
 * (`f-pattern-prefetch` t-264), for both: the sequencer's Pattern picker (the library ranked, `useRankedPatterns`) and
 * the sequencer's Patterns ("Suits this sound", `useSuggestedPatterns`).
 *
 * - `FindingRows`: placeholder rows shaped like the real ones, gently pulsing (not under `prefers-reduced-motion`).
 *   Hidden from screen readers, which hear the picker's one status instead (`findingStatus`).
 * - `FresherBar`: the patch has moved far since the open list was found, and a list for it now is ready: offered, not
 *   swapped in under the pointer.
 */

import { useRef } from 'react';

/** Widths for the placeholder names, so the rows read as a list rather than a block. */
const NAME_WIDTHS = ['62%', '48%', '70%', '55%', '40%'];

export function FindingRows({
  sections = 1,
  rows = 4,
  heading = true,
  grid = false,
}: {
  sections?: number;
  rows?: number;
  /** Whether each section has a placeholder heading: not where the real heading is already shown. */
  heading?: boolean;
  /** Tiles in a grid (the sequencer's Patterns), rather than rows in a list (the Pattern picker). */
  grid?: boolean;
}) {
  return (
    <div className={grid ? 'kys-patfind is-grid' : 'kys-patfind'} aria-hidden="true">
      {Array.from({ length: sections }, (_, s) => (
        <div key={s} className="kys-patfind-section">
          {heading && <span className="kys-patfind-bar kys-patfind-h" />}
          <div className="kys-patfind-rows">
            {Array.from({ length: rows }, (_, r) => (
              <span key={r} className="kys-patfind-row">
                <span
                  className="kys-patfind-bar kys-patfind-name"
                  style={{ width: NAME_WIDTHS[(s * rows + r) % NAME_WIDTHS.length] }}
                />
                <span className="kys-patfind-bar kys-patfind-meta" />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FresherBar({
  onTake,
  focusIn,
}: {
  onTake: () => void;
  /** Where focus goes once the list is taken: the first control matching this, in the picker; else its first control. */
  focusIn?: string;
}) {
  const bar = useRef<HTMLDivElement | null>(null);
  // Taking the list takes the bar away, and the focused button with it: focus stays in the picker, on the first thing
  // there to focus, rather than falling to the page (where the popover's Escape no longer reaches it).
  const take = () => {
    const around = bar.current?.parentElement ?? null;
    onTake();
    requestAnimationFrame(() => {
      if (!around || (document.activeElement && document.activeElement !== document.body)) return;
      const first = 'input, button, a[href], [tabindex]:not([tabindex="-1"])';
      (
        (focusIn && around.querySelector<HTMLElement>(focusIn)) ||
        around.querySelector<HTMLElement>(first)
      )?.focus();
    });
  };
  return (
    <div className="kys-patfind-fresher" ref={bar}>
      <span>The patch has changed.</span>
      <button type="button" className="kys-patfind-take" onClick={take}>
        Update the list
      </button>
    </div>
  );
}

/**
 * What the picker's one status says: that it is waiting for the sound to load, that patterns are being found, then
 * how many are shown. Empty otherwise (an error, said where it is shown, or a count not known yet), so nothing is said.
 */
export function findingStatus(state: string, found: number | null): string {
  if (state === 'off') return 'Waiting for the sound on the panel to load';
  if (state === 'reading') return 'Finding patterns that suit the patch';
  if ((state !== 'ready' && state !== 'near') || found === null) return '';
  return found === 1 ? 'Found 1 pattern' : `Found ${found} patterns`;
}

/**
 * How many patterns the picker shows: the sound's own and `more` (what was found for the patch). Null while the own
 * are still being read, so no count is said before it is known; own that could not be read count as none.
 */
export function shownCount(
  own: { patterns: readonly unknown[] | null; error?: boolean } | null | undefined,
  more: number
): number | null {
  if (own && own.patterns === null && !own.error) return null;
  return (own?.patterns?.length ?? 0) + more;
}
