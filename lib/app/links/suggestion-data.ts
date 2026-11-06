/**
 * The shapes of a link suggestion (`f-link-suggestions` t-185): what a user sends, and what an admin decides. Shapes
 * only, with no database client, so the forms validate with the same schemas the routes do. Spec:
 * `.context/app/links.md` (Suggestions).
 */
import { z } from 'zod';
import { LINK_KINDS, type LinkKind } from '@/lib/app/links/providers';
import { OwnerRefSchema } from '@/lib/app/links/owner-ref';
import type { OwnerSummary } from '@/lib/app/links/owner';

const TitleSchema = z.string().trim().min(1).max(200);

/** `POST /api/v1/links/suggestions`: a link, and what it is about. */
export const LinkSuggestionInputSchema = z.object({
  target: OwnerRefSchema,
  url: z.string().trim().min(1, 'Give the link').max(2000),
  kind: z.enum(LINK_KINDS),
  title: TitleSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});
export type LinkSuggestionInput = z.infer<typeof LinkSuggestionInputSchema>;

export const LINK_SUGGESTION_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED'] as const;
export type LinkSuggestionStatus = (typeof LINK_SUGGESTION_STATUSES)[number];

/**
 * An admin's decision on a pending suggestion:
 * - `accept` makes the link, through the links admin's own create path, so it is checked like any other; `kind` and
 *   `title` replace what the user gave;
 * - `decline` leaves the links alone, with the reason kept.
 */
export const LinkSuggestionDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('accept'),
    kind: z.enum(LINK_KINDS).optional(),
    title: TitleSchema.optional(),
  }),
  z.object({
    action: z.literal('decline'),
    reason: z.string().trim().min(1, 'Say why it is declined').max(1000),
  }),
]);
export type LinkSuggestionDecision = z.infer<typeof LinkSuggestionDecisionSchema>;

/** One suggestion as the admin queue shows it. */
export interface AdminLinkSuggestion {
  id: string;
  /** What it is about. `name` is null when the target has since been removed: it can only be declined. */
  target: Omit<OwnerSummary, 'name'> & { name: string | null };
  url: string;
  kind: LinkKind;
  title: string | null;
  note: string | null;
  status: LinkSuggestionStatus;
  linkId: string | null;
  reason: string | null;
  decidedAt: string | null;
  createdAt: string;
  /** Who suggested it; null once their account is erased. */
  suggestedBy: string | null;
}
