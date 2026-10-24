/**
 * The panel's undo history: the last `HISTORY_MAX` states of its controls and cables before a change, and the ones
 * undone since, for redo. A gesture is one change: moves that come within `HISTORY_GROUP_MS` of the one before (a knob
 * turned, a slider dragged) keep the state from before the first. Pure, so the page's hook is only the wiring.
 */

import { lanePos, laneValueAt } from '@/lib/app/sequencer/lanes';
import { controlMap } from '@/lib/app/synths/lib/patch';
import type { ControlValues, PatchCable, SynthDef } from '@/lib/app/synths/contract';

/** How many changes back Undo goes. */
export const HISTORY_MAX = 20;
/** How close together moves are one change, in ms: a knob turned, not each step of it. */
export const HISTORY_GROUP_MS = 600;

/** What Undo puts back: the panel's controls and cables. */
export interface PanelSnap {
  values: ControlValues;
  cables: PatchCable[];
}

export interface PanelHistory {
  past: PanelSnap[];
  future: PanelSnap[];
  /** When the panel last changed, for grouping (ms); `null` before any change. */
  at: number | null;
}

export const emptyHistory = (): PanelHistory => ({ past: [], future: [], at: null });

/**
 * The history after the panel changed from `before` at time `now`: `before` kept as a step back (unless the change is
 * part of the gesture the last one began), the oldest dropped past `HISTORY_MAX`, and redo gone, as a new change
 * leaves the undone ones behind.
 */
export function recordChange(h: PanelHistory, before: PanelSnap, now: number): PanelHistory {
  const grouped = h.at !== null && now - h.at < HISTORY_GROUP_MS && h.past.length > 0;
  const past = grouped ? h.past : [...h.past, before].slice(-HISTORY_MAX);
  return { past, future: [], at: now };
}

/** One step back from `current`: the state to put on the panel, and the history after; `null` with none to go to. */
export function undo(
  h: PanelHistory,
  current: PanelSnap
): { to: PanelSnap; history: PanelHistory } | null {
  const to = h.past.at(-1);
  if (!to) return null;
  return {
    to,
    history: { past: h.past.slice(0, -1), future: [...h.future, current], at: null },
  };
}

/** One step forward again from `current`, after an undo; `null` with none undone. */
export function redo(
  h: PanelHistory,
  current: PanelSnap
): { to: PanelSnap; history: PanelHistory } | null {
  const to = h.future.at(-1);
  if (!to) return null;
  return {
    to,
    history: {
      past: [...h.past, current].slice(-HISTORY_MAX),
      future: h.future.slice(0, -1),
      at: null,
    },
  };
}

/** What an undo or redo changes: the controls it moves, and the jacks of the cables it plugs in or pulls out. */
export function panelChanges(
  from: PanelSnap,
  to: PanelSnap
): { controls: string[]; jacks: string[] } {
  const ids = new Set([...Object.keys(from.values), ...Object.keys(to.values)]);
  const controls = [...ids].filter((id) => from.values[id] !== to.values[id]);
  const key = (c: PatchCable) => `${c.from}>${c.to}`;
  const had = new Set(from.cables.map(key));
  const has = new Set(to.cables.map(key));
  const jacks = new Set<string>();
  for (const c of [...from.cables, ...to.cables]) {
    if (had.has(key(c)) !== has.has(key(c))) {
      jacks.add(c.from);
      jacks.add(c.to);
    }
  }
  return { controls, jacks: [...jacks] };
}

/**
 * The controls `t` (0..1) of the way from `from` to `to`, as a hand turning them would have them: along each one's
 * travel (a log knob by ratio), so a stepped knob or a choice passes through each setting on the way and a switch
 * flips halfway. At 1, exactly `to`. A control the synth has not got goes straight to its value at the end.
 */
export function tweenValues(
  def: SynthDef,
  from: ControlValues,
  to: ControlValues,
  t: number
): ControlValues {
  if (t >= 1) return to;
  const out: ControlValues = { ...to };
  const controls = controlMap(def);
  for (const id of Object.keys(to)) {
    const a = from[id];
    const b = to[id];
    if (a === b || a === undefined) continue;
    const c = controls[id];
    if (!c) {
      out[id] = a;
      continue;
    }
    const pa = lanePos(c, a);
    out[id] = laneValueAt(c, pa + (lanePos(c, b) - pa) * Math.max(0, t));
  }
  return out;
}

/** How long each cable an undo or redo plugs or pulls takes, in ms: they go one by one, in the order they were plugged. */
export const HISTORY_CABLE_MS = 160;

/**
 * The cables `t` (0..1) of the way from `from` to `to`, one at a time: those that go, in the order they were plugged,
 * then those that come, in theirs, the first at once. At 1, exactly `to`.
 */
export function tweenCables(from: PatchCable[], to: PatchCable[], t: number): PatchCable[] {
  if (t >= 1) return to;
  const key = (c: PatchCable) => `${c.from}>${c.to}`;
  const had = new Set(from.map(key));
  const has = new Set(to.map(key));
  const going = from.filter((c) => !has.has(key(c)));
  const coming = to.filter((c) => !had.has(key(c)));
  const n = going.length + coming.length;
  const done = t <= 0 ? 0 : Math.min(n, Math.floor(t * n) + 1);
  const gone = new Set(going.slice(0, done).map(key));
  return [
    ...from.filter((c) => !gone.has(key(c))),
    ...coming.slice(0, Math.max(0, done - going.length)),
  ];
}

