'use client';

/**
 * The orientation tour: a card docked to the bottom of the window that walks through the panel while the panel itself
 * stays visible above it and lights up section by section.
 *
 * It only ever points: no stop changes a control, a cable or the loaded sound, so a player can take the tour in the
 * middle of building something and come back to exactly what they left.
 *
 * Transliterated from the prototype file `src/ui/Tour.jsx` (decision D3). The stops come from `buildTour()`, which is
 * handed the catalogue's "Unusual on…" notes (D13) rather than reading them off the definition.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildTour } from '@/lib/app/synths/lib/tour';
import type { TourNote, TourStop } from '@/lib/app/synths/lib/tour';
import { jackName } from '@/lib/app/synths/lib/explain';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { displayName } from '@/lib/app/synths/lib/patch';
import type { Control, Jack, SynthDef, UnusualNotes } from '@/lib/app/synths/contract';
import { findStore, focusStore, highlightStore } from '@/components/app/synth/stores';

/** Show the whole thing on the panel and open its text in the inspector: the same pair the search uses. */
const reveal = (kind: 'control' | 'jack' | 'area', id: string) => {
  findStore.set({ kind, id });
  focusStore.set({ kind, id, x: 0, y: 0, tip: false });
};

/** A note's names, with a long row of them cut short (an envelope's four stages read as "A, D, S and 1 more"). */
function Names({ names }: { names: string[] }) {
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  return (
    <>
      {shown.join(', ')}
      {rest > 0 ? ` and ${rest} more` : ''}
    </>
  );
}

