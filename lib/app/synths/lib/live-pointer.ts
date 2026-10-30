// Which control a live pointer sits on (`f-live-panel` t-154), and where on it: a second, moving pointer on the knob or
// fader that sets the filter's cutoff, or the VCA's gain, at the value the engine is running at now (`MeterEvent.cutoff`,
// `.amp`) rather than the one the control is set to. An envelope or LFO sweeping the cutoff then shows on its knob.
//
// Nothing here is written per synth. The control is the one whose own travel moves that engine value furthest, read
// back from `toEngine()`, and its position for an engine value is read off `toEngine()` across the same travel. A synth
// with no such control has no pointer for it: the Model D's VCA, which only its contour opens.
import { isShown } from '@/lib/app/synths/lib/patch';
import type {
  ContinuousValue,
  ControlValues,
  EngineContext,
  EngineParams,
  FaderControl,
  KnobControl,
  SynthDef,
} from '@/lib/app/synths/contract';

/** The engine values a live pointer follows. */
export type PointerParam = 'cutoff' | 'amp';

export const POINTER_PARAMS: readonly PointerParam[] = ['cutoff', 'amp'];

/** One engine value as the voice holds it: clamped as the voice clamps it. */
const READ: Record<PointerParam, (p: EngineParams) => number> = {
  cutoff: (p) => Math.min(Math.max(p.filter.cutoff, 10), 20000),
  amp: (p) => Math.min(Math.max(p.vca.bias, 0), 1.6),
};

/** The scale a value is compared and read between samples on: octaves for the cutoff, the gain itself for the VCA. */
const SCALE: Record<PointerParam, (x: number) => number> = {
  cutoff: (x) => Math.log2(Math.max(x, 1e-9)),
  amp: (x) => x,
};

/** The pitch the oscillators are set to: a control that moves it is a tuning control, whatever else follows it. */
const pitchOf = (p: EngineParams) =>
  JSON.stringify([p.tune ?? 0, p.osc.map((o) => [o.semi, o.fixedNote])]);

/** A continuous knob or fader: what a live pointer can sit on. */
export type PointerControl = (KnobControl | FaderControl) & ContinuousValue;

const isPointerControl = (c: SynthDef['controls'][number]): c is PointerControl =>
  (c.type === 'knob' || c.type === 'fader') &&
  c.kind === 'cont' &&
  !c.ui &&
  !(c.type === 'knob' && c.style === 'solar-eye');

/** Points across a control's travel at which its engine value is read. */
const SAMPLES = 24;

/** A control that carries a live pointer, and the engine value it gives along its travel. */
export interface PointerKnob {
  param: PointerParam;
  control: PointerControl;
  /** Control values, rising, each with its engine value on `SCALE`; the control's own value is one of them. */
  table: { v: number; e: number }[];
  /** The control's own value, which an engine value it gives at more than one place on its travel is read nearest. */
  own: number;
}

/**
 * The control that sets `param` on `def` with the panel at `values`: of the knobs and faders on show, the one whose
 * travel from end to end moves it furthest, leaving out any that also tune the oscillators (the Syncussion's TUNE,
 * which the filter follows). Null when none moves it.
 */
export function pointerControl(
  def: SynthDef,
  param: PointerParam,
  values: ControlValues,
  ctx: EngineContext
): PointerControl | null {
  let best: PointerControl | null = null;
  let reach = 1e-6;
  for (const c of def.controls) {
    if (!isPointerControl(c) || !isShown(c, values)) continue;
    const lo = def.toEngine({ ...values, [c.id]: c.min }, ctx);
    const hi = def.toEngine({ ...values, [c.id]: c.max }, ctx);
    const d = Math.abs(SCALE[param](READ[param](hi)) - SCALE[param](READ[param](lo)));
    if (d > reach && pitchOf(lo) === pitchOf(hi)) {
      reach = d;
      best = c;
    }
  }
  return best;
}

/** `control`'s engine value for `param` across its travel, with the panel otherwise at `values`. */
export function pointerTable(
  def: SynthDef,
  param: PointerParam,
  control: PointerControl,
  values: ControlValues,
  ctx: EngineContext
): PointerKnob {
  const own = Number(values[control.id] ?? control.def);
  const vs = Array.from(
    { length: SAMPLES + 1 },
    (_, k) => control.min + ((control.max - control.min) * k) / SAMPLES
  );
  if (Number.isFinite(own) && !vs.includes(own)) vs.push(own);
  vs.sort((a, b) => a - b);
  const table = vs.map((v) => ({
    v,
    e: SCALE[param](READ[param](def.toEngine({ ...values, [control.id]: v }, ctx))),
  }));
  return { param, control, table, own: Number.isFinite(own) ? own : control.def };
}

/**
 * Where on its control the engine's `value` of the control's parameter sits: the control value that gives it, read
 * between the two nearest samples. Where more than one does (a stretch of travel past the voice's clamp, all at
 * 20 kHz), the one nearest the control's own value, so an unmodulated cutoff stays under the knob. Past the control's
 * reach, the end nearer the value.
 */
export function pointerValue(pk: PointerKnob, value: number): number {
  const { table, own } = pk;
  const e = SCALE[pk.param](value);
  let best: number | null = null;
  for (let k = 1; k < table.length; k++) {
    const a = table[k - 1],
      b = table[k];
    if ((e - a.e) * (e - b.e) > 0) continue;
    const v =
      a.e === b.e
        ? Math.min(Math.max(own, a.v), b.v)
        : a.v + ((b.v - a.v) * (e - a.e)) / (b.e - a.e);
    if (best === null || Math.abs(v - own) < Math.abs(best - own)) best = v;
  }
  if (best !== null) return best;
  const lo = table[0],
    hi = table[table.length - 1];
  return Math.abs(e - lo.e) < Math.abs(e - hi.e) ? lo.v : hi.v;
}

/**
 * The panel's settings that can change which control carries a pointer: every value but the knobs' and faders', as one
 * string, so a view finds its controls again when a switch moves and not with every knob turned.
 */
export function pointerSwitches(def: SynthDef, values: ControlValues): string {
  return JSON.stringify(def.controls.filter((c) => !isPointerControl(c)).map((c) => values[c.id]));
}

/**
 * The control for each parameter that has one, with the panel's switches at `switches` (`pointerSwitches()`) and its
 * knobs and faders where the init patch has them, which change only how far each one reaches.
 */
export function pointerControls(
  def: SynthDef,
  switches: string,
  ctx: EngineContext
): { param: PointerParam; control: PointerControl }[] {
  const set: unknown = JSON.parse(switches);
  const values: ControlValues = { ...def.init };
  if (Array.isArray(set))
    def.controls
      .filter((c) => !isPointerControl(c))
      .forEach((c, k) => {
        const v: unknown = set[k];
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
          values[c.id] = v;
      });
  return POINTER_PARAMS.flatMap((param) => {
    const control = pointerControl(def, param, values, ctx);
    return control ? [{ param, control }] : [];
  });
}
