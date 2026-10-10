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
 * Pure: it calls the definition's functions and nothing else, so the test needs no prototype.
 */
import type {
  ControlValue,
  ControlValues,
  JackHearContext,
  SynthDef,
} from '@/lib/app/synths/contract';

/** One synth's recording. Keys are `init`, `<controlId>=<value>`, `wheel=1` or `patched:<jackId>`. */
export interface SynthGoldens {
  id: string;
  /** Control → its readout at eleven evenly spaced points from `min` to `max`. */
  readouts: Record<string, string[]>;
  /** Setting → hash of `toEngine`'s parameters (keys sorted, so only values count). */
  engine: Record<string, string>;
  /** Jack → its `check` at `init`, and at every setting where that differs. */
  checks: Record<string, Record<string, string | null>>;
  /** Jack → its function `amt` or `gain` at `init`, and at every setting where that differs (`null` if it threw). */
  depths: Record<string, Record<string, number | null>>;
  /** Jack → its `hear` for each source in `HEAR_SOURCES` at `init`, and at every setting where that differs. */
  hears: Record<string, Record<string, string | null>>;
}

/** JSON with every object's keys sorted: two values that differ only in key order serialise the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v
  );
}

/** FNV-1a, 32 bits, as 8 hex digits: the hash `check:synths` uses for samples. */
export function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
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

/** A function's result, or what it threw: a recording never stops part way. */
function attempt<T>(run: () => T): T | string {
  try {
    return run();
  } catch (error) {
    return `throws: ${error instanceof Error ? error.message : String(error)}`;
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
    else add(c.id, !c.def);
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

  const engine: SynthGoldens['engine'] = {};
  const play = (
    key: string,
    values: ControlValues,
    wheel: number,
    patched: Record<string, boolean>
  ): void => {
    engine[key] = fnv(
      String(attempt(() => canonicalJson(def.toEngine(values, { wheel, patched }))))
    );
  };
  for (const [key, values] of grid) play(key, values, 0, {});
  play('wheel=1', def.init, 1, {});
  for (const j of def.jacks) play(`patched:${j.id}`, def.init, 0, { [j.id]: true });

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
      depths[j.id] = track((v) => {
        const n = attempt(() => depth(v));
        return typeof n === 'number' ? n : null;
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