function Notes({ notes }: { notes: TourNote[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {notes.map((n) => (
        <li key={n.key} className="rounded-lg border border-(--kys-line) bg-(--kys-ground) p-3">
          <button
            type="button"
            onPointerEnter={() => highlightStore.set(n.ids)}
            onPointerLeave={() => highlightStore.set([])}
            onClick={() => reveal(n.kind, n.id)}
            title={`Find ${n.names[0]} on the panel`}
            className="kys-label text-left text-(--kys-accent) underline-offset-2 hover:underline"
          >
            <Names names={n.names} />
          </button>
          <p className="mt-1 text-[14px] leading-relaxed">{n.text}</p>
        </li>
      ))}
    </ul>
  );
}

function Chips({ def, controls, jacks }: { def: SynthDef; controls: Control[]; jacks: Jack[] }) {
  if (!controls.length && !jacks.length) return null;
  return (
    <div className="mt-3">
      <p className="kys-label text-(--kys-muted)">
        What is in here · click one to find it on the panel
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {controls.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onPointerEnter={() => highlightStore.set([c.id])}
              onPointerLeave={() => highlightStore.set([])}
              onClick={() => reveal('control', c.id)}
              className="rounded-md border border-(--kys-line) px-2 py-1 text-[13px] text-(--kys-muted) hover:border-(--kys-muted) hover:text-(--kys-text)"
            >
              {displayName(def, c)}
            </button>
          </li>
        ))}
        {jacks.map((j) => (
          <li key={j.id}>
            <button
              type="button"
              onPointerEnter={() => highlightStore.set([j.id])}
              onPointerLeave={() => highlightStore.set([])}
              onClick={() => reveal('jack', j.id)}
              className="rounded-md border border-dashed border-(--kys-line) px-2 py-1 font-mono text-xs text-(--kys-muted) hover:border-(--kys-muted) hover:text-(--kys-text)"
            >
              {jackName(j)} {j.dir}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StopBody({ def, stop }: { def: SynthDef; stop: TourStop }) {
  if (stop.kind === 'intro') {
    const { controls, jacks, sections } = stop.counts;
    return (
      <>
        <p className="text-[14.5px] leading-relaxed">{stop.body}</p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-(--kys-muted)">
          {controls} knobs and switches, {jacks} socket{jacks === 1 ? '' : 's'} and {sections} named
          sections. The tour lights them up a few at a time, in the order the sound travels through
          them. It never moves a control, so whatever you have loaded is safe.
        </p>
        <div
          className="mt-3 flex flex-wrap items-center gap-1.5"
          aria-label="The parts of this synth, in the order the tour visits them"
        >
          {stop.chain.map((m, i) => (
            <span key={m} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-(--kys-faint)">→</span>}
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                style={{ borderColor: moduleOf(m).color, color: moduleOf(m).color }}
              >
                {moduleOf(m).label}
              </span>
            </span>
          ))}
        </div>
      </>
    );
  }

  if (stop.kind === 'naming') {
    return (
      <>
        <p className="text-[14.5px] leading-relaxed">{stop.lead}</p>
        <Notes notes={stop.notes} />
      </>
    );
  }

  // The prototype's outro also points at "Dim unused parts" and "Show sensitive controls". Those are the sound map's
  // switches, so their lines come back with it (t-15) rather than pointing at nothing (`B31`).
  if (stop.kind === 'outro') {
    return (
      <>
        <p className="text-[14.5px] leading-relaxed">{stop.lead}</p>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[14.5px] leading-relaxed text-(--kys-muted)">
          <li>
            <span className="text-(--kys-text)">Explain sections</span> puts this same tour on the
            panel itself: point at any coloured region to read what it does.
          </li>
          <li>
            The search box finds a control by what it does, so{' '}
            <span className="text-(--kys-text)">resonance</span> finds it whatever this panel calls
            it.
          </li>
          <li>
            Pick a sound on the left and open <span className="text-(--kys-text)">Build it</span> to
            put the panel together one module at a time.
          </li>
        </ul>
      </>
    );
  }

  // A section of the panel: what each of its areas is for, then anything about it that is done differently here.
  return (
    <>
      {stop.areas.map((a) => (
        <div key={a.id} className="mt-3 first:mt-0">
          {stop.areas.length > 1 && (
            <button
              type="button"
              onClick={() => reveal('area', a.id)}
              title="Light up only this section"
              className="kys-label text-left underline-offset-2 hover:underline"
              style={{ color: stop.color }}
            >
              {a.label}
            </button>
          )}
          <p className="mt-0.5 text-[14.5px] leading-relaxed">{a.help}</p>
          {a.unusual && (
            <p className="mt-1.5 border-l-2 border-(--kys-line) pl-2.5 text-[14px] leading-relaxed text-(--kys-muted)">
              <span className="kys-label text-(--kys-accent)">Unusual here · </span>
              {a.unusual}
            </p>
          )}
        </div>
      ))}
      {stop.extra.length > 0 && <Notes notes={stop.extra} />}
      <Chips def={def} controls={stop.controls} jacks={stop.jacks} />
    </>
  );
}

export interface TourProps {
  /** The panel as drawn. */
  def: SynthDef;
  /** The catalogue's "Unusual on…" notes: id → text. */
  notes: UnusualNotes;
  onClose: () => void;
}

export function Tour({ def, notes, onClose }: TourProps) {
  const stops = useMemo(() => buildTour(def, notes), [def, notes]);
  const [i, setI] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stop = stops[Math.min(i, stops.length - 1)];
  const mod = moduleOf(stop.module);

  // Light up what this stop is about. A stop with no place on the panel (the opening and closing ones) clears the
  // spotlight instead, so the whole faceplate is visible while it is read.
  useEffect(() => {
    // The naming stop has no one place on the panel, so it rings every control it talks about instead.
    highlightStore.set(stop.kind === 'naming' ? stop.notes.flatMap((n) => n.ids) : []);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    if (stop.kind !== 'module') {
      findStore.set(null);
      return undefined;
    }
    const lit = { kind: 'areas' as const, ids: stop.areaIds };
    findStore.set(lit);
    // Pressing the faceplate clears the spotlight, which is how the search result gets out of the way once you start
    // playing with what it found. While a tour stop is up the spotlight belongs to the tour, so put it back: it is
    // drawn with pointer events off, so it never stops a knob underneath it being turned.
    return findStore.subscribe(() => {
      if (findStore.get() === null) findStore.set(lit);
    });
  }, [stop]);
  useEffect(
    () => () => {
      findStore.set(null);
      highlightStore.set([]);
    },
    []
  );

  // Arrow keys move between stops; Escape leaves. The note keys (A W S E D…) are untouched, so the synth can still be
  // played while the tour is open. A key something else already handled (the lesson's tabs), or one meant for a modal
  // dialog over the page (Escape closing the lineage), is not the tour's.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.defaultPrevented || (t instanceof Element && t.closest('dialog'))) return;
      if (
        t instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)
      )
        return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((k) => Math.min(stops.length - 1, k + 1));
      else if (e.key === 'ArrowLeft') setI((k) => Math.max(0, k - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stops.length, onClose]);

  const last = i === stops.length - 1;
  const primary =
    'rounded-md bg-(--kys-accent) px-3 py-1.5 text-sm font-semibold text-(--kys-accent-ink)';
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <section
        role="dialog"
        aria-label={`Orientation tour of the ${def.name}`}
        className="kys-fade pointer-events-auto w-full max-w-[840px] rounded-2xl border border-(--kys-line) bg-(--kys-raised) shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-(--kys-line) px-4 py-2.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: mod.color }} />
          <h2 className="kys-label min-w-0 truncate">{stop.title}</h2>
          <span className="kys-label ml-auto shrink-0 text-(--kys-faint)">
            {i + 1} / {stops.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="End the tour"
            className="-mr-1 shrink-0 px-2 text-lg leading-none text-(--kys-muted) hover:text-(--kys-text)"
          >
            ×
          </button>
        </header>

        <div
          ref={bodyRef}
          aria-live="polite"
          className="kys-scroll max-h-[38vh] overflow-y-auto px-4 py-3"
        >
          {stop.kind === 'intro' && <p className="mb-1.5 text-(--kys-muted)">{stop.lead}</p>}
          <StopBody def={def} stop={stop} />
        </div>

        <nav
          aria-label="Tour stops"
          className="flex items-center gap-2 border-t border-(--kys-line) px-4 py-2.5"
        >
          <button
            type="button"
            onClick={() => setI(i - 1)}
            disabled={i === 0}
            className="rounded-md border border-(--kys-line) px-3 py-1.5 text-sm text-(--kys-muted) enabled:hover:text-(--kys-text) disabled:opacity-40"
          >
            Back
          </button>
          <ol className="kys-scroll flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto">
            {stops.map((s, k) => (
              <li key={k} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setI(k)}
                  aria-current={k === i ? 'step' : undefined}
                  title={s.title}
                  aria-label={`Stop ${k + 1}: ${s.title}`}
                  className={`h-2.5 rounded-full transition-all ${k === i ? 'w-6' : 'w-2.5 opacity-45 hover:opacity-90'}`}
                  style={{ background: moduleOf(s.module).color }}
                />
              </li>
            ))}
          </ol>
          {last ? (
            <button type="button" onClick={onClose} className={primary}>
              Finish
            </button>
          ) : (
            <button type="button" onClick={() => setI(i + 1)} className={primary}>
              Next
            </button>
          )}
        </nav>
      </section>
    </div>
  );
}
