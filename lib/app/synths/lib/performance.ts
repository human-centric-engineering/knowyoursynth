/**
 * A synth's performance wheels as mod lanes (`f-performance-wheels`): the template every synth follows.
 *
 * A synth declares the wheels it natively has, or hears over MIDI (`SynthDef.performance`). Each one declared:
 * - is a lane a pattern can play, by a reserved id (`@wheel`), which the lane code reads as it reads a panel control,
 *   through the control made here, so drawing, resolving, the hand check and MIDI out need nothing of their own;
 * - reaches the voice through `EngineContext`, not the panel's values, exactly as a hand on the wheel does: a lane's
 *   set is split ({@link splitPerformance}) before `toEngine()` hears it;
 * - is sent over MIDI out as the message the declaration names, with no CC to assign: the mod wheel as its CC, the
 *   pitch wheel (`@bend`) as pitch bend.
 *
 * A synth that declares nothing is offered no lane, and a pattern's lane for a wheel it lacks is kept and silent, as a
 * lane for any control a synth has not got. Adopting the template on another synth is its declaration, and its
 * `toEngine()` reading `ctx.wheel` and `ctx.bend` where the hardware's wheels go: `.context/app/sequencer.md` (Performance wheels).
 */
import type {
  Control,
  ControlValue,
  ControlValues,
  FaderControl,
  SynthDef,
  SynthRouting,
} from '@/lib/app/synths/contract';
import { moduleOf } from '@/lib/app/synths/lib/modules';
import { fmtSemi } from '@/lib/app/synths/lib/maps';
import { controlMap, displayName, WHEEL } from '@/lib/app/synths/lib/patch';
import type { WheelReach } from '@/lib/app/synths/lib/routing';

/** The performance inputs a lane can play, by the key `SynthDef.performance` declares them under. */
export type PerformanceKey = 'wheel' | 'bend';

/** The pitch wheel, where a lane id is expected. */
export const BEND = '@bend';

/**
 * What a performance input is sent as when it is pitch bend rather than a CC: a number no CC can be (they are 0..127),
 * so the lookup that sends lanes as `[cc, value]` carries it beside them, its value 0..16383 with 8192 the centre.
 */
export const PITCH_BEND = 128;

/** One declared performance input, as the lanes and MIDI out read it. */
export interface PerformanceInput {
  key: PerformanceKey;
  /** The lane id: reserved, so it never names a panel control. */
  id: string;
  /** The lane's control: what drawing, resolving and the hand check read. Never on the panel. */
  control: Control;
  /** The CC the hardware hears it as, or `PITCH_BEND`. */
  cc: number;
}

/** The reserved lane ids, by key. */
export const PERFORMANCE_IDS: Record<PerformanceKey, string> = { wheel: WHEEL, bend: BEND };

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

/**
 * The pitch wheel as a control: -1 (all the way down) to 1 (all the way up), 0 at rest, as the keyboard strip's pitch
 * wheel and `ctx.bend` read it. Its readout is in semitones, by the range `def` declares. Drawn nowhere on the panel.
 */
const bendControl = (range: number): FaderControl => ({
  id: BEND,
  type: 'fader',
  len: 0,
  orient: 'v',
  x: 0,
  y: 0,
  module: 'osc',
  label: 'Pitch wheel',
  name: 'Pitch wheel',
  help: `The pitch wheel beside the keys: bends the pitch up or down, up to ${range} semitone${range === 1 ? '' : 's'} either way, and springs back to the middle when let go.`,
  find: false,
  kind: 'cont',
  min: -1,
  max: 1,
  def: 0,
  fmt: (v) => fmtSemi(v * range),
});

const made = new WeakMap<SynthDef, PerformanceInput[]>();

