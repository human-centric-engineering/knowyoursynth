'use client';

/**
 * Outboard effects between the synth and the speakers: a master switch, then one card per effect. The cards fold
 * away independently of the switch.
 *
 * Transliterated from the prototype file `prototype/src/ui/FxRack.jsx` (decision D3). Whether the rack is unfolded
 * is kept in browser storage, read after mount so the server and the first client render agree.
 */

import { useId } from 'react';
import { z } from 'zod';
import { FX_DEFAULT } from '@/lib/app/synths/audio/fx';
import type { RackFx } from '@/lib/app/synths/audio/fx';
import { STORAGE_KEYS, useStoredPref } from '@/components/app/synth/storage';

type Unit = 'drive' | 'chorus' | 'delay' | 'reverb';
type Format = (v: number) => string;

interface UnitInfo {
  id: Unit;
  name: string;
  help: string;
  knobs: [key: string, label: string, format: Format][];
}

const pct: Format = (v) => `${Math.round(v * 100)}%`;

const UNITS: UnitInfo[] = [
  {
    id: 'drive',
    name: 'Drive',
    help: 'Pushes the signal into clipping, like a distortion pedal. Adds grit and extra harmonics.',
    knobs: [
      ['amount', 'Amount', pct],
      ['tone', 'Tone', (v) => `${Math.round((700 * Math.pow(20, v)) / 100) / 10} kHz`],
    ],
  },
  {
    id: 'chorus',
    name: 'Chorus',
    help: 'Blends in slightly delayed, wobbling copies left and right. Makes one oscillator sound wider and thicker.',
    knobs: [
      ['rate', 'Rate', (v) => `${(0.1 * Math.pow(60, v)).toFixed(1)} Hz`],
      ['depth', 'Depth', pct],
    ],
  },
  {
    id: 'delay',
    name: 'Delay',
    help: 'Repeats what you play. Feedback sets how many echoes you hear; each one is a little darker.',
    knobs: [
      ['time', 'Time', (v) => `${Math.round((0.05 + v * 0.95) * 1000)} ms`],
      ['feedback', 'Feedback', pct],
      ['mix', 'Mix', pct],
    ],
  },
  {
    id: 'reverb',
    name: 'Reverb',
    help: 'Puts the synth in a room. Size sets how long the tail rings on.',
    knobs: [
      ['size', 'Size', (v) => `${(0.6 + v * 4.4).toFixed(1)} s`],
      ['mix', 'Mix', pct],
    ],
  },
];

/** A unit's knob value: every knob in {@link UNITS} is a number in its unit's settings. */
function knobValue(fx: RackFx, unit: Unit, key: string): number {
  const setting: Record<string, number | boolean> = fx[unit];
  const v = setting[key];
  return typeof v === 'number' ? v : 0;
}
function knobDefault(unit: Unit, key: string): number {
  return knobValue(FX_DEFAULT, unit, key);
}

function Slider({
  label,
  value,
  format,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  format: Format;
  disabled: boolean;
  onChange: (v: number | null) => void;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-0.5 ${disabled ? 'opacity-55' : ''}`}>
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <label htmlFor={id} className="kys-label text-[11px] text-(--kys-muted)">
          {label}
        </label>
        <span className="font-mono text-(--kys-muted)">{format(value)}</span>
      </span>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(null)}
        className="w-full cursor-pointer"
        style={{ accentColor: 'var(--kys-accent)' }}
      />
    </div>
  );
}

const OpenSchema = z.boolean();

export function FxRack({ fx, onChange }: { fx: RackFx; onChange: (fx: RackFx) => void }) {
  const [open, setOpen] = useStoredPref(STORAGE_KEYS.fxOpen, OpenSchema, false);
  const setUnit = (id: Unit, patch: Record<string, number | boolean>) =>
    onChange({ ...fx, [id]: { ...fx[id], ...patch } });
  const active = UNITS.filter((u) => fx[u.id].on).map((u) => u.name);
  return (
    <section
      aria-labelledby="fx-h"
      className="mt-4 rounded-xl border border-(--kys-line) bg-(--kys-surface) p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="fx-h" className="kys-label">
            <button
              type="button"
              aria-expanded={open}
              aria-controls="fx-units"
              onClick={() => setOpen(!open)}
              className="flex items-baseline gap-2 text-left text-(--kys-muted) uppercase hover:text-(--kys-text)"
            >
              <span
                aria-hidden="true"
                className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}
              >
                ▸
              </span>
              Effects rack
              {!open && (
                <span className="text-xs tracking-normal text-(--kys-faint) normal-case">
                  {fx.on ? (active.length ? active.join(' · ') : 'no effects switched on') : 'off'}
                </span>
              )}
            </button>
          </h2>
          {open && (
            <p className="text-xs text-(--kys-faint)">
              Pedals after the synth. Your hardware does not have these, so the panel settings still
              copy across as they are.
            </p>
          )}
        </div>
        <button
          type="button"
          aria-pressed={fx.on}
          onClick={() => {
            if (!fx.on) setOpen(true);
            onChange({ ...fx, on: !fx.on });
          }}
          className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-semibold ${fx.on ? 'border-(--kys-accent) bg-(--kys-accent) text-(--kys-accent-ink)' : 'border-(--kys-line) text-(--kys-muted) hover:text-(--kys-text)'}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${fx.on ? 'bg-(--kys-accent-ink)' : 'bg-(--kys-faint)'}`}
          />
          {fx.on ? 'Effects on' : 'Effects off'}
        </button>
      </div>
      {open && (
        <div id="fx-units" className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {UNITS.map((u) => {
            const s = fx[u.id];
            const live = fx.on && s.on;
            return (
              <div
                key={u.id}
                className={`rounded-lg border p-3 ${live ? 'border-(--kys-accent)/60 bg-(--kys-raised)' : 'border-(--kys-line) bg-(--kys-ground)'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="kys-display text-[13px]">{u.name}</span>
                  <button
                    type="button"
                    aria-pressed={s.on}
                    aria-label={`${u.name} effect`}
                    onClick={() => setUnit(u.id, { on: !s.on })}
                    className={`kys-label rounded px-2 py-0.5 text-[11px] ${s.on ? 'bg-(--kys-accent) text-(--kys-accent-ink)' : 'border border-(--kys-line) text-(--kys-muted) hover:text-(--kys-text)'}`}
                  >
                    {s.on ? 'On' : 'Off'}
                  </button>
                </div>
                <p className="mt-1 text-xs leading-snug text-(--kys-muted)">{u.help}</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {u.knobs.map(([k, label, format]) => (
                    <Slider
                      key={k}
                      label={label}
                      value={knobValue(fx, u.id, k)}
                      format={format}
                      disabled={!s.on}
                      onChange={(v) => setUnit(u.id, { [k]: v ?? knobDefault(u.id, k) })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
