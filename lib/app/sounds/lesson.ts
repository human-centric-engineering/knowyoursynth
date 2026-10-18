/**
 * A user sound's lesson (`f-tutor` t-55): how the sound works, the steps that build it, what each control does in it,
 * things to try and a riff. A sound the tutor designed keeps its lesson when it is saved as one of the user's sounds,
 * so it opens with its steps every time (owner ruling on `f-tutor`, 2026-10-18).
 *
 * **One shape, two writers.** `design_sound` (`lib/app/tutor/design-sound.ts`) takes it from the model with the
 * sound's name beside it, and `POST /api/v1/sounds` takes it from any client. So both are held to the tutor's rules,
 * which are strict: a field past its limit is refused, never clamped (`sanitizePreset` clamped the prototype's to the
 * same limits). `checkLesson` then runs `validatePreset` against the synth, which refuses a control or jack the synth
 * does not have and a value its control cannot take.
 *
 * Shapes and pure functions only, with no database client, so the synth page reads a lesson with the same code.
 */
import { z } from 'zod';
import { CablePairSchema, validatePreset, type ValidationResult } from '@/lib/app/synths/validate';
import {
  PRESET_CATEGORIES,
  SYNTH_MODULES,
  type Preset,
  type PresetStep,
  type SynthDef,
} from '@/lib/app/synths/contract';

const text = (max: number) => z.string().trim().min(1).max(max);
/** The most controls one step sets, and the most controls the lesson explains. */
export const MAX_STEP_SET = 32;
export const MAX_CONTEXT = 16;

const PhraseNoteSchema = z.tuple([
  z.number().min(0).max(16),
  z.number().int().min(24).max(96),
  z.number().min(0.05).max(16),
]);

/** A lesson as a writer sends it: everything about a sound but its name, and the panel its steps build. */
export const SoundLessonSchema = z
  .object({
    blurb: text(200),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    category: z.enum(PRESET_CATEGORIES),
    how: text(900),
    steps: z
      .array(
        z
          .object({
            title: text(90),
            module: z.enum(SYNTH_MODULES),
            why: text(1500),
            set: z
              .record(z.string().min(1).max(160), z.unknown())
              .refine(
                (set) => Object.keys(set).length <= MAX_STEP_SET,
                `At most ${MAX_STEP_SET} controls in one step`
              )
              .optional(),
            cables: z.array(CablePairSchema).max(16).optional(),
          })
          .strict()
          .refine((s) => Object.keys(s.set ?? {}).length > 0 || (s.cables ?? []).length > 0, {
            message: 'A step must set a control or plug in a cable',
          })
      )
      .min(1)
      .max(9),
    context: z
      .record(z.string().min(1).max(160), text(400))
      .refine(
        (context) => Object.keys(context).length <= MAX_CONTEXT,
        `At most ${MAX_CONTEXT} controls in the context`
      )
      .default({}),
    tweaks: z
      .array(z.object({ id: z.string().min(1).max(160), try: text(200), hear: text(300) }).strict())
      .max(5)
      .default([]),
    phrase: z
      .object({ bpm: z.number().min(40).max(180), steps: z.array(PhraseNoteSchema).min(1).max(32) })
      .strict(),
  })
  .strict();
/** A lesson in the shape it was sent or stored in, before it is checked against the synth. */
export type SoundLessonInput = z.infer<typeof SoundLessonSchema>;
/** A lesson that passed `checkLesson`: what the API returns and the synth page reads. */
export type SoundLesson = Omit<SoundLessonInput, 'steps'> & { steps: PresetStep[] };

type LessonSound = { id: string; name: string; fromTutor: boolean };

/** A lesson as a sound, for `validatePreset` to check (any lesson) or the Lesson panel to read (a checked one). */
function asPreset(lesson: SoundLessonInput, sound: LessonSound) {
  return {
    id: sound.id,
    name: sound.name,
    ref: sound.fromTutor ? 'Designed by the AI tutor' : 'A lesson saved with this sound',
    artist: sound.fromTutor ? 'AI tutor' : 'Its owner',
    tags: [lesson.category],
    level: lesson.level,
    blurb: lesson.blurb,
    how: lesson.how,
    phrase: { bpm: lesson.phrase.bpm, loop: true, steps: lesson.phrase.steps },
    steps: lesson.steps,
    context: lesson.context,
    tweaks: lesson.tweaks,
    ...(sound.fromTutor ? { ai: true } : {}),
  };
}

/**
 * The lesson as the Lesson panel reads a sound: a `Preset` under the user sound's own id and name. The credit line
 * says where the lesson came from, since it is not a library sound's.
 */
export function lessonPreset(lesson: SoundLesson, sound: LessonSound): Preset {
  return { ...asPreset(lesson, sound), steps: lesson.steps };
}

/**
 * A lesson checked against the synth with `validatePreset`: every step's control ids, values and cables, and the ids
 * its context and tweaks name. Passed, its steps are as the validator typed them.
 */
export function checkLesson(
  def: SynthDef,
  lesson: SoundLessonInput
): ValidationResult<SoundLesson> {
  const checked = validatePreset(
    def,
    asPreset(lesson, { id: 'lesson', name: 'Lesson', fromTutor: false })
  );
  if (!checked.ok) return checked;
  return { ok: true, value: { ...lesson, steps: checked.value.steps }, problems: [] };
}

/** A stored lesson read back: its shape, or null when the column is empty or holds something that is not a lesson. */
export function storedLesson(value: unknown): SoundLessonInput | null {
  if (value === null || value === undefined) return null;
  const parsed = SoundLessonSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Every piece of text a lesson shows, for the word check at publish. */
export function lessonText(lesson: SoundLessonInput): string[] {
  return [
    lesson.blurb,
    lesson.how,
    ...lesson.steps.flatMap((s) => [s.title, s.why]),
    ...Object.values(lesson.context),
    ...lesson.tweaks.flatMap((t) => [t.try, t.hear]),
  ];
}
