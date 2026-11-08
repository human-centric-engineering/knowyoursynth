'use client';

/**
 * The Play deck's pattern picker (`f-pattern-picker` t-213): beside Play, a select-like button naming what Play will
 * play, which opens a searchable list of patterns to play instead. From `lg` up it opens upward over the deck; below
 * `lg` it is a bottom sheet, as the page's other regions are.
 *
 * The list is the patch's own patterns first (`useSoundPatterns`, the default marked), then the whole public library
 * in a section per role, ordered by how well each suits the patch (`useRankedPatterns`, `POST /library-patterns/rank`).
 * Each section shows its best few, with "Show all N". The search, at the top as the patch library's is, filters every
 * section by name and Inspired by. A library row has no notes, so a pick reads its one pattern
 * (`GET /api/v1/library-patterns/:id`) and loads it into the sequencer (`seq.load`), leaving the sequencer closed: Play
 * plays what the sequencer holds once it holds a loaded pattern.
 *
 * The page owns whether it is open, so the reads it needs run only while it is.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronUp, Search } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { logger } from '@/lib/logging';
import type { LibraryPatternView } from '@/lib/app/patterns/library';
import { ROLE_LABELS } from '@/lib/app/patterns/library-labels';
import type { Pattern } from '@/lib/app/sequencer/pattern';
import type { LoadedPattern } from '@/components/app/sequencer/use-sequencer';
import type { SoundPatterns } from '@/components/app/sequencer/use-sound-patterns';
import { PatternCredit, patternLength } from '@/components/app/sequencer/sound-pattern-picker';
import type { RankedPatterns } from '@/components/app/synth/use-ranked-patterns';
import { BottomSheet } from '@/components/app/ui/bottom-sheet';

/** How many patterns a library section shows before "Show all N". */
export const SECTION_FEW = 5;

export interface PatternPickerProps {
  synthId: string;
  /** What Play will play now: the button's text. */
  plays: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Below `lg`: a bottom sheet, rather than a popover over the deck. */
  sheet: boolean;
  /** The sound's own patterns, or null with no library sound on the panel. */
  own: SoundPatterns | null;
  /** The library, ranked for the patch. */
  ranked: RankedPatterns;
  /** The library pattern the sequencer holds as it came, if it holds one: marked in the list. */
  current: string | null;
  /** Loads a pattern into the sequencer (`seq.load`): the pattern now held, or null if it was refused. */
  load: (p: Pattern, from: LoadedPattern) => Pattern | null;
  /** A pick has loaded. */
  onPicked?: () => void;
}

export function PatternPicker(props: PatternPickerProps) {
  const { plays, open, onOpenChange, sheet } = props;
  const button = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  const popId = useId();

  // The popover closes on a press outside it (not on the button, which toggles it), on Escape inside it, and when
  // focus leaves it for anything but the button. The sheet does all of this itself.
  useEffect(() => {
    if (!open || sheet) return undefined;
    const outside = (t: EventTarget | null) =>
      t instanceof Node && !pop.current?.contains(t) && !button.current?.contains(t);
    const onDown = (e: PointerEvent) => {
      if (outside(e.target)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      onOpenChange(false);
      button.current?.focus({ preventScroll: true });
    };
    const onFocusOut = (e: FocusEvent) => {
      if (outside(e.relatedTarget)) onOpenChange(false);
    };
    const el = pop.current;
    document.addEventListener('pointerdown', onDown);
    el?.addEventListener('keydown', onKey);
    el?.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      el?.removeEventListener('keydown', onKey);
      el?.removeEventListener('focusout', onFocusOut);
    };
  }, [open, sheet, onOpenChange]);

  const close = () => {
    onOpenChange(false);
    button.current?.focus({ preventScroll: true });
  };

  return (
    <div className="kys-patpick">
      <button
        ref={button}
        type="button"
        className="kys-patpick-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open && !sheet ? popId : undefined}
        aria-label={`Choose what Play plays (now: ${plays})`}
        title={plays}
        onClick={() => onOpenChange(!open)}
      >
        <span className="kys-patpick-kicker" aria-hidden="true">
          Plays
        </span>
        <span className="kys-patpick-name">{plays}</span>
        <ChevronUp size={16} className="kys-patpick-caret" aria-hidden="true" />
      </button>
      {sheet ? (
        <BottomSheet
          title="Patterns"
          open={open}
          onOpenChange={onOpenChange}
          fallbackFocus={() => button.current}
        >
          <PickerBody {...props} onDone={() => onOpenChange(false)} />
        </BottomSheet>
      ) : (
        open && (
          <div ref={pop} id={popId} className="kys-patpick-pop" role="dialog" aria-label="Patterns">
            <PickerBody {...props} onDone={close} />
          </div>
        )
      )}
    </div>
  );
}

