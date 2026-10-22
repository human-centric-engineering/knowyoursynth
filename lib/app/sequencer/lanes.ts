/**
 * Mod lanes against the synth playing them (`f-step-sequencer` t-82).
 *
 * A pattern is not tied to a synth, so a lane names a control by id and holds plain values. Only the synth playing it
 * knows whether it has that control, and what the control takes. Here a lane's values are read against it:
 * - A lane for a control the synth does not have is kept, and silent.
 * - A value the control cannot take (a number for a switch, a choice it does not have) is ignored on that step.
 * - A number past either end of a knob's travel is kept inside it.
 * The pattern itself is never changed, so a pattern moved between synths loses nothing.
 */
import type { ModChange } from '@/lib/app/sequencer/compile';
import type { Pattern } from '@/lib/app/sequencer/pattern';
import { controlMap } from '@/lib/app/synths/lib/patch';
import type {
  Control,
  ControlOption,
  ControlValue,
  ControlValues,
  SynthDef,
} from '@/lib/app/synths/contract';

/** The control a lane moves, if the synth has one it can move. Its tempo knob is the pattern's own tempo, so not that. */
export function laneControl(def: SynthDef, id: string): Control | null {
  if (id === def.tempo) return null;
  return controlMap(def)[id] ?? null;
}

/** The controls a lane can be given on this synth, in panel order. */
export const laneControls = (def: SynthDef): Control[] =>
  def.controls.filter((c) => c.id !== def.tempo && !('pairOf' in c && c.pairOf));

/** The options of a choice a lane can pick: those the panel draws. */
export const laneOptions = (c: { options: ControlOption[] }): ControlOption[] => {
  const shown = c.options.filter((o) => !o.hide);
  return shown.length > 0 ? shown : c.options;
};

/** What a lane's value plays as on this control: kept inside a knob's travel, or `null` if the control can't take it. */
export function laneValue(c: Control, v: ControlValue | undefined): ControlValue | null {
  if (v === undefined) return null;
  if (c.kind === 'cont') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return Math.min(c.max, Math.max(c.min, v));
  }
  if (c.kind === 'bool') return typeof v === 'boolean' ? v : null;
  const o = c.options.find((x) => x.v === v);
  return o ? o.v : null;
}

/**
 * The loop's lane changes as this synth plays them: lanes it has no control for, and values its controls can't take,
 * left out, and a change that then changes nothing dropped. No lane it can play gives no changes at all, so the loop
 * sounds as it would with no lanes.
 */
export function resolveMods(def: SynthDef, mods: readonly ModChange[]): ModChange[] {
  const out: ModChange[] = [];
  let last = '';
  let any = false;
  for (const [beat, set] of mods) {
    let live: ControlValues | null = null;
    for (const id of Object.keys(set ?? {})) {
      const c = laneControl(def, id);
      const v = c && laneValue(c, set![id]);
      if (v !== null && v !== undefined) (live ??= {})[id] = v;
    }
    if (live) any = true;
    const key = live ? JSON.stringify(live) : '';
    if (out.length > 0 && key === last) continue;
    out.push([beat, live]);
    last = key;
  }
  return any ? out : [];
}

/** Whether any of the pattern's lanes sets a value this synth's control can take, on any step: whether they play here. */
export function lanesPlay(def: SynthDef, p: Pattern): boolean {
  const live = (p.lanes ?? []).filter((id) => laneControl(def, id));
  if (live.length === 0) return false;
  return p.parts.some((part) =>
    part.steps.some((s) => !!s.mod && stepOverrides(def, s.mod, live) !== null)
  );
}

/**
 * A turn of a control the panel draws at a lane's value (`shown`) while the pattern plays, as a change to the panel's
 * own value (`own`). The control worked its new value out from the one it drew, so a knob moves the panel's value by
 * as much as it moved, and a switch flips the panel's. A choice picked is the choice picked.
 */
export function rebase(
  c: Control,
  shown: ControlValue,
  own: ControlValue | undefined,
  next: ControlValue
): ControlValue {
  if (c.kind === 'cont') {
    if (typeof next !== 'number' || typeof shown !== 'number') return next;
    const from = typeof own === 'number' ? own : c.def;
    return Math.min(c.max, Math.max(c.min, from + (next - shown)));
  }
  if (c.kind === 'bool') {
    const from = typeof own === 'boolean' ? own : c.def;
    return next === shown ? from : !from;
  }
  return next;
}

/** What a step's lanes set on this synth, as the panel shows it while the step plays: `null` for nothing. */
export function stepOverrides(
  def: SynthDef,
  mod: Readonly<Record<string, ControlValue>> | undefined,
  lanes: readonly string[]
): ControlValues | null {
  if (!mod) return null;
  let out: ControlValues | null = null;
  for (const id of lanes) {
    if (!Object.hasOwn(mod, id)) continue;
    const c = laneControl(def, id);
    const v = c && laneValue(c, mod[id]);
    if (v !== null && v !== undefined) (out ??= {})[id] = v;
  }
  return out;
}

// Where a value sits on a lane's bar, 0..1, and back: as a knob's travel reads, `taper: 'log'` by ratio.
const isLog = (c: Control) => c.kind === 'cont' && c.taper === 'log' && c.min > 0;

/** How high a value draws on the lane, 0 (bottom) to 1 (top). */
export function lanePos(c: Control, v: ControlValue): number {
  if (c.kind === 'bool') return v ? 1 : 0;
  if (c.kind === 'enum') {
    const opts = laneOptions(c);
    const i = opts.findIndex((o) => o.v === v);
    return opts.length < 2 ? 1 : Math.max(0, i) / (opts.length - 1);
  }
  const n = typeof v === 'number' ? v : c.def;
  const t = isLog(c)
    ? Math.log(n / c.min) / Math.log(c.max / c.min)
    : (n - c.min) / (c.max - c.min);
  return Math.min(1, Math.max(0, t));
}

/** The value at height `pos` (0..1) of the lane: on the control's step, if it has one, and a choice's nearest option. */
export function laneValueAt(c: Control, pos: number): ControlValue {
  const t = Math.min(1, Math.max(0, pos));
  if (c.kind === 'bool') return t >= 0.5;
  if (c.kind === 'enum') {
    const opts = laneOptions(c);
    return opts[Math.round(t * (opts.length - 1))].v;
  }
  const v = isLog(c) ? c.min * Math.pow(c.max / c.min, t) : c.min + (c.max - c.min) * t;
  if (c.step) return Math.min(c.max, Math.max(c.min, Math.round(v / c.step) * c.step));
  return Math.round(v * 1000) / 1000;
}
