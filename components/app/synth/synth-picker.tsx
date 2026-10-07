'use client';

/**
 * The synth chooser. A dropdown rather than a row of buttons: the list has room for each synth's maker, year and
 * one-line heritage.
 *
 * Transliterated from the prototype file `prototype/src/ui/SynthPicker.jsx` (decision D3). One change: the list is
 * the catalogue (`GET /api/v1/synths`), passed in, rather than the prototype's built-in `SYNTHS`.
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CatalogueSynth } from '@/lib/app/catalogue/read';

export interface SynthPickerProps {
  synths: readonly Pick<CatalogueSynth, 'id' | 'name' | 'maker' | 'year' | 'heritage'>[];
  synthId: string;
  onSelect: (id: string) => void;
}

export function SynthPicker({ synths, synthId, onSelect }: SynthPickerProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = synths.find((s) => s.id === synthId) || synths[0];

  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target))
        setOpen(false);
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        wrap.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  // Open on the synth you are already using, so the arrow keys start from the right place.
  useEffect(() => {
    if (!open || !list.current) return;
    const sel =
      list.current.querySelector<HTMLElement>('[aria-selected="true"]') ||
      (list.current.firstElementChild instanceof HTMLElement
        ? list.current.firstElementChild
        : null);
    if (sel) sel.focus();
  }, [open]);

  const step = (from: HTMLElement, dir: number) => {
    if (!list.current) return;
    const items = [...list.current.children];
    const i = items.indexOf(from);
    const next = items[(i + dir + items.length) % items.length];
    if (next instanceof HTMLElement) next.focus();
  };

  const pick = (id: string) => {
    setOpen(false);
    onSelect(id);
  };

  const onItemKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      step(e.currentTarget, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      step(e.currentTarget, -1);
    }
  };

  if (!current) return null;
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 rounded-lg border border-(--kys-line) bg-(--kys-surface) py-1.5 pr-2.5 pl-3 text-left hover:border-(--kys-muted)"
      >
        <span className="kys-label text-(--kys-faint)">Synth</span>
        <span className="text-sm font-semibold">{current.name}</span>
        <svg
          width="10"
          height="7"
          viewBox="0 0 10 7"
          aria-hidden="true"
          className={`text-(--kys-muted) transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M1 1.5 5 5.5 9 1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={list}
          role="listbox"
          aria-label="Choose a synth"
          className="kys-scroll absolute top-[calc(100%+6px)] left-0 z-40 max-h-[min(70vh,520px)] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-(--kys-line) bg-(--kys-raised) p-1 shadow-2xl"
        >
          {synths.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={s.id === synthId}
              onClick={() => pick(s.id)}
              onKeyDown={onItemKey}
              className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left ${s.id === synthId ? 'bg-(--kys-accent)/12' : 'hover:bg-(--kys-surface)'}`}
            >
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${s.id === synthId ? 'bg-(--kys-accent)' : 'bg-transparent'}`}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span className="kys-label text-(--kys-faint)">
                    {s.maker} · {s.year}
                  </span>
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-(--kys-muted)">
                  {s.heritage}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
