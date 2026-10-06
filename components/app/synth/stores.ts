'use client';

/**
 * The synth page's small external stores: what the pointer is on, what the
 * search and the lessons point at, the meters and the sound map.
 *
 * Transliterated from the prototype file `prototype/src/lib/store.js` (decision D3). The one
 * change: `useStore` passes the same snapshot getter as its server snapshot,
 * because Next renders client components on the server too and
 * `useSyncExternalStore` throws there without one.
 */

import { useSyncExternalStore } from 'react';
import type { ControlValue } from '@/lib/app/synths/contract';

/** A store: read it, replace it (or map it), and hear about changes. */
export interface Store<T> {
  get: () => T;
  set: (next: T | ((state: T) => T)) => void;
  subscribe: (f: () => void) => () => void;
}

/** Tiny external store so fast-changing things (meters, hover, held notes) never re-render the whole app. */
export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      const v = typeof next === 'function' ? (next as (state: T) => T)(state) : next;
      if (v === state) return;
      state = v;
      subs.forEach((f) => f());
    },
    subscribe: (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
  };
}

export function useStore<T>(store: Store<T>): T;
export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S;
export function useStore<T, S>(store: Store<T>, selector?: (state: T) => S): T | S {
  const read = () => (selector ? selector(store.get()) : store.get());
  return useSyncExternalStore(store.subscribe, read, read);
}

// ── What the stores hold ────────────────────────────────────────────────────

/** Engine meters, as the audio worklet reports them. */
export interface Meters {
  gate: boolean;
  lfo: number;
  overload: number;
  power: boolean;
  /** Bit per voice that is sounding. */
  voices?: number;
  /** Bit per oscillator that is sounding. */
  oscs?: number;
  env1?: number;
  /** The sequencer stage (0-based), −1 when stopped. */
  seq?: number;
  pulser?: number;
}

/** A control, jack or area the pointer, the keyboard or a press is on. */
export interface ItemFocus {
  kind: 'control' | 'jack' | 'area';
  id: string;
  /** Screen position for the tooltip. */
  x: number;
  y: number;
  /** Show the tooltip. */
  tip: boolean;
  /** Stays up until the next press anywhere (touch has no hover). */
  sticky?: boolean;
  /** Only a cable focus is ever `at` a jack; present so the two read alike. */
  at?: string;
}

/** A cable (or a pin, or a cable not yet made) that the tooltip and inspector explain. */
export interface CableFocus {
  kind: 'cable';
  /** `from>to`. */
  id: string;
  from: string;
  to: string;
  /** The jack the cable was just plugged into. */
  at?: string;
  x: number;
  y: number;
  tip: boolean;
  sticky?: boolean;
  /** Where a dragged plug would land, before it is dropped. */
  prospect?: boolean;
  /** A matrix pin. */
  pin?: boolean;
  /** A matrix hole with no pin in it. */
  empty?: boolean;
}

export type Focus = ItemFocus | CableFocus;

/** What the search (or the orientation tour) is pointing at. */
export type FindTarget =
  { kind: 'control' | 'jack' | 'area'; id: string } | { kind: 'areas'; ids: string[] };

/** A position in panel units. */
export interface PanelPoint {
  x: number;
  y: number;
}

/** A sound-map verdict on a control or cable. */
export type MapCellState = 'on' | 'zero' | 'dead';

/** A way in to a dark control: set this control to `v`, or (`id: '@wheel'`) move the mod wheel. */
export interface Door {
  id: string;
  v?: ControlValue;
}

export interface SoundMap {
  status: 'off' | 'working' | 'ready';
  progress: number;
  state: Record<string, MapCellState> | null;
  heat: Record<string, number> | null;
  ranked: string[];
  why: Record<string, Door[][]>;
  /** The sound the map was worked out for. */
  key?: string;
}

export const meterStore = createStore<Meters>({ gate: false, lfo: 0, overload: 0, power: false });
export const notesStore = createStore<number[]>([]); // midi notes currently sounding
export const focusStore = createStore<Focus | null>(null); // { kind: 'control' | 'jack', id, x, y, tip } or { kind: 'cable', id: 'from>to', from, to, at?, x, y, tip }
export const highlightStore = createStore<string[]>([]); // control / jack ids the lesson is pointing at
export const pendingStore = createStore<string | null>(null); // jack id of a cable the player has started but not yet plugged in
export const lensStore = createStore<PanelPoint | null>(null); // { x, y } in panel units while the magnifier is over the faceplate
export const findStore = createStore<FindTarget | null>(null); // { kind: 'control' | 'jack' | 'area', id } the search is pointing at
/**
 * The sound map (src/lib/soundmap.js): `state[id]` is 'on' | 'zero' | 'dead' for controls and 'from>to' cables, `heat[id]`
 * 0..1 for knobs and sliders. `why[id]` = the ways in to a dead control, once it has been pointed at and worked out:
 * [[door, …], …] with door = { id, v } or { id: '@wheel' }; [] = no one or two controls bring it in.
 */
export const MAP_OFF: SoundMap = {
  status: 'off',
  progress: 0,
  state: null,
  heat: null,
  ranked: [],
  why: {},
};
export const mapStore = createStore<SoundMap>(MAP_OFF);
