'use client';

/**
 * Find a knob, switch, jack or section by name or by what it does. The best match is lit on the panel as you type;
 * choosing a result also opens its explanation in the inspector.
 *
 * Transliterated from the prototype file `prototype/src/ui/Search.jsx` (decision D3).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { buildIndex, searchIndex } from '@/lib/app/synths/lib/areas';
import type { SearchRow } from '@/lib/app/synths/lib/areas';
import type { SynthDef } from '@/lib/app/synths/contract';
import { findStore, focusStore } from '@/components/app/synth/stores';

export function Search({ def }: { def: SynthDef }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => buildIndex(def), [def]);
  const results = useMemo(() => searchIndex(rows, q), [rows, q]);

  // A new synth (or a new layout of this one) starts the search again.
  const [searchedDef, setSearchedDef] = useState(def);
  if (searchedDef !== def) {
    setSearchedDef(def);
    setQ('');
    setOpen(false);
  }
  useEffect(() => {
    findStore.set(null);
  }, [def]);

  // Light up whichever result is current while the list is open.
  const cur = open && results.length ? results[Math.min(active, results.length - 1)] : null;
  const curKind = cur?.kind;
  const curId = cur?.id;
  useEffect(() => {
    if (curKind && curId) findStore.set({ kind: curKind, id: curId });
  }, [curKind, curId]);

  const choose = (r: SearchRow) => {
    findStore.set({ kind: r.kind, id: r.id });
    focusStore.set({ kind: r.kind, id: r.id, x: 0, y: 0, tip: false });
    setQ(r.name);
    setOpen(false);
  };
  const clear = () => {
    setQ('');
    setOpen(false);
    findStore.set(null);
    inputRef.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && cur) {
      e.preventDefault();
      choose(cur);
    } else if (e.key === 'Escape') {
      if (q) {
        e.preventDefault();
        clear();
      } else e.currentTarget.blur();
    }
  };

  return (
    <div className="relative w-full min-w-0 sm:w-[380px]">
      <label htmlFor="kys-find" className="sr-only">
        Find a knob, jack or section on the {def.name}
      </label>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-(--kys-faint)"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M13 13l4.5 4.5" />
      </svg>
      <input
        id="kys-find"
        ref={inputRef}
        type="text"
        autoComplete="off"
        spellCheck="false"
        value={q}
        placeholder="Find a knob, jack or section, e.g. resonance"
        role="combobox"
        aria-expanded={open && q.trim() !== ''}
        aria-controls="kys-find-list"
        aria-autocomplete="list"
        aria-activedescendant={cur ? `kys-find-${cur.kind}-${cur.id}` : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
          if (!e.target.value.trim()) findStore.set(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-(--kys-line) bg-(--kys-surface) py-1.5 pr-8 pl-8 text-sm text-(--kys-text) placeholder:text-(--kys-faint)"
      />
      {q && (
        <button
          type="button"
          aria-label="Clear search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
          className="absolute top-1/2 right-1 -translate-y-1/2 px-2 py-1 text-(--kys-muted) hover:text-(--kys-text)"
        >
          ×
        </button>
      )}
      {open && q.trim() !== '' && (
        <ul
          id="kys-find-list"
          role="listbox"
          aria-label="Matches"
          className="kys-scroll absolute top-full left-0 z-40 mt-1 max-h-[380px] w-full overflow-y-auto rounded-lg border border-(--kys-line) bg-(--kys-raised) p-1 shadow-2xl sm:w-[460px]"
        >
          {results.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-(--kys-muted)">
              Nothing on the {def.name} panel matches “{q.trim()}”. Try a plainer word, such as
              filter, echo or pitch.
            </li>
          )}
          {results.map((r, i) => (
            <li
              key={`${r.kind}:${r.id}`}
              id={`kys-find-${r.kind}-${r.id}`}
              role="option"
              aria-selected={r === cur}
              // Chosen on press, before the input's blur would close the list. The keyboard path is the input's
              // arrows and Enter (aria-activedescendant), so the options themselves take no focus.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              onPointerEnter={() => setActive(i)}
              className={`cursor-pointer rounded-md px-2.5 py-1.5 ${r === cur ? 'bg-(--kys-surface)' : ''}`}
            >
              <span className="flex items-baseline gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="truncate text-sm font-semibold text-(--kys-text)">{r.name}</span>
                <span className="kys-label shrink-0 text-(--kys-faint)">
                  {r.type}
                  {r.where ? ` · ${r.where}` : ''}
                </span>
              </span>
              <span className="block truncate pl-4 text-[13px] text-(--kys-muted)">{r.help}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
