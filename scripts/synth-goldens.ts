/**
 * What a synth definition does, recorded as plain data: every readout, jack check, jack depth and "what you will hear"
 * sentence, and the engine parameters, over a fixed grid of panel settings.
 *
 * Recorded once from the prototype's definitions by `scripts/record-synth-goldens.ts` (the prototype is the spec, D3)
 * into `tests/fixtures/synths/goldens/`, and recorded again from each ported definition by
 * `tests/unit/lib/app/synths/defs/goldens.test.ts`, which compares the two. `npm run check:synths` already proves the
 * engine mapping on every sound in the library; this covers the parts it compares only by presence (the functions on
 * controls and jacks) and the panel settings no sound uses.
 *
 * Everything recorded is plain JSON (`toJson`), so a recording and a file compare exactly, `NaN` included, and a
 * mismatch shows the parameter and value that differ.
 *
 * Pure: it calls the definition's functions and nothing else, so the test needs no prototype.
 */
import type {
  ControlValue,
  ControlValues,
  JackHearContext,
  SynthDef,
} from '@/lib/app/synths/contract';

/** Plain JSON: what a golden file holds, so a recording and a file compare exactly. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** An engine row's value for a parameter the row leaves out that its base sets. */
export const ABSENT = '(absent)';

/**
 * One synth's recording. Setting keys are `init`, `<controlId>=<value>`, `wheel=1`, `patched:<jackId>` (that jack
 * alone patched, panel at init), `patched:*` (every jack patched, panel at init) and `patched:* <controlId>=<value>`
 * (every jack patched, that control moved).
 */
export interface SynthGoldens {
  id: string;
  /** Control → its readout at eleven evenly spaced points from `min` to `max`. */
  readouts: Record<string, string[]>;
  /**
   * Setting → `toEngine`'s parameters. `init` holds them all; every other row holds only the parameters that differ
   * from its base (`patched:*` for the rows with every jack patched, `init` for the rest), `ABSENT` for one it drops,
   * and `{}` when nothing differs. A setting where `toEngine` threw holds what it threw.
   */
  engine: Record<string, Json>;
  /** Jack → its `check` at `init`, and at every setting where that differs. */
  checks: Record<string, Record<string, string | null>>;
  /**
   * Jack → its function `amt` or `gain` at `init`, and at every setting where that differs: a number, `"NaN"` or
   * `"±Infinity"` (JSON holds neither), or `null` if it threw or returned something else.
   */
  depths: Record<string, Record<string, number | string | null>>;
  /** Jack → its `hear` for each source in `HEAR_SOURCES` at `init`, and at every setting where that differs. */
  hears: Record<string, Record<string, string | null>>;
}

/**
 * `value` as plain JSON with every object's keys sorted. What `JSON.stringify` would lose is kept: `NaN` and
 * `±Infinity` become the strings `"NaN"` and `"Infinity"`/`"-Infinity"` rather than `null`, and `-0` is `0`.
 * Functions and `undefined` are dropped from objects and are `null` in arrays, as in JSON.
 */
export function toJson(value: unknown): Json {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value + 0 : String(value);
  if (Array.isArray(value)) return value.map((v) => toJson(v));
  if (typeof value === 'object') {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort()) {
      const v: unknown = Reflect.get(value, key);
      if (v !== undefined && typeof v !== 'function') out[key] = toJson(v);
    }
    return out;
  }
  return null;
}

/** JSON with every object's keys sorted: two values that differ only in key order serialise the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(toJson(value));
}

const isJsonObject = (v: Json): v is { [key: string]: Json } =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** The parameters of `row` that differ from `base`'s, `ABSENT` for one it drops; a row that threw stays whole. */
function engineDiff(base: Json, row: Json): Json {
  if (!isJsonObject(base) || !isJsonObject(row)) return row;
  const out: { [key: string]: Json } = {};
  for (const key of [...new Set([...Object.keys(base), ...Object.keys(row)])].sort()) {
    if (!(key in row)) out[key] = ABSENT;
    else if (canonicalJson(row[key]) !== canonicalJson(base[key])) out[key] = row[key];
  }
  return out;
}

/** The sources a `hear` sentence is asked about: each kind of signal it branches on, and the two keyboard roots. */
export const HEAR_SOURCES: Record<string, Pick<JackHearContext, 'src' | 'kind' | 'root'>> = {
  lfo: { src: 'the LFO', kind: 'lfo', root: 'lfo' },
  audio: { src: 'oscillator 1', kind: 'audio', root: 'osc1' },
  noise: { src: 'the noise generator', kind: 'noise', root: 'noise' },
  fast: { src: 'the fast LFO', kind: 'fast', root: 'lfo' },
  env: { src: 'the envelope', kind: 'env', root: 'env1' },
  kbd: { src: 'the keyboard pitch', kind: 'kbd', root: 'kbd' },
  kbd2: { src: 'the upper voice', kind: 'kbd', root: 'kbd2' },
};

