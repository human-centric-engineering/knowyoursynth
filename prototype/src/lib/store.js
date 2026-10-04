import { useSyncExternalStore } from 'react';

/** Tiny external store so fast-changing things (meters, hover, held notes) never re-render the whole app. */
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set: (next) => {
      const v = typeof next === 'function' ? next(state) : next;
      if (v === state) return;
      state = v;
      subs.forEach((f) => f());
    },
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
  };
}

export function useStore(store, selector = (s) => s) {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

export const meterStore = createStore({ gate: false, lfo: 0, overload: 0, power: false });
export const notesStore = createStore([]); // midi notes currently sounding
export const focusStore = createStore(null); // { kind: 'control' | 'jack', id, x, y, tip } or { kind: 'cable', id: 'from>to', from, to, at?, x, y, tip }
export const highlightStore = createStore([]); // control / jack ids the lesson is pointing at
export const pendingStore = createStore(null); // jack id of a cable the player has started but not yet plugged in
export const lensStore = createStore(null); // { x, y } in panel units while the magnifier is over the faceplate
export const findStore = createStore(null); // { kind: 'control' | 'jack' | 'area', id } the search is pointing at
/**
 * The sound map (src/lib/soundmap.js): `state[id]` is 'on' | 'zero' | 'dead' for controls and 'from>to' cables, `heat[id]`
 * 0..1 for knobs and sliders. `why[id]` = the ways in to a dead control, once it has been pointed at and worked out:
 * [[door, …], …] with door = { id, v } or { id: '@wheel' }; [] = no one or two controls bring it in.
 */
export const MAP_OFF = { status: 'off', progress: 0, state: null, heat: null, ranked: [], why: {} };
export const mapStore = createStore(MAP_OFF);
