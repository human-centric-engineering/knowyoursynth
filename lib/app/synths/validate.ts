/**
 * The sound validator: checks a sound against the `SynthDef` it is for, and lists every problem.
 *
 * The strict counterpart of the `sanitize*` helpers in `lib/patch.ts`. Those repair what they are given (they clamp
 * a value into range, swap a cable that is the wrong way round, drop what they do not know) because they read AI
 * output that is better used half-right than not at all. This refuses instead: a sound that is stored, shared or
 * submitted through the API must already be right, and the person who wrote it needs to know what is wrong with it.
 * The rules are the ones the prototype checker (`check.mjs`) enforces on the library, so a sound that passes here would pass there.
 *
 * Two layers, in order:
 *  1. **Shape** (Zod): is it a sound at all — the right fields, of the right types. Nothing about the synth.
 *  2. **Against the definition**: every control id exists, every value is legal for its control (a number in range,
 *     one of the options, a boolean), every cable runs from a modelled output jack to a modelled input jack.
 *
 * Nothing throws. Every problem comes back with a path into the input (`steps.2.set.filter.cutoff`), a machine code
 * and a plain-English message, and the validated value comes back typed only when there are none.
 */
import { z } from 'zod';
import { controlMap, jackMap } from '@/lib/app/synths/lib/patch';
import {
  PRESET_CATEGORIES,
  SYNTH_MODULES,
  type CablePair,
  type Control,
  type ControlValue,
  type ControlValues,
  type Preset,
  type PresetStep,
  type SynthDef,
} from '@/lib/app/synths/contract';

// ─── Results ─────────────────────────────────────────────────────────────────

/** Why a sound was refused. */
export type SoundProblemCode =
  /** Not the shape of a sound: a missing field, a wrong type (from the Zod layer). */
  | 'invalid-shape'
  /** A control id the synth does not have. */
  | 'unknown-control'
  /** A continuous control given something that is not a finite number. */
  | 'not-a-number'
  /** A continuous control's value outside its `min..max`. */
  | 'out-of-range'
  /** An enum control's value that is none of its options. */
  | 'bad-option'
  /** An on/off control given something that is not `true` or `false`. */
  | 'not-boolean'
  /** A cable end that is no jack on this synth. */
  | 'unknown-jack'
  /** A cable written input first: `[input, output]` instead of `[output, input]`. */
  | 'reversed-cable'
  /** A cable from an output to another output. */
  | 'output-to-output'
  /** A cable from an input to another input. */
  | 'input-to-input'
  /** A cable to or from a jack the sound engine does not model (no `signal` / `dest`). */
  | 'unmodelled-jack';

export interface SoundProblem {
  /** Where in the input, dot-separated (`steps.0.cables.1`). Empty for the input as a whole. */
  path: string;
  code: SoundProblemCode;
  message: string;
}

/** The validated value when there are no problems; otherwise every problem found. */
export type ValidationResult<T> =
  { ok: true; value: T; problems: [] } | { ok: false; value: null; problems: SoundProblem[] };

const done = <T>(value: T, problems: SoundProblem[]): ValidationResult<T> =>
  problems.length ? { ok: false, value: null, problems } : { ok: true, value, problems: [] };

const join = (...parts: (string | number)[]) => parts.filter((p) => p !== '').join('.');

const fromZod = (error: z.ZodError, prefix = ''): SoundProblem[] =>
  error.issues.map((issue) => ({
    path: join(prefix, ...issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p))),
    code: 'invalid-shape',
    message: issue.message,
  }));

// ─── Shapes (layer 1) ────────────────────────────────────────────────────────

/** A cable as a sound writes it: `[outputJackId, inputJackId]`. */
export const CablePairSchema = z.tuple([z.string().min(1), z.string().min(1)]);

/** Control id → value, before the values are checked against the synth. */
export const SettingsSchema = z.record(z.string(), z.unknown());

