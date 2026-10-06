// Helpers that work on a SynthDef + values: formatting, building a preset's target state, validating AI output.
//
// Transliterated from `prototype/src/lib/patch.js` (decision D3). Two changes of mechanism, not of behaviour:
// the prototype cached its lookup tables on the definition itself (`def._cmap`, `def._jmap`, `def._dupes`); here they
// live in WeakMaps keyed by the definition, so a SynthDef stays the plain contract type. And the `sanitize*`
// functions take `unknown` (they read AI output) and check its shape as they go. Their strict counterpart, which
// refuses instead of repairing, is `lib/app/synths/validate.ts`.
import { CABLE_COLORS } from '@/lib/app/synths/lib/modules';
import {
  SYNTH_MODULES,
  type CablePair,
  type Control,
  type ControlValue,
  type ControlValues,
  type EngineCable,
  type Jack,
  type PatchCable,
  type Phrase,
  type PhraseNote,
  type Preset,
  type PresetStep,
  type PresetTweak,
  type SynthDef,
  type SynthModule,
} from '@/lib/app/synths/contract';

/** A cable as far as the libraries care: which output jack goes to which input jack. */
export interface CableLike {
  from: string;
  to: string;
}

/** Anything with an id and an optional printed label (a control or a jack). */
interface Labelled {
  id: string;
  label?: string;
}

export const cleanLabel = (c: Labelled): string => (c.label || c.id).replace(/\n/g, ' ');

/** A plain object (not null, not an array), for reading untrusted input. */
export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Whether a control is on the faceplate right now. `show: { id, eq }` (or a list of them, all of which must hold) ties a
 * control to a panel mode: the DeepMind's four envelope faders are twelve controls deep, and which ones they are depends on
 * the VCA / VCF / MOD buttons. A hidden control keeps its value and is still part of the sound; it just is not drawn.
 * `{ id, in: [...] }` holds when the other control is at any of those values.
 */
export function isShown(c: Control, values: ControlValues): boolean {
  if (!c.show) return true;
  const list = Array.isArray(c.show) ? c.show : [c.show];
  return list.every((w) => ('in' in w ? w.in.includes(values[w.id]) : values[w.id] === w.eq));
}

const controlMaps = new WeakMap<SynthDef, Record<string, Control | undefined>>();
const jackMaps = new WeakMap<SynthDef, Record<string, Jack | undefined>>();

export function controlMap(def: SynthDef): Record<string, Control | undefined> {
  let m = controlMaps.get(def);
  if (!m) {
    m = Object.fromEntries(def.controls.map((c) => [c.id, c]));
    controlMaps.set(def, m);
  }
  return m;
}
export function jackMap(def: SynthDef): Record<string, Jack | undefined> {
  let m = jackMaps.get(def);
  if (!m) {
    m = Object.fromEntries(def.jacks.map((j) => [j.id, j]));
    jackMaps.set(def, m);
  }
  return m;
}

export function formatValue(c: Control, v: ControlValue | null | undefined): string {
  if (v == null) return '—';
  if (c.kind === 'bool') return v ? 'On' : 'Off';
  if (c.kind === 'enum') {
    const o = c.options.find((x) => x.v === v);
    return (o && o.label) || WAVE_NAMES[String(v)] || String(v);
  }
  const num = Number(v);
  const n = (Math.round(num * 10) / 10).toFixed(1).replace(/\.0$/, '').replace('-', '−');
  if (c.fmt) {
    try {
      return `${n} · ${c.fmt(num)}`;
    } catch {
      return n;
    }
  }
  return n;
}
const WAVE_NAMES: Record<string, string | undefined> = {
  tri: 'Triangle',
  shark: 'Triangle-saw',
  saw: 'Sawtooth',
  rsaw: 'Reverse saw',
  sq: 'Square',
  wide: 'Wide pulse',
  narrow: 'Narrow pulse',
  pulse: 'Pulse',
  sine: 'Sine',
  tmod: 'Tone mod',
};

/** A panel state: every control's value and the cables in. */
export interface PanelState {
  values: ControlValues;
  cables: PatchCable[];
}

/** init + steps[0..upto] → { values, cables }. `upto` omitted = the whole sound. */
export function presetState(
  def: SynthDef,
  preset?: Pick<Preset, 'steps' | 'phrase'> | null,
  upto?: number | null
): PanelState {
  const values: ControlValues = { ...def.init };
  const cables: PatchCable[] = [];
  if (!preset) return { values, cables };
  // A synth whose TEMPO knob sets the riff's speed (SynthDef `tempo`) starts each sound at its own riff's BPM.
  if (def.tempo && preset.phrase && preset.phrase.bpm) values[def.tempo] = preset.phrase.bpm;
  const last = upto == null ? preset.steps.length - 1 : upto;
  preset.steps.forEach((s, i) => {
    if (i > last) return;
    Object.assign(values, s.set || {});
    (s.cables || []).forEach(([from, to]) => {
      if (!cables.some((c) => c.from === from && c.to === to))
        cables.push({ from, to, color: CABLE_COLORS[cables.length % CABLE_COLORS.length] });
    });
  });
  return { values, cables };
}

