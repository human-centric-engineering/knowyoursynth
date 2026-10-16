'use client';

/**
 * The sound library: the synth's sounds, searched and filtered by category, beside the panel.
 *
 * Transliterated from the prototype file `src/ui/Library.jsx` (decision D3). The sounds are the catalogue's, read from
 * the API by the page (D13). "My sounds" joins them in `f-my-sounds`, and a signed-in user's progress through each
 * lesson and their stars on the sounds (s4).
 */

import { useMemo, useState } from 'react';
import type { Preset } from '@/lib/app/synths/contract';
import { StarButton } from '@/components/app/synth/favourites';
import type { LessonMark, LessonMarks } from '@/components/app/synth/progress';

const LEVELS = ['', 'Beginner', 'Intermediate', 'Advanced'] as const;

/** A sound's level as three dots, the first `level` of them lit. */
export function LevelDots({ level }: { level: Preset['level'] }) {
  return (
    <span
      className="inline-flex items-center gap-[3px]"
      title={LEVELS[level]}
      aria-label={LEVELS[level]}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i <= level ? 'bg-(--kys-accent)' : 'bg-(--kys-line)'}`}
        />
      ))}
    </span>
  );
}

export interface LibraryProps {
  presets: Preset[];
  /** The sound on the panel, if any. */
  currentId: string | null;
  onSelect: (id: string) => void;
  /** How far the user has got through each lesson; `null` or absent when signed out. */
  marks?: LessonMarks | null;
  /** Whether a sound is starred; `null` when no star shows (signed out, or still loading). */
  isStarred?: (id: string) => boolean | null;
  onStar?: (id: string) => void;
}

/** The furthest step reached, from 0, within the lesson as it is now: one cut shorter since leaves it at the last. */
export const reachedStep = (mark: LessonMark, steps: number): number =>
  Math.min(mark.furthestStep, steps - 1);

/** How far the user has got through a lesson, in a few words. */
export function markText(mark: LessonMark, steps: number): string {
  return mark.completed ? 'Finished' : `Reached step ${reachedStep(mark, steps) + 1} of ${steps}`;
}

export function Library({
  presets,
  currentId,
  onSelect,
  marks = null,
  isStarred,
  onStar,
}: LibraryProps) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  // The first tag is the category (contract `Preset.tags`).
  const cats = useMemo(
    () => ['all', ...Array.from(new Set(presets.map((p) => p.tags[0])))],
    [presets]
  );
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = presets.filter((p) => {
    if (cat !== 'all' && p.tags[0] !== cat) return false;
    if (!words.length) return true;
    const hay = `${p.name} ${p.ref} ${p.artist} ${p.tags.join(' ')} ${p.blurb}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return (
    <section aria-labelledby="lib-h" className="flex min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="lib-h" className="kys-label text-(--kys-muted)">
          Sound library
        </h2>
        <span className="font-mono text-xs text-(--kys-faint)">
          {shown.length} of {presets.length}
        </span>
      </div>
      <input
        id="lib-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search artist, song, style…"
        aria-label="Search the sound library"
        className="w-full rounded-md border border-(--kys-line) bg-(--kys-surface) px-3 py-2 text-sm text-(--kys-text) placeholder:text-(--kys-faint)"
      />
      <div className="flex flex-wrap gap-1.5">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={`kys-label rounded-full border px-2.5 py-1 ${cat === c ? 'border-(--kys-accent) bg-(--kys-accent) text-(--kys-accent-ink)' : 'border-(--kys-line) text-(--kys-muted) hover:text-(--kys-text)'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <ul className="kys-scroll -mr-1 flex max-h-[560px] flex-col gap-1.5 overflow-y-auto pr-1">
        {shown.map((p) => {
          const on = p.id === currentId;
          const mark = marks?.get(p.id);
          const starred = isStarred?.(p.id) ?? null;
          return (
            <li key={p.id} className="flex items-start gap-1">
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                aria-current={on}
                className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${on ? 'border-(--kys-accent) bg-(--kys-raised)' : 'border-transparent bg-(--kys-surface) hover:border-(--kys-line)'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="leading-tight font-semibold">{p.name}</span>
                  <LevelDots level={p.level} />
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-(--kys-muted)">
                  {p.ref}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {p.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-(--kys-ground) px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-(--kys-faint) uppercase"
                    >
                      {t}
                    </span>
                  ))}
                </span>
                {mark && p.steps.length > 0 && (
                  <span
                    className={`mt-1.5 block font-mono text-[11px] ${mark.completed ? 'text-(--kys-good)' : 'text-(--kys-muted)'}`}
                  >
                    {mark.completed ? '✓ ' : ''}
                    {markText(mark, p.steps.length)}
                  </span>
                )}
              </button>
              {starred !== null && onStar && (
                <StarButton
                  on={starred}
                  name={p.name}
                  onToggle={() => onStar(p.id)}
                  className="mt-1.5"
                />
              )}
            </li>
          );
        })}
        {!shown.length && (
          <li className="rounded-lg border border-dashed border-(--kys-line) p-4 text-sm text-(--kys-muted)">
            No sounds match. Clear the search or pick another category.
          </li>
        )}
      </ul>
    </section>
  );
}