/** A panel state: control values (all or some of them) and the cables in. */
export const SoundStateSchema = z.object({
  values: SettingsSchema,
  cables: z.array(CablePairSchema).default([]),
});

const nonEmpty = z.string().trim().min(1);
const CATEGORY_NAMES: readonly string[] = PRESET_CATEGORIES;

const PhraseNoteSchema = z.union([
  z.tuple([z.number().min(0), z.number().int().min(0).max(127), z.number().positive()]),
  z.tuple([
    z.number().min(0),
    z.number().int().min(0).max(127),
    z.number().positive(),
    z.number().min(0).max(1),
  ]),
]);

const PresetStepSchema = z.object({
  title: nonEmpty,
  module: z.enum(SYNTH_MODULES),
  why: nonEmpty,
  set: SettingsSchema.optional(),
  cables: z.array(CablePairSchema).optional(),
});

/** A library sound, built step by step (`Preset` in the contract), before it is checked against the synth. */
export const PresetSchema = z.object({
  id: nonEmpty,
  name: nonEmpty,
  ref: nonEmpty,
  artist: nonEmpty,
  tags: z
    .array(z.string())
    .min(1)
    .refine((tags) => CATEGORY_NAMES.includes(tags[0]), {
      message: `The first tag must be a category (${PRESET_CATEGORIES.join(', ')})`,
    }),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  blurb: nonEmpty,
  how: nonEmpty,
  phrase: z.object({
    bpm: z.number().positive(),
    loop: z.boolean(),
    steps: z.array(PhraseNoteSchema).min(1),
    transpose: z.number().optional(),
  }),
  steps: z.array(PresetStepSchema).min(1),
  context: z.record(z.string(), z.string()).default({}),
  tweaks: z.array(z.object({ id: z.string(), try: z.string(), hear: z.string() })).default([]),
  ai: z.boolean().optional(),
});

// ─── Against the definition (layer 2) ────────────────────────────────────────

/** One value against its control: the value, typed, or the problem with it. */
function checkValue(
  c: Control,
  v: unknown,
  path: string
): { value: ControlValue } | { problem: SoundProblem } {
  if (c.kind === 'cont') {
    if (typeof v !== 'number' || !Number.isFinite(v))
      return {
        problem: {
          path,
          code: 'not-a-number',
          message: `${c.id} must be a number from ${c.min} to ${c.max}`,
        },
      };
    if (v < c.min || v > c.max)
      return {
        problem: {
          path,
          code: 'out-of-range',
          message: `${c.id}=${v} is out of range ${c.min}..${c.max}`,
        },
      };
    return { value: v };
  }
  if (c.kind === 'bool') {
    if (typeof v !== 'boolean')
      return { problem: { path, code: 'not-boolean', message: `${c.id} must be true or false` } };
    return { value: v };
  }
  const option = c.options.find((o) => o.v === v);
  if (!option)
    return {
      problem: {
        path,
        code: 'bad-option',
        message: `${c.id}=${JSON.stringify(v)} is not one of ${c.options.map((o) => JSON.stringify(o.v)).join(' ')}`,
      },
    };
  return { value: option.v };
}

/** Control values against the synth: every id a control, every value legal for it. */
export function checkSettings(
  def: SynthDef,
  settings: Record<string, unknown>,
  path = 'values'
): { values: ControlValues; problems: SoundProblem[] } {
  const cm = controlMap(def);
  const values: ControlValues = {};
  const problems: SoundProblem[] = [];
  for (const [id, v] of Object.entries(settings)) {
    const at = join(path, id);
    const c = cm[id];
    if (!c) {
      problems.push({
        path: at,
        code: 'unknown-control',
        message: `${def.id} has no control ${id}`,
      });
      continue;
    }
    const r = checkValue(c, v, at);
    if ('problem' in r) problems.push(r.problem);
    else values[id] = r.value;
  }
  return { values, problems };
}

