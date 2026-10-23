/**
 * What the tutor's stream route takes: `POST /api/v1/tutor/stream` (t-54).
 *
 * **What is not here is the point.** No agent: the route pins the tutor. No user: it comes from the session. No context
 * type, context id or entity context: the route builds them from the synth and the panel once it has checked them, so
 * the prompt and the tools are about the same synth. The client sends what it owns: the synth open on the page, its
 * panel, the message, and which conversation it carries on.
 */
import { z } from 'zod';
import { PatternSchema } from '@/lib/app/sequencer/pattern';
import { PanelInputSchema, SynthIdSchema } from '@/lib/app/sounds/data';
import { cuidSchema } from '@/lib/validations/common';

/** A learner's question is a sentence or two; this leaves room for a pasted paragraph. */
export const MAX_TUTOR_MESSAGE_CHARS = 4000;

/**
 * The most a turn's request body can be, checked from `Content-Length` before the body is read. The largest real one,
 * the DeepMind's whole panel with a message at the limit, is about 40 KB; the largest library riff as a pattern adds
 * under 4 KB (measured at t-84).
 */
export const MAX_TUTOR_BODY_BYTES = 256 * 1024;

export const TutorStreamRequestSchema = z.object({
  /** The synth open on the page. It must be one the catalogue lists, as for a saved sound. */
  synthId: SynthIdSchema,
  /** The panel as the page has it now, checked against the synth's current definition before the model is called. */
  panel: PanelInputSchema,
  /**
   * The pattern open in the sequencer (t-84), which the tutor reads and edits. Held to `PatternSchema`, the rule the
   * sequencer holds it to; a page with none leaves it out.
   */
  pattern: PatternSchema.optional(),
  message: z
    .string()
    .trim()
    .min(1, 'Ask the tutor something')
    .max(MAX_TUTOR_MESSAGE_CHARS, `Keep it under ${MAX_TUTOR_MESSAGE_CHARS} characters`),
  /** A conversation the caller started with the tutor. Another person's, or another agent's, is not found. */
  conversationId: cuidSchema.optional(),
});
export type TutorStreamRequest = z.infer<typeof TutorStreamRequestSchema>;

/** What `GET /api/v1/tutor/conversation` takes: the synth whose latest conversation to carry on. */
export const TutorConversationQuerySchema = z.object({ synthId: SynthIdSchema });