/** A row of the list, from the sound's own patterns or a library section. */
interface Row {
  id: string;
  name: string;
  meta: string;
  inspiredBy: LibraryPatternView['inspiredBy'];
  fidelity: LibraryPatternView['fidelity'];
  /** Why it is where it is: its tooltip. */
  why?: string | null;
  /** The sound's own carry their notes; a library row's are read when it is picked. */
  view?: LibraryPatternView;
  isDefault?: boolean;
  /** It starts more notes together than the patch can play. */
  tooManyVoices?: boolean;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Whether `row` is one the search names: every word of it in the name or the Inspired by. */
function matches(row: Row, words: readonly string[]): boolean {
  if (!words.length) return true;
  const text = `${row.name} ${row.inspiredBy.label}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

function PickerBody({
  synthId,
  own,
  ranked,
  current,
  load,
  onPicked,
  onDone,
}: PatternPickerProps & { onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  // Only the latest pick loads: one read meanwhile is let go.
  const pickN = useRef(0);
  const live = useRef(true);
  // The list is opened to find something in it: the search has focus as it opens.
  const search = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    search.current?.focus({ preventScroll: true });
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  const pick = async (row: Row) => {
    if (row.id === current) {
      onDone();
      return;
    }
    const n = ++pickN.current;
    setStatus(null);
    let view = row.view;
    if (!view) {
      setReading(row.id);
      try {
        view = await apiClient.get<LibraryPatternView>(
          `/api/v1/library-patterns/${encodeURIComponent(row.id)}`
        );
      } catch (err) {
        logger.warn('pattern picker: pattern could not be read', {
          patternId: row.id,
          err: String(err),
        });
        if (live.current && n === pickN.current) {
          setReading(null);
          setStatus(`${row.name} could not be read. Try again.`);
        }
        return;
      }
      if (!live.current || n !== pickN.current) return;
      setReading(null);
    }
    if (!load(view.pattern, { id: null, name: view.name, libraryId: view.id })) {
      setStatus(`${row.name} cannot be played.`);
      return;
    }
    onPicked?.();
    onDone();
  };

  const ownRows: Row[] = (own?.patterns ?? []).map((p, i) => ({
    id: p.id,
    name: p.name,
    meta: `${ROLE_LABELS[p.role]} · ${patternLength(p.facts.bars)}`,
    inspiredBy: p.inspiredBy,
    fidelity: p.fidelity,
    view: p,
    isDefault: i === 0,
  }));
  const result = ranked.state === 'ready' ? ranked.result : null;
  const sections = (result?.sections ?? []).map((s) => ({
    key: s.role,
    title: s.label,
    rows: s.patterns.map((p): Row => ({
      id: p.id,
      name: p.name,
      meta: patternLength(p.bars),
      inspiredBy: p.inspiredBy,
      fidelity: p.fidelity,
      why: p.why ? capitalise(p.why) : null,
      tooManyVoices: p.tooManyVoices,
    })),
  }));

  const ownShown = ownRows.filter((r) => matches(r, words));
  const sectionsShown = sections
    .map((s) => ({ ...s, rows: s.rows.filter((r) => matches(r, words)) }))
    .filter((s) => s.rows.length > 0);
  const nothing = words.length > 0 && !ownShown.length && !sectionsShown.length && !!result;

  const rowList = (rows: readonly Row[], label: string) => (
    <PatternRows
      rows={rows}
      label={label}
      current={current}
      reading={reading}
      synthId={synthId}
      onPick={(r) => void pick(r)}
    />
  );

  const line = (text: ReactNode, role?: 'status' | 'alert') => (
    <p className="kys-patpick-line" role={role}>
      {text}
    </p>
  );

  return (
    <div className="kys-patpick-body">
      <label className="kys-patpick-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or Inspired by…"
          aria-label="Search the patterns"
          ref={search}
        />
      </label>
      {status && line(status, 'alert')}
      <div className="kys-patpick-scroll kys-scroll">
        {own && (
          <section className="kys-patpick-section" aria-label={`${own.sound.name}’s patterns`}>
            <h3 className="kys-patpick-h">{own.sound.name}’s patterns</h3>
            {own.error ? (
              <p className="kys-patpick-line">
                They could not be read.{' '}
                <button type="button" className="kys-patpick-more" onClick={own.retry}>
                  Try again
                </button>
              </p>
            ) : own.patterns === null ? (
              line(`Reading ${own.sound.name}’s patterns…`)
            ) : !ownRows.length ? (
              line(`${own.sound.name} has no patterns of its own.`)
            ) : ownShown.length ? (
              rowList(ownShown, `${own.sound.name}’s patterns`)
            ) : (
              line('None of these matches the search.')
            )}
          </section>
        )}
        {ranked.state === 'reading' &&
          line('Listening to the patch to put the library in order for it…', 'status')}
        {ranked.state === 'error' &&
          line(
            'The library could not be read. Close the patterns and open them again to try again.'
          )}
        {result &&
          line(
            result.reading
              ? `Heard: ${result.reading.summary}. The library’s parts that suit it come first.`
              : 'Without a reading of the patch, the library is listed by part and name.'
          )}
        {nothing && line('No pattern matches that. Clear the search to see them all.')}
        {sectionsShown.map((s) => {
          const all = expanded.has(s.key) || s.rows.length <= SECTION_FEW;
          return (
            <section key={s.key} className="kys-patpick-section" aria-label={s.title}>
              <h3 className="kys-patpick-h">
                {s.title} <span className="kys-patpick-count">{s.rows.length}</span>
              </h3>
              {rowList(all ? s.rows : s.rows.slice(0, SECTION_FEW), s.title)}
              {!all && (
                <button
                  type="button"
                  className="kys-patpick-more"
                  onClick={() => setExpanded((was) => new Set([...was, s.key]))}
                >
                  Show all {s.rows.length}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PatternRows({
  rows,
  label,
  current,
  reading,
  synthId,
  onPick,
}: {
  rows: readonly Row[];
  label: string;
  current: string | null;
  /** The row whose pattern is being read. */
  reading: string | null;
  synthId: string;
  onPick: (r: Row) => void;
}) {
  return (
    <ul className="kys-patpick-list" aria-label={label}>
      {rows.map((r) => (
        <li key={r.id} className="kys-patpick-item">
          <button
            type="button"
            className="kys-patpick-row"
            aria-current={r.id === current ? 'true' : undefined}
            aria-busy={reading === r.id || undefined}
            title={r.why ?? undefined}
            onClick={() => onPick(r)}
          >
            <span className="kys-patpick-row-name">
              {r.name}
              {r.isDefault && <span className="kys-patpick-default">Default</span>}
            </span>
            <span className="kys-patpick-row-meta">
              {r.meta}
              {r.tooManyVoices && ' · needs more voices'}
            </span>
          </button>
          <PatternCredit by={r.inspiredBy} fidelity={r.fidelity} synthId={synthId} />
        </li>
      ))}
    </ul>
  );
}
