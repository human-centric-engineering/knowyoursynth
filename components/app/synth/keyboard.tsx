'use client';

/**
 * The on-screen keyboard: three octaves and a top C, the mod wheel, octave shift and hold.
 *
 * Transliterated from the prototype file `prototype/src/ui/Keyboard.jsx` (decision D3). What changed (`f-phone-and-tablet`):
 * - Each pointer holds its own note, so several fingers play a chord.
 * - Under `lg` the keys and buttons are finger-sized (44 px), so the keys scroll sideways, and a sideways swipe on
 *   them scrolls instead of sliding from key to key. A tap still plays.
 */

import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { useWheelWanted } from '@/components/app/synth/sound-map';
import { notesStore, useStore } from '@/components/app/synth/stores';

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const HAS_SHARP: Record<number, boolean> = { 0: true, 2: true, 5: true, 7: true, 9: true };

/** Computer key → semitones above the keyboard's C. */
export const QWERTY: Readonly<Record<string, number>> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ';': 16,
};
const QWERTY_LABEL: Record<number, string> = Object.fromEntries(
  Object.entries(QWERTY).map(([k, v]) => [v, k.toUpperCase()])
);

/** The lowest and highest octave shift. */
export const OCTAVE_MIN = -1;
export const OCTAVE_MAX = 2;

function ModWheel({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const wanted = useWheelWanted(); // the sound map says: pushing this up would bring in the dark control being pointed at
  const set = (e: PointerEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)));
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Mod wheel"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        className={`relative h-24 w-11 touch-none overflow-hidden rounded-md border bg-(--kys-desk) lg:w-9 ${wanted ? 'kys-pulse border-dashed border-(--kys-text) outline-2 outline-offset-2 outline-(--kys-text) outline-dashed' : 'border-(--kys-line)'}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          set(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) set(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') onChange(Math.min(1, value + 0.05));
          if (e.key === 'ArrowDown') onChange(Math.max(0, value - 0.05));
        }}
      >
        <div
          className="absolute inset-x-0 bottom-0 bg-(--kys-accent)/25"
          style={{ height: `${value * 100}%` }}
        />
        <div
          className="absolute inset-x-1 h-3 -translate-y-1/2 rounded-sm bg-(--kys-muted) shadow"
          style={{ top: `${(1 - value) * 84 + 8}%` }}
        />
      </div>
      <span className={`kys-label ${wanted ? 'text-(--kys-text)' : 'text-(--kys-faint)'}`}>
        {wanted ? 'Push up' : 'Mod'}
      </span>
    </div>
  );
}

export interface KeyboardProps {
  octave: number;
  onOctave: (o: number) => void;
  wheel: number;
  onWheel: (v: number) => void;
  hold: boolean;
  onHold: (h: boolean) => void;
  noteOn: (n: number) => void;
  noteOff: (n: number) => void;
}

