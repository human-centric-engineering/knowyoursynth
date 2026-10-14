/**
 * The shapes of a synth suggestion (`f-databank` t-37): what a user sends, and what an admin decides. Shapes only, with
 * no database client, so the forms validate with the same schemas the routes do.
 */
import { z } from 'zod';
import { BankInstrumentSchema } from '@/lib/app/bank/data';

/** A web link: http or https only, so an admin can follow it safely. */
const LinkSchema = z
  .string()
  .trim()
  .max(500)
  .refine(isWebLink, 'must be a web address starting with http:// or https://');

function isWebLink(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** `POST /api/v1/bank/suggestions`: what a user says is missing. */
export const SuggestionInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the synth').max(120),
  maker: z.string().trim().min(1, 'Name the company that made it').max(120),
  link: LinkSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});
export type SuggestionInput = z.infer<typeof SuggestionInputSchema>;

export const SUGGESTION_STATUSES = ['PENDING', 'ACCEPTED', 'MERGED', 'DECLINED'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/**
 * An admin's decision on a pending suggestion:
 * - `accept` creates the instrument, through the databank's own create path, so it is checked like any other save;
 * - `merge` says it is already in the databank, as `instrumentId`;
 * - `decline` leaves the databank alone, with the reason kept.
 */
export const SuggestionDecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept'), instrument: BankInstrumentSchema }),
  z.object({ action: z.literal('merge'), instrumentId: BankInstrumentSchema.shape.id }),
  z.object({
    action: z.literal('decline'),
    reason: z.string().trim().min(1, 'Say why it is declined').max(1000),
  }),
]);
export type SuggestionDecision = z.infer<typeof SuggestionDecisionSchema>;

/** One suggestion as the admin queue shows it. */
export interface AdminSuggestion {
  id: string;
  name: string;
  maker: string;
  link: string | null;
  note: string | null;
  status: SuggestionStatus;
  instrumentId: string | null;
  reason: string | null;
  decidedAt: string | null;
  createdAt: string;
  /** Who suggested it; null once their account is erased. */
  suggestedBy: string | null;
}
