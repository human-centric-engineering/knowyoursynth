'use client';

/**
 * Where this synth comes from, in a dialog: the instruments and ideas behind it and its close relatives.
 *
 * Transliterated from the prototype file `src/ui/Lineage.jsx` (decision D3). The lineage is the catalogue's, read from
 * the API by the page (D13).
 *
 * What is not here yet (`B31`): "Heard on", the records made on this family, is joined from the databank, and so are
 * its "About <artist>" links. Both arrive with `f-databank`. Until then the third tab shows only when the lineage
 * names players ("Also known to have played one").
 */

import { useEffect, useState } from 'react';
import type { Lineage as LineageData } from '@/lib/app/synths/contract';
import { useDialog } from '@/components/app/synth/use-dialog';

type TabId = 'timeline' | 'relatives' | 'heard';

export interface LineageProps {
  synth: { id: string; maker: string; name: string };
  lineage: LineageData;
  open: boolean;
  onClose: () => void;
}

export function Lineage({ synth, lineage: l, open, onClose }: LineageProps) {
  const { ref, close } = useDialog(open);
  const [tab, setTab] = useState<TabId>('timeline');
  useEffect(() => {
    setTab('timeline');
  }, [synth.id]);

  const users = l.users ?? [];
  const tabs: [TabId, string, number][] = [
    ['timeline', 'How it got here', l.timeline.length],
    ['relatives', 'Close relatives', l.relatives.length],
    ...(users.length ? [['heard', 'Heard on', users.length] as [TabId, string, number]] : []),
  ];

  return (
    <dialog
      ref={ref}
      aria-labelledby="lineage-h"
      onClose={onClose}
      className="m-auto h-[min(820px,calc(100vh-32px))] w-[min(920px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-(--kys-line) bg-(--kys-surface) p-0 text-(--kys-text) shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex h-full flex-col">
        <header className="border-b border-(--kys-line) px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="kys-label text-(--kys-accent)">
                Lineage · {synth.maker} {synth.name}
              </p>
              <h2
                id="lineage-h"
                className="kys-display mt-1 text-[19px] leading-tight text-balance"
              >
                {l.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-1 px-1 text-2xl leading-none text-(--kys-muted) hover:text-(--kys-text)"
            >
              ×
            </button>
          </div>
          <p className="mt-2 max-w-[78ch] text-[14.5px] leading-relaxed text-(--kys-text)/90">
            {l.intro}
          </p>
          <div role="tablist" aria-label="Lineage" className="mt-3 flex gap-1 overflow-x-auto">
            {tabs.map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls="lineage-panel"
                onClick={() => setTab(id)}
                className={`-mb-px flex shrink-0 items-baseline gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-(--kys-accent) text-(--kys-text)' : 'border-transparent text-(--kys-muted) hover:text-(--kys-text)'}`}
              >
                {label}
                <span className="font-mono text-xs text-(--kys-faint)">{count}</span>
              </button>
            ))}
          </div>
        </header>

        <div
          id="lineage-panel"
          role="tabpanel"
          className="kys-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
        >
          {tab === 'timeline' && (
            <ol className="flex flex-col">
              {l.timeline.map((t, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[84px_minmax(0,1fr)]"
                >
                  <span className="pt-0.5 text-right font-mono text-[13px] text-(--kys-accent)">
                    {t.year}
                  </span>
                  <div
                    className={`border-l pb-4 pl-4 ${t.tag ? 'border-(--kys-accent)' : 'border-(--kys-line)'}`}
                  >
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-snug font-semibold">
                      {t.name}
                      {t.tag && (
                        <span className="kys-label rounded bg-(--kys-accent) px-1.5 py-0.5 text-(--kys-accent-ink)">
                          {t.tag}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 max-w-[68ch] text-[14px] leading-relaxed text-(--kys-muted)">
                      {t.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {tab === 'relatives' && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {l.relatives.map((r) => (
                <li
                  key={r.name}
                  className="rounded-xl border border-(--kys-line) bg-(--kys-ground) p-3.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="leading-snug font-semibold">{r.name}</p>
                    <span className="shrink-0 font-mono text-xs text-(--kys-faint)">{r.years}</span>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-(--kys-muted)">{r.text}</p>
                </li>
              ))}
            </ul>
          )}

          {tab === 'heard' && (
            <>
              <p className="kys-label text-(--kys-muted)">Also known to have played one</p>
              <p className="mt-1.5 max-w-[78ch] text-[14px] leading-relaxed text-(--kys-text)/90">
                {users.join(' · ')}
              </p>
              {l.note && (
                <p className="mt-3 text-sm leading-relaxed text-(--kys-faint)">{l.note}</p>
              )}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
