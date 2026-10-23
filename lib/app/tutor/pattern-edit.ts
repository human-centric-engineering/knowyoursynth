/**
 * A pattern the tutor proposes (`f-step-sequencer` t-84): what `propose_pattern` takes, how it is made into a pattern,
 * and the summary `get_pattern` reads the open one as. Pure and free of the server, so the tool that checks a proposal
 * and the tutor panel that applies it make the same pattern from it.
 *
 * - **An edit, not a whole pattern.** The model names the steps it writes and any setting it changes; everything else
 *   is the open pattern's (`start: 'open'`) or a blank one's (`start: 'blank'`). A busier second half is the steps of
 *   the second half, not the whole pattern sent back, and the result the tool loop sends on to every later step stays
 *   small.
 * - **A step it lists is replaced**: whether it is on, its notes, accent, slide, ratchet and chance. Its condition and
 *   its mod lanes' values stay, because the tool cannot write either; a fresh step starts with neither.
 * - **The result is held to `PatternSchema`**, the rule every pattern the sequencer holds is held to, so a proposal that
 *   passes is one the module can load.
 */
import { z } from 'zod';
import { resizePattern } from '@/lib/app/sequencer/tools';
import {
  DIRECTIONS,
  MAX_BPM,
  MAX_CHORD,
  MAX_PARTS,
  MAX_RATCHET,
  MAX_STEPS,
  MAX_TRANSPOSE,
  MIN_BPM,
  PatternSchema,
  SCALE_NAMES,
  STEP_SIZE_NAMES,
  StepNoteSchema,
  newPattern,
  patternLength,
  type Pattern,
  type ScaleName,
  type Step,
  type StepSize,
} from '@/lib/app/sequencer/pattern';

/** The length of a blank pattern the tutor starts from when it names none: one bar of sixteenths. */
export const BLANK_LENGTH = 16;
/** The most steps one proposal writes: every step of both parts. */
export const MAX_WRITTEN = MAX_STEPS * MAX_PARTS;

const PART_NAMES = ['A', 'B'] as const;

export const PatternStepEditSchema = z
  .object({
    /** Which step, counted from 1, as the module numbers them. */
    step: z.number().int().min(1).max(MAX_STEPS),
    part: z.enum(PART_NAMES).default('A'),
    on: z.boolean().default(true),
    /** None is a rest. */
    notes: z.array(StepNoteSchema).max(MAX_CHORD),
    accent: z.boolean().optional(),
    slide: z.boolean().optional(),
    ratchet: z.number().int().min(1).max(MAX_RATCHET).optional(),
    probability: z.number().min(0).max(1).optional(),
  })
  .strict();
export type PatternStepEdit = z.infer<typeof PatternStepEditSchema>;

export const PatternEditSchema = z
  .object({
    start: z.enum(['open', 'blank']),
    length: z.number().int().min(1).max(MAX_STEPS).optional(),
    stepSize: z.enum(STEP_SIZE_NAMES as [StepSize, ...StepSize[]]).optional(),
    bpm: z.number().min(MIN_BPM).max(MAX_BPM).optional(),
    loop: z.boolean().optional(),
    direction: z.enum(DIRECTIONS).optional(),
    swing: z.number().min(50).max(75).optional(),
    transpose: z.number().int().min(-MAX_TRANSPOSE).max(MAX_TRANSPOSE).optional(),
    root: z.number().int().min(0).max(11).optional(),
    scale: z.enum(SCALE_NAMES as [ScaleName, ...ScaleName[]]).optional(),
    steps: z.array(PatternStepEditSchema).max(MAX_WRITTEN).default([]),
  })
  .strict();
export type PatternEdit = z.infer<typeof PatternEditSchema>;
/** An edit as the model may write it: `part`, `on` and `steps` may be left out. */
export type PatternEditInput = z.input<typeof PatternEditSchema>;

/** One thing wrong with an edit, where it is, in words the model can act on (the shape of `panel.ts`'s `Problem`). */
export interface PatternProblem {
  path: string;
  message: string;
}

export type PatternEditResult =
  | { ok: true; pattern: Pattern }
  | { ok: false; code: 'no_pattern' | 'invalid_pattern'; problems: PatternProblem[] };

const SETTINGS = [
  'stepSize',
  'bpm',
  'loop',
  'direction',
  'swing',
  'transpose',
  'root',
  'scale',
] as const;

/** What an edit changes: the settings it names, and `steps` if it writes any. None is an edit with nothing in it. */
export function patternEditKeys(edit: PatternEdit): string[] {
  const keys: string[] = [...SETTINGS, 'length'].filter(
    (k) => edit[k as keyof PatternEdit] !== undefined
  );
  if (edit.steps.length) keys.push('steps');
  return keys;
}

function writeStep(was: Step | undefined, e: PatternStepEdit): Step {
  const step: Step = { on: e.on, notes: e.notes.map((n) => ({ ...n })) };
  if (e.accent) step.accent = true;
  if (e.slide) step.slide = true;
  if (e.ratchet !== undefined && e.ratchet > 1) step.ratchet = e.ratchet;
  if (e.probability !== undefined && e.probability < 1) step.probability = e.probability;
  if (was?.condition) step.condition = structuredClone(was.condition);
  if (was?.mod) step.mod = { ...was.mod };
  return step;
}