/** The performance inputs `def` declares, in the order a lane picker lists them. The same array for the same def. */
export function performanceInputs(def: SynthDef): PerformanceInput[] {
  const had = made.get(def);
  if (had) return had;
  const out: PerformanceInput[] = [];
  const wheel = def.performance?.wheel;
  if (wheel) out.push({ key: 'wheel', id: WHEEL, control: WHEEL_CONTROL, cc: wheel.cc });
  const bend = def.performance?.bend;
  if (bend) out.push({ key: 'bend', id: BEND, control: bendControl(bend.range), cc: PITCH_BEND });
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
  /** The pitch wheel's position the set gives, -1..1, when it gives one. */
  bend?: number;
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
  if (def.performance?.bend) {
    const b = num(set[BEND]);
    if (b !== undefined) out.bend = Math.min(1, Math.max(-1, b));
  }
  return out;
}

/** The mod wheel's position a set of lane values gives (the lanes' on a step), for the keyboard strip to draw. */
export function shownWheel(set: ControlValues | null | undefined): number | undefined {
  return set ? num(set[WHEEL]) : undefined;
}

/** The pitch wheel's position a set of lane values gives, for the keyboard strip to draw. */
export function shownBend(set: ControlValues | null | undefined): number | undefined {
  return set ? num(set[BEND]) : undefined;
}

/** What the keyboard strip says under the mod wheel: where pushing it sends modulation (`wheelReach`). */
export interface WheelSays {
  /** What it brings in, e.g. "LFO + Noise"; absent when it scales no source of its own. */
  from?: string;
  /** Where it lands, e.g. "→ Oscillators · Filter", or "Nowhere". */
  to: string;
  /** Where it lands nowhere: what would send it somewhere, e.g. "Switch on OSCILLATOR MODULATION or …". */
  hint?: string;
}

/**
 * `reach` in words: its sources by their block names, where it lands by the parts of the synth those blocks are
 * (`moduleOf`: three oscillators read as "Oscillators"), and, where it lands nowhere, the switches that would send it
 * somewhere, by their panel names.
 */
export function wheelSays(def: SynthDef, routing: SynthRouting, reach: WheelReach): WheelSays {
  const blocks = new Map(routing.blocks.map((b) => [b.id, b]));
  const names = (ids: string[], name: (id: string) => string | undefined) => [
    ...new Set(ids.flatMap((id) => name(id) ?? [])),
  ];
  const from = names(reach.sources, (id) => blocks.get(id)?.name).join(' + ') || undefined;
  if (reach.blocks.length) {
    const to = names(reach.blocks, (id) => moduleOf(blocks.get(id)?.module).label);
    return { from, to: `→ ${to.join(' · ')}` };
  }
  const controls = controlMap(def);
  const doors = reach.doors.flatMap((d) => {
    const c = controls[d.id];
    if (!c) return [];
    const verb = c.kind === 'bool' ? (d.v ? 'switch on' : 'switch off') : 'set';
    return [{ verb, name: displayName(def, c) }];
  });
  // "Switch on A or B." where every way in is the same move, else each with its own: "Switch on A, or set B."
  const said = doors.every((d) => d.verb === doors[0].verb)
    ? `${doors[0]?.verb} ${doors.map((d) => d.name).join(' or ')}`
    : doors.map((d) => `${d.verb} ${d.name}`).join(', or ');
  return {
    from,
    to: 'Nowhere',
    hint: doors.length ? `${said.charAt(0).toUpperCase()}${said.slice(1)}.` : undefined,
  };
}

/** A mod wheel's step over MIDI (CC 1, 0–127), and a pitch wheel's (14-bit pitch bend, -1–1). */
export const WHEEL_STEP = 1 / 127;
export const BEND_STEP = 1 / 8192;
/** How many of a wheel lane's latest values a wheel coming in from MIDI is checked against as their echo (t-310). */
export const ECHO_KEPT = 3;

/**
 * Whether `v`, a wheel in from MIDI while its lane sends, is the lane's own value echoed back (a DAW returning it):
 * within a MIDI step or two (`step`) of one the lane sent lately (`sent`), not the hand.
 */
export function isLaneEcho(sent: readonly number[], v: number, step: number): boolean {
  return sent.some((s) => Math.abs(s - v) <= step * 1.5);
}
