/**
 * The shapes of a signed-in user's lesson progress (`f-my-sounds` s4): what `/api/v1/me/progress` takes and returns.
 * Shapes only, with no database client, so the synth page checks with the same schemas the routes do.
 */
import { z } from 'zod';
import { SynthIdSchema } from '@/lib/app/sounds/data';
import { MAX_STEP } from '@/lib/app/sounds/preference-data';

/** `PUT /api/v1/me/progress/:synthId/:slug`: a step reached, and whether the lesson was finished from it. */
export const ProgressInputSchema = z
  .object({
    step: z.number().int().min(0).max(MAX_STEP),
    completed: z.boolean().optional(),
  })
  .strict();
export type ProgressInput = z.infer<typeof ProgressInputSchema>;

/** `GET /api/v1/me/progress`: every lesson the caller has started, or those on one synth. */
export const ListProgressQuerySchema = z.object({ synthId: SynthIdSchema.optional() });

/** A user's progress through one library sound's lesson. */
export interface LessonProgressEntry {
  synthId: string;
  /** The library sound's slug, which the page calls its id. */
  slug: string;
  name: string;
  /** How many steps the lesson has now. */
  steps: number;
  /** The furthest step reached, from 0. */
  furthestStep: number;
  /** When the user first finished it, or `null`. */
  completedAt: string | null;
  updatedAt: string;
  /** Whether its synth is listed, so it has a page to open. */
  available: boolean;
}

/** One entry as the page reads it: outside data, so checked. */
export const LessonProgressReadSchema = z.object({
  slug: z.string(),
  furthestStep: z.number().int().min(0),
  completedAt: z.iso.datetime().nullable(),
});
export type LessonProgressRead = z.infer<typeof LessonProgressReadSchema>;
