/**
 * The shapes of a user's pattern (`f-step-sequencer` t-81): what the API takes and what it returns. Shapes only, with no
 * database client, so the sequencer checks a name with the same schema the routes do.
 *
 * A pattern is checked with the sequencer's own `PatternSchema` (`lib/app/sequencer/pattern.ts`), which bounds it: at
 * most two parts of 128 steps of six notes. It is not tied to a synth; the synth it was made on is kept for the list.
 */
import { z } from 'zod';
import { PatternSchema, type Pattern } from '@/lib/app/sequencer/pattern';
import {
  EXPLORE_SORTS,
  SharedSlugSchema,
  SynthIdSchema,
  UserPatternIdSchema,
  type SoundVisibility,
} from '@/lib/app/sounds/data';

/** A user pattern's id. Anything else cannot be one, so it is not looked up. */
export { UserPatternIdSchema };

/** A pattern's name, as the API takes it. Exported so the save box checks it the same way. */
export const PatternNameSchema = z.string().trim().min(1, 'Name the pattern').max(120);

/**
 * `POST /api/v1/patterns`. `synthId` is the synth it was made on, for the list: it does not limit where it plays.
 *
 * `source: { shared }` saves a copy of someone's link or published pattern (t-83): with no name or steps sent, it takes
 * the shared pattern's. Without a source, both are needed.
 */
export const CreateUserPatternSchema = z
  .object({
    name: PatternNameSchema.optional(),
    pattern: PatternSchema.optional(),
    synthId: SynthIdSchema.optional(),
    source: z.object({ shared: SharedSlugSchema }).strict().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.source) return;
    if (v.name === undefined)
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Name the pattern' });
    if (v.pattern === undefined)
      ctx.addIssue({ code: 'custom', path: ['pattern'], message: 'A pattern is needed' });
  });
export type CreateUserPattern = z.infer<typeof CreateUserPatternSchema>;

/**
 * `PATCH /api/v1/patterns/:id`: a new name, new steps, who can open it, or any of them. `visibility` is `private` or
 * `link` only: only publishing (`POST /api/v1/patterns/:id/publish`) makes a pattern `published` (t-83).
 */
export const UpdateUserPatternSchema = z
  .object({
    name: PatternNameSchema.optional(),
    pattern: PatternSchema.optional(),
    visibility: z.enum(['private', 'link']).optional(),
  })
  .refine((v) => v.name !== undefined || v.pattern !== undefined || v.visibility !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateUserPattern = z.infer<typeof UpdateUserPatternSchema>;

/** `POST /api/v1/patterns/:id/publish`. A pattern has no tags: they are a synth's library's, and a pattern has no synth. */
export const PublishUserPatternSchema = z.object({
  confirm: z.literal(true, { error: 'Confirm the pattern is yours to publish' }),
});
export type PublishUserPattern = z.infer<typeof PublishUserPatternSchema>;

/** The published pattern a copy credits: read live, never kept (`sharing.ts`). */
export interface SharedPatternSource {
  name: string;
  username: string;
  slug: string;
}

/** A user's pattern as My patterns lists it. */
export interface UserPatternSummary {
  id: string;
  name: string;
  /** The synth it was made on, or null. It plays on any. */
  synthId: string | null;
  /** How many steps it has, and how many parts (A, or A and B); 0 when it cannot be read (`problems` on the detail). */
  steps: number;
  parts: number;
  /** Who can open it (t-83). */
  visibility: SoundVisibility;
  /** Its public address's slug, once it has left private; kept when it goes back. */
  slug: string | null;
  /** When it was first published. */
  publishedAt: string | null;
  /** Whether moderators unlisted it after a report: nobody else can open it, whatever `visibility` says. */
  unlisted: boolean;
  /** The published pattern it was copied from, while that is published and its owner has a username. */
  basedOn: SharedPatternSource | null;
  createdAt: string;
  updatedAt: string;
}

/** A user's pattern with its steps. */
export interface UserPatternDetail extends UserPatternSummary {
  /** The pattern, checked as the sequencer reads one; null when it cannot be, and `problems` says why. */
  pattern: Pattern | null;
  problems: string[];
}

/**
 * A shared pattern as anyone may see it (`GET /api/v1/public/patterns/:slug`, t-83). Never the row's id, its owner's,
 * or the source's: the slug, a username and the credit only.
 */
export interface PublicPattern {
  slug: string;
  visibility: Exclude<SoundVisibility, 'private'>;
  name: string;
  /** The synth it was made on, or null. Its page opens on that synth when the catalogue serves it. */
  synthId: string | null;
  /** Published only. */
  publishedAt: string | null;
  /** The owner's username: always on a published pattern, on a link share only when their profile is public. */
  author: string | null;
  /** Whether `/u/<author>` shows anything. */
  authorProfile: boolean;
  basedOn: SharedPatternSource | null;
  /** The pattern, checked as the sequencer reads one; null when it cannot be, and `problems` says why. */
  pattern: Pattern | null;
  problems: string[];
  steps: number;
  parts: number;
}

/** A published pattern as Explore and a profile list it. */
export interface PublishedPatternCard {
  slug: string;
  name: string;
  /** The synth it was made on, and its name, while the catalogue serves it. */
  synthId: string | null;
  synthName: string | null;
  steps: number;
  parts: number;
  publishedAt: string;
  author: string;
  authorProfile: boolean;
  /** How many copies people saved. */
  saves: number;
}

/** Explore's patterns: newest or most saved first, a page at a time. Anything that does not parse is dropped. */
export const PatternExploreQuerySchema = z.object({
  sort: z.enum(EXPLORE_SORTS).default('newest').catch('newest'),
  page: z.coerce.number().int().positive().max(1000).default(1).catch(1),
});
export type PatternExploreQuery = z.infer<typeof PatternExploreQuerySchema>;