/**
 * The pattern `edit` makes from `open` (the pattern open in the sequencer, if any): the open one or a blank one, its
 * length and settings changed, then each step it lists written. Refused, with every problem named, when it starts from
 * an open pattern there is none of, names a step past the end or a part the pattern does not have, lists a step twice,
 * or makes a pattern `PatternSchema` refuses.
 */
export function applyPatternEdit(open: Pattern | null, edit: PatternEdit): PatternEditResult {
  if (edit.start === 'open' && !open)
    return {
      ok: false,
      code: 'no_pattern',
      problems: [
        {
          path: 'start',
          message:
            'No pattern is open in the sequencer to edit; start from "blank" to write a new one',
        },
      ],
    };
  const base =
    edit.start === 'open' && open
      ? structuredClone(open)
      : newPattern(edit.length ?? BLANK_LENGTH, edit.stepSize ?? '1/16', edit.bpm ?? 120);
  let p: Pattern =
    edit.length !== undefined && edit.length !== patternLength(base)
      ? resizePattern(base, edit.length)
      : base;
  for (const key of SETTINGS) if (edit[key] !== undefined) p = { ...p, [key]: edit[key] };

  const problems: PatternProblem[] = [];
  const len = patternLength(p);
  const seen = new Set<string>();
  edit.steps.forEach((e, i) => {
    const partIndex = PART_NAMES.indexOf(e.part);
    const part = p.parts[partIndex];
    const where = `${e.part}${e.step}`;
    if (!part)
      problems.push({
        path: `steps.${i}.part`,
        message: `The pattern has no part ${e.part}`,
      });
    else if (e.step > len)
      problems.push({
        path: `steps.${i}.step`,
        message: `Step ${e.step} is past the end: the pattern has ${len} steps (set length to make it longer)`,
      });
    else if (seen.has(where))
      problems.push({
        path: `steps.${i}`,
        message: `Step ${e.step} of part ${e.part} is listed twice`,
      });
    else {
      seen.add(where);
      part.steps[e.step - 1] = writeStep(part.steps[e.step - 1], e);
    }
  });
  if (problems.length) return { ok: false, code: 'invalid_pattern', problems };

  const checked = PatternSchema.safeParse(p);
  if (!checked.success)
    return {
      ok: false,
      code: 'invalid_pattern',
      problems: checked.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  return { ok: true, pattern: checked.data };
}

/** Whether two patterns are the same, note for note and setting for setting. */
export const samePattern = (a: Pattern, b: Pattern): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/** Whether a pattern plays anything at all: a step that is on and has a note. */
export const hasNotes = (p: Pattern): boolean =>
  p.parts.some((part) => part.steps.some((s) => s.on && s.notes.length > 0));

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** A root as a note name, C = 0. */
export const rootName = (root: number): string => NOTE_NAMES[root] ?? String(root);

const round = (n: number) => Math.round(n * 1000) / 1000;

/** One step as a line of the summary: `5: 36 g2 v0.7 acc slide r2 p0.5 if 1:2 off`; a rest is left out. */
function stepLine(step: Step, i: number): string | null {
  if (step.notes.length === 0) return null;
  const notes = step.notes
    .map((n) => {
      const bits = [String(n.note), `g${round(n.gate)}`];
      if (n.velocity !== undefined) bits.push(`v${round(n.velocity)}`);
      if (n.nudge !== undefined) bits.push(`n${round(n.nudge)}`);
      return bits.join(' ');
    })
    .join(' + ');
  const flags: string[] = [];
  if (step.accent) flags.push('acc');
  if (step.slide) flags.push('slide');
  if (step.ratchet && step.ratchet > 1) flags.push(`r${step.ratchet}`);
  if (step.probability !== undefined && step.probability < 1)
    flags.push(`p${round(step.probability)}`);
  if (step.condition)
    flags.push(
      step.condition.t === 'ab' ? `if ${step.condition.a}:${step.condition.b}` : step.condition.t
    );
  if (!step.on) flags.push('off');
  return `${i + 1}: ${notes}${flags.length ? ` ${flags.join(' ')}` : ''}`;
}

export interface PatternSummary {
  length: number;
  stepSize: StepSize;
  bpm: number;
  loop: boolean;
  direction: Pattern['direction'];
  swing: number;
  transpose: number;
  /** As a note name. */
  root: string;
  scale: ScaleName;
  /** The order the parts play in, one per loop: `AAAB`. */
  chain: string;
  /** The controls the mod lanes move. Their values are not listed, and an edit keeps them. */
  lanes: string[];
  /** Each part's steps that hold notes, one line each; a step not listed is a rest. */
  parts: { part: 'A' | 'B'; steps: string[] }[];
}

/**
 * The open pattern as `get_pattern` gives it to the model: its settings, and each step that holds notes as one short
 * line. The largest library riff summarises in about 1,100 characters, where its JSON is 3,700 (measured at t-84), and
 * the tool loop sends the result again on every later step.
 */
export function summarisePattern(p: Pattern): PatternSummary {
  return {
    length: patternLength(p),
    stepSize: p.stepSize,
    bpm: p.bpm,
    loop: p.loop,
    direction: p.direction,
    swing: p.swing,
    transpose: p.transpose,
    root: rootName(p.root),
    scale: p.scale,
    chain: p.chain.map((c) => PART_NAMES[c] ?? '?').join(''),
    lanes: p.lanes ?? [],
    parts: p.parts.map((part, i) => ({
      part: PART_NAMES[i] ?? 'A',
      steps: part.steps.flatMap((s, k) => stepLine(s, k) ?? []),
    })),
  };
}
