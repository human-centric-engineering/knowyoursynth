'use client';

/**
 * An encoder (`f-step-sequencer` t-80): the sequencer's knob, as a hardware sequencer sets a step's values. A ring
 * lit to the value, the value itself in the middle, and its name under it.
 *
 * A slider to assistive technology and the keyboard: arrows move it a step, Page Up and Page Down a big step, Home and
 * End to either end. A drag up or down turns it, with a mouse or a finger. Its help is the player's tooltip, on hover
 * and on focus.
 */

import { useRef } from 'react';
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
}: EncoderProps) {
  const drag = useRef<{ y: number; from: number } | null>(null);
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
    // Up is more: a step every few pixels, or the whole range in 400px where that is quicker (a tempo).
    const per = Math.max(step / DRAG_PX, (max - min) / 400);
    set(d.from + (d.y - e.clientY) * per);
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const share = max > min ? (value - min) / (max - min) : 0;
  const ring: CSSProperties & Record<'--enc', string> = { '--enc': `${share * 270}deg` };
  const text = format(value);
  return (
    <div className="kys-enc" data-unset={unset || undefined} data-compact={compact || undefined}>
      <PlayerTip name={label} help={help}>
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={unset ? `${text} (default)` : text}
          className="kys-enc-knob"
          style={ring}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="kys-enc-value">{text}</span>
        </div>
      </PlayerTip>
      <span className="kys-enc-label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
