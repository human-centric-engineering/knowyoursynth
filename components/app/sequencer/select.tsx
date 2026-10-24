'use client';

/**
 * A select in the sequencer's readout (`f-step-sequencer` t-80): a cell that opens a list drawn in the readout's own
 * amber, in place of the browser's menu.
 *
 * A combobox to assistive technology: focus stays on the cell while the list is open, and the option the arrows are
 * on is its active descendant. Arrows (or Enter, or Space) open it; in it, the arrows, Home and End move, a letter
 * jumps to the next option starting with it, Enter or Space chooses, and Escape or Tab closes. A press outside closes
 * it. It opens upward (the dock is at the foot of the screen) unless there is no room above.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { PlayerTip } from '@/components/app/synth/player-tip';

/** Room the list wants above the cell before it opens upward, in px. */
const LIST_ROOM = 260;

export function SeqSelect({
  label,
  help,
  value,
  options,
  onChange,
}: {
  label: string;
  help: string;
  value: string;
  /** Each a value and the words it is shown as. */
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [down, setDown] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const cell = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const at = Math.max(
    0,
    options.findIndex(([v]) => v === value)
  );
  const shown = options[at]?.[1] ?? value;

  const show = () => {
    const top = cell.current?.getBoundingClientRect().top ?? LIST_ROOM;
    setDown(top < LIST_ROOM);
    setActive(at);
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o && o[0] !== value) onChange(o[0]);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        show();
      }
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') setOpen(false);
    else if (/^\S$/.test(e.key)) {
      // A letter or digit: the next option after the active one that starts with it, round the end.
      const k = e.key.toLowerCase();
      const next = [...options.keys()]
        .map((n) => (active + 1 + n) % options.length)
        .find((n) => options[n][1].toLowerCase().startsWith(k));
      if (next === undefined) return;
      setActive(next);
    } else return;
    e.preventDefault();
    // The page plays notes from letters; while the list is open they are the list's.
    e.stopPropagation();
  };

  return (
    <div ref={wrap} className="kys-cell kys-cell-dropdown">
      <PlayerTip name={label} help={help}>
        <button
          ref={cell}
          type="button"
          role="combobox"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-activedescendant={open ? `${id}-${active}` : undefined}
          className="kys-cell-select"
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={onKeyDown}
        >
          <span className="kys-cell-label" aria-hidden="true">
            {label}
          </span>
          <span className="kys-cell-value">{shown}</span>
        </button>
      </PlayerTip>
      {open && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          className="kys-seq-list"
          data-down={down || undefined}
        >
          {options.map(([v, l], i) => (
            // The keys are the combobox's, which keeps focus while the list is open (aria-activedescendant).
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={v}
              id={`${id}-${i}`}
              data-i={i}
              role="option"
              aria-selected={v === value}
              data-active={i === active || undefined}
              className="kys-seq-option"
              onPointerDown={(e) => e.preventDefault()}
              onPointerEnter={() => setActive(i)}
              onClick={() => {
                choose(i);
                cell.current?.focus();
              }}
            >
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The list of a select without its cell, for a list another control opens (a lane's tab, pressed again). It takes the
 * keys while it is open: focus moves to it, the arrows, Home and End move, a letter jumps, Enter or Space chooses, and
 * Escape or Tab closes, handing focus back to `anchor`. A press outside it and outside `anchor` closes it. It opens
 * upward unless there is no room above, from the nearest positioned ancestor.
 */
export function SeqPicker({
  label,
  value,
  options,
  anchor,
  onChange,
  onClose,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  /** What opened it, which a press on does not close it (it toggles it itself), and focus goes back to. */
  anchor: { current: HTMLElement | null };
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const list = useRef<HTMLUListElement | null>(null);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex(([v]) => v === value)
    )
  );
  const [down] = useState(
    () => (anchor.current?.getBoundingClientRect().top ?? LIST_ROOM) < LIST_ROOM
  );
  const close = (refocus: boolean) => {
    onClose();
    if (refocus) anchor.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o && o[0] !== value) onChange(o[0]);
    close(true);
  };

  useEffect(() => {
    list.current?.focus();
  }, []);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node) || list.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [anchor, onClose]);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') close(true);
    else if (/^\S$/.test(e.key)) {
      const k = e.key.toLowerCase();
      const next = [...options.keys()]
        .map((n) => (active + 1 + n) % options.length)
        .find((n) => options[n][1].toLowerCase().startsWith(k));
      if (next === undefined) return;
      setActive(next);
    } else return;
    e.preventDefault();
    // The page plays notes from letters; while the list is open they are the list's.
    e.stopPropagation();
  };

  return (
    <ul
      ref={list}
      id={id}
      role="listbox"
      tabIndex={-1}
      aria-label={label}
      aria-activedescendant={`${id}-${active}`}
      className="kys-seq-list"
      data-down={down || undefined}
      onKeyDown={onKeyDown}
    >
      {options.map(([v, l], i) => (
        // The keys are the list's own (aria-activedescendant), so an option takes none.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events
        <li
          key={v}
          id={`${id}-${i}`}
          data-i={i}
          role="option"
          aria-selected={v === value}
          data-active={i === active || undefined}
          className="kys-seq-option"
          onPointerDown={(e) => e.preventDefault()}
          onPointerEnter={() => setActive(i)}
          onClick={() => choose(i)}
        >
          {l}
        </li>
      ))}
    </ul>
  );
}
