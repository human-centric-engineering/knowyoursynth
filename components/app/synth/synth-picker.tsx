'use client';

/**
 * The synth chooser. A dropdown rather than a row of buttons: the list has room for each synth's maker, year and
 * one-line heritage.
 *
 * Transliterated from the prototype file `prototype/src/ui/SynthPicker.jsx` (decision D3). One change: the list is
 * the catalogue (`GET /api/v1/synths`), passed in, rather than the prototype's built-in `SYNTHS`.
 *
 * A signed-in user stars the synth they are on with the button beside the chooser (`f-my-sounds` s4), and the list
 * marks the ones they have starred. The star is not inside the list: its entries are listbox options, which cannot hold
 * a button of their own.
 *
 * A synth family (`f-synth-families` t-320) is one entry, with its members' makers and years. Choosing it opens the
 * member the user owns, else the family's default; the version toggle by the caption moves between members. The box
 * over the list finds a member by its own name, and that member opens as itself.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { SynthFamily } from '@/lib/app/families/read';
import { StarButton, StarIcon } from '@/components/app/synth/favourites';
import {
  familyOpens,
  pickerEntries,
  type PickerEntry,
  type PickerSynth,
} from '@/components/app/synth/family-entries';

const NO_FAMILIES: readonly SynthFamily[] = [];
const NONE_OWNED: ReadonlySet<string> = new Set();

export interface SynthPickerProps {
  synths: readonly PickerSynth[];
  /** From `GET /api/v1/synths/families`: each is listed as one entry. */
  families?: readonly SynthFamily[];
  /** The databank instruments the signed-in user owns, by id: a family opens on the member they own. */
  owned?: ReadonlySet<string>;
  synthId: string;
  onSelect: (id: string) => void;
  /** Whether a synth is starred; `null` when no star shows (signed out, or still loading). */
  isStarred?: (id: string) => boolean | null;
  onStar?: (id: string) => void;
  /** `caption`: the player's caption, where the synth's name is the title over the panel and opens the list. */
  variant?: 'button' | 'caption';
}

export function SynthPicker({
  synths,
  families = NO_FAMILIES,
  owned = NONE_OWNED,
  synthId,
  onSelect,
  isStarred,
  onStar,
  variant = 'button',
}: SynthPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = synths.find((s) => s.id === synthId) || synths[0];
  const entries = useMemo(() => pickerEntries(synths, families, query), [synths, families, query]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
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

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pick = (id: string) => {
    close();
    onSelect(id);
  };
  // A family you are already on stays on the member you have open: the toggle is what moves between them.
  const choose = (e: PickerEntry) => {
    if (e.kind === 'synth') return pick(e.synth.id);
    if (e.synths.some((s) => s.id === synthId)) return close();
    const opens = familyOpens(e.family, e.synths, owned);
    if (opens) pick(opens);
    else close();
  };
  const isOn = (e: PickerEntry) =>
    e.kind === 'synth' ? e.synth.id === synthId : e.synths.some((s) => s.id === synthId);
  const firstOption = () =>
    list.current?.firstElementChild instanceof HTMLElement ? list.current.firstElementChild : null;

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      firstOption()?.focus();
    } else if (e.key === 'Enter' && entries[0]) {
      e.preventDefault();
      choose(entries[0]);
    }
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
  const starred = isStarred?.(current.id) ?? null;
  return (
    <div ref={wrap} className="relative flex items-center gap-1">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={
          variant === 'caption'
            ? 'group flex items-end gap-2.5 rounded-lg text-left'
            : 'flex items-center gap-2.5 rounded-lg border border-(--kys-line) bg-(--kys-surface) py-1.5 pr-2.5 pl-3 text-left hover:border-(--kys-muted)'
        }
      >
        {variant === 'caption' ? (
          <span className="flex flex-col">
            {/* The maker is the page heading's; the button keeps the name it has as a plain button. */}
            <span aria-hidden="true" className="kys-label text-(--kys-faint)">
              {current.maker}
            </span>
            <span className="kys-display text-[clamp(20px,1.8vw,26px)] leading-[1.05] whitespace-nowrap text-(--kys-text) group-hover:text-(--kys-accent)">
              <span className="sr-only">Synth </span>
              {current.name}
            </span>
          </span>
        ) : (
          <>
            <span className="kys-label text-(--kys-faint)">Synth</span>
            <span className="text-sm font-semibold">{current.name}</span>
          </>
        )}
        <svg
          width="10"
          height="7"
          viewBox="0 0 10 7"
          aria-hidden="true"
          className={`text-(--kys-muted) transition-transform ${variant === 'caption' ? 'mb-2' : ''} ${open ? 'rotate-180' : ''}`}
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
      {starred !== null && onStar && (
        <StarButton on={starred} name={current.name} onToggle={() => onStar(current.id)} />
      )}

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-40 flex w-[min(360px,calc(100vw-64px))] flex-col gap-1 rounded-xl border border-(--kys-line) bg-(--kys-raised) p-1 shadow-2xl">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            aria-label="Find a synth"
            placeholder="Find a synth"
            className="w-full rounded-lg border border-(--kys-line) bg-(--kys-surface) px-2.5 py-1.5 text-sm"
          />
          <div
            ref={list}
            role="listbox"
            aria-label="Choose a synth"
            className="kys-scroll max-h-[min(70vh,480px)] overflow-y-auto"
          >
            {entries.map((e) => (
              <PickerOption
                key={e.kind === 'synth' ? e.synth.id : `family:${e.family.id}`}
                entry={e}
                on={isOn(e)}
                starred={
                  e.kind === 'synth'
                    ? !!isStarred?.(e.synth.id)
                    : e.synths.some((s) => isStarred?.(s.id))
                }
                onChoose={() => choose(e)}
                onKeyDown={onItemKey}
              />
            ))}
          </div>
          {entries.length === 0 && (
            <p className="px-2.5 py-2 text-[13px] text-(--kys-muted)">No synth matches that.</p>
          )}
        </div>
      )}
    </div>
  );
}

function PickerOption({
  entry,
  on,
  starred,
  onChoose,
  onKeyDown,
}: {
  entry: PickerEntry;
  on: boolean;
  starred: boolean;
  onChoose: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const name = entry.kind === 'synth' ? entry.synth.name : entry.family.name;
  // A family names each of its members' makers and years: the original's and every copy's.
  const made =
    entry.kind === 'synth'
      ? `${entry.synth.maker} · ${entry.synth.year}`
      : entry.family.members.map((m) => `${m.instrument.maker} ${m.instrument.year}`).join(' · ');
  const heritage =
    entry.kind === 'synth'
      ? entry.synth.heritage
      : entry.family.members.map((m) => m.label).join(', ');
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      onClick={onChoose}
      onKeyDown={onKeyDown}
      className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left ${on ? 'bg-(--kys-accent)/12' : 'hover:bg-(--kys-surface)'}`}
    >
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-(--kys-accent)' : 'bg-transparent'}`}
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold">{name}</span>
          {starred && (
            <span className="self-center text-(--kys-accent)" title="In your favourites">
              <StarIcon filled />
              <span className="sr-only">(in your favourites)</span>
            </span>
          )}
          <span className="kys-label text-(--kys-faint)">{made}</span>
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-(--kys-muted)">
          {entry.kind === 'family' && <span className="sr-only">Family: </span>}
          {heritage}
        </span>
      </span>
    </button>
  );
}