export function Keyboard({
  octave,
  onOctave,
  wheel,
  onWheel,
  hold,
  onHold,
  noteOn,
  noteOff,
}: KeyboardProps) {
  const active = useStore(notesStore);
  // One note per finger (or mouse), so a chord holds on a poly. A mono still gets last-note priority from the engine.
  const down = useRef(new Map<number, number>());
  const base = 36 + octave * 12;
  const whites: number[] = [];
  for (let o = 0; o < 3; o++) WHITE.forEach((s) => whites.push(base + o * 12 + s));
  whites.push(base + 36);

  /** Whether a pointer other than `id` is holding note `n`: then that note keeps sounding. */
  const heldByOther = (n: number, id: number) =>
    [...down.current].some(([p, held]) => p !== id && held === n);

  useEffect(() => {
    const held = down.current;
    const up = (e: globalThis.PointerEvent) => {
      const n = held.get(e.pointerId);
      if (n == null) return;
      held.delete(e.pointerId);
      if (![...held.values()].includes(n)) noteOff(n);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [noteOff]);

  const press = (id: number, n: number) => {
    const prev = down.current.get(id);
    if (prev === n) return;
    if (prev != null && !heldByOther(prev, id)) noteOff(prev);
    const sounding = heldByOther(n, id);
    down.current.set(id, n);
    if (!sounding) noteOn(n);
  };
  const keyProps = (n: number) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      // Touch captures the pointer to the first key; releasing it lets a finger slide onto the next one.
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
      press(e.pointerId, n);
    },
    onPointerEnter: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.buttons && down.current.has(e.pointerId)) press(e.pointerId, n);
    },
  });
  const qLabel = (n: number) => QWERTY_LABEL[n - (base + 12)];

  return (
    <div className="flex items-stretch gap-3">
      <ModWheel value={wheel} onChange={onWheel} />
      <div className="kys-scroll min-w-0 flex-1 overflow-x-auto rounded-md">
        <div className="relative flex h-28 min-w-[980px] touch-pan-x rounded-md border border-(--kys-line) bg-(--kys-desk) p-1 select-none lg:min-w-[620px] lg:touch-none">
          {whites.map((n, i) => {
            const on = active.includes(n);
            const sharp = HAS_SHARP[(n - base) % 12] && i < whites.length - 1 ? n + 1 : null;
            return (
              <div key={n} className="relative flex-1">
                <button
                  type="button"
                  aria-label={`Note ${n}`}
                  {...keyProps(n)}
                  className={`flex h-full w-full items-end justify-center rounded-b-[5px] border border-black/25 pb-1 font-mono text-[10px] ${on ? 'bg-(--kys-accent) text-(--kys-accent-ink)' : 'bg-[#f1efe9] text-black/40'}`}
                >
                  {(n - base) % 12 === 0 ? `C${Math.floor(n / 12) - 1}` : qLabel(n) || ''}
                </button>
                {sharp != null && (
                  <button
                    type="button"
                    aria-label={`Note ${sharp}`}
                    {...keyProps(sharp)}
                    className={`absolute top-0 right-0 z-10 flex h-[60%] w-[62%] translate-x-1/2 items-end justify-center rounded-b-[4px] border border-black pb-1 font-mono text-[9px] ${active.includes(sharp) ? 'bg-(--kys-accent) text-(--kys-accent-ink)' : 'bg-[#16171a] text-white/35'}`}
                  >
                    {qLabel(sharp) || ''}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex w-32 shrink-0 flex-col justify-between gap-1 lg:w-[74px]">
        <div className="flex items-center justify-between rounded-md border border-(--kys-line) bg-(--kys-surface)">
          <button
            type="button"
            className="h-11 w-11 text-(--kys-muted) hover:text-(--kys-text) lg:h-auto lg:w-auto lg:px-2 lg:py-1"
            aria-label="Octave down"
            onClick={() => onOctave(Math.max(OCTAVE_MIN, octave - 1))}
          >
            −
          </button>
          <span className="font-mono text-xs text-(--kys-muted)">
            {octave > 0 ? `+${octave}` : octave}
          </span>
          <button
            type="button"
            className="h-11 w-11 text-(--kys-muted) hover:text-(--kys-text) lg:h-auto lg:w-auto lg:px-2 lg:py-1"
            aria-label="Octave up"
            onClick={() => onOctave(Math.min(OCTAVE_MAX, octave + 1))}
          >
            +
          </button>
        </div>
        <span className="kys-label text-center text-(--kys-faint)">Octave</span>
        <button
          type="button"
          aria-pressed={hold}
          onClick={() => onHold(!hold)}
          className={`kys-label h-11 rounded-md border px-2 lg:h-auto lg:py-1.5 ${hold ? 'border-(--kys-accent) bg-(--kys-accent) text-(--kys-accent-ink)' : 'border-(--kys-line) bg-(--kys-surface) text-(--kys-muted) hover:text-(--kys-text)'}`}
        >
          Hold
        </button>
      </div>
    </div>
  );
}