/** How much an output jack scales what it sends (its `gain`, a number or a function of the values; default 1). */
export const jackGain = (j: Jack, values: ControlValues): number => {
  const gain = j.dir === 'out' ? j.gain : undefined;
  return typeof gain === 'function' ? gain(values) : gain == null ? 1 : gain;
};

/** An input jack's depth (its `amt`, a number or a function of the values; default 1). */
export const jackAmt = (j: Jack, values: ControlValues): number => {
  const amt = j.dir === 'in' ? j.amt : undefined;
  return typeof amt === 'function' ? amt(values) : amt == null ? 1 : amt;
};

/** Cables → engine cable routes, using the jack definitions. */
export function cablesToEngine(
  def: SynthDef,
  cables: CableLike[],
  values: ControlValues
): EngineCable[] {
  const jm = jackMap(def);
  const out: EngineCable[] = [];
  for (const cb of cables) {
    const a = jm[cb.from];
    const b = jm[cb.to];
    // Only an output carries a `signal` and only an input a `dest`, so this is the prototype's `!a.signal || !b.dest`.
    if (!a || !b || a.dir !== 'out' || b.dir !== 'in' || !a.signal || !b.dest) continue;
    // An output jack may carry a `gain` (the VCS3's numbered level knobs scale a matrix row wherever it is pinned).
    const amt = jackAmt(b, values) * jackGain(a, values);
    // Jacks of a two-module synth carry `part` (0 or 1): the engine sends the cable to that module's voice.
    const part = a.part || b.part ? { sp: a.part || 0, dp: b.part || 0 } : {};
    out.push({ src: a.signal, dst: b.dest, amt, add: !!b.add, ...part });
  }
  return out;
}

/** Keep only settings that are real controls with legal values. Used on anything that comes back from the AI. */
export function sanitizeSet(def: SynthDef, set: unknown): ControlValues {
  const cm = controlMap(def);
  const clean: ControlValues = {};
  if (!isRecord(set)) return clean;
  for (const [id, raw] of Object.entries(set)) {
    const c = cm[id];
    if (!c) continue;
    if (c.kind === 'cont') {
      const n = Number(raw);
      if (Number.isFinite(n))
        clean[id] = Math.round(Math.max(c.min, Math.min(c.max, n)) * 100) / 100;
    } else if (c.kind === 'bool') {
      clean[id] = raw === true || raw === 'true' || raw === 'on' || raw === 1;
    } else {
      const o = c.options.find((x) => x.v === raw || String(x.v) === String(raw));
      if (o) clean[id] = o.v;
    }
  }
  return clean;
}

export function sanitizeCables(def: SynthDef, list: unknown): CablePair[] {
  const jm = jackMap(def);
  const out: CablePair[] = [];
  if (!Array.isArray(list)) return out;
  const items: unknown[] = list;
  for (const pair of items) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const ends: unknown[] = pair;
    let a = String(ends[0]);
    let b = String(ends[1]);
    const ja = jm[a];
    const jb = jm[b];
    if (ja && jb && ja.dir === 'in' && jb.dir === 'out') [a, b] = [b, a];
    const fa = jm[a];
    const fb = jm[b];
    if (fa && fb && fa.dir === 'out' && fb.dir === 'in') out.push([a, b]);
  }
  return out;
}

const MODS: readonly string[] = SYNTH_MODULES;
const isModule = (x: unknown): x is SynthModule => typeof x === 'string' && MODS.includes(x);
const firstTag = (tags: unknown): unknown => {
  if (!Array.isArray(tags)) return '';
  const list: unknown[] = tags;
  return list[0];
};
const isLevel = (x: unknown): x is 1 | 2 | 3 => x === 1 || x === 2 || x === 3;

