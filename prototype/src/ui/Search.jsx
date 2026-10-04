import { useEffect, useMemo, useRef, useState } from 'react';
import { findStore, focusStore } from '@/lib/store.js';
import { buildIndex, searchIndex } from '@/lib/areas.js';

/**
 * Find a knob, switch, jack or section by name or by what it does. The best match is lit on the panel as you type;
 * choosing a result also opens its explanation in the inspector.
 */
export function Search({ def }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const rows = useMemo(() => buildIndex(def), [def]);
  const results = useMemo(() => searchIndex(rows, q), [rows, q]);

  useEffect(() => { setQ(''); setOpen(false); findStore.set(null); }, [def]);
  // Light up whichever result is current while the list is open.
  const cur = open && results.length ? results[Math.min(active, results.length - 1)] : null;
  const curKey = cur ? `${cur.kind}:${cur.id}` : '';
  useEffect(() => { if (cur) findStore.set({ kind: cur.kind, id: cur.id }); }, [curKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (r) => {
    findStore.set({ kind: r.kind, id: r.id });
    focusStore.set({ kind: r.kind, id: r.id, tip: false });
    setQ(r.name);
    setOpen(false);
  };
  const clear = () => { setQ(''); setOpen(false); findStore.set(null); if (inputRef.current) inputRef.current.focus(); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && cur) { e.preventDefault(); choose(cur); }
    else if (e.key === 'Escape') { if (q) { e.preventDefault(); clear(); } else e.currentTarget.blur(); }
  };

  return (
    <div className="relative w-full min-w-0 sm:w-[380px]">
      <label htmlFor="kys-find" className="sr-only">Find a knob, jack or section on the {def.name}</label>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4.5 4.5" /></svg>
      <input id="kys-find" ref={inputRef} type="text" autoComplete="off" spellCheck="false" value={q} placeholder="Find a knob, jack or section, e.g. resonance"
        role="combobox" aria-expanded={open && q.trim() !== ''} aria-controls="kys-find-list" aria-autocomplete="list" aria-activedescendant={cur ? `kys-find-${cur.kind}-${cur.id}` : undefined}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); if (!e.target.value.trim()) findStore.set(null); }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
        className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-8 text-sm text-text placeholder:text-faint" />
      {q && <button type="button" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={clear} className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 text-muted hover:text-text">×</button>}
      {open && q.trim() !== '' && (
        <ul id="kys-find-list" role="listbox" aria-label="Matches" className="kys-scroll absolute left-0 top-full z-40 mt-1 max-h-[380px] w-full overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-2xl sm:w-[460px]">
          {results.length === 0 && <li className="px-2.5 py-2 text-sm text-muted">Nothing on the {def.name} panel matches “{q.trim()}”. Try a plainer word, such as filter, echo or pitch.</li>}
          {results.map((r, i) => (
            <li key={`${r.kind}:${r.id}`} id={`kys-find-${r.kind}-${r.id}`} role="option" aria-selected={r === cur}
              onMouseDown={(e) => e.preventDefault()} onPointerEnter={() => setActive(i)} onClick={() => choose(r)}
              className={`cursor-pointer rounded-md px-2.5 py-1.5 ${r === cur ? 'bg-surface' : ''}`}>
              <span className="flex items-baseline gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="truncate text-sm font-semibold text-text">{r.name}</span>
                <span className="kys-label shrink-0 text-faint">{r.type}{r.where ? ` · ${r.where}` : ''}</span>
              </span>
              <span className="block truncate pl-4 text-[13px] text-muted">{r.help}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
