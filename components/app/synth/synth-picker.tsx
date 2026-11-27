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
 * The list (`f-synth-picker` t-328, `.context/app/synth-picker.md`): grouped under each maker's brand, every row
 * leading with the synth's name and maker, then its year, kind, whether it plays and its description, with a thumbnail
 * of the panel for a synth that plays. Each member of a synth family is a row of its own; one nobody has modelled opens
 * as its family's blank panel (`onSelectMember`). The box finds a synth by name, maker, brand or family.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { SynthFamily } from '@/lib/app/families/read';
import { StarButton, StarIcon } from '@/components/app/synth/favourites';
import { synthThumbnailHref } from '@/components/app/synth/routes';
import { PickerAdvanced } from '@/components/app/synth/picker-advanced';
import {
  familyOpens,
  pickerGroups,
  type PickerListRow,
  type PickerRow,
  type PickerSynth,
} from '@/components/app/synth/picker-entries';
import {
  changedChoices,
  FACTORY_PICKER,
  pickerChoices,
  withChoice,
  type PickerChoices,
  type PickerPrefs,
  type SitePickerSettings,
} from '@/lib/app/picker/settings';

const NO_FAMILIES: readonly SynthFamily[] = [];
const NONE_OWNED: ReadonlySet<string> = new Set();
const NO_PREFS: PickerPrefs = {};

export interface SynthPickerProps {
  synths: readonly PickerSynth[];
  /** From `GET /api/v1/synths/families`: each is listed as one entry. */
  families?: readonly SynthFamily[];
  /** The databank instruments the signed-in user owns, by id: a family opens on the member they own. */
  owned?: ReadonlySet<string>;
  synthId: string;
  /** The unmodelled family member whose blank panel is showing, by slug, if any: its row is the one selected. */
  memberSlug?: string | null;
  onSelect: (id: string) => void;
  /**
   * An unmodelled family member chosen: show its blank panel over `synthId`, the family's synth it opens on (this one
   * when the member is in this synth's family). Without it, those members are not listed; a synth is still found by
   * its family's name.
   */
  onSelectMember?: (synthId: string, slug: string) => void;
  /** Whether a synth is starred; `null` when no star shows (signed out, or still loading). */
  isStarred?: (id: string) => boolean | null;
  onStar?: (id: string) => void;
  /** `caption`: the player's caption, where the synth's name is the title over the panel and opens the list. */
  variant?: 'button' | 'caption';
  /** The site's settings (`GET /api/v1/synths/picker-settings`, t-329); the defaults when not given. */
  site?: SitePickerSettings;
  /** The visitor's own changes to them (`picker` of `/api/v1/me/settings`, or the browser's). */
  prefs?: PickerPrefs;
  /** Keep the visitor's changes. Without it, or while the site does not allow them, there is no Advanced search. */
  onPrefs?: (prefs: PickerPrefs) => void;
}