export function sanitizePreset(def: SynthDef, raw: unknown): Preset | null {
  if (!isRecord(raw) || !Array.isArray(raw.steps)) return null;
  const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');
  const rawSteps: unknown[] = raw.steps;
  const steps: PresetStep[] = rawSteps
    .slice(0, 9)
    .map((s) => {
      const r = isRecord(s) ? s : {};
      return {
        title: str(r.title, 90) || 'Step',
        module: isModule(r.module) ? r.module : 'osc',
        why: str(r.why, 1500),
        set: sanitizeSet(def, r.set),
        cables: sanitizeCables(def, r.cables),
      };
    })
    .filter((s) => Object.keys(s.set).length || s.cables.length);
  if (!steps.length) return null;
  const cm = controlMap(def);
  const context: Record<string, string> = {};
  if (isRecord(raw.context)) {
    for (const [id, t] of Object.entries(raw.context))
      if (cm[id] && typeof t === 'string') context[id] = t.slice(0, 400);
  }
  const rawTweaks: unknown[] = Array.isArray(raw.tweaks) ? raw.tweaks : [];
  const tweaks: PresetTweak[] = Array.isArray(raw.tweaks)
    ? rawTweaks
        .filter(
          (t): t is Record<string, unknown> & { id: string } =>
            isRecord(t) && typeof t.id === 'string' && !!cm[t.id]
        )
        .slice(0, 5)
        .map((t) => ({ id: t.id, try: str(t.try, 200), hear: str(t.hear, 300) }))
    : [];
  let phrase: Phrase | null = null;
  if (isRecord(raw.phrase) && Array.isArray(raw.phrase.steps)) {
    const rawPhrase: unknown[] = raw.phrase.steps;
    const ps = rawPhrase
      .filter(
        (p): p is unknown[] =>
          Array.isArray(p) && p.length >= 3 && p.every((n: unknown) => Number.isFinite(Number(n)))
      )
      .slice(0, 32)
      .map(([b, n, l]): PhraseNote => [
        Math.max(0, Math.min(16, Number(b))),
        Math.max(24, Math.min(96, Math.round(Number(n)))),
        Math.max(0.05, Math.min(16, Number(l))),
      ]);
    if (ps.length)
      phrase = {
        bpm: Math.max(40, Math.min(180, Number(raw.phrase.bpm) || 100)),
        loop: true,
        steps: ps,
      };
  }
  return {
    id: `ai-${Date.now().toString(36)}`,
    name: str(raw.name, 60) || 'AI sound',
    ref: 'Designed by the AI tutor from your description',
    artist: 'AI tutor',
    tags: [str(firstTag(raw.tags), 16) || 'ai', 'ai'],
    level: isLevel(raw.level) ? raw.level : 2,
    blurb: str(raw.blurb, 200),
    how: str(raw.how, 900),
    phrase: phrase || {
      bpm: 100,
      loop: true,
      steps: [
        [0, 48, 0.9],
        [1, 55, 0.9],
        [2, 60, 0.9],
        [3, 55, 0.9],
      ],
    },
    steps,
    context,
    tweaks,
    ai: true,
  };
}

/** Compact, model-readable description of every control and jack, with current values. */
export function describeSynth(def: SynthDef, values: ControlValues, cables: CableLike[]): string {
  const lines = def.controls.map((c) => {
    const range =
      c.kind === 'cont'
        ? `number ${c.min}..${c.max}`
        : c.kind === 'bool'
          ? 'true|false'
          : `one of ${c.options.map((o) => JSON.stringify(o.v)).join(', ')}`;
    return `${c.id} | ${cleanLabel(c)} | ${c.module} | ${range} | now ${JSON.stringify(values[c.id])}`;
  });
  const jl = def.jacks
    .filter((j) => (j.dir === 'out' ? j.signal : j.dest))
    .map((j) => `${j.id} | ${j.label} | ${j.dir}`);
  const cl = cables.length ? cables.map((c) => `${c.from} -> ${c.to}`).join(', ') : 'none';
  return `CONTROLS (id | panel label | section | legal values | current value)\n${lines.join('\n')}\n\nPATCH JACKS (id | label | direction)\n${jl.join('\n')}\n\nCABLES NOW: ${cl}`;
}

const PREFIX_NAMES: Record<string, string | undefined> = {
  fenv: 'filter env',
  aenv: 'loudness env',
  env1: 'env 1',
  env2: 'env 2',
  mix: 'mixer',
  mixer: 'mixer',
  osc1: 'osc 1',
  osc2: 'osc 2',
  osc3: 'osc 3',
  oscA: 'osc A',
  oscB: 'osc B',
  vcaEnv: 'VCA env',
  vcfEnv: 'VCF env',
  modEnv: 'MOD env',
  attackCurve: 'attack curve',
  decayCurve: 'decay curve',
  releaseCurve: 'release curve',
  lfo1: 'LFO 1',
  lfo2: 'LFO 2',
  vcf: 'VCF',
  hpf: 'HPF',
  vca: 'VCA',
  arp: 'arp',
};

const dupeCounts = new WeakMap<SynthDef, Record<string, number>>();

/** Panel label, made unambiguous when several controls share it (three "VOLUME" knobs, two "ATTACK"s…). */
export function displayName(def: SynthDef, c: Control): string {
  if (c.name) return c.name;
  const label = cleanLabel(c);
  let dupes = dupeCounts.get(def);
  if (!dupes) {
    const seen: Record<string, number> = {};
    def.controls.forEach((x) => {
      const l = cleanLabel(x);
      seen[l] = (seen[l] || 0) + 1;
    });
    dupes = seen;
    dupeCounts.set(def, dupes);
  }
  if ((dupes[label] || 0) < 2) return label;
  const lower = label.toLowerCase();
  const hint = c.id
    .split(/[._]/)
    .filter((s) => !lower.includes(s.toLowerCase().slice(0, 4)))
    .map((s) => PREFIX_NAMES[s] || s)
    .join(' ');
  return hint ? `${label} · ${hint}` : label;
}
