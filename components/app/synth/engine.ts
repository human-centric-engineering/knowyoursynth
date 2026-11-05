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
      env2: e.env2 || 0,
      env1Stage: e.env1Stage,
      env2Stage: e.env2Stage,
      lfoHz: e.lfoHz || 0,
      oscV: e.oscV,
      oscHz: e.oscHz,
      oscLv: e.oscLv,
      seq: e.seq == null ? -1 : e.seq,
      pulser: e.pulser || 0,
      eyes: e.eyes,
      moog: e.moog,
      cutoff: e.cutoff,
      amp: e.amp,
    }));
  else if (e.type === 'note')
    notesStore.set((ns) =>
      e.on ? (ns.includes(e.n) ? ns : [...ns, e.n]) : ns.filter((n) => n !== e.n)
    );
  else if (e.type === 'allOff') notesStore.set([]);
}

let engine: Engine | null = null;
let listener: ((e: SynthEvent) => void) | null = null;

/**
 * The events a browser counts as a gesture that may start sound. On a touch screen that is the finger lifting, not
 * landing: iOS refuses a resume() from a tap's pointerdown, so the key's own start can fail and the lift recovers it.
 */
export const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;

/** The engine, made on first use. Browser only: it is never called while rendering on the server. */
export function getEngine(): Engine {
  if (!engine) {
    const made = new Engine((e) => {
      toStores(e);
      listener?.(e);
    });
    engine = made;
    // On any gesture, before the page's own handlers: a context iOS interrupted (a call, a backgrounded tab) runs again.
    GESTURES.forEach((type) =>
      document.addEventListener(type, () => made.unlock(), { capture: true, passive: true })
    );
  }
  return engine;
}

/** Hear the engine's events as well as the stores. Returns the undo; a newer listener replaces an older one. */
export function listen(f: (e: SynthEvent) => void): () => void {
  listener = f;
  return () => {
    if (listener === f) listener = null;
  };
}