// ── glides ──────────────────────────────────────────────────────────────────
// A new patch on the panel (a sound opened, Blank patch, Restore patch, the synth arriving) is shown being set, as
// the lesson builds a sound: the oscillators first, then the mixer, the filter, the envelopes and so on down the voice,
// one part at a time. The cables the new patch has not got are pulled out first, before anything turns, and its own
// are plugged in last.

/** The order the parts of the panel are set in: down the voice, as the lessons go. `lfo` and `mod` are one part. */
export const GLIDE_ORDER: readonly (readonly string[])[] = [
  ['osc'],
  ['mixer'],
  ['filter'],
  ['env'],
  ['amp'],
  ['lfo', 'mod'],
  ['glide'],
  ['mode'],
  ['util'],
  ['fx'],
  ['out'],
];

/** How long one part of the panel takes to turn, in ms, at most and at least: many parts go faster. */
export const GLIDE_STAGE_MS = 450;
export const GLIDE_STAGE_MIN_MS = 220;
/** How long all the parts' turning may take together, in ms, before each goes faster (down to the least). */
export const GLIDE_KNOBS_MS = 2700;
/** How long the cables may take together, in ms (each is `HISTORY_CABLE_MS` until they would take longer). */
export const GLIDE_CABLES_MS = 1600;

/** One part of a glide: the controls it turns (or, for the cables, the jacks it plugs and pulls) and how long it takes. */
export interface GlideStage {
  /** The parts' module, or for the cables `unplug` (those that go, first) or `patch` (those that come, last). */
  module: string;
  /** Control ids, or for the cables the jacks at either end of each that comes or goes. */
  ids: string[];
  ms: number;
}

const cableKey = (c: PatchCable) => `${c.from}>${c.to}`;

/** The parts of the panel that change from `from` to `to`, in the order they are set: cables out, parts, cables in. */
export function glidePlan(def: SynthDef, from: PanelSnap, to: PanelSnap): GlideStage[] {
  const { controls, jacks } = panelChanges(from, to);
  const cm = controlMap(def);
  const rank = (id: string) => {
    const m = cm[id]?.module ?? 'util';
    const k = GLIDE_ORDER.findIndex((g) => g.includes(m));
    return k < 0 ? GLIDE_ORDER.findIndex((g) => g.includes('util')) : k;
  };
  const parts = new Map<number, string[]>();
  for (const id of controls) {
    const k = rank(id);
    parts.set(k, [...(parts.get(k) ?? []), id]);
  }
  const ranks = [...parts.keys()].sort((a, b) => a - b);
  const ms = Math.max(
    GLIDE_STAGE_MIN_MS,
    Math.min(GLIDE_STAGE_MS, GLIDE_KNOBS_MS / Math.max(1, ranks.length))
  );
  const stages: GlideStage[] = ranks.map((k) => ({
    module: GLIDE_ORDER[k][0],
    ids: parts.get(k) ?? [],
    ms,
  }));
  if (jacks.length) {
    const had = new Set(from.cables.map(cableKey));
    const has = new Set(to.cables.map(cableKey));
    const going = from.cables.filter((c) => !has.has(cableKey(c)));
    const coming = to.cables.filter((c) => !had.has(cableKey(c)));
    const cables = (module: string, list: PatchCable[]): GlideStage => ({
      module,
      ids: [...new Set(list.flatMap((c) => [c.from, c.to]))],
      ms: Math.min(GLIDE_CABLES_MS, Math.max(GLIDE_STAGE_MIN_MS, list.length * HISTORY_CABLE_MS)),
    });
    if (going.length) stages.unshift(cables('unplug', going));
    if (coming.length) stages.push(cables('patch', coming));
  }
  return stages;
}

/** How long a glide takes, in ms. */
export const glideMs = (stages: readonly GlideStage[]): number =>
  stages.reduce((n, s) => n + s.ms, 0);

/**
 * The panel `elapsed` ms into a glide from `from` to `to` along `stages`: the parts before the one turning as they
 * end, the part turning `ease`d along its turn, those after as they began; and which part is turning (`-1` once all
 * have). At or past the end, exactly `to`.
 */
export function glideAt(
  def: SynthDef,
  from: PanelSnap,
  to: PanelSnap,
  stages: readonly GlideStage[],
  elapsed: number,
  ease: (t: number) => number = (t) => t
): { snap: PanelSnap; stage: number } {
  let start = 0;
  let stage = -1;
  let t = 1;
  for (let k = 0; k < stages.length; k++) {
    if (elapsed < start + stages[k].ms) {
      stage = k;
      t = Math.max(0, (elapsed - start) / stages[k].ms);
      break;
    }
    start += stages[k].ms;
  }
  if (stage < 0) return { snap: to, stage: -1 };
  const values: ControlValues = { ...to.values };
  stages.forEach((s, k) => {
    if (s.module === 'patch' || s.module === 'unplug' || k < stage) return;
    const part: ControlValues = {};
    const was: ControlValues = {};
    for (const id of s.ids) {
      if (id in to.values) part[id] = to.values[id];
      if (id in from.values) was[id] = from.values[id];
    }
    const turned = k === stage ? tweenValues(def, was, part, ease(t)) : was;
    // One the panel did not have before goes straight to where it goes.
    for (const id of s.ids) if (id in turned) values[id] = turned[id];
  });
  // Between the two: the old patch's cables that the new one keeps.
  const has = new Set(to.cables.map(cableKey));
  const kept = from.cables.filter((c) => has.has(cableKey(c)));
  const turning = stages[stage].module;
  const cables =
    turning === 'unplug'
      ? tweenCables(from.cables, kept, t)
      : turning === 'patch'
        ? tweenCables(kept, to.cables, t)
        : stages[0].module === 'unplug'
          ? kept
          : from.cables;
  return { snap: { values, cables }, stage };
}
