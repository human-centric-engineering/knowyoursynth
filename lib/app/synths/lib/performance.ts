/**
 * A synth's performance wheels as mod lanes (`f-performance-wheels`): the template every synth follows.
 *
 * A synth declares the wheels it natively has, or hears over MIDI (`SynthDef.performance`). Each one declared:
 * - is a lane a pattern can play, by a reserved id (`@wheel`), which the lane code reads as it reads a panel control,
 *   through the control made here, so drawing, resolving, the hand check and MIDI out need nothing of their own;
 * - reaches the voice through `EngineContext`, not the panel's values, exactly as a hand on the wheel does: a lane's
 *   set is split ({@link splitPerformance}) before `toEngine()` hears it;
 * - is sent over MIDI out as the message the declaration names, with no CC to assign.
 *
 * A synth that declares nothing is offered no lane, and a pattern's lane for a wheel it lacks is kept and silent, as a
 * lane for any control a synth has not got. Adopting the template on another synth is its declaration, and its
 * `toEngine()` reading `ctx.wheel` where the hardware's wheel goes: `.context/app/lane-sounds.md`.
 */
import type {
  Control,
  ControlValue,
  ControlValues,
  FaderControl,
  SynthDef,
} from '@/lib/app/synths/contract';
import { WHEEL } from '@/lib/app/synths/lib/patch';

/** The performance inputs a lane can play, by the key `SynthDef.performance` declares them under. */
export type PerformanceKey = 'wheel';

/** One declared performance input, as the lanes and MIDI out read it. */
export interface PerformanceInput {
  key: PerformanceKey;
  /** The lane id: reserved, so it never names a panel control. */
  id: string;
  /** The lane's control: what drawing, resolving and the hand check read. Never on the panel. */
  control: Control;
  /** The CC the hardware hears it as. */
  cc: number;
}

/** The reserved lane ids, by key. */
export const PERFORMANCE_IDS: Record<PerformanceKey, string> = { wheel: WHEEL };

/** Whether `id` is a performance input's lane id, rather than a panel control's. */
export const isPerformanceId = (id: string): boolean =>
  Object.values<string>(PERFORMANCE_IDS).includes(id);

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * The mod wheel as a control: 0 (down) to 1 (all the way up), as the keyboard strip's wheel and `ctx.wheel` read it.
 * Drawn nowhere on the panel (no geometry), and left out of search and the panel's control list.
 */
const WHEEL_CONTROL: FaderControl = {
  id: WHEEL,
  type: 'fader',
  len: 0,
  orient: 'v',
  x: 0,
  y: 0,
  module: 'mod',
  label: 'Mod wheel',
  name: 'Mod wheel',
  help: 'The mod wheel beside the keys: how much of the synth’s modulation it brings in, on top of the panel’s own.',
  find: false,
  kind: 'cont',
  min: 0,
  max: 1,
  def: 0,
  fmt: pct,
};

const made = new WeakMap<SynthDef, PerformanceInput[]>();

/** The performance inputs `def` declares, in the order a lane picker lists them. The same array for the same def. */
export function performanceInputs(def: SynthDef): PerformanceInput[] {
  const had = made.get(def);
  if (had) return had;
  const out: PerformanceInput[] = [];
  const wheel = def.performance?.wheel;
  if (wheel) out.push({ key: 'wheel', id: WHEEL, control: WHEEL_CONTROL, cc: wheel.cc });
  made.set(def, out);
  return out;
}

/** The lane control for performance input `id` on `def`, or `null` where it declares none. */
export function performanceControl(def: SynthDef, id: string): Control | null {
  return performanceInputs(def).find((p) => p.id === id)?.control ?? null;
}

/** What a set of lane values sends to the voice: the panel's values, and the performance inputs, apart. */
export interface PerformanceSplit {
  values: ControlValues;
  /** The mod wheel's position the set gives, 0..1, when it gives one. */
  wheel?: number;
}

const num = (v: ControlValue | undefined): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * A set of lane values split into the panel's values and the performance inputs `def` declares. An input `def` does
 * not declare stays out of both: it is no panel control, and the synth has no such wheel.
 */
export function splitPerformance(def: SynthDef, set: ControlValues): PerformanceSplit {
  if (!Object.keys(set).some(isPerformanceId)) return { values: set };
  const values: ControlValues = {};
  for (const [id, v] of Object.entries(set)) if (!isPerformanceId(id)) values[id] = v;
  const out: PerformanceSplit = { values };
  if (def.performance?.wheel) {
    const w = num(set[WHEEL]);
    if (w !== undefined) out.wheel = Math.min(1, Math.max(0, w));
  }
  return out;
}

/** The mod wheel's position a set of lane values gives (the lanes' on a step), for the keyboard strip to draw. */
export function shownWheel(set: ControlValues | null | undefined): number | undefined {
  return set ? num(set[WHEEL]) : undefined;
}