export function SynthPicker({
  synths,
  families = NO_FAMILIES,
  owned = NONE_OWNED,
  synthId,
  memberSlug = null,
  onSelect,
  onSelectMember,
  isStarred,
  onStar,
  variant = 'button',
  site = FACTORY_PICKER,
  prefs = NO_PREFS,
  onPrefs,
}: SynthPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const advancedId = useId();
  const choices = pickerChoices(site, prefs);
  const changed = changedChoices(site, prefs);
  const mayChange = site.visitorsMayChange && !!onPrefs;
  const choose_ = <K extends keyof PickerChoices>(key: K, value: PickerChoices[K]) =>
    onPrefs?.(withChoice(site, prefs, key, value));
  const wrap = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = synths.find((s) => s.id === synthId) || synths[0];
  const listsMembers = !!onSelectMember;
  const groups = useMemo(
    () =>
      pickerGroups(synths, families, query, {
        unmodelled: listsMembers,
        group: choices.group,
        order: choices.order,
        kinds: choices.kinds,
      }),
    // Whether there is a handler, not which: the page passes a new one each render. `kinds` is the site's or the
    // visitor's own array, the same until one of them changes.
    [synths, families, listsMembers, query, choices.group, choices.order, choices.kinds]
  );
  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // The Advanced window first, then the list.
      if (advanced) {
        setAdvanced(false);
        return;
      }
      setOpen(false);
      setQuery('');
      wrap.current?.querySelector('button')?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open, advanced]);

  // Open on the synth you are already using, so the arrow keys start from the right place.
  useEffect(() => {
    if (!open || !list.current) return;
    const sel =
      list.current.querySelector<HTMLElement>('[role="option"][aria-selected="true"]') ||
      list.current.querySelector<HTMLElement>('[role="option"]');
    if (sel) sel.focus();
  }, [open]);

  const step = (from: HTMLElement, dir: number) => {
    if (!list.current) return;
    const items = [...list.current.querySelectorAll<HTMLElement>('[role="option"]')];
    const i = items.indexOf(from);
    const next = items[(i + dir + items.length) % items.length];
    next?.focus();
  };

  const close = () => {
    setOpen(false);
    setQuery('');
    setAdvanced(false);
  };
  const pick = (id: string) => {
    close();
    onSelect(id);
  };
  // An unmodelled member opens over this synth when it is in this synth's family, else over the family's synth the
  // user owns, or its default.
  const choose = (row: PickerRow) => {
    if (row.synthId) return pick(row.synthId);
    const rf = row.family;
    close();
    if (!rf || !onSelectMember) return;
    const offered = rf.family.members.flatMap(
      (m) => (m.synthId && synths.find((s) => s.id === m.synthId)) || []
    );
    const over = offered.some((s) => s.id === synthId)
      ? synthId
      : familyOpens(rf.family, offered, owned);
    if (over) onSelectMember(over, rf.member.slug);
  };
  const isOn = (row: PickerRow) =>
    row.synthId
      ? row.synthId === synthId && !memberSlug
      : !!memberSlug &&
        row.family?.member.slug === memberSlug &&
        row.family.family.members.some((m) => m.synthId === synthId);
  const firstOption = () => list.current?.querySelector<HTMLElement>('[role="option"]') ?? null;

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      firstOption()?.focus();
    } else if (e.key === 'Enter' && query.trim() && rows[0]) {
      e.preventDefault();
      choose(rows[0]);
    }
  };

  const onItemKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      step(e.currentTarget, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      step(e.currentTarget, -1);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      // Typing on the list finds: the letter goes into the box, and the cursor with it.
      e.preventDefault();
      setQuery((q) => q + e.key);
      search.current?.focus();
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
        <div className="absolute top-[calc(100%+6px)] left-0 z-40 flex w-[min(460px,calc(100vw-64px))] flex-col gap-1 rounded-xl border border-(--kys-line) bg-(--kys-raised) p-1 shadow-2xl">
          <div className="flex items-center gap-1">
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              aria-label="Find a synth"
              placeholder="Find a synth by name or maker"
              className="min-w-0 flex-1 rounded-lg border border-(--kys-line) bg-(--kys-surface) px-2.5 py-1.5 text-sm"
            />
            {mayChange && (
              <button
                type="button"
                aria-expanded={advanced}
                aria-controls={advancedId}
                onClick={() => setAdvanced((a) => !a)}
                className={`kys-label flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${advanced ? 'border-(--kys-text) bg-(--kys-text) text-(--kys-raised)' : 'border-(--kys-line) text-(--kys-muted) hover:border-(--kys-muted)'}`}
              >
                Advanced
                {changed > 0 && (
                  <span className="rounded-full bg-(--kys-accent) px-1.5 text-(--kys-accent-ink)">
                    {changed}
                    <span className="sr-only"> changed</span>
                  </span>
                )}
              </button>
            )}
          </div>
          {mayChange && advanced && (
            <PickerAdvanced
              id={advancedId}
              choices={choices}
              changed={changed}
              onChange={choose_}
              onReset={() => onPrefs?.({})}
            />
          )}
          <div
            ref={list}
            role="listbox"
            aria-label="Choose a synth"
            // Scroll padding the height of a brand's sticky heading, so a row the arrow keys reach is not under it.
            className="kys-scroll max-h-[min(70vh,520px)] scroll-pt-9 overflow-y-auto"
          >
            {groups.map((g) => (
              // A list by name or lineage is one group with no heading; by maker, one per brand.
              <div key={g.label} role="group" aria-label={g.label || 'Synths'}>
                {g.label && (
                  <div
                    aria-hidden="true"
                    className="kys-label sticky top-0 z-10 bg-(--kys-raised) px-2.5 pt-2.5 pb-1 text-(--kys-accent)"
                  >
                    {g.label}
                  </div>
                )}
                {g.rows.map((row) => (
                  <PickerOption
                    key={row.key}
                    row={row}
                    thumbs={choices.thumbs}
                    on={isOn(row)}
                    starred={!!row.synthId && !!isStarred?.(row.synthId)}
                    onChoose={() => choose(row)}
                    onKeyDown={onItemKey}
                  />
                ))}
              </div>
            ))}
          </div>
          {rows.length === 0 && (
            <p className="px-2.5 py-2 text-[13px] text-(--kys-muted)">No synth matches that.</p>
          )}
        </div>
      )}
    </div>
  );
}

