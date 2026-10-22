/**
 * The shapes of a user's pattern (`f-step-sequencer` t-81): what the API takes and what it returns. Shapes only, with no
 * database client, so the sequencer checks a name with the same schema the routes do.
 *
 * A pattern is checked with the sequencer's own `PatternSchema` (`lib/app/sequencer/pattern.ts`), which bounds it: at
 * most two parts of 128 steps of six notes. It is not tied to a synth; the synth it was made on is kept for the list.
 */
import { z } from 'zod';
import { PatternSchema, type Pattern } from '@/lib/app/sequencer/pattern';
import { SynthIdSchema, UserPatternIdSchema } from '@/lib/app/sounds/data';

/** A user pattern's id. Anything else cannot be one, so it is not looked up. */
export { UserPatternIdSchema };

/** A pattern's name, as the API takes it. Exported so the save box checks it the same way. */
export const PatternNameSchema = z.string().trim().min(1, 'Name the pattern').max(120);

/** `POST /api/v1/patterns`. `synthId` is the synth it was made on, for the list: it does not limit where it plays. */
export const CreateUserPatternSchema = z.object({
  name: PatternNameSchema,
  pattern: PatternSchema,
  synthId: SynthIdSchema.optional(),
});
export type CreateUserPattern = z.infer<typeof CreateUserPatternSchema>;

/** `PATCH /api/v1/patterns/:id`: a new name, new steps, or both. */
export const UpdateUserPatternSchema = z
  .object({ name: PatternNameSchema.optional(), pattern: PatternSchema.optional() })
  .refine((v) => v.name !== undefined || v.pattern !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateUserPattern = z.infer<typeof UpdateUserPatternSchema>;

/** A user's pattern as My patterns lists it. */
export interface UserPatternSummary {
  id: string;
  name: string;
  /** The synth it was made on, or null. It plays on any. */
  synthId: string | null;
  /** How many steps it has, and how many parts (A, or A and B); 0 when it cannot be read (`problems` on the detail). */
  steps: number;
  parts: number;
  createdAt: string;
  updatedAt: string;
}

/** A user's pattern with its steps. */
export interface UserPatternDetail extends UserPatternSummary {
  /** The pattern, checked as the sequencer reads one; null when it cannot be, and `problems` says why. */
  pattern: Pattern | null;
  problems: string[];
}
