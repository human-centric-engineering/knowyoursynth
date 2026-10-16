/**
 * A signed-in user's progress through the library's lessons (`f-my-sounds` s4): the furthest step they reached in each
 * library sound's lesson, and when they first finished it.
 *
 * **Owner-scoped by construction.** Every row is keyed on the caller's user id, and there is no way to name another
 * user's.
 *
 * **It only moves forward.** A step behind the furthest one changes nothing, and a finished lesson stays finished. Each
 * is a conditional update, so two devices writing at once cannot move it back.
 *
 * **Only a lesson the user can see.** The synth has to be listed and the app able to play it, and the step has to be
 * one the lesson has, or the write is refused (400) and nothing is stored.
 */
import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/lib/api/errors';
import { playableSynth } from '@/lib/app/sounds/store';
import type { LessonProgressEntry, ProgressInput } from '@/lib/app/sounds/progress-data';

/** How many steps a library sound's lesson has. `steps` is the catalogue's checked `PresetStep[]`. */
const stepCount = (steps: unknown): number => (Array.isArray(steps) ? steps.length : 0);

const SOUND_SELECT = {
  synthId: true,
  slug: true,
  name: true,
  steps: true,
  synth: { select: { listed: true } },
} as const;

function toEntry(row: {
  furthestStep: number;
  completedAt: Date | null;
  updatedAt: Date;
  sound: {
    synthId: string;
    slug: string;
    name: string;
    steps: unknown;
    synth: { listed: boolean };
  };
}): LessonProgressEntry {
  return {
    synthId: row.sound.synthId,
    slug: row.sound.slug,
    name: row.sound.name,
    steps: stepCount(row.sound.steps),
    furthestStep: row.furthestStep,
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    available: row.sound.synth.listed,
  };
}

/** The caller's lessons, most recently moved first: on one synth, or on every synth. */
export async function listProgress(
  userId: string,
  synthId?: string
): Promise<LessonProgressEntry[]> {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId, ...(synthId ? { sound: { synthId } } : {}) },
    orderBy: [{ updatedAt: 'desc' }, { soundId: 'asc' }],
    select: {
      furthestStep: true,
      completedAt: true,
      updatedAt: true,
      sound: { select: SOUND_SELECT },
    },
  });
  return rows.map(toEntry);
}

/**
 * Record that the caller reached `step` of a library sound's lesson, and finished it when `completed`. Returns their
 * progress through it as it now stands, which may be further than `step`.
 */
export async function recordProgress(
  userId: string,
  synthId: string,
  slug: string,
  input: ProgressInput
): Promise<LessonProgressEntry> {
  const def = await playableSynth(synthId);
  const sound = await prisma.synthSound.findUnique({
    where: { synthId_slug: { synthId: def.id, slug } },
    select: { id: true, steps: true },
  });
  if (!sound)
    throw new ValidationError(`${def.id} has no library sound ${slug}`, {
      errors: [{ path: 'slug', message: `No library sound ${slug} on ${def.id}` }],
    });
  const n = stepCount(sound.steps);
  if (input.step >= n)
    throw new ValidationError(`${slug} has ${n} steps`, {
      errors: [{ path: 'step', message: `The lesson has ${n} steps, counted from 0` }],
    });

  const key = { userId, soundId: sound.id };
  const now = new Date();
  await prisma.lessonProgress.upsert({
    where: { userId_soundId: key },
    create: { ...key, furthestStep: input.step, completedAt: input.completed ? now : null },
    update: {},
  });
  // Forward only, each a condition the database checks, so a slower request for an earlier step cannot undo a later one.
  await prisma.lessonProgress.updateMany({
    where: { ...key, furthestStep: { lt: input.step } },
    data: { furthestStep: input.step },
  });
  if (input.completed)
    await prisma.lessonProgress.updateMany({
      where: { ...key, completedAt: null },
      data: { completedAt: now },
    });

  const row = await prisma.lessonProgress.findUniqueOrThrow({
    where: { userId_soundId: key },
    select: {
      furthestStep: true,
      completedAt: true,
      updatedAt: true,
      sound: { select: SOUND_SELECT },
    },
  });
  return toEntry(row);
}
