/**
 * Sounds played by their mod lanes (`f-lane-sounds` t-301): a compact way to write a sound whose default pattern is a
 * chained A/B song with one or two mod lanes, and the checks that it can be the sound's default. Synth-agnostic: a
 * synth's lane sounds live in their own file (`model-d/lane-sounds.ts`), which hands its specs to `buildLaneSound`.
 *
 * A part is written as one token per step, `|` between beats for the eye:
 *
 *   `.`        a rest
 *   `A2`       a note for one step (C4 is MIDI 60)
 *   `A2:3`     held for three steps
 *   `A2!`      accented; `A2^` slides into the next step (a mono voice glides with GLIDE up)
 *   `A2*3`     ratcheted: three even hits inside the step
 *
 * A lane is a function of the step: what it plays, and where it is in the part. Return `null` to leave the control at
 * the panel's value on that step.
 */
import type {
  ControlValue,
  Phrase,
  PhraseNote,
  Preset,
  PresetStep,
  PresetTweak,
  SynthDef,
} from '@/lib/app/synths/contract';
import { presetState } from '@/lib/app/synths/lib/patch';
import {
  PATTERN_VERSION,
  PatternSchema,
  type Pattern,
  type ScaleName,
  type Step,
  type StepSize,
} from '@/lib/app/sequencer/pattern';
import { laneControl, laneValue } from '@/lib/app/sequencer/lanes';
import { handProblems } from '@/lib/app/sequencer/hands';
import { phraseOf, riffProblem } from '@/lib/app/patterns/library';
import type { PatternRole } from '@prisma/client';
import type { SoundSpec, StepSpec } from '@/scripts/app/sounds/lesson-writer';

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** `A2` → 45, `F#3` → 54, `Bb1` → 34. C4 is 60. */
export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + acc;
}

/** One step of a part as written, before its lanes. */
export interface Cell {
  /** Its place in the part, from 0. */
  i: number;
  /** The note it starts, or null for a rest. */
  note: number | null;
  gate: number;
  accent: boolean;
  slide: boolean;
  ratchet: number;
  /** Steps since the last note started (0 on a step that starts one; the part's length before the first). */
  since: number;
  /** The note sounding on this step, started here or held from before; null in a gap. */
  sounding: number | null;
  /** Starts a note the step before slides into: where a mono voice glides. */
  slidIn: boolean;
  len: number;
}

