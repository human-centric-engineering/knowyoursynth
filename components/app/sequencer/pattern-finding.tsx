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
    <div className={`kys-patfind${grid ? 'is-grid' : ''}`} aria-hidden="true">
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

export function FresherBar({ onTake }: { onTake: () => void }) {
  return (
    <div className="kys-patfind-fresher">
      <span>The patch has changed.</span>
      <button type="button" className="kys-patfind-take" onClick={onTake}>
        Update the list
      </button>
    </div>
  );
}

/**
 * What the picker's one status says: that patterns are being found, then how many were. Empty otherwise (closed,
 * waiting for the sound to load, or nothing to find), so nothing is said.
 */
export function findingStatus(state: string, found: number | null): string {
  if (state === 'reading') return 'Finding patterns that suit the patch';
  if (state !== 'ready' || found === null) return '';
  return found === 1 ? 'Found 1 pattern' : `Found ${found} patterns`;
}