function PickerOption({
  row,
  thumbs,
  on,
  starred,
  onChoose,
  onKeyDown,
}: {
  row: PickerListRow;
  /** Whether rows show a thumbnail of the panel (the visitor's choice, t-329). */
  thumbs: boolean;
  on: boolean;
  starred: boolean;
  onChoose: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const { synthId } = row;
  const plays = synthId !== null;
  // A thumbnail that will not load (the route's 404 when a panel will not draw) gives way to the empty box.
  const [noPicture, setNoPicture] = useState(false);
  const made = [row.year, row.kind].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      onClick={onChoose}
      onKeyDown={onKeyDown}
      className={`flex w-full items-start gap-2.5 rounded-lg py-2 pr-2.5 text-left ${row.depth ? 'pl-8' : 'pl-2.5'} ${on ? 'bg-(--kys-accent)/12' : 'hover:bg-(--kys-surface)'}`}
    >
      <span
        className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-(--kys-accent)' : 'bg-transparent'}`}
      />
      {!thumbs ? null : synthId !== null && !noPicture ? (
        // A picture of a page, from the app's own route: next/image would only re-encode it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={synthThumbnailHref(synthId)}
          alt=""
          width={92}
          height={38}
          loading="lazy"
          decoding="async"
          onError={() => setNoPicture(true)}
          className="mt-0.5 h-[38px] w-[92px] shrink-0 rounded bg-(--kys-desk) object-contain object-left"
        />
      ) : (
        <span
          aria-hidden="true"
          className="kys-label mt-0.5 grid h-[38px] w-[92px] shrink-0 place-items-center rounded border border-dashed border-(--kys-line) text-[9px] text-(--kys-faint)"
        >
          No panel
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          {row.relation && (
            <span className="kys-label text-[10px] text-(--kys-faint)">{row.relation}</span>
          )}
          <span className={`text-sm font-semibold ${plays ? '' : 'text-(--kys-muted)'}`}>
            {row.name}
          </span>
          <span className="text-sm text-(--kys-muted)">{row.maker}</span>
          {starred && (
            <span className="self-center text-(--kys-accent)" title="In your favourites">
              <StarIcon filled />
              <span className="sr-only">(in your favourites)</span>
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {made && <span className="kys-label text-(--kys-faint)">{made}</span>}
          <span
            className={`kys-label rounded px-1.5 text-[11px] ${plays ? 'border border-(--kys-good)/55 text-(--kys-good)' : 'border border-dashed border-(--kys-line) text-(--kys-faint)'}`}
          >
            {plays ? 'Plays' : 'Not modelled'}
          </span>
        </span>
        <span className="line-clamp-2 text-[13px] leading-snug text-(--kys-muted)">{row.text}</span>
      </span>
    </button>
  );
}