/** Parses a part's tokens into its cells. */
export function cells(text: string, len: number): Cell[] {
  const tokens = text.split(/\s+/).filter((t) => t && t !== '|');
  if (tokens.length !== len)
    throw new Error(`a part has ${tokens.length} steps, not ${len}: ${text}`);
  const out: Cell[] = [];
  let last = -1;
  let held: { note: number; until: number } | null = null;
  tokens.forEach((t, i) => {
    if (t === '.') {
      const sounding = held && i < held.until ? held.note : null;
      out.push({
        i,
        note: null,
        gate: 0,
        accent: false,
        slide: false,
        ratchet: 1,
        since: last < 0 ? len : i - last,
        sounding,
        slidIn: false,
        len,
      });
      return;
    }
    const m = /^([A-G][#b]?-?\d)(?::(\d+(?:\.\d+)?))?([!^]*)(?:\*([2-4]))?$/.exec(t);
    if (!m) throw new Error(`not a step: ${t}`);
    const note = midi(m[1]);
    const gate = m[2] ? Number(m[2]) : 1;
    const before = out[i - 1];
    const slidIn = !!before && before.slide && before.note !== null;
    last = i;
    held = { note, until: i + gate };
    out.push({
      i,
      note,
      gate,
      accent: m[3].includes('!'),
      slide: m[3].includes('^'),
      ratchet: m[4] ? Number(m[4]) : 1,
      since: 0,
      sounding: note,
      slidIn,
      len,
    });
  });
  return out;
}

export type Lane = (c: Cell) => ControlValue | null;

/** A part's notes moved by whole octaves: `up(1, 'A1 . C2')` is `'A2 . C3'`. */
export const up = (octaves: number, text: string): string =>
  text.replace(/([A-G][#b]?)(-?\d)/g, (_m, n: string, o: string) => `${n}${Number(o) + octaves}`);

export interface PartSpec {
  notes: string;
  lanes: Record<string, Lane>;
}

export interface LanePatternSpec {
  name: string;
  role: PatternRole;
  /** What the pattern is in the style of: a genre, era or tradition (never a person). */
  genre: string;
  bpm: number;
  stepSize?: StepSize;
  swing?: number;
  root: number;
  scale: ScaleName;
  len: number;
  /** Part A, then part B. */
  parts: [PartSpec, PartSpec];
  /** The order the parts play in, by index: `[0, 0, 0, 1]` is AAAB. */
  chain: number[];
  /** The record kept with the pattern: what the song does, section by section, and how the lanes play it. */
  notes: string;
  key: string;
}

/** A sound played by its lanes: the lesson, and its default pattern. */
export interface LaneSoundSpec extends Omit<SoundSpec, 'bpm' | 'riff' | 'steps'> {
  steps: StepSpec[];
  pattern: LanePatternSpec;
}

const round = (v: ControlValue): ControlValue =>
  typeof v === 'number' ? Math.round(v * 100) / 100 : v;

/** Builds the pattern, checking each lane value against the synth's control and the pattern against the riff rule. */
export function buildPattern(def: SynthDef, s: LanePatternSpec): Pattern {
  const ids = [...new Set(s.parts.flatMap((p) => Object.keys(p.lanes)))];
  if (ids.length < 1 || ids.length > 2)
    throw new Error(`${s.name}: a lane sound moves one or two controls, not ${ids.length}`);
  for (const id of ids) if (!laneControl(def, id)) throw new Error(`${s.name}: no lane for ${id}`);
  // Swing starts every second step late; a note there keeps its end on the grid, so it never overlaps the next one.
  const push = (s.swing ?? 50) / 50 - 1;
  const gateOf = (c: Cell) => (c.i % 2 === 1 ? Math.round((c.gate - push) * 1000) / 1000 : c.gate);
  const parts = s.parts.map((p) => ({
    steps: cells(p.notes, s.len).map((c): Step => {
      const step: Step = {
        on: true,
        notes: c.note === null ? [] : [{ note: c.note, gate: gateOf(c) }],
        ...(c.accent && { accent: true }),
        ...(c.slide && { slide: true }),
        ...(c.ratchet > 1 && { ratchet: c.ratchet }),
      };
      const mod: Record<string, ControlValue> = {};
      for (const [id, lane] of Object.entries(p.lanes)) {
        const v = lane(c);
        if (v === null) continue;
        const control = laneControl(def, id)!;
        if (laneValue(control, v) === null)
          throw new Error(`${s.name}: ${id} cannot take ${String(v)} (step ${c.i + 1})`);
        if (typeof v === 'number' && 'min' in control && 'max' in control) {
          const { min, max } = control as { min: number; max: number };
          if (v < min - 1e-9 || v > max + 1e-9)
            throw new Error(`${s.name}: ${id} ${v} is outside ${min}..${max} (step ${c.i + 1})`);
        }
        mod[id] = round(v);
      }
      return Object.keys(mod).length ? { ...step, mod } : step;
    }),
  }));
  const pattern = PatternSchema.parse({
    version: PATTERN_VERSION,
    bpm: s.bpm,
    stepSize: s.stepSize ?? '1/16',
    loop: true,
    direction: 'forward',
    swing: s.swing ?? 50,
    transpose: 0,
    root: s.root,
    scale: s.scale,
    parts,
    chain: s.chain,
    lanes: ids,
  });
  if (new Set(pattern.chain).size < 2) throw new Error(`${s.name}: the chain plays one part`);
  const problem = riffProblem(pattern);
  if (problem) throw new Error(`${s.name}: ${problem}`);
  return pattern;
}

/**
 * Refuses a lane no hand could play (`handProblems`), read against the panel the finished sound sets: a step a lane
 * leaves alone is at that value.
 */
export function checkHands(def: SynthDef, sound: Preset, pattern: Pattern): void {
  const panel = presetState(def, sound, sound.steps.length - 1).values;
  const problems = handProblems(def, pattern, panel);
  if (problems.length)
    throw new Error(`${sound.name}: no hand could play it:\n  ${problems.join('\n  ')}`);
}

/** The riff a pattern's sound stores: its first loop, part A's notes. */
export const riffOf = (pattern: Pattern): PhraseNote[] => phraseOf(pattern).steps;

/** A tweak that points at a lane: redraw it in the sequencer. */
export const laneTweak = (id: string, tryIt: string, hear: string): PresetTweak => ({
  id,
  try: `In the sequencer's Mod lanes, ${tryIt}`,
  hear,
});

// ── Lane shapes ─────────────────────────────────────────────────────────────

/** From `a` on the first step to `b` on the last. */
export const ramp =
  (a: number, b: number): Lane =>
  (c) =>
    a + ((b - a) * c.i) / Math.max(1, c.len - 1);

/** A sine between `lo` and `hi`, `period` steps long, starting at its low point shifted by `phase` steps. */
export const wave =
  (lo: number, hi: number, period: number, phase = 0): Lane =>
  (c) =>
    lo + ((hi - lo) * (1 - Math.cos((2 * Math.PI * (c.i + phase)) / period))) / 2;

/**
 * A hand moving a knob between positions: `{ 0: -2, 24: 1, 31: -2 }` turns it from -2 on the first step to 1 by step
 * 25, then back by the last, in straight lines. Before the first point and after the last it rests there. The shape
 * a playable lane is usually made of (`lane-sounds.md`, Playable by hand).
 */
export const moves =
  (points: Record<number, number>): Lane =>
  (c) => {
    const at = Object.entries(points)
      .map(([k, v]) => [Number(k), v] as const)
      .sort((a, b) => a[0] - b[0]);
    if (!at.length) return null;
    if (c.i <= at[0][0]) return at[0][1];
    for (let k = 1; k < at.length; k++) {
      const [i0, v0] = at[k - 1];
      const [i1, v1] = at[k];
      if (c.i <= i1) return v0 + ((v1 - v0) * (c.i - i0)) / (i1 - i0);
    }
    return at[at.length - 1][1];
  };

/** `on` on a step that starts a note, `off` elsewhere (null leaves the panel's value). */
export const onNotes =
  (on: ControlValue, off: ControlValue | null): Lane =>
  (c) =>
    c.since === 0 ? on : off;

/** A value per step, from a list that repeats. */
export const cycle =
  (values: (ControlValue | null)[]): Lane =>
  (c) =>
    values[c.i % values.length];

/** Values that change at given steps and hold until the next: `{ 0: 2, 16: 5 }`. */
export const holds =
  (points: Record<number, ControlValue>): Lane =>
  (c) => {
    let v: ControlValue | null = null;
    for (const [at, value] of Object.entries(points)) if (Number(at) <= c.i) v = value;
    return v;
  };

/** A lane plus another on top: the second wins wherever it says anything. */
export const over =
  (base: Lane, top: Lane): Lane =>
  (c) =>
    top(c) ?? base(c);

// ── The lesson ──────────────────────────────────────────────────────────────

/** How a lesson names a control and its values where the panel's own label does not say enough. */
export interface Readouts {
  /** By control id: "Osc 1 volume" where the panel says only VOLUME. */
  names: Record<string, string>;
  /** By option value: "sawtooth" where the panel draws only a picture. */
  options: Record<string, string>;
}

/** A control's readout line: its name, then its position and what that reads as on the panel. */
export function laneReadout(
  def: SynthDef,
  r: Readouts,
  id: string,
  v: ControlValue,
  values: Record<string, ControlValue>
): string {
  const c = def.controls.find((x) => x.id === id);
  if (!c) throw new Error(`${def.id}: no control ${id}`);
  // A panel label can run over two lines (CUTOFF / FREQUENCY); a readout is one.
  const name = r.names[id] ?? (c.label ?? id).replace(/\s*\n\s*/g, ' ');
  if (c.kind === 'bool') return `${name} ${v ? 'on' : 'off'}`;
  if (c.kind === 'enum') {
    const o = 'options' in c ? c.options?.find((x) => x.v === v) : undefined;
    return `${name} ${r.options[String(v)] ?? (o?.label || String(v))}`;
  }
  if (typeof v !== 'number') throw new Error(`${def.id}: ${id} takes a number`);
  const shown = 'fmt' in c && c.fmt ? c.fmt(v, values) : '';
  const n = String(Math.round(v * 100) / 100);
  return shown && shown !== n ? `${name} ${n} (${shown})` : `${name} ${n}`;
}

/** The finished sounds: each step's text with a readout line for every control it sets, at that step's panel. */
export function writeLaneSounds(
  def: SynthDef,
  r: Readouts,
  sounds: { spec: LaneSoundSpec; riff: PhraseNote[]; bpm: number }[]
): Preset[] {
  return sounds.map(({ spec: s, riff, bpm }) => {
    const phrase: Phrase = { bpm, loop: true, steps: riff };
    const bare = s.steps.map((st) => ({
      title: st.title,
      module: st.module,
      why: '',
      ...(st.set && { set: st.set }),
    }));
    const steps: PresetStep[] = s.steps.map((st, k) => {
      const at = presetState(def, { phrase, steps: bare }, k).values;
      const lines = [
        st.why,
        ...Object.entries(st.set ?? {}).map(([id, v]) => `- ${laneReadout(def, r, id, v, at)}`),
        `- Listen for: ${st.listen}`,
      ];
      return { ...bare[k], why: lines.join('\n') };
    });
    return {
      id: s.id,
      name: s.name,
      ref: s.ref,
      artist: s.artist,
      tags: s.tags,
      level: s.level,
      blurb: s.blurb,
      how: s.how,
      phrase,
      steps,
      context: s.context,
      tweaks: s.tweaks,
    };
  });
}
