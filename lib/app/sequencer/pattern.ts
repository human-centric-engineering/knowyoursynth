/**
 * The pattern sequencer's model (`f-step-sequencer` t-78): a riff you can edit, step by step, on any synth.
 *
 * A library riff is a flat list of notes (`Phrase`, `lib/app/synths/contract.ts`). A pattern is the same music laid
 * out on a grid of steps, with what a modular sequencer adds on top: probability, conditions, ratchets, slides,
 * directions, swing and a scale. `importPhrase` (`import.ts`) turns any riff into a pattern without changing a note,
 * and `compileLoop` (`compile.ts`) turns a pattern back into the notes of one pass through it, which is what the
 * engine plays. The rules are in `.context/app/sequencer.md`.
 *
 * Shapes and pure functions only, so the page, the API and the tutor read a pattern with the same code.
 */
import { z } from 'zod';

/** The version of the pattern shape. A change that an older pattern cannot be read as ships a mapping (D1). */
export const PATTERN_VERSION = 1;

/** The most steps a pattern has: 32 beats of sixteenths, the longest library riff. */
export const MAX_STEPS = 128;
/** The most notes one step plays at once. The library's biggest chord has five. */
export const MAX_CHORD = 6;
/** The most parts (A, B, …) a pattern has, and the longest chain of them. */
export const MAX_PARTS = 2;
export const MAX_CHAIN = 16;
/** The most times a step repeats inside itself. */
export const MAX_RATCHET = 4;
/**
 * The longest a note can be held, in steps: a tie across a whole pattern and on into the next pass, which a library
 * note ending just past the loop's last beat does.
 */