function hearContext(source: Pick<JackHearContext, 'src' | 'kind' | 'root'>): JackHearContext {
  return {
    ...source,
    live: source.src,
    amount: 1,
    depth: 'up to 1 octave either way',
    size: '1 octave',
    sign: 1,
    hz: 5,
    shape: 'sine',
    target: 'the cutoff',
    normal: 'nothing',
    replaced: false,
    shared: false,
    same: false,
    plural: false,
    uni: false,
    slowOsc: false,
    slowAttack: '',
    leaks: '',
    gated: '',
    stepped: '',
    smooth: true,
    doubles: false,
    self: false,
    synced: false,
  };
}

/** What a function threw, as a recording holds it. */
function threw(error: unknown): string {
  return `throws: ${error instanceof Error ? error.message : String(error)}`;
}

/** A function's result, or what it threw: a recording never stops part way. */
function attempt<T>(run: () => T): T | string {
  try {
    return run();
  } catch (error) {
    return threw(error);
  }
}

/** `count` points evenly spaced from `min` to `max`, rounded so the keys stay readable. */
function spread(min: number, max: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    Number((min + ((max - min) * i) / (count - 1)).toFixed(6))
  );
}

/** The panel settings the grid covers: `init`, then each control moved on its own across its values. */
export function settings(def: SynthDef): [key: string, values: ControlValues][] {
  const out: [string, ControlValues][] = [['init', def.init]];
  const add = (id: string, value: ControlValue): void => {
    if (value !== def.init[id])
      out.push([`${id}=${JSON.stringify(value)}`, { ...def.init, [id]: value }]);
  };
  for (const c of def.controls) {
    if (c.kind === 'cont') spread(c.min, c.max, 5).forEach((v) => add(c.id, v));
    else if (c.kind === 'enum') c.options.forEach((o) => add(c.id, o.v));
    else add(c.id, !def.init[c.id]);
  }
  return out;
}

/** Records what `def` does over the grid. */
export function recordGoldens(def: SynthDef): SynthGoldens {
  const grid = settings(def);
  const readouts: SynthGoldens['readouts'] = {};
  for (const c of def.controls) {
    if (c.kind !== 'cont' || !c.fmt) continue;
    const fmt = c.fmt;
    readouts[c.id] = spread(c.min, c.max, 11).map((v) => String(attempt(() => fmt(v))));
  }

  const play = (values: ControlValues, wheel: number, patched: Record<string, boolean>): Json => {
    try {
      return toJson(def.toEngine(values, { wheel, patched }));
    } catch (error) {
      return threw(error);
    }
  };
  const base = play(def.init, 0, {});
  const allPatched = Object.fromEntries(def.jacks.map((j) => [j.id, true]));
  const baseAll = play(def.init, 0, allPatched);
  const engine: SynthGoldens['engine'] = { init: base };
  for (const [key, values] of grid.slice(1)) engine[key] = engineDiff(base, play(values, 0, {}));
  engine['wheel=1'] = engineDiff(base, play(def.init, 1, {}));
  for (const j of def.jacks)
    engine[`patched:${j.id}`] = engineDiff(base, play(def.init, 0, { [j.id]: true }));
  engine['patched:*'] = engineDiff(base, baseAll);
  for (const [key, values] of grid.slice(1))
    engine[`patched:* ${key}`] = engineDiff(baseAll, play(values, 0, allPatched));

  /** A value at `init`, and at every setting where it differs from that. */
  const track = <T>(read: (values: ControlValues) => T): Record<string, T> => {
    const base = read(def.init);
    const rows: Record<string, T> = { init: base };
    for (const [key, values] of grid.slice(1)) {
      const value = read(values);
      if (canonicalJson(value) !== canonicalJson(base)) rows[key] = value;
    }
    return rows;
  };

  const checks: SynthGoldens['checks'] = {};
  const depths: SynthGoldens['depths'] = {};
  const hears: SynthGoldens['hears'] = {};
  for (const j of def.jacks) {
    const check = j.check;
    if (check) checks[j.id] = track((v) => attempt(() => check(v)));
    const depth = j.dir === 'in' ? j.amt : j.gain;
    if (typeof depth === 'function') {
      depths[j.id] = track((v): number | string | null => {
        const n = attempt(() => depth(v));
        return typeof n !== 'number' ? null : Number.isFinite(n) ? n + 0 : String(n);
      });
    }
    const hear = j.dir === 'in' ? j.hear : null;
    if (hear) {
      const rows: Record<string, string | null> = {};
      for (const [name, source] of Object.entries(HEAR_SOURCES)) {
        const x = hearContext(source);
        for (const [key, value] of Object.entries(track((v) => attempt(() => hear(v, x)))))
          rows[`${name}@${key}`] = value;
      }
      hears[j.id] = rows;
    }
  }

  return { id: def.id, readouts, engine, checks, depths, hears };
}
