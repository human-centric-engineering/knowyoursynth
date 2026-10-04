import { useState } from 'react';
import { FX_DEFAULT } from '@/audio/fx.js';

const loadOpen = () => { try { return localStorage.getItem('kys.fxOpen') === 'true'; } catch { return false; } };
const saveOpen = (v) => { try { localStorage.setItem('kys.fxOpen', String(v)); } catch { /* storage unavailable */ } };

const UNITS = [
  {
    id: 'drive', name: 'Drive', help: 'Pushes the signal into clipping, like a distortion pedal. Adds grit and extra harmonics.',
    knobs: [['amount', 'Amount', (v) => `${Math.round(v * 100)}%`], ['tone', 'Tone', (v) => `${Math.round(700 * Math.pow(20, v) / 100) / 10} kHz`]],
  },
  {
    id: 'chorus', name: 'Chorus', help: 'Blends in slightly delayed, wobbling copies left and right. Makes one oscillator sound wider and thicker.',
    knobs: [['rate', 'Rate', (v) => `${(0.1 * Math.pow(60, v)).toFixed(1)} Hz`], ['depth', 'Depth', (v) => `${Math.round(v * 100)}%`]],
  },
  {
    id: 'delay', name: 'Delay', help: 'Repeats what you play. Feedback sets how many echoes you hear; each one is a little darker.',
    knobs: [['time', 'Time', (v) => `${Math.round((0.05 + v * 0.95) * 1000)} ms`], ['feedback', 'Feedback', (v) => `${Math.round(v * 100)}%`], ['mix', 'Mix', (v) => `${Math.round(v * 100)}%`]],
  },
  {
    id: 'reverb', name: 'Reverb', help: 'Puts the synth in a room. Size sets how long the tail rings on.',
    knobs: [['size', 'Size', (v) => `${(0.6 + v * 4.4).toFixed(1)} s`], ['mix', 'Mix', (v) => `${Math.round(v * 100)}%`]],
  },
];

function Slider({ label, value, format, disabled, onChange }) {
  return (
    <label className={`flex flex-col gap-0.5 ${disabled ? 'opacity-55' : ''}`}>
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="kys-label text-[11px] text-muted">{label}</span>
        <span className="font-mono text-muted">{format(value)}</span>
      </span>
      <input type="range" min={0} max={1} step={0.01} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(null)}
        className="w-full cursor-pointer" style={{ accentColor: 'var(--accent)' }} />
    </label>
  );
}

/** Outboard effects between the synth and the speakers: a master switch, then one card per effect. The cards fold away independently of the switch. */
export function FxRack({ fx, onChange }) {
  const [open, setOpenState] = useState(loadOpen);
  const setOpen = (v) => { setOpenState(v); saveOpen(v); };
  const setUnit = (id, patch) => onChange({ ...fx, [id]: { ...fx[id], ...patch } });
  const active = UNITS.filter((u) => fx[u.id].on).map((u) => u.name);
  return (
    <section aria-labelledby="fx-h" className="mt-4 rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="fx-h" className="kys-label">
            <button type="button" aria-expanded={open} aria-controls="fx-units" onClick={() => setOpen(!open)} className="flex items-baseline gap-2 text-left uppercase text-muted hover:text-text">
              <span aria-hidden="true" className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
              Effects rack
              {!open && <span className="font-sans text-xs normal-case tracking-normal text-faint">{fx.on ? (active.length ? active.join(' · ') : 'no effects switched on') : 'off'}</span>}
            </button>
          </h2>
          {open && <p className="text-xs text-faint">Pedals after the synth. Your hardware does not have these, so the panel settings still copy across as they are.</p>}
        </div>
        <button type="button" aria-pressed={fx.on} onClick={() => { if (!fx.on) setOpen(true); onChange({ ...fx, on: !fx.on }); }}
          className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-semibold ${fx.on ? 'border-accent bg-accent text-accent-ink' : 'border-line text-muted hover:text-text'}`}>
          <span className={`h-2 w-2 rounded-full ${fx.on ? 'bg-accent-ink' : 'bg-faint'}`} />
          {fx.on ? 'Effects on' : 'Effects off'}
        </button>
      </div>
      {open && (
        <div id="fx-units" className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {UNITS.map((u) => {
            const s = fx[u.id];
            const live = fx.on && s.on;
            return (
              <div key={u.id} className={`rounded-lg border p-3 ${live ? 'border-accent/60 bg-raised' : 'border-line bg-ground'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[13px]">{u.name}</span>
                  <button type="button" aria-pressed={s.on} aria-label={`${u.name} effect`} onClick={() => setUnit(u.id, { on: !s.on })}
                    className={`kys-label rounded px-2 py-0.5 text-[11px] ${s.on ? 'bg-accent text-accent-ink' : 'border border-line text-muted hover:text-text'}`}>{s.on ? 'On' : 'Off'}</button>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted">{u.help}</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {u.knobs.map(([k, label, format]) => (
                    <Slider key={k} label={label} value={s[k]} format={format} disabled={!s.on}
                      onChange={(v) => setUnit(u.id, { [k]: v == null ? FX_DEFAULT[u.id][k] : v })} />
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
