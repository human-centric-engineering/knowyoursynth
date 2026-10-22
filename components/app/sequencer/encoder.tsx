'use client';

/**
 * An encoder (`f-step-sequencer` t-80): one cell of the sequencer's readout, as a hardware sequencer shows a value on
 * its display and sets it with the knob beside it. Its name, the value in the display's amber, and a meter along its
 * foot showing where the value sits in its range.
 *
 * A slider to assistive technology and the keyboard: arrows move it a step, Page Up and Page Down a big step, Home and
 * End to either end. A drag up or down turns it, with a mouse or a finger. A double press, Enter, or a digit typed
 * makes it a text box for a value typed in ("70", "C#3"): Enter sets it, Escape leaves it. Its help is the player's
 * tooltip, on hover and on focus.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { PlayerTip } from '@/components/app/synth/player-tip';

/** Pixels of drag per step. */
const DRAG_PX = 6;

export interface EncoderProps {
  /** Its name, under it and as its accessible name. */
  label: string;
  value: number;
  min: number;
  max: number;
  /** One arrow press. */
  step?: number;
  /** One Page Up or Page Down. */
  big?: number;
  /** The value as it is read: "C♯3", "50%", "1/2 step". */
  format?: (v: number) => string;
  onChange: (v: number) => void;
  /** What it does, in its tooltip. */
  help: string;
  /** Shown dimmed: the value is a default, not set on this step. */
  unset?: boolean;
  /** Smaller, with its name beside it rather than under it: for a tool row. */
  compact?: boolean;
  /** Reads a typed value ("70%", "C#3"), or `null` for text that is not one. A number in the text by default. */
  parse?: (text: string) => number | null;
}

/** The first number in typed text: "70%" is 70, "×3" is 3, "-12" is -12. */
export function parseNumber(text: string): number | null {
  const m = /-?\d+(?:\.\d+)?|-?\.\d+/.exec(text.replace(',', '.'));
  return m ? Number(m[0]) : null;
}

/** `v` on the step grid from `min`, inside the range, with the float noise of the steps taken out. */
export function snap(v: number, min: number, max: number, step: number): number {
  const on = min + Math.round((v - min) / step) * step;
  return Math.min(max, Math.max(min, Number(on.toFixed(6))));
}

export function Encoder({
  label,
  value,
  min,
  max,
  step = 1,
  big,
  format = String,
  onChange,
  help,
  unset = false,
  compact = false,
  parse = parseNumber,
}: EncoderProps) {
  const drag = useRef<{ y: number; from: number } | null>(null);
  // Typing a value: the cell is a text box until Enter (or leaving it) sets it, or Escape leaves it as it was.
  const [typing, setTyping] = useState<string | null>(null);
  const knob = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLInputElement | null>(null);
  const wasTyping = useRef(false);
  useEffect(() => {
    if (typing !== null) {
      if (!wasTyping.current) box.current?.select();
      wasTyping.current = true;
    } else if (wasTyping.current) {
      wasTyping.current = false;
      knob.current?.focus();
    }
  }, [typing]);
  const commit = (text: string) => {
    const v = parse(text);
    if (v !== null && Number.isFinite(v)) set(v);
    setTyping(null);
  };
  const bigStep = big ?? step * 10;
  const set = (v: number) => {
    const next = snap(v, min, max, step);
    if (next !== value) onChange(next);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const by: Record<string, number> = {
      ArrowUp: step,
      ArrowRight: step,
      ArrowDown: -step,
      ArrowLeft: -step,
      PageUp: bigStep,
      PageDown: -bigStep,
    };
    if (e.key in by) set(value + by[e.key]);
    else if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
    else if (e.key === 'Enter') setTyping(format(value));
    // A digit, a minus or a point starts typing a value with it. Letters stay the page's: they play notes.
    else if (/^[\d.-]$/.test(e.key)) setTyping(e.key);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // The main button or a finger: a right-click opens the context menu, which can swallow the let-go.
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus();
    drag.current = { y: e.clientY, from: value };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // Up is more: a step every few pixels, or the whole range in 400px where that is quicker (a tempo), but never more
    // than half a step a pixel, so a long range with a fine step (a gate) can still be set by hand.
    const per = Math.max(step / DRAG_PX, Math.min((max - min) / 400, step / 2));
    set(d.from + (d.y - e.clientY) * per);
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const share = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const meter: CSSProperties & Record<'--enc', string> = { '--enc': `${Math.round(share * 100)}%` };
  const text = format(value);
  if (typing !== null)
    return (
      <div className="kys-cell" data-compact={compact || undefined}>
        <div className="kys-cell-hit is-typing">
          <span className="kys-cell-label" aria-hidden="true">
            {label}
          </span>
          <input
            ref={box}
            className="kys-cell-type"
            aria-label={`${label}: type a value`}
            value={typing}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setTyping(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(typing);
              else if (e.key === 'Escape') setTyping(null);
              else return;
              e.preventDefault();
              e.stopPropagation();
            }}
            onBlur={() => commit(typing)}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the cell becomes this box at the user's own press
            autoFocus
          />
        </div>
      </div>
    );
  return (
    <div className="kys-cell" data-unset={unset || undefined} data-compact={compact || undefined}>
      <PlayerTip name={label} help={help}>
        <div
          ref={knob}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={unset ? `${text} (default)` : text}
          className="kys-cell-hit"
          style={meter}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => setTyping(format(value))}
        >
          <span className="kys-cell-label" aria-hidden="true">
            {label}
          </span>
          <span className="kys-cell-value">{text}</span>
          <span className="kys-cell-meter" aria-hidden="true" />
        </div>
      </PlayerTip>
    </div>
  );
}
