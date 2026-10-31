'use client';

/**
 * The pattern picker (`f-pattern-library` t-123): the patterns of the library sound on the panel, in its order, the
 * default first. Each says the part it plays (its role), how long it is, and where there is one, what it is
 * **Inspired by** (linked to the databank's page for it) and how close it is to that (its fidelity). Picking one opens
 * it in the sequencer, from where it can be edited and saved to My patterns.
 *
 * The list is in groups, so suggestions for the patch on the panel (t-125, "Suits this sound") are a second group in
 * the same picker. Below `lg` it is in the sequencer's sheet, as the rest of the module is.
 */

import type { LibraryPatternView } from '@/lib/app/patterns/library';
import { FIDELITY_LABELS, ROLE_LABELS } from '@/lib/app/patterns/library-labels';
import { bankHref } from '@/components/app/bank/routes';
import { synthHref } from '@/components/app/synth/routes';

export interface PatternGroup {
  /** Stable, for React and for tests: `sound` for the sound's own. */
  key: string;
  title: string;
  patterns: readonly LibraryPatternView[];
  /** Whether the group's first pattern is the sound's default, and says so. */
  leadIsDefault?: boolean;
}

export interface SoundPatternPickerProps {
  groups: readonly PatternGroup[];
  /** The library pattern the sequencer holds, if it holds one. */
  current: string | null;
  /** The synth on the panel: Inspired by this synth needs no link to the page it is on. */
  synthId: string;
  onPick: (p: LibraryPatternView) => void;
}

/** Where an Inspired by links to: the databank's page for the work or the artist, or a synth's page. Null for a genre. */
export function inspiredHref(by: LibraryPatternView['inspiredBy'], synthId: string): string | null {
  if (by.kind === 'work' && by.songId) return bankHref('songs', by.songId);
  if (by.kind === 'artist' && by.artistId) return bankHref('artists', by.artistId);
  if (by.kind === 'synth' && by.synthId && by.synthId !== synthId) return synthHref(by.synthId);
  return null;
}

/** How long it is: in bars, or in beats when it is shorter than one. */
const length = (bars: number) => {
  const r = (n: number) => Math.round(n * 10) / 10;
  if (bars < 1) return r(bars * 4) === 1 ? '1 beat' : `${r(bars * 4)} beats`;
  return r(bars) === 1 ? '1 bar' : `${r(bars)} bars`;
};

export function SoundPatternPicker({ groups, current, synthId, onPick }: SoundPatternPickerProps) {
  return (
    <div className="kys-seq-lib-browser is-patterns">
      {groups.map((g) => (
        <section key={g.key} className="kys-seq-pat-group">
          <h3 className="kys-seq-lib-label">{g.title}</h3>
          <ul className="kys-seq-lib-list is-patterns" aria-label={g.title}>
            {g.patterns.map((p, i) => {
              const by = p.inspiredBy.label.trim();
              const href = by ? inspiredHref(p.inspiredBy, synthId) : null;
              const fidelity = FIDELITY_LABELS[p.fidelity];
              return (
                <li key={p.id} className="kys-seq-pat">
                  <button
                    type="button"
                    className="kys-seq-lib-item"
                    aria-current={p.id === current ? 'true' : undefined}
                    onClick={() => onPick(p)}
                  >
                    <span className="kys-seq-lib-item-name">
                      {p.name}
                      {g.leadIsDefault && i === 0 && (
                        <span className="kys-seq-pat-default">Default</span>
                      )}
                    </span>
                    <span className="kys-seq-lib-item-meta">
                      {ROLE_LABELS[p.role]} · {length(p.facts.bars)}
                    </span>
                  </button>
                  {by && (
                    <p className="kys-seq-pat-credit">
                      Inspired by{' '}
                      {href ? (
                        <a href={href} className="kys-seq-pat-link">
                          {by}
                        </a>
                      ) : (
                        <span>{by}</span>
                      )}
                      {fidelity && (
                        <span className="kys-seq-pat-fidelity" title={fidelity.means}>
                          {fidelity.label}
                        </span>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