export const MAX_GATE = MAX_STEPS * 2;
/** The furthest a pattern is transposed, in semitones, either way. */
export const MAX_TRANSPOSE = 48;
export const MIN_BPM = 20;
export const MAX_BPM = 300;
/** The most mod lanes a pattern carries. */
export const MAX_LANES = 8;
/** What a panel control's id looks like (`vcf.cutoff`, `xm1_vco1.coarse`, `fx1.tc-deepvrb.pst`): what a mod lane names. */
export const CONTROL_ID = /^(?=.{1,64}$)[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/;
/** The velocity a step's notes play at when nothing sets it, as the engine reads a riff note without one. */
export const DEFAULT_VELOCITY = 0.85;
/** The velocity of an accented step. */
export const ACCENT_VELOCITY = 1;

/** How long one step is, and how many fit in a beat. A triplet size fits three (or six) in the time of two (or four). */
export const STEP_SIZES = {
  '1/8': 2,
  '1/8t': 3,
  '1/16': 4,
  '1/16t': 6,
  '1/32': 8,
} as const;
export type StepSize = keyof typeof STEP_SIZES;
export const STEP_SIZE_NAMES = Object.keys(STEP_SIZES) as StepSize[];

/**
 * The order the steps play in, one pass at a time. `pendulum` alternates a pass forward and a pass back (each end
 * plays twice in a row, once per pass); `random` picks any step for each slot; `brownian` walks from the step before,
 * mostly forward, sometimes staying or stepping back.
 */
export const DIRECTIONS = ['forward', 'reverse', 'pendulum', 'random', 'brownian'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Scales as semitones above the root. `chromatic` leaves every note where it is. */
export const SCALES = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
} as const satisfies Record<string, readonly number[]>;
export type ScaleName = keyof typeof SCALES;
export const SCALE_NAMES = Object.keys(SCALES) as ScaleName[];

/**
 * When a step plays, by loop count (the first loop is 1):
 * - `ab`: on loop `a` of every `b` (Elektron's A:B), so `{a: 1, b: 2}` plays on loops 1, 3, 5 …
 * - `first` / `notFirst`: only on, or never on, the first loop since play was pressed.
 * - `fill` / `notFill`: only while Fill is held, or only while it is not.
 */
export const StepConditionSchema = z.discriminatedUnion('t', [
  z
    .object({
      t: z.literal('ab'),
      a: z.number().int().min(1).max(8),
      b: z.number().int().min(2).max(8),
    })
    .strict()
    .refine((c) => c.a <= c.b, { message: 'The loop played must be one of the loops counted' }),
  z.object({ t: z.literal('first') }).strict(),
  z.object({ t: z.literal('notFirst') }).strict(),
  z.object({ t: z.literal('fill') }).strict(),
  z.object({ t: z.literal('notFill') }).strict(),
]);
export type StepCondition = z.infer<typeof StepConditionSchema>;

/**
 * One note a step plays. A chord is several. Each keeps its own length, velocity and nudge, because a library riff's
 * chords are not always struck or let go together.
 */
export const StepNoteSchema = z
  .object({
    /** MIDI note, before the pattern's transpose and scale. */
    note: z.number().int().min(0).max(127),
    /** How long it is held, in steps. Past 1 it ties over the steps after it. */
    gate: z.number().positive().max(MAX_GATE),
    /** 0..1. Absent plays at the default, or at the accent velocity on an accented step. */
    velocity: z.number().min(0).max(1).optional(),
    /** How late it starts, as a fraction of a step: off-grid timing, a triplet on a straight grid, a flam. */
    nudge: z.number().min(0).lt(1).optional(),
  })
  .strict();
export type StepNote = z.infer<typeof StepNoteSchema>;

/** One step. A step with no notes is a rest; `on: false` mutes it and keeps its notes. */
export const StepSchema = z
  .object({
    on: z.boolean(),
    notes: z.array(StepNoteSchema).max(MAX_CHORD),
    /** Plays its notes at the accent velocity. */
    accent: z.boolean().optional(),
    /** Holds its notes into the next step, so a mono synth glides to it. */
    slide: z.boolean().optional(),
    /** Plays the step this many times inside itself, evenly spaced. */
    ratchet: z.number().int().min(1).max(MAX_RATCHET).optional(),
    /** 0..1: the chance it plays on any pass. Absent always plays. */
    probability: z.number().min(0).max(1).optional(),
    condition: StepConditionSchema.optional(),
    /**
     * What the pattern's mod lanes set on this step, by control id: a value in the control's own range, which the
     * synth playing it checks (`lanes.ts`). A lane with no value here leaves the control at the panel's value.
     */
    mod: z
      .record(z.string().regex(CONTROL_ID), z.union([z.number(), z.string().max(64), z.boolean()]))
      .optional(),
  })
  .strict();
export type Step = z.infer<typeof StepSchema>;
/** What a step's lanes set: control id → value. */
export type StepMod = NonNullable<Step['mod']>;

export const PartSchema = z.object({ steps: z.array(StepSchema).min(1).max(MAX_STEPS) }).strict();
export type Part = z.infer<typeof PartSchema>;

export const PatternSchema = z
  .object({
    version: z.literal(PATTERN_VERSION),
    bpm: z.number().min(MIN_BPM).max(MAX_BPM),
    stepSize: z.enum(STEP_SIZE_NAMES as [StepSize, ...StepSize[]]),
    /** Whether it plays again from the top. Three library riffs play once. */
    loop: z.boolean(),
    direction: z.enum(DIRECTIONS),
    /** 50 is straight; up to 75 delays every second step by half a step. */
    swing: z.number().min(50).max(75),
    /** Semitones added to every note, before the scale. */
    transpose: z.number().int().min(-MAX_TRANSPOSE).max(MAX_TRANSPOSE),
    /** 0..11, C = 0. */
    root: z.number().int().min(0).max(11),
    scale: z.enum(SCALE_NAMES as [ScaleName, ...ScaleName[]]),
    /** A, and optionally B. Every part has the same number of steps. */
    parts: z.array(PartSchema).min(1).max(MAX_PARTS),
    /** The parts in the order they play, one per loop, then round again: `[0, 0, 0, 1]` is AAAB. */
    chain: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(MAX_PARTS - 1)
      )
      .min(1)
      .max(MAX_CHAIN),
    /**
     * Mod lanes: the panel controls this pattern moves step by step, by id. Optional, so a pattern saved before lanes
     * existed reads as it was. A lane names a control of whichever synth it was made on and is kept on a synth without
     * it, silent.
     */
    lanes: z.array(z.string().regex(CONTROL_ID)).max(MAX_LANES).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const len = p.parts[0].steps.length;
    p.parts.forEach((part, i) => {
      if (part.steps.length !== len)
        ctx.addIssue({
          code: 'custom',
          path: ['parts', i, 'steps'],
          message: 'Every part has the same number of steps',
        });
    });
    p.chain.forEach((c, i) => {
      if (c >= p.parts.length)
        ctx.addIssue({
          code: 'custom',
          path: ['chain', i],
          message: 'The chain names a part the pattern does not have',
        });
    });
    const lanes = p.lanes ?? [];
    if (new Set(lanes).size !== lanes.length)
      ctx.addIssue({ code: 'custom', path: ['lanes'], message: 'A control has one lane' });
    p.parts.forEach((part, i) =>
      part.steps.forEach((step, k) => {
        for (const id of Object.keys(step.mod ?? {}))
          if (!lanes.includes(id))
            ctx.addIssue({
              code: 'custom',
              path: ['parts', i, 'steps', k, 'mod', id],
              message: 'A step sets a control the pattern has no lane for',
            });
      })
    );
  });
export type Pattern = z.infer<typeof PatternSchema>;

/** A note kept inside MIDI. */
export const clampNote = (n: number): number => Math.min(127, Math.max(0, n));

/** A note's place in the octave above `root`, 0..11, for notes below the root too. */
export const pitchClass = (note: number, root = 0): number => (((note - root) % 12) + 12) % 12;

/** Steps in one beat at the pattern's step size. */
export const stepsPerBeat = (p: Pick<Pattern, 'stepSize'>): number => STEP_SIZES[p.stepSize];

/** How many steps the pattern has. */
export const patternLength = (p: Pick<Pattern, 'parts'>): number => p.parts[0].steps.length;

/** A rest. */
export const emptyStep = (): Step => ({ on: true, notes: [] });

/** A blank pattern: one part of rests, straight, forward, chromatic. */
export function newPattern(length = 16, stepSize: StepSize = '1/16', bpm = 120): Pattern {
  return {
    version: PATTERN_VERSION,
    bpm,
    stepSize,
    loop: true,
    direction: 'forward',
    swing: 50,
    transpose: 0,
    root: 0,
    scale: 'chromatic',
    parts: [{ steps: Array.from({ length }, emptyStep) }],
    chain: [0],
  };
}