/** Cables against the synth: each from a modelled output jack to a modelled input jack. */
export function checkCables(def: SynthDef, cables: CablePair[], path = 'cables'): SoundProblem[] {
  const jm = jackMap(def);
  const problems: SoundProblem[] = [];
  cables.forEach(([from, to], i) => {
    const at = join(path, i);
    const a = jm[from];
    const b = jm[to];
    if (!a || !b) {
      const missing = [!a && from, !b && to].filter((x): x is string => !!x);
      problems.push({
        path: at,
        code: 'unknown-jack',
        message: `${def.id} has no jack ${missing.join(' or ')}`,
      });
      return;
    }
    if (a.dir === 'in' && b.dir === 'out') {
      problems.push({
        path: at,
        code: 'reversed-cable',
        message: `Cable ${from} > ${to} is the wrong way round: write it [output, input], as [${to}, ${from}]`,
      });
      return;
    }
    if (a.dir === 'out' && b.dir === 'out') {
      problems.push({
        path: at,
        code: 'output-to-output',
        message: `Cable ${from} > ${to} joins two outputs`,
      });
      return;
    }
    if (a.dir === 'in' && b.dir === 'in') {
      problems.push({
        path: at,
        code: 'input-to-input',
        message: `Cable ${from} > ${to} joins two inputs`,
      });
      return;
    }
    if (a.dir === 'out' && b.dir === 'in' && (!a.signal || !b.dest)) {
      problems.push({
        path: at,
        code: 'unmodelled-jack',
        message: `Cable ${from} > ${to} uses a jack the sound engine does not model (${!a.signal ? from : to})`,
      });
    }
  });
  return problems;
}

// ─── Entry points ────────────────────────────────────────────────────────────

/** A panel state that has passed: legal values and well-formed cables. */
export interface SoundState {
  values: ControlValues;
  cables: CablePair[];
}

/** Validate a panel state (`{ values, cables }`) against a synth. */
export function validateSound(def: SynthDef, input: unknown): ValidationResult<SoundState> {
  const parsed = SoundStateSchema.safeParse(input);
  if (!parsed.success) return done<SoundState>({ values: {}, cables: [] }, fromZod(parsed.error));
  const { values, problems } = checkSettings(def, parsed.data.values, 'values');
  problems.push(...checkCables(def, parsed.data.cables, 'cables'));
  return done({ values, cables: parsed.data.cables }, problems);
}

/**
 * Validate a library sound (a `Preset`) against a synth: its shape, then every step's settings and cables, and the
 * control ids its `tweaks` and `context` point at.
 */
export function validatePreset(def: SynthDef, input: unknown): ValidationResult<Preset> {
  const parsed = PresetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, value: null, problems: fromZod(parsed.error) };
  const raw = parsed.data;
  const cm = controlMap(def);
  const problems: SoundProblem[] = [];
  const steps: PresetStep[] = raw.steps.map((s, i) => {
    const { values, problems: setProblems } = checkSettings(
      def,
      s.set || {},
      join('steps', i, 'set')
    );
    problems.push(...setProblems);
    const cables = s.cables || [];
    problems.push(...checkCables(def, cables, join('steps', i, 'cables')));
    return {
      title: s.title,
      module: s.module,
      why: s.why,
      ...(s.set ? { set: values } : {}),
      ...(s.cables ? { cables } : {}),
    };
  });
  raw.tweaks.forEach((t, i) => {
    if (!cm[t.id])
      problems.push({
        path: join('tweaks', i, 'id'),
        code: 'unknown-control',
        message: `Tweak names ${t.id}, which ${def.id} does not have`,
      });
  });
  for (const id of Object.keys(raw.context)) {
    if (!cm[id])
      problems.push({
        path: join('context', id),
        code: 'unknown-control',
        message: `Context names ${id}, which ${def.id} does not have`,
      });
  }
  return done<Preset>({ ...raw, steps }, problems);
}
