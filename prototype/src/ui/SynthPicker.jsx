import { useEffect, useRef, useState } from 'react';
import { SYNTHS } from '@/synths/index.js';

/**
 * The synth chooser. A dropdown rather than a row of buttons: the row grew past the header as
 * synths were added, and the list has room for each synth's maker, year and one-line heritage.
 */
export function SynthPicker({ synthId, onSelect }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const list = useRef(null);
  const current = SYNTHS.find((s) => s.id === synthId) || SYNTHS[0];

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); wrap.current.querySelector('button').focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  // Open on the synth you are already using, so the arrow keys start from the right place.
  useEffect(() => {
    if (!open || !list.current) return;
    const sel = list.current.querySelector('[aria-selected="true"]') || list.current.firstElementChild;
    if (sel) sel.focus();
  }, [open]);

  const step = (from, dir) => {
    const items = [...list.current.children];
    const i = items.indexOf(from);
    const next = items[(i + dir + items.length) % items.length];
    if (next) next.focus();
  };

  const pick = (id) => { setOpen(false); onSelect(id); };

  return (
    <div ref={wrap} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 rounded-lg border border-line bg-surface py-1.5 pl-3 pr-2.5 text-left hover:border-muted">
        <span className="kys-label text-faint">Synth</span>
        <span className="text-sm font-semibold">{current.name}</span>
        <svg width="10" height="7" viewBox="0 0 10 7" aria-hidden="true" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1.5 5 5.5 9 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div ref={list} role="listbox" aria-label="Choose a synth"
          className="kys-scroll absolute left-0 top-[calc(100%+6px)] z-40 max-h-[min(70vh,520px)] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-line bg-raised p-1 shadow-2xl">
          {SYNTHS.map((s) => (
            <button key={s.id} type="button" role="option" aria-selected={s.id === synthId} onClick={() => pick(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); step(e.currentTarget, 1); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); step(e.currentTarget, -1); }
              }}
              className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left ${s.id === synthId ? 'bg-accent/12' : 'hover:bg-surface'}`}>
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${s.id === synthId ? 'bg-accent' : 'bg-transparent'}`} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span className="kys-label text-faint">{s.maker} · {s.year}</span>
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{s.heritage}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
