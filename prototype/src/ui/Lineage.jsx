import { useEffect, useRef, useState } from 'react';
import { artistById } from '@/bank/index.js';

const TABS = [
  ['timeline', 'How it got here'],
  ['relatives', 'Close relatives'],
  ['heard', 'Heard on'],
];

/** Where this synth comes from, in a dialog: the instruments and ideas behind it, its close relatives, and records made on that family. */
export function Lineage({ def, presets, open, onClose, onSelect, onArtist }) {
  const ref = useRef(null);
  const [tab, setTab] = useState('timeline');
  const l = def.lineage;

  useEffect(() => { setTab('timeline'); }, [def.id]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (!l) return null;
  const has = (id) => id && presets.some((p) => p.id === id);
  const counts = { timeline: l.timeline.length, relatives: l.relatives.length, heard: l.heard.length };

  return (
    <dialog ref={ref} aria-labelledby="lineage-h" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}
      className="m-auto h-[min(820px,calc(100vh-32px))] w-[min(920px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-text shadow-2xl backdrop:bg-black/60">
      <div className="flex h-full flex-col">
        <header className="border-b border-line px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="kys-label text-accent">Lineage · {def.maker} {def.name}</p>
              <h2 id="lineage-h" className="mt-1 font-display text-[19px] leading-tight text-balance">{l.title}</h2>
            </div>
            <button type="button" onClick={() => ref.current.close()} aria-label="Close" className="-mr-1 px-1 text-2xl leading-none text-muted hover:text-text">×</button>
          </div>
          <p className="mt-2 max-w-[78ch] text-[14.5px] leading-relaxed text-text/90">{l.intro}</p>
          <div role="tablist" aria-label="Lineage" className="mt-3 flex gap-1 overflow-x-auto">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls="lineage-panel" onClick={() => setTab(id)}
                className={`-mb-px flex shrink-0 items-baseline gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'}`}>
                {label}<span className="font-mono text-xs text-faint">{counts[id]}</span>
              </button>
            ))}
          </div>
        </header>

        <div id="lineage-panel" role="tabpanel" className="kys-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {tab === 'timeline' && (
            <ol className="flex flex-col">
              {l.timeline.map((t, i) => (
                <li key={i} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[84px_minmax(0,1fr)]">
                  <span className="pt-0.5 text-right font-mono text-[13px] text-accent">{t.year}</span>
                  <div className={`border-l pb-4 pl-4 ${t.tag ? 'border-accent' : 'border-line'}`}>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold leading-snug">
                      {t.name}
                      {t.tag && <span className="kys-label rounded bg-accent px-1.5 py-0.5 text-accent-ink">{t.tag}</span>}
                    </p>
                    <p className="mt-1 max-w-[68ch] text-[14px] leading-relaxed text-muted">{t.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {tab === 'relatives' && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {l.relatives.map((r) => (
                <li key={r.name} className="rounded-xl border border-line bg-ground p-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold leading-snug">{r.name}</p>
                    <span className="shrink-0 font-mono text-xs text-faint">{r.years}</span>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{r.text}</p>
                </li>
              ))}
            </ul>
          )}

          {tab === 'heard' && (
            <>
              <ul className="grid gap-2 sm:grid-cols-2">
                {l.heard.map((h) => (
                  <li key={`${h.who}${h.what}`} className="flex flex-col rounded-xl border border-line bg-ground p-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 font-semibold leading-snug">{h.who}</p>
                      <span className="shrink-0 font-mono text-xs text-faint">{h.year}</span>
                    </div>
                    <p className="text-[14px] leading-snug text-text/90">{h.what}</p>
                    <p className="kys-label mt-1.5 text-muted">Played on: <span className="text-text">{h.on}</span></p>
                    <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-muted">{h.text}</p>
                    {onArtist && h.artists?.some(artistById) && (
                      <p className="mt-2 flex flex-wrap gap-x-3 text-sm">
                        {h.artists.filter(artistById).map((id) => (
                          <button key={id} type="button" onClick={() => onArtist(id)} className="text-accent underline-offset-2 hover:underline">About {artistById(id).name} ›</button>
                        ))}
                      </p>
                    )}
                    {has(h.sound) && (
                      <button type="button" onClick={() => { onSelect(h.sound); ref.current.close(); }}
                        className="mt-2.5 self-start rounded-md border border-line px-2.5 py-1 text-left text-sm text-muted hover:border-muted hover:text-text">
                        Load a sound in this style: <span className="text-text">{presets.find((p) => p.id === h.sound).name}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {l.users?.length > 0 && (
                <div className="mt-4">
                  <p className="kys-label text-muted">Also known to have played one</p>
                  <p className="mt-1.5 max-w-[78ch] text-[14px] leading-relaxed text-text/90">{l.users.join(' · ')}</p>
                </div>
              )}
              {l.note && <p className="mt-3 text-sm leading-relaxed text-faint">{l.note}</p>}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
