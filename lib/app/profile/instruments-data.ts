import { z } from 'zod';

import { BankIdSchema } from '@/lib/app/bank/data';

/**
 * The shapes `/api/v1/me/instruments` reads and answers (`f-profiles` r2): the synths a user owns and the ones they
 * want, each a databank instrument. Client-safe: the settings section checks what it sends and reads with the same
 * schemas the routes do.
 */

export const OWNED_KINDS = ['owned', 'wishlist'] as const;
export type OwnedKind = (typeof OWNED_KINDS)[number];
export const OwnedKindSchema = z.enum(OWNED_KINDS);

/** The most synths one list holds, so a reorder is a bounded request. */
export const MAX_PER_LIST = 200;

/** A databank instrument's id, as the bank writes them. */
export const InstrumentIdSchema = BankIdSchema.max(100);

/** `POST /api/v1/me/instruments`: put an instrument on one list, at its end. */
export const AddInstrumentSchema = z
  .object({ instrumentId: InstrumentIdSchema, kind: OwnedKindSchema })
  .strict();
export type AddInstrumentInput = z.infer<typeof AddInstrumentSchema>;

/** `PATCH /api/v1/me/instruments/:instrumentId`: move it to a list, at its end. */
export const MoveInstrumentSchema = z.object({ kind: OwnedKindSchema }).strict();

/** `PUT /api/v1/me/instruments/order`: one list's instruments, every one of them, in their new order. */
export const ReorderInstrumentsSchema = z
  .object({
    kind: OwnedKindSchema,
    instrumentIds: z
      .array(InstrumentIdSchema)
      .max(MAX_PER_LIST)
      .refine((ids) => new Set(ids).size === ids.length, 'lists an instrument twice'),
  })
  .strict();
export type ReorderInstrumentsInput = z.infer<typeof ReorderInstrumentsSchema>;

/** One instrument on a list, as the API returns it. */
export const OwnedEntrySchema = z.object({
  instrumentId: z.string(),
  kind: OwnedKindSchema,
  name: z.string(),
  maker: z.string(),
  year: z.string(),
  addedAt: z.string(),
});
export type OwnedEntry = z.infer<typeof OwnedEntrySchema>;

/** `GET /api/v1/me/instruments`: both lists, each in the user's order. */
export const OwnedListsSchema = z.object({
  owned: z.array(OwnedEntrySchema),
  wishlist: z.array(OwnedEntrySchema),
});
export type OwnedLists = z.infer<typeof OwnedListsSchema>;

/** The words for each list, used by the API's refusals and the settings section alike. */
export const LIST_NAMES: Record<OwnedKind, string> = {
  owned: 'synths you own',
  wishlist: 'your wishlist',
};
