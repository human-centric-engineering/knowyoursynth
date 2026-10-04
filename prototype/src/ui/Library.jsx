import { useMemo, useState } from 'react';

const LEVELS = ['', 'Beginner', 'Intermediate', 'Advanced'];

export function LevelDots({ level }) {
  return (
    <span className="inline-flex items-center gap-[3px]" title={LEVELS[level]} aria-label={LEVELS[level]}>
      {[1, 2, 3].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= level ? 'bg-accent' : 'bg-line'}`} />)}
    </span>
  );
}

export function Library({ presets, currentId, onSelect }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const cats = useMemo(() => ['all', ...Array.from(new Set(presets.map((p) => p.tags[0])))], [presets]);
  const shown = presets.filter((p) => {
    if (cat !== 'all' && p.tags[0] !== cat) return false;
    if (!q.trim()) return true;
    const hay = `${p.name} ${p.ref} ${p.artist} ${p.tags.join(' ')} ${p.blurb}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });
  return (
    <section aria-labelledby="lib-h" className="flex min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="lib-h" className="kys-label text-muted">Sound library</h2>
        <span className="font-mono text-xs text-faint">{shown.length} of {presets.length}</span>
      </div>
      <input id="lib-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artist, song, style…"
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint" />
      <div className="flex flex-wrap gap-1.5">
        {cats.map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
            className={`kys-label rounded-full border px-2.5 py-1 ${cat === c ? 'border-accent bg-accent text-accent-ink' : 'border-line text-muted hover:text-text'}`}>{c}</button>
        ))}
      </div>
      <ul className="kys-scroll -mr-1 flex max-h-[560px] flex-col gap-1.5 overflow-y-auto pr-1">
        {shown.map((p) => {
          const on = p.id === currentId;
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onSelect(p.id)} aria-current={on}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${on ? 'border-accent bg-raised' : 'border-transparent bg-surface hover:border-line'}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold leading-tight">{p.name}</span>
                  <LevelDots level={p.level} />
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{p.ref}</span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {p.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-ground px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-faint">{t}</span>)}
                </span>
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No sounds match. Clear the search, or ask the tutor to design one.</li>}
      </ul>
    </section>
  );
}
