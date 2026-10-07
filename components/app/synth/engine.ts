'use client';

/**
 * The page's audio engine: one for the whole visit.
 *
 * The prototype made one `Engine` when the app loaded and kept it as the synth changed, so the sound stayed on.
 * Here each synth is its own page, so the engine lives in this module instead: going to another synth keeps the
 * audio running, and only one AudioContext is ever opened.
 *
 * The engine reports meters and notes to the stores, whichever page is showing. A mounted page adds its own
 * listener ({@link listen}) for what only it cares about.
 */

import { Engine } from '@/lib/app/synths/audio/engine';
import type { SynthEvent } from '@/lib/app/synths/audio/dsp-core';
import { meterStore, notesStore } from '@/components/app/synth/stores';

/** Meters and held notes into the stores, so fast-changing things never re-render the page. */
export function toStores(e: SynthEvent): void {
  if (e.type === 'meter')
    meterStore.set((m) => ({
      ...m,
      gate: e.gate,
      lfo: e.lfo,
      overload: e.overload,
      voices: e.voices || 0,
      env1: e.env1 || 0,
      seq: e.seq == null ? -1 : e.seq,
      pulser: e.pulser || 0,
    }));
  else if (e.type === 'note')
    notesStore.set((ns) =>
      e.on ? (ns.includes(e.n) ? ns : [...ns, e.n]) : ns.filter((n) => n !== e.n)
    );
  else if (e.type === 'allOff') notesStore.set([]);
}

let engine: Engine | null = null;
let listener: ((e: SynthEvent) => void) | null = null;

/** The engine, made on first use. Browser only: it is never called while rendering on the server. */
export function getEngine(): Engine {
  if (!engine)
    engine = new Engine((e) => {
      toStores(e);
      listener?.(e);
    });
  return engine;
}

/** Hear the engine's events as well as the stores. Returns the undo; a newer listener replaces an older one. */
export function listen(f: (e: SynthEvent) => void): () => void {
  listener = f;
  return () => {
    if (listener === f) listener = null;
  };
}
